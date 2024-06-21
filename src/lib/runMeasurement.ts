import assert from "assert";
import { Config } from "./Config";
import { cookieSwapPartyHeuristics } from "./measurement/cookieSwapPartyHeuristics";
import { Flow, equalsFlow, getFrameFlows } from "./measurement/Flow";
import { SiteAnalysisData } from "./measurement/SiteAnalysisData";
import {
  AnalysisDetail,
  Cookie,
  Frame,
  Request,
  SitesEntry,
  StorageItem,
} from "./model";
import { distinct, divide, mapSequentialAsync } from "./util/array";
import { getSiteFromHostname } from "./measurement/getSiteFromHostname";
import { readFile } from "fs/promises";
import path from "path";
import { BrowserId } from "./BrowserId";
import { isNonNullable } from "./util/types";
import { sum, countIfNonZero, bothSumCount } from "./util/stats";
import { Agent } from "port_agent";
import { Worker, isMainThread, parentPort } from "worker_threads";

const DEFAULT_CONCURRENCY_LEVEL = 4;

interface SiteReport {
  site: string;
  firstPartyContext: SiteContextReport;
  thirdPartyContext: SiteContextReport;
}

interface SiteContextReport {
  general: SiteGeneralReport;
  tfAggregate: SiteAggregateReport;
  ffAggregate: SiteAggregateReport;
  fxAggregate: SiteAggregateReport;
  brAggregate: SiteAggregateReport;
  bxAggregate: SiteAggregateReport;
}

interface SiteGeneralReport {
  // cookies
  cookies: number;
  trkCookies: number;
  cookieFlows: number;
  labeledCookieFlows: number;
  trkCookieFlows: number;
  // storageItems
  storageItems: number;
  trkStorageItems: number;
  storageItemFlows: number;
  trkStorageItemFlows: number;
  // ga
  ga: number;
  // matching
  notSubstrMatchingTrkFlows: number;
  notLCSMatchingTrkFlows: number;
}

interface SiteAggregateReport {
  // trkFlows
  trkFlows: Flow[];
  pureSameSiteTrkFlows: Flow[];
  xdomSameSiteTrkFlows: Flow[];
  // trackers
  trackers: string[];
  pureSameSiteTrackers: string[];
  xdomSameSiteTrackers: string[];
  // trackersAll
  trackersAll: string[];
}

interface GlobalReport {
  totalGeneral: GlobalGeneralReport;
  firstPartyGeneral: GlobalGeneralReport;
  thirdPartyGeneral: GlobalGeneralReport;
  tfFirstPartyAggregate: GlobalAggregateReport;
  tfThirdPartyAggregate: GlobalAggregateReport;
  ffFirstPartyAggregate: GlobalAggregateReport;
  ffThirdPartyAggregate: GlobalAggregateReport;
  fxFirstPartyAggregate: GlobalAggregateReport;
  fxThirdPartyAggregate: GlobalAggregateReport;
  brFirstPartyAggregate: GlobalAggregateReport;
  brThirdPartyAggregate: GlobalAggregateReport;
  bxFirstPartyAggregate: GlobalAggregateReport;
  bxThirdPartyAggregate: GlobalAggregateReport;
  sitesWithOnlyFlowTrackers: string[];
}

interface GlobalGeneralReport {
  // cookies
  cookies: number;
  cookieDomains: number;
  trkCookies: number;
  trkCookieDomains: number;
  cookieFlows: number;
  cookieFlowDomains: number;
  labeledCookieFlows: number;
  labeledCookieFlowDomains: number;
  trkCookieFlows: number;
  trkCookieFlowDomains: number;
  // storageItems
  storageItems: number;
  storageItemDomains: number;
  trkStorageItems: number;
  trkStorageItemDomains: number;
  storageItemFlows: number;
  storageItemFlowDomains: number;
  trkStorageItemFlows: number;
  trkStorageItemFlowDomains: number;
  // cssis
  cssis: number;
  cssiDomains: number;
  trkCssis: number;
  trkCssiDomains: number;
  cssiFlows: number;
  cssiFlowDomains: number;
  trkCssiFlows: number;
  trkCssiFlowDomains: number;
  // ga
  gaDomains: number;
  // matching
  notSubstrMatchingTrkFlows: number;
  notSubstrMatchingTrkFlowDomains: number;
  notLCSMatchingTrkFlows: number;
  notLCSMatchingTrkFlowDomains: number;
}

