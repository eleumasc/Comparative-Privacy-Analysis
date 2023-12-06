import assert from "assert";
import { Config } from "./Config";
import { cookieSwapPartyHeuristics } from "./measurement/cookieSwapPartyHeuristics";
import { Flow, equalsFlow, getFrameFlows } from "./measurement/Flow";
import { BrowserId, SiteAnalysisData } from "./measurement/SiteAnalysisData";
import {
  AnalysisDetail,
  Cookie,
  Frame,
  Request,
  SitesEntry,
  StorageItem,
} from "./model";
import { distinct, mapSequentialAsync } from "./util/array";
import { getSiteFromHostname } from "./measurement/getSiteFromHostname";
import { readFile } from "fs/promises";
import path from "path";

interface SiteReport {
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
  // crossSite...
  crossSiteTrkFlows: Flow[];
  crossSiteCookies: string[];
}

interface GlobalReport {
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
  // crossSite...
  crossSiteTrkFlows: number;
  crossSiteTrkFlowDomains: number;
  crossSiteCookies: number;
  crossSiteCookieDomains: number;
}

interface TrackerRankingEntry {
  tracker: string;
  popularity: number;
}

export const runMeasurement = async (config: Config) => {
  const outputPath = (() => {
    const arg = process.argv[2];
    assert(typeof arg === "string", "outputPath must be a string");
    return arg;
  })();
  const sliceEnd = (() => {
    const arg = process.argv[3];
    if (typeof arg !== "undefined") {
      const num = +arg;
      assert(!Number.isNaN(num), "sliceEnd must be a number");
      return num;
    } else {
      return undefined;
    }
  })();

  const sitesEntries = JSON.parse(
    (await readFile(path.join(outputPath, "sites.json"))).toString()
  ) as SitesEntry[];

  const totalCount = sitesEntries.length;
  const successSitesEntries = sitesEntries.filter(
    (sitesEntry) => sitesEntry.failureError === null
  );
  const successCount = successSitesEntries.length;
  const navigationErrorCount = sitesEntries.filter(
    (sitesEntry) => sitesEntry.failureError === "NavigationError"
  ).length;
  const successRate = successCount / (totalCount - navigationErrorCount);

  const slicedSuccessSitesEntries =
    sliceEnd !== null
      ? successSitesEntries.slice(0, sliceEnd)
      : successSitesEntries;

  const siteReports = (
    await mapSequentialAsync(
      slicedSuccessSitesEntries,
      async (siteEntry, siteIndex) => {
        const { site } = siteEntry;
        try {
          const data = await SiteAnalysisData.fromFile(outputPath, site);
          return processSite(data, siteIndex);
        } catch (e) {
          console.log(e);
          return null;
        }
      }
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  console.log(
    JSON.stringify({
      totalCount: totalCount,
      successCount: successCount,
      navigationErrorCount: navigationErrorCount,
      successRate: successRate,
      siteReports: siteReports.length,
      globalReport: getGlobalReport(siteReports),
    })
  );
};

const processSite = (data: SiteAnalysisData, siteIndex: number): SiteReport => {
  console.log(siteIndex, data.site);

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
    contextSelector: (contextSet: ContextSet) => Context | null,
    isThirdPartyContext?: boolean
  ): SiteContextReport | null => {
    const tf1ACtx = contextSelector(tf1ACtxSet);
    if (!tf1ACtx) {
      return null;
    }
    const contextOrigin = tf1ACtx.origin;
    const tf1BCtx = contextSelector(tf1BCtxSet);
    if (!tf1BCtx) {
      return null;
    }
    assert(tf1BCtx.origin === contextOrigin, `${tf1BCtx.origin} must be equal to ${contextOrigin}`);
    const tf2ACtx = contextSelector(tf2ACtxSet);
    if (!tf2ACtx) {
      return null;
    }
    assert(tf2ACtx.origin === contextOrigin,  `${tf2ACtx.origin} must be equal to ${contextOrigin}`);

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
      getNotPartitionedStorage(isThirdPartyContext ?? false, "foxhound")
    );

    const compareBrowser = (
      browserId: BrowserId,
      index: number
    ): SiteAggregateReport | null => {
      const ctxs = data
        .select({ browserId, index })
        .map((detail) => getContextSet(detail))
        .map((ctxSet) => contextSelector(ctxSet));
      if (!ctxs.every((ctx): ctx is NonNullable<typeof ctx> => ctx !== null)) {
        return null;
      }
      assert(ctxs.every((ctx) => ctx.origin === contextOrigin),  `all ${JSON.stringify(ctxs.map(ctx => ctx.origin))} must be equal to ${contextOrigin}`);

      return mergeAggregateReports(
        ctxs.flatMap(({ frames }) => {
          return frames.flatMap(({ frame, requests }) => {
            const cookieKeys = distinct(frame.cookies.map(({ key }) => key));

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
              getNotPartitionedStorage(isThirdPartyContext ?? false, browserId)
            );
          });
        })
      );
    };

    const mergeAggregateReports = (
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
        crossSiteTrkFlows: distinct(
          reports.flatMap(({ crossSiteTrkFlows }) => crossSiteTrkFlows)
        ),
        crossSiteCookies: distinct(
          reports.flatMap(({ crossSiteCookies }) => crossSiteCookies)
        ),
      };
    };

    const getAggregateReportForOtherBrowser = (
      browserId: BrowserId
    ): SiteAggregateReport => {
      return mergeAggregateReports(
        [
          compareBrowser(browserId, 1),
          compareBrowser(browserId, 2),
          compareBrowser(browserId, 3),
          compareBrowser(browserId, 4),
          compareBrowser(browserId, 5),
        ].filter((x): x is NonNullable<typeof x> => x !== null)
      );
    };

    const ffAggregate = getAggregateReportForOtherBrowser("firefox");
    const fxAggregate = getAggregateReportForOtherBrowser("firefox-nops");
    const brAggregate = getAggregateReportForOtherBrowser("brave");
    const bxAggregate = getAggregateReportForOtherBrowser("brave-aggr");

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
      },
      tfAggregate,
      ffAggregate,
      fxAggregate,
      brAggregate,
      bxAggregate,
    };
  };

  return {
    firstPartyContext: processContext((ctxSet) => ctxSet.firstPartyContext)!,
    thirdPartyContext: combineSiteContextReports(
      tf1ACtxSet.thirdPartyContexts
        .map((ctx) =>
          processContext(
            (ctxSet) =>
              ctxSet.thirdPartyContexts.find(
                (matchingCtx) => ctx.origin === matchingCtx.origin
              ) ?? null,
            true
          )
        )
        .filter((x): x is NonNullable<typeof x> => x !== null)
    ),
  };
};