interface GlobalAggregateReport {
  // trkFlows
  trkFlows: number;
  trkFlowDomains: number;
  pureSameSiteTrkFlows: number;
  pureSameSiteTrkFlowDomains: number;
  xdomSameSiteTrkFlows: number;
  xdomSameSiteTrkFlowDomains: number;
  // trackers
  trackers: number;
  trackerDomains: number;
  pureSameSiteTrackers: number;
  pureSameSiteTrackerDomains: number;
  xdomSameSiteTrackers: number;
  xdomSameSiteTrackerDomains: number;
  trackerRanking: TrackerRankingEntry[];
  // trackersAll
  trackersAll: number;
  trackerDomainsAll: number;
  trackerRankingAll: TrackerRankingEntry[];
}

interface TrackerRankingEntry {
  tracker: string;
  popularity: number;
}

interface ExtendedSitesEntry extends SitesEntry {
  outputPath: string;
}

const readSitesEntries = async (
  outputPaths: string[]
): Promise<ExtendedSitesEntry[]> => {
  let mergedExtendedSitesEntries: ExtendedSitesEntry[] = [];
  for (const outputPath of outputPaths) {
    const mergedLength = mergedExtendedSitesEntries.length;
    const newExtendedSitesEntries = (
      JSON.parse(
        (await readFile(path.join(outputPath, "sites.json"))).toString()
      ) as SitesEntry[]
    ).map((sitesEntry: SitesEntry, index): ExtendedSitesEntry => {
      return {
        ...sitesEntry,
        siteIndex: mergedLength + index,
        outputPath,
      };
    });
    const sites = newExtendedSitesEntries.map(({ site }) => site);
    mergedExtendedSitesEntries = [
      ...mergedExtendedSitesEntries.filter(
        (extendedSitesEntry) => !sites.includes(extendedSitesEntry.site)
      ),
      ...newExtendedSitesEntries,
    ];
  }
  return mergedExtendedSitesEntries;
};

export const runMeasurement = async (config: Config) => {
  const outputPaths = (() => {
    const values = process.argv.slice(2);
    assert(
      values.every((outputPath) => typeof outputPath === "string"),
      "all outputPaths must be a string"
    );
    return values;
  })();

  const concurrencyLevel = (() => {
    const envValue = process.env["CONCURRENCY_LEVEL"];
    const value = envValue
      ? Number.parseInt(envValue)
      : DEFAULT_CONCURRENCY_LEVEL;
    assert(!Number.isNaN(value), `CONCURRENCY_LEVEL must be a number`);
    return value;
  })();
  console.log(`Concurrency Level: ${concurrencyLevel}`);

  const sitesEntries = await readSitesEntries(outputPaths);
  const tfSuccessSitesEntries = sitesEntries.filter(
    (sitesEntry) =>
      sitesEntry.failureErrorEntries.find(
        (entry) => entry.browserId === "foxhound"
      )!.failureError === null
  );

  const totalDomains = sitesEntries.length;
  const tfNavigationErrorDomains = sitesEntries.filter(
    (sitesEntry) =>
      sitesEntry.failureErrorEntries.find(
        (entry) => entry.browserId === "foxhound"
      )!.failureError === "NavigationError"
  ).length;
  const tfSuccessDomains = tfSuccessSitesEntries.length;
  const tfSuccessRate =
    tfSuccessDomains / (totalDomains - tfNavigationErrorDomains);

  const bothOtherBrowserSuccessDomainsRate = (
    browserId: BrowserId
  ): [number, number] => {
    const successDomains = tfSuccessSitesEntries.filter(
      (sitesEntry) =>
        sitesEntry.failureErrorEntries.find(
          (entry) => entry.browserId === browserId
        )!.failureError === null
    ).length;
    const successRate = successDomains / tfSuccessDomains;
    return [successDomains, successRate];
  };
  const [ffSuccessDomains, ffSuccessRate] =
    bothOtherBrowserSuccessDomainsRate("firefox");
  const [fxSuccessDomains, fxSuccessRate] =
    bothOtherBrowserSuccessDomainsRate("firefox-nops");
  const [brSuccessDomains, brSuccessRate] =
    bothOtherBrowserSuccessDomainsRate("brave");
  const [bxSuccessDomains, bxSuccessRate] =
    bothOtherBrowserSuccessDomainsRate("brave-aggr");

  const siteReports = await getSiteReports(
    tfSuccessSitesEntries, // use tfSuccessSitesEntries.slice(0, ...) for debugging
    concurrencyLevel
  );

  console.log(
    JSON.stringify({
      totalDomains,
      tfNavigationErrorDomains,
      tfSuccessDomains,
      tfSuccessRate,
      ffSuccessDomains,
      ffSuccessRate,
      fxSuccessDomains,
      fxSuccessRate,
      brSuccessDomains,
      brSuccessRate,
      bxSuccessDomains,
      bxSuccessRate,
      siteReports: siteReports.length,
      globalReport: getGlobalReport(siteReports),
    })
  );
};

const getSiteReports = async (
  sitesEntries: ExtendedSitesEntry[],
  concurrencyLevel: number
) => {
  const sitesEntriesPerThread = divide(
    sitesEntries,
    Math.ceil(sitesEntries.length / concurrencyLevel)
  );

  return (
    await Promise.all(
      sitesEntriesPerThread.map(async (sitesEntries) => {
        const worker = new Worker(__filename);
        const agent = new Agent(worker);
        try {
          return (await agent.call(
            processSiteMulti.name,
            sitesEntries
          )) as SiteReport[];
        } finally {
          worker.terminate();
        }
      })
    )
  ).flat();
};

export const processSiteMulti = async (
  sitesEntries: ExtendedSitesEntry[]
): Promise<SiteReport[]> => {
  return (
    await mapSequentialAsync(sitesEntries, async (sitesEntry) => {
      try {
        const data = await SiteAnalysisData.fromFile(
          sitesEntry.outputPath,
          sitesEntry
        );
        return processSite(data, sitesEntry);
      } catch (e) {
        console.log(e);
        return null;
      }
    })
  ).filter(isNonNullable);
};

const processSite = (
  data: SiteAnalysisData,
  sitesEntry: SitesEntry
): SiteReport => {
  console.log(sitesEntry.siteIndex, sitesEntry.site);

  interface ContextFrame {
    frame: Frame;
    requests: Request[];
  }

  interface Context {
    origin: string;
    cookies: Cookie[];
    storageItems: StorageItem[];
    frames: ContextFrame[];
  }

  interface ContextSet {
    firstPartyContext: Context;
    thirdPartyContexts: Context[];
  }

  const getContextSet = (detail: AnalysisDetail): ContextSet => {
    const contextMap = detail.frames.reduce((contextMap, frame) => {
      const origin = new URL(frame.url).origin;
      const requests = detail.requests.filter(
        (request) => request.frameId === frame.frameId
      );
      const frames = contextMap.get(origin) ?? [];
      return contextMap.set(origin, [...frames, { frame, requests }]);
    }, new Map<string, ContextFrame[]>());
    const contexts: Context[] = [...contextMap].map(([origin, frames]) => {
      const representativeFrame = frames[0].frame;
      const cookies = representativeFrame.cookies;
      const storageItems = representativeFrame.storageItems;
      return { origin, cookies, storageItems, frames };
    });
    assert(contexts.length > 0);
    return {
      firstPartyContext: contexts[0],
      thirdPartyContexts: contexts.slice(1),
    };
  };

  const tf1ACtxSet = getContextSet(
    data.select({
      browserId: "foxhound",
      index: 1,
      runId: "A",
    })[0]
  );
  const tf1BCtxSet = getContextSet(
    data.select({
      browserId: "foxhound",
      index: 1,
      runId: "B",
    })[0]
  );
  const tf2ACtxSet = getContextSet(
    data.select({
      browserId: "foxhound",
      index: 2,
      runId: "A",
    })[0]
  );

  const firstPartySite = getSiteFromHostname(
    new URL(tf1ACtxSet.firstPartyContext.origin).hostname
  );

  const processContext = (
    contextSelector: (contextSet: ContextSet) => Context | null
  ): SiteContextReport | null => {
    const tf1ACtx = contextSelector(tf1ACtxSet);
    if (!isNonNullable(tf1ACtx)) {
      return null;
    }
    const contextOrigin = tf1ACtx.origin;
    const contextSite = getSiteFromHostname(new URL(contextOrigin).hostname);
    const tf1BCtx = contextSelector(tf1BCtxSet);
    if (!isNonNullable(tf1BCtx)) {
      return null;
    }
    assert(
      tf1BCtx.origin === contextOrigin,
      `${tf1BCtx.origin} must be equal to ${contextOrigin}`
    );
    const tf2ACtx = contextSelector(tf2ACtxSet);
    if (!isNonNullable(tf2ACtx)) {
      return null;
    }
    assert(
      tf2ACtx.origin === contextOrigin,
      `${tf2ACtx.origin} must be equal to ${contextOrigin}`
    );

    const tf1ACookies = tf1ACtx.cookies;
    const tf1BCookies = tf1BCtx.cookies;
    const tf2ACookies = tf2ACtx.cookies;
    const cookieKeys = distinct(
      [...tf1ACookies, ...tf1BCookies].map(({ key }) => key)
    );
    const trkCookieKeys = distinct(
      cookieSwapPartyHeuristics(tf1ACookies, tf1BCookies, tf2ACookies, true)
    );
    const tf1AStorageItems = tf1ACtx.storageItems;
    const tf1BStorageItems = tf1BCtx.storageItems;
    const tf2AStorageItems = tf2ACtx.storageItems;
    const storageItemKeys = distinct(
      [...tf1AStorageItems, ...tf1BStorageItems].map(({ key }) => key)
    );
    const trkStorageItemKeys = distinct(
      cookieSwapPartyHeuristics(
        tf1AStorageItems,
        tf1BStorageItems,
        tf2AStorageItems
      )
    );

    const flows = distinct(
      [...tf1ACtx.frames, ...tf1BCtx.frames].flatMap(({ frame }) =>
        getFrameFlows(frame)
      ),
      equalsFlow
    ).filter((flow) => flow.targetSite !== firstPartySite); // consider just cross-site flows

    const cookieFlows = flows.filter((flow) => flow.source === "cookie");
    const labeledCookieFlows = cookieFlows.filter(
      (flow) => flow.sourceKeys.length > 0
    ); // labeledCookieFlows.length / cookieFlows.length gives the "effectiveness" percentage of "cookie assignment" heuristics
    const trkCookieFlows = labeledCookieFlows.filter((flow) =>
      flow.sourceKeys.some((key) => trkCookieKeys.includes(key))
    );

    const storageItemFlows = flows.filter(
      (flow) => flow.source === "storageItem"
    );
    const trkStorageItemFlows = flows
      .filter((flow) => flow.source === "storageItem")
      .filter((flow) =>
        flow.sourceKeys.some((key) => trkStorageItemKeys.includes(key))
      );

    const trkFlows = [...trkCookieFlows, ...trkStorageItemFlows];

    const requests = [...tf1ACtx.frames, ...tf1BCtx.frames].flatMap(
      ({ requests }) => requests
    );
    const tfAggregate = getSiteAggregateReport(
      trkFlows,
      requests,
      trkCookieKeys,
      contextSite
    );

    const compareBrowser = (browserId: BrowserId): SiteAggregateReport => {
      const ctxs = data
        .select({ browserId })
        .map((detail) => getContextSet(detail))
        .map((ctxSet) => contextSelector(ctxSet))
        .filter(isNonNullable);
      assert(
        ctxs.every((ctx) => ctx.origin === contextOrigin),
        `all ${JSON.stringify(
          ctxs.map((ctx) => ctx.origin)
        )} must be equal to ${contextOrigin}`
      );

      const reports = ctxs.flatMap(({ frames }) =>
        frames.flatMap(({ frame, requests }) => {
          const cookieKeys = distinct(frame.cookies.map(({ key }) => key));
          const matchingTrkCookieKeys = trkCookieKeys.filter((key) =>
            cookieKeys.includes(key)
          );

          const storageItemKeys = distinct(
            frame.storageItems.map(({ key }) => key)
          );

          const targetSites = requests.map((request) =>
            getSiteFromHostname(new URL(request.url).hostname)
          );

          const includedScripts = distinct(
            requests
              .filter((request) => request.resourceType === "script")
              .map((request) => {
                const scriptURL = new URL(request.url);
                return scriptURL.origin + scriptURL.pathname;
              })
          );

          const matchingTrkFlows = trkFlows.filter(
            (flow) =>
              flow.sourceKeys.some((key) => {
                const keys =
                  flow.source === "cookie" ? cookieKeys : storageItemKeys;
                return keys.includes(key);
              }) &&
              targetSites.includes(flow.targetSite) &&
              includedScripts.includes(flow.sinkScriptUrl)
          );

          return getSiteAggregateReport(
            matchingTrkFlows,
            requests,
            matchingTrkCookieKeys,
            contextSite
          );
        })
      );

      return combineSiteAggregateReportsSameOrigin(reports);
    };

    const ffAggregate = compareBrowser("firefox");
    const fxAggregate = compareBrowser("firefox-nops");
    const brAggregate = compareBrowser("brave");
    const bxAggregate = compareBrowser("brave-aggr");

    const notSubstrMatchingTrkFlows = trkFlows.filter(
      (flow) => !flow.substrMatching
    );

    const notLCSMatchingTrkFlows = trkFlows.filter((flow) => !flow.lcsMatching);

    return {
      general: {
        cookies: cookieKeys.length,
        trkCookies: trkCookieKeys.length,
        cookieFlows: cookieFlows.length,
        labeledCookieFlows: labeledCookieFlows.length,
        trkCookieFlows: trkCookieFlows.length,
        storageItems: storageItemKeys.length,
        trkStorageItems: trkStorageItemKeys.length,
        storageItemFlows: storageItemFlows.length,
        trkStorageItemFlows: trkStorageItemFlows.length,
        ga:
          trkCookieKeys.includes("_gid") ||
          trkCookieKeys.includes("_ga") ||
          trkStorageItemKeys.includes("_gid") ||
          trkStorageItemKeys.includes("_ga")
            ? 1
            : 0,

        notSubstrMatchingTrkFlows: notSubstrMatchingTrkFlows.length,
        notLCSMatchingTrkFlows: notLCSMatchingTrkFlows.length,
      },
      tfAggregate,
      ffAggregate,
      fxAggregate,
      brAggregate,
      bxAggregate,
    };
  };

  return {
    site: data.site,
    firstPartyContext: processContext((ctxSet) => ctxSet.firstPartyContext)!,
    thirdPartyContext: combineSiteContextReports(
      tf1ACtxSet.thirdPartyContexts
        .map((ctx) =>
          processContext(
            (ctxSet) =>
              ctxSet.thirdPartyContexts.find(
                (matchingCtx) => ctx.origin === matchingCtx.origin
              ) ?? null
          )
        )
        .filter(isNonNullable)
    ),
  };
};