const combineSiteGeneralReports = (
  reports: SiteGeneralReport[]
): SiteGeneralReport => {
  const cookies = sum(reports.map(({ cookies }) => cookies));
  const trkCookies = sum(reports.map(({ trkCookies }) => trkCookies));
  const cookieFlows = sum(reports.map(({ cookieFlows }) => cookieFlows));
  const labeledCookieFlows = sum(
    reports.map(({ labeledCookieFlows }) => labeledCookieFlows)
  );
  const trkCookieFlows = sum(
    reports.map(({ trkCookieFlows }) => trkCookieFlows)
  );
  const storageItems = sum(reports.map(({ storageItems }) => storageItems));
  const trkStorageItems = sum(
    reports.map(({ trkStorageItems }) => trkStorageItems)
  );
  const storageItemFlows = sum(
    reports.map(({ storageItemFlows }) => storageItemFlows)
  );
  const trkStorageItemFlows = sum(
    reports.map(({ trkStorageItemFlows }) => trkStorageItemFlows)
  );
  return {
    cookies,
    trkCookies,
    cookieFlows,
    labeledCookieFlows,
    trkCookieFlows,
    storageItems,
    trkStorageItems,
    storageItemFlows,
    trkStorageItemFlows,
  };
};

const combineSiteAggregateReports = (
  reports: SiteAggregateReport[]
): SiteAggregateReport => {
  const trkFlows = reports.flatMap(({ trkFlows }) => trkFlows);
  const pureSameSiteTrkFlows = reports.flatMap(
    ({ pureSameSiteTrkFlows }) => pureSameSiteTrkFlows
  );
  const xdomSameSiteTrkFlows = reports.flatMap(
    ({ xdomSameSiteTrkFlows }) => xdomSameSiteTrkFlows
  );
  const trackers = distinct(reports.flatMap(({ trackers }) => trackers));
  const pureSameSiteTrackers = distinct(
    reports.flatMap(({ pureSameSiteTrackers }) => pureSameSiteTrackers)
  );
  const xdomSameSiteTrackers = distinct(
    reports.flatMap(({ xdomSameSiteTrackers }) => xdomSameSiteTrackers)
  );
  const crossSiteTrkFlows = reports.flatMap(
    ({ crossSiteTrkFlows }) => crossSiteTrkFlows
  );
  const crossSiteCookies = reports.flatMap(
    ({ crossSiteCookies }) => crossSiteCookies
  );

  return {
    trkFlows,
    pureSameSiteTrkFlows,
    xdomSameSiteTrkFlows,
    trackers,
    pureSameSiteTrackers,
    xdomSameSiteTrackers,
    crossSiteTrkFlows,
    crossSiteCookies,
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

const getNotPartitionedStorage = (
  isThirdPartyContext: boolean,
  browserId: BrowserId
): boolean | undefined => {
  if (!isThirdPartyContext) {
    return undefined;
  }
  switch (browserId) {
    case "foxhound":
    case "firefox-nops":
      return true;
    case "firefox":
    case "brave":
    case "brave-aggr":
      return false;
  }
};

const getSiteAggregateReport = (
  trkFlows: Flow[],
  requests: Request[],
  notPartitionedStorage?: boolean // boolean in a third-party context, undefined otherwise
): SiteAggregateReport => {
  const allowedTargetSites = distinct(
    requests
      .filter((request) => request.resourceType === "script")
      .map((request) => getSiteFromHostname(new URL(request.url).hostname))
  );
  let pureSameSiteTrkFlows: Flow[] = [];
  let xdomSameSiteTrkFlows: Flow[] = [];
  let crossSiteTrkFlows: Flow[] = [];
  if (typeof notPartitionedStorage !== "undefined" && notPartitionedStorage) {
    crossSiteTrkFlows = trkFlows;
  } else {
    for (const flow of trkFlows) {
      if (allowedTargetSites.includes(flow.targetSite)) {
        pureSameSiteTrkFlows = [...pureSameSiteTrkFlows, flow];
      } else {
        xdomSameSiteTrkFlows = [...xdomSameSiteTrkFlows, flow];
      }
    }
  }

  const trackers = distinct(trkFlows.map((flow) => flow.targetSite));

  const pureSameSiteTrackers = distinct(
    pureSameSiteTrkFlows.map((flow) => flow.targetSite)
  );
  const xdomSameSiteTrackers = distinct(
    xdomSameSiteTrkFlows.map((flow) => flow.targetSite)
  );

  return {
    trkFlows,
    pureSameSiteTrkFlows,
    xdomSameSiteTrkFlows,
    trackers,
    pureSameSiteTrackers,
    xdomSameSiteTrackers,
    crossSiteTrkFlows,
    crossSiteCookies: [], // TODO: implement
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
    const trackerDomains = count(
      reports.map((report) => report.trackers.length)
    );
    const pureSameSiteTrackers = distinct(
      reports.flatMap((report) => report.pureSameSiteTrackers)
    ).length;
    const pureSameSiteTrackerDomains = count(
      reports.map((report) => report.pureSameSiteTrackers.length)
    );
    const xdomSameSiteTrackers = distinct(
      reports.flatMap((report) => report.xdomSameSiteTrackers)
    ).length;
    const xdomSameSiteTrackerDomains = count(
      reports.map((report) => report.xdomSameSiteTrackers.length)
    );

    const rankTrackers = (
      reports: SiteAggregateReport[]
    ): TrackerRankingEntry[] => {
      const popularityMap = reports.reduce((map, report) => {
        for (const tracker of report.trackers) {
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
    const trackerRanking = rankTrackers(reports);

    const [crossSiteTrkFlows, crossSiteTrkFlowDomains] = bothSumCount(
      reports.map((report) => report.crossSiteTrkFlows.length)
    );
    const [crossSiteCookies, crossSiteCookieDomains] = bothSumCount(
      reports.map((report) => report.crossSiteCookies.length)
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
      // crossSite...
      crossSiteTrkFlows,
      crossSiteTrkFlowDomains,
      crossSiteCookies,
      crossSiteCookieDomains,
    };
  };

  return {
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
  };
};

const sum = (values: number[]): number => {
  return values.reduce((acc, value) => acc + value, 0);
};
const count = (values: number[]): number => {
  return values.reduce((acc, value) => acc + (value > 0 ? 1 : 0), 0);
};
const bothSumCount = (values: number[]): [number, number] => {
  return [sum(values), count(values)];
};