const combineSiteAggregateReportsSameOrigin = (
  reports: SiteAggregateReport[]
): SiteAggregateReport => {
  return {
    trkFlows: distinct(reports.flatMap(({ trkFlows }) => trkFlows)),
    pureSameSiteTrkFlows: distinct(
      reports.flatMap(({ pureSameSiteTrkFlows }) => pureSameSiteTrkFlows)
    ),
    xdomSameSiteTrkFlows: distinct(
      reports.flatMap(({ xdomSameSiteTrkFlows }) => xdomSameSiteTrkFlows)
    ),
    trackers: distinct(reports.flatMap(({ trackers }) => trackers)),
    pureSameSiteTrackers: distinct(
      reports.flatMap(({ pureSameSiteTrackers }) => pureSameSiteTrackers)
    ),
    xdomSameSiteTrackers: distinct(
      reports.flatMap(({ xdomSameSiteTrackers }) => xdomSameSiteTrackers)
    ),
    trackersAll: distinct(reports.flatMap(({ trackersAll }) => trackersAll)),
  };
};

const combineSiteGeneralReports = (
  reports: SiteGeneralReport[]
): SiteGeneralReport => {
  return {
    cookies: sum(reports.map(({ cookies }) => cookies)),
    trkCookies: sum(reports.map(({ trkCookies }) => trkCookies)),
    cookieFlows: sum(reports.map(({ cookieFlows }) => cookieFlows)),
    labeledCookieFlows: sum(
      reports.map(({ labeledCookieFlows }) => labeledCookieFlows)
    ),
    trkCookieFlows: sum(reports.map(({ trkCookieFlows }) => trkCookieFlows)),
    storageItems: sum(reports.map(({ storageItems }) => storageItems)),
    trkStorageItems: sum(reports.map(({ trkStorageItems }) => trkStorageItems)),
    storageItemFlows: sum(
      reports.map(({ storageItemFlows }) => storageItemFlows)
    ),
    trkStorageItemFlows: sum(
      reports.map(({ trkStorageItemFlows }) => trkStorageItemFlows)
    ),
    ga: sum(reports.map(({ ga }) => ga)) > 0 ? 1 : 0,
    notSubstrMatchingTrkFlows: sum(
      reports.map(({ notSubstrMatchingTrkFlows }) => notSubstrMatchingTrkFlows)
    ),
    notLCSMatchingTrkFlows: sum(
      reports.map(({ notLCSMatchingTrkFlows }) => notLCSMatchingTrkFlows)
    ),
  };
};

const combineSiteAggregateReports = (
  reports: SiteAggregateReport[]
): SiteAggregateReport => {
  return {
    trkFlows: reports.flatMap(({ trkFlows }) => trkFlows),
    pureSameSiteTrkFlows: reports.flatMap(
      ({ pureSameSiteTrkFlows }) => pureSameSiteTrkFlows
    ),
    xdomSameSiteTrkFlows: reports.flatMap(
      ({ xdomSameSiteTrkFlows }) => xdomSameSiteTrkFlows
    ),
    trackers: distinct(reports.flatMap(({ trackers }) => trackers)),
    pureSameSiteTrackers: distinct(
      reports.flatMap(({ pureSameSiteTrackers }) => pureSameSiteTrackers)
    ),
    xdomSameSiteTrackers: distinct(
      reports.flatMap(({ xdomSameSiteTrackers }) => xdomSameSiteTrackers)
    ),
    trackersAll: distinct(reports.flatMap(({ trackersAll }) => trackersAll)),
  };
};

const combineSiteContextReports = (
  reports: SiteContextReport[]
): SiteContextReport => {
  return {
    general: combineSiteGeneralReports(reports.map(({ general }) => general)),
    tfAggregate: combineSiteAggregateReports(
      reports.map(({ tfAggregate }) => tfAggregate)
    ),
    ffAggregate: combineSiteAggregateReports(
      reports.map(({ ffAggregate }) => ffAggregate)
    ),
    fxAggregate: combineSiteAggregateReports(
      reports.map(({ fxAggregate }) => fxAggregate)
    ),
    brAggregate: combineSiteAggregateReports(
      reports.map(({ brAggregate }) => brAggregate)
    ),
    bxAggregate: combineSiteAggregateReports(
      reports.map(({ bxAggregate }) => bxAggregate)
    ),
  };
};

const getSiteAggregateReport = (
  trkFlows: Flow[],
  requests: Request[],
  trkCookies: string[],
  contextSite: string
): SiteAggregateReport => {
  const allowedTargetSites = distinct(
    requests
      .filter((request) => request.resourceType === "script")
      .map((request) => getSiteFromHostname(new URL(request.url).hostname))
  );
  let pureSameSiteTrkFlows: Flow[] = [];
  let xdomSameSiteTrkFlows: Flow[] = [];
  for (const flow of trkFlows) {
    if (allowedTargetSites.includes(flow.targetSite)) {
      pureSameSiteTrkFlows = [...pureSameSiteTrkFlows, flow];
    } else {
      xdomSameSiteTrkFlows = [...xdomSameSiteTrkFlows, flow];
    }
  }

  const trackers = distinct(trkFlows.map((flow) => flow.targetSite));

  const pureSameSiteTrackers = distinct(
    pureSameSiteTrkFlows.map((flow) => flow.targetSite)
  );
  const xdomSameSiteTrackers = distinct(
    xdomSameSiteTrkFlows.map((flow) => flow.targetSite)
  );

  const trackersAll = distinct([
    ...trackers,
    ...(trkCookies.length > 0 ? [contextSite] : []),
  ]);

  return {
    trkFlows,
    pureSameSiteTrkFlows,
    xdomSameSiteTrkFlows,
    trackers,
    pureSameSiteTrackers,
    xdomSameSiteTrackers,
    trackersAll,
  };
};

const getGlobalReport = (reports: SiteReport[]): GlobalReport => {
  const getGlobalGeneralReport = (
    reports: SiteGeneralReport[]
  ): GlobalGeneralReport => {
    const [cookies, cookieDomains] = bothSumCount(
      reports.map((report) => report.cookies)
    );
    const [trkCookies, trkCookieDomains] = bothSumCount(
      reports.map((report) => report.trkCookies)
    );
    const [cookieFlows, cookieFlowDomains] = bothSumCount(
      reports.map((report) => report.cookieFlows)
    );
    const [labeledCookieFlows, labeledCookieFlowDomains] = bothSumCount(
      reports.map((report) => report.labeledCookieFlows)
    );
    const [trkCookieFlows, trkCookieFlowDomains] = bothSumCount(
      reports.map((report) => report.trkCookieFlows)
    );

    const [storageItems, storageItemDomains] = bothSumCount(
      reports.map((report) => report.storageItems)
    );
    const [trkStorageItems, trkStorageItemDomains] = bothSumCount(
      reports.map((report) => report.trkStorageItems)
    );
    const [storageItemFlows, storageItemFlowDomains] = bothSumCount(
      reports.map((report) => report.storageItemFlows)
    );
    const [trkStorageItemFlows, trkStorageItemFlowDomains] = bothSumCount(
      reports.map((report) => report.trkStorageItemFlows)
    );

    const [cssis, cssiDomains] = bothSumCount(
      reports.map((report) => report.cookies + report.storageItems)
    );
    const [trkCssis, trkCssiDomains] = bothSumCount(
      reports.map((report) => report.trkCookies + report.trkStorageItems)
    );
    const [cssiFlows, cssiFlowDomains] = bothSumCount(
      reports.map((report) => report.cookieFlows + report.storageItemFlows)
    );
    const [trkCssiFlows, trkCssiFlowDomains] = bothSumCount(
      reports.map(
        (report) => report.trkCookieFlows + report.trkStorageItemFlows
      )
    );

    const gaDomains = countIfNonZero(reports.map((report) => report.ga));

    const [notSubstrMatchingTrkFlows, notSubstrMatchingTrkFlowDomains] =
      bothSumCount(reports.map((report) => report.notSubstrMatchingTrkFlows));

    const [notLCSMatchingTrkFlows, notLCSMatchingTrkFlowDomains] = bothSumCount(
      reports.map((report) => report.notLCSMatchingTrkFlows)
    );

    return {
      // cookies
      cookies,
      cookieDomains,
      trkCookies,
      trkCookieDomains,
      cookieFlows,
      cookieFlowDomains,
      labeledCookieFlows,
      labeledCookieFlowDomains,
      trkCookieFlows,
      trkCookieFlowDomains,
      // storageItems
      storageItems,
      storageItemDomains,
      trkStorageItems,
      trkStorageItemDomains,
      storageItemFlows,
      storageItemFlowDomains,
      trkStorageItemFlows,
      trkStorageItemFlowDomains,
      // cssis
      cssis,
      cssiDomains,
      trkCssis,
      trkCssiDomains,
      cssiFlows,
      cssiFlowDomains,
      trkCssiFlows,
      trkCssiFlowDomains,
      // ga
      gaDomains,
      // matching
      notSubstrMatchingTrkFlows,
      notSubstrMatchingTrkFlowDomains,
      notLCSMatchingTrkFlows,
      notLCSMatchingTrkFlowDomains,
    };
  };

  const getGlobalAggregateReport = (
    reports: SiteAggregateReport[]
  ): GlobalAggregateReport => {
    const [trkFlows, trkFlowDomains] = bothSumCount(
      reports.map((report) => report.trkFlows.length)
    );
    const [pureSameSiteTrkFlows, pureSameSiteTrkFlowDomains] = bothSumCount(
      reports.map((report) => report.pureSameSiteTrkFlows.length)
    );
    const [xdomSameSiteTrkFlows, xdomSameSiteTrkFlowDomains] = bothSumCount(
      reports.map((report) => report.xdomSameSiteTrkFlows.length)
    );

    const trackers = distinct(
      reports.flatMap((report) => report.trackers)
    ).length;
    const trackerDomains = countIfNonZero(
      reports.map((report) => report.trackers.length)
    );
    const pureSameSiteTrackers = distinct(
      reports.flatMap((report) => report.pureSameSiteTrackers)
    ).length;
    const pureSameSiteTrackerDomains = countIfNonZero(
      reports.map((report) => report.pureSameSiteTrackers.length)
    );
    const xdomSameSiteTrackers = distinct(
      reports.flatMap((report) => report.xdomSameSiteTrackers)
    ).length;
    const xdomSameSiteTrackerDomains = countIfNonZero(
      reports.map((report) => report.xdomSameSiteTrackers.length)
    );

    const rankTrackers = (
      trackersPerSite: string[][]
    ): TrackerRankingEntry[] => {
      const popularityMap = trackersPerSite.reduce((map, trackers) => {
        for (const tracker of trackers) {
          const currentPopularity = map.get(tracker) ?? 0;
          map.set(tracker, currentPopularity + 1);
        }
        return map;
      }, new Map<string, number>());

      return [...popularityMap.entries()]
        .map(([tracker, popularity]): TrackerRankingEntry => {
          return { tracker, popularity };
        })
        .sort((a, b) => -(a.popularity - b.popularity))
        .filter(({ popularity }) => popularity > 1);
    };
    const trackerRanking = rankTrackers(
      reports.map(({ trackers }) => trackers)
    );

    const trackersAll = distinct(
      reports.flatMap((report) => report.trackersAll)
    ).length;
    const trackerDomainsAll = countIfNonZero(
      reports.map((report) => report.trackersAll.length)
    );
    const trackerRankingAll = rankTrackers(
      reports.map(({ trackersAll }) => trackersAll)
    );

    return {
      // trkFlows
      trkFlows,
      trkFlowDomains,
      pureSameSiteTrkFlows,
      pureSameSiteTrkFlowDomains,
      xdomSameSiteTrkFlows,
      xdomSameSiteTrkFlowDomains,
      // trackers
      trackers,
      trackerDomains,
      pureSameSiteTrackers,
      pureSameSiteTrackerDomains,
      xdomSameSiteTrackers,
      xdomSameSiteTrackerDomains,
      trackerRanking,
      // trackersAll
      trackersAll: trackersAll,
      trackerDomainsAll: trackerDomainsAll,
      trackerRankingAll: trackerRankingAll,
    };
  };

  const getSitesWithOnlyFlowTrackers = (reports: SiteReport[]): string[] => {
    const trkCookieDomains = reports
      .filter((report) => report.thirdPartyContext.general.trkCookies > 0)
      .map(({ site }) => site);
    const trackerDomainsAll = reports
      .filter(
        (report) => report.thirdPartyContext.tfAggregate.trackersAll.length > 0
      )
      .map(({ site }) => site);
    return [...trackerDomainsAll].filter(
      (site) => !trkCookieDomains.includes(site)
    );
  };

  return {
    totalGeneral: getGlobalGeneralReport(
      reports.map((report) =>
        combineSiteGeneralReports([
          report.firstPartyContext.general,
          report.thirdPartyContext.general,
        ])
      )
    ),
    firstPartyGeneral: getGlobalGeneralReport(
      reports.map((report) => report.firstPartyContext.general)
    ),
    thirdPartyGeneral: getGlobalGeneralReport(
      reports.map((report) => report.thirdPartyContext.general)
    ),
    tfFirstPartyAggregate: getGlobalAggregateReport(
      reports.map((report) => report.firstPartyContext.tfAggregate)
    ),
    tfThirdPartyAggregate: getGlobalAggregateReport(
      reports.map((report) => report.thirdPartyContext.tfAggregate)
    ),
    ffFirstPartyAggregate: getGlobalAggregateReport(
      reports.map((report) => report.firstPartyContext.ffAggregate)
    ),
    ffThirdPartyAggregate: getGlobalAggregateReport(
      reports.map((report) => report.thirdPartyContext.ffAggregate)
    ),
    fxFirstPartyAggregate: getGlobalAggregateReport(
      reports.map((report) => report.firstPartyContext.fxAggregate)
    ),
    fxThirdPartyAggregate: getGlobalAggregateReport(
      reports.map((report) => report.thirdPartyContext.fxAggregate)
    ),
    brFirstPartyAggregate: getGlobalAggregateReport(
      reports.map((report) => report.firstPartyContext.brAggregate)
    ),
    brThirdPartyAggregate: getGlobalAggregateReport(
      reports.map((report) => report.thirdPartyContext.brAggregate)
    ),
    bxFirstPartyAggregate: getGlobalAggregateReport(
      reports.map((report) => report.firstPartyContext.bxAggregate)
    ),
    bxThirdPartyAggregate: getGlobalAggregateReport(
      reports.map((report) => report.thirdPartyContext.bxAggregate)
    ),
    sitesWithOnlyFlowTrackers: getSitesWithOnlyFlowTrackers(reports),
  };
};

// worker thread
if (!isMainThread) {
  if (parentPort) {
    const agent = new Agent(parentPort);

    agent.register(
      processSiteMulti.name,
      (sitesEntries: ExtendedSitesEntry[]): Promise<SiteReport[]> =>
        processSiteMulti(sitesEntries)
    );
  }
}
