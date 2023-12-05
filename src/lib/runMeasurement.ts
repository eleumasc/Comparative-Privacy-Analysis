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
import { unionSet } from "./util/set";

interface SiteReport {
  cookies: number;
  trkCookies: number;
  // xsTrkCookies: number; // distinct tracking cookie keys that we observe in a 3rd-party context
  cookieFlows: number;
  labeledCookieFlows: number;
  trkCookieFlows: number;

  storageItems: number;
  trkStorageItems: number;
  trkStorageItemFlows: number;

  tfAggregateReport: SiteAggregateReport;

  ffAggregateReport: SiteAggregateReport;
  fxAggregateReport: SiteAggregateReport;
  brAggregateReport: SiteAggregateReport;
  bxAggregateReport: SiteAggregateReport;
}

interface SiteAggregateReport {
  trkFlows: Flow[];
  intnSameSiteTrkFlows: Flow[];
  xdomSameSiteTrkFlows: Flow[];
  trackers: string[];
  intnSameSiteTrackers: string[];
  xdomSameSiteTrackers: string[];

  // xsTrkFlows: number; // distinct flows from tracking cookie/storageItem that we observe in a 3rd-party context
}

interface GlobalReport {
  cookies: number;
  cookieDomains: number;
  trkCookies: number;
  trkCookieDomains: number;
  cookieFlows: number;
  labeledCookieFlows: number;
  trkCookieFlows: number;
  trkCookieFlowDomains: number;

  storageItems: number;
  storageItemDomains: number;
  trkStorageItems: number;
  trkStorageItemDomains: number;
  trkStorageItemFlows: number;
  trkStorageItemFlowDomains: number;

  tfAggregateReport: GlobalAggregateReport;

  ffAggregateReport: GlobalAggregateReport;
  fxAggregateReport: GlobalAggregateReport;
  brAggregateReport: GlobalAggregateReport;
  bxAggregateReport: GlobalAggregateReport;
}

interface GlobalAggregateReport {
  trkFlows: number;
  trkFlowDomains: number;
  intnSameSiteTrkFlows: number;
  xdomSameSiteTrkFlows: number;
  trackers: number;
  trackerDomains: number;
  intnSameSiteTrackers: string[];
  xdomSameSiteTrackers: string[];
  trackerRanking: TrackerRankingEntry[];
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

  console.log("totalCount", totalCount);
  console.log("successCount", successCount);
  console.log("navigationErrorCount", navigationErrorCount);
  console.log("successRate", successRate);
  console.log("siteReports", siteReports.length);
  console.log("globalReport", JSON.stringify(getGlobalReport(siteReports)));
};

const processSite = (data: SiteAnalysisData, siteIndex: number): SiteReport => {
  console.log(siteIndex, data.site);

  const tf1A = data.select({
    browserId: "foxhound",
    index: 1,
    runId: "A",
  })[0];
  const tf1B = data.select({
    browserId: "foxhound",
    index: 1,
    runId: "B",
  })[0];
  const tf2A = data.select({
    browserId: "foxhound",
    index: 2,
    runId: "A",
  })[0];

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

  const tf1ACtxSet = getContextSet(tf1A);
  const tf1BCtxSet = getContextSet(tf1B);
  const tf2ACtxSet = getContextSet(tf2A);

  const tf1ACtx = tf1ACtxSet.firstPartyContext;
  const tf1BCtx = tf1BCtxSet.firstPartyContext;
  assert(tf1BCtx.origin === tf1ACtx.origin);
  const tf2ACtx = tf2ACtxSet.firstPartyContext;
  assert(tf2ACtx.origin === tf1ACtx.origin);

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

  const originSite = getSiteFromHostname(new URL(tf1ACtx.origin).hostname);
  const flows = distinct(
    [...tf1ACtx.frames, ...tf1BCtx.frames].flatMap(({ frame }) =>
      getFrameFlows(frame)
    ),
    equalsFlow
  ).filter((flow) => flow.targetSite !== originSite); // consider just cross-site flows

  const cookieFlows = flows.filter((flow) => flow.source === "cookie");
  const labeledCookieFlows = cookieFlows.filter(
    (flow) => flow.sourceKeys.length > 0
  ); // NOTE: labeledCookieFlows.length / cookieFlows.length gives the "effectiveness" percentage of "cookie assignment" heuristics
  const trkCookieFlows = labeledCookieFlows.filter((flow) =>
    flow.sourceKeys.some((key) => trkCookieKeys.includes(key))
  );

  const trkStorageItemFlows = flows
    .filter((flow) => flow.source === "storageItem")
    .filter((flow) =>
      flow.sourceKeys.some((key) => trkStorageItemKeys.includes(key))
    );

  const trkFlows = [...trkCookieFlows, ...trkStorageItemFlows];

  const selectRequestsByFrameId = (
    requests: Request[],
    frameId: string
  ): Request[] => {
    return requests.filter((request) => request.frameId === frameId);
  };

  const requests = [...tf1ACtx.frames, ...tf1BCtx.frames].flatMap(
    ({ requests }) => requests
  );
  const tfAggregateReport = getSiteAggregateReport(trkFlows, requests);

  const compareBrowser = (
    browserId: BrowserId,
    index: number
  ): SiteAggregateReport => {
    const details = data.select({ browserId, index });
    const frames = details.map((detail) => detail.frames[0]);
    assert(
      frames.every(
        (frame): frame is NonNullable<typeof frame> =>
          typeof frame !== "undefined"
      )
    );
    const cookieKeys = distinct(
      frames.flatMap((frame) => frame.cookies.map(({ key }) => key))
    );
    const storageItemKeys = distinct(
      frames.flatMap((frame) => frame.storageItems.map(({ key }) => key))
    );
    const thatRequests = details.flatMap((detail) =>
      selectRequestsByFrameId(detail.requests, detail.frames[0].frameId)
    );
    const targetSites = thatRequests.map((request) =>
      getSiteFromHostname(new URL(request.url).hostname)
    );
    const includedScripts = distinct(
      thatRequests
        .filter((request) => request.resourceType === "script")
        .map((request) => {
          const scriptURL = new URL(request.url);
          return scriptURL.origin + scriptURL.pathname;
        })
    );
    const thatTrkFlows = trkFlows.filter(
      (flow) =>
        flow.sourceKeys.some((key) => {
          const keys = flow.source === "cookie" ? cookieKeys : storageItemKeys;
          return keys.includes(key);
        }) &&
        targetSites.includes(flow.targetSite) &&
        includedScripts.includes(flow.sinkScriptUrl)
    );
    return getSiteAggregateReport(thatTrkFlows, thatRequests);
  };

  const getAggregateReportForOtherBrowser = (
    browserId: BrowserId
  ): SiteAggregateReport => {
    const aggregateReports = [
      compareBrowser(browserId, 1),
      compareBrowser(browserId, 2),
      compareBrowser(browserId, 3),
      compareBrowser(browserId, 4),
      compareBrowser(browserId, 5),
    ];
    return aggregateReports.reduce(
      (acc, cur) => {
        return {
          trkFlows: unionSet(acc.trkFlows, cur.trkFlows, null),
          intnSameSiteTrkFlows: unionSet(
            acc.intnSameSiteTrkFlows,
            cur.intnSameSiteTrkFlows,
            null
          ),
          xdomSameSiteTrkFlows: unionSet(
            acc.xdomSameSiteTrkFlows,
            cur.xdomSameSiteTrkFlows,
            null
          ),
          trackers: unionSet(acc.trackers, cur.trackers, null),
          intnSameSiteTrackers: unionSet(
            acc.intnSameSiteTrackers,
            cur.intnSameSiteTrackers,
            null
          ),
          xdomSameSiteTrackers: unionSet(
            acc.xdomSameSiteTrackers,
            cur.xdomSameSiteTrackers,
            null
          ),
        };
      },
      {
        trkFlows: [],
        intnSameSiteTrkFlows: [],
        xdomSameSiteTrkFlows: [],
        trackers: [],
        intnSameSiteTrackers: [],
        xdomSameSiteTrackers: [],
      }
    );
  };

  const ffAggregateReport = getAggregateReportForOtherBrowser("firefox");
  const fxAggregateReport = getAggregateReportForOtherBrowser("firefox-nops");
  const brAggregateReport = getAggregateReportForOtherBrowser("brave");
  const bxAggregateReport = getAggregateReportForOtherBrowser("brave-aggr");

  return {
    cookies: cookieKeys.length, // 1.A
    trkCookies: trkCookieKeys.length, // 1.B
    cookieFlows: cookieFlows.length, // 1.C
    labeledCookieFlows: labeledCookieFlows.length, // 1.D
    trkCookieFlows: trkCookieFlows.length, // 1.D

    storageItems: storageItemKeys.length, // 2.A
    trkStorageItems: trkStorageItemKeys.length, // 2.B
    trkStorageItemFlows: trkStorageItemFlows.length, // 2.C

    tfAggregateReport, // 3.A, ..., 3.F

    ffAggregateReport,
    fxAggregateReport,
    brAggregateReport,
    bxAggregateReport,
  };
};

const getSiteAggregateReport = (
  trkFlows: Flow[],
  requests: Request[]
): SiteAggregateReport => {
  const allowedTargetSites = distinct(
    requests
      .filter((request) => request.resourceType === "script")
      .map((request) => getSiteFromHostname(new URL(request.url).hostname))
  );
  const intnSameSiteTrkFlows = trkFlows.filter((flow) =>
    allowedTargetSites.includes(flow.targetSite)
  );
  const xdomSameSiteTrkFlows = trkFlows.filter(
    (flow) => !allowedTargetSites.includes(flow.targetSite)
  );

  const trackers = distinct(trkFlows.map((flow) => flow.targetSite));

  const intnSameSiteTrackers = distinct(
    intnSameSiteTrkFlows.map((flow) => flow.targetSite)
  );
  const xdomSameSiteTrackers = distinct(
    xdomSameSiteTrkFlows.map((flow) => flow.targetSite)
  );

  return {
    trkFlows,
    intnSameSiteTrkFlows,
    xdomSameSiteTrkFlows,
    trackers,
    intnSameSiteTrackers,
    xdomSameSiteTrackers,
  };
};

const getGlobalReport = (siteReports: SiteReport[]): GlobalReport => {
  const globalAggregateReportBase: GlobalAggregateReport = {
    trkFlows: 0,
    trkFlowDomains: 0,
    intnSameSiteTrkFlows: 0,
    xdomSameSiteTrkFlows: 0,
    trackers: 0,
    trackerDomains: 0,
    intnSameSiteTrackers: [],
    xdomSameSiteTrackers: [],
    trackerRanking: [],
  };
  const createReduceGlobalAggregateReport = (
    siteAggregateReports: SiteAggregateReport[]
  ) => {
    const trackers = distinct(
      siteAggregateReports.flatMap(
        (siteAggregateReport) => siteAggregateReport.trackers
      )
    );
    const intnSameSiteTrackers = distinct(
      siteAggregateReports.flatMap(
        (siteAggregateReport) => siteAggregateReport.intnSameSiteTrackers
      )
    );
    const xdomSameSiteTrackers = distinct(
      siteAggregateReports.flatMap(
        (siteAggregateReport) => siteAggregateReport.xdomSameSiteTrackers
      )
    );
    const trackerRanking = rankTrackers(siteAggregateReports);

    return (
      acc: GlobalAggregateReport,
      cur: SiteAggregateReport
    ): GlobalAggregateReport => {
      return {
        trkFlows: acc.trkFlows + cur.trkFlows.length,
        trkFlowDomains: acc.trkFlowDomains + (cur.trkFlows.length > 0 ? 1 : 0),
        intnSameSiteTrkFlows:
          acc.intnSameSiteTrkFlows + cur.intnSameSiteTrkFlows.length,
        xdomSameSiteTrkFlows:
          acc.xdomSameSiteTrkFlows + cur.xdomSameSiteTrkFlows.length,
        trackers: trackers.length,
        trackerDomains: acc.trackerDomains + (cur.trackers.length > 0 ? 1 : 0),
        intnSameSiteTrackers: intnSameSiteTrackers,
        xdomSameSiteTrackers: xdomSameSiteTrackers,
        trackerRanking,
      };
    };
  };

  const tfReduceGlobalAggregateReport = createReduceGlobalAggregateReport(
    siteReports.map(({ tfAggregateReport }) => tfAggregateReport)
  );

  const ffReduceGlobalAggregateReport = createReduceGlobalAggregateReport(
    siteReports.map(({ ffAggregateReport }) => ffAggregateReport)
  );
  const fxReduceGlobalAggregateReport = createReduceGlobalAggregateReport(
    siteReports.map(({ fxAggregateReport }) => fxAggregateReport)
  );
  const brReduceGlobalAggregateReport = createReduceGlobalAggregateReport(
    siteReports.map(({ brAggregateReport }) => brAggregateReport)
  );
  const bxReduceGlobalAggregateReport = createReduceGlobalAggregateReport(
    siteReports.map(({ bxAggregateReport }) => bxAggregateReport)
  );

  return siteReports.reduce<GlobalReport>(
    (acc, cur) => {
      return {
        cookies: acc.cookies + cur.cookies,
        cookieDomains: acc.cookieDomains + (cur.cookies > 0 ? 1 : 0),
        trkCookies: acc.trkCookies + cur.trkCookies,
        trkCookieDomains: acc.trkCookieDomains + (cur.trkCookies > 0 ? 1 : 0),
        cookieFlows: acc.cookieFlows + cur.cookieFlows,
        labeledCookieFlows: acc.labeledCookieFlows + cur.labeledCookieFlows,
        trkCookieFlows: acc.trkCookieFlows + cur.trkCookieFlows,
        trkCookieFlowDomains:
          acc.trkCookieFlowDomains + (cur.trkCookieFlows > 0 ? 1 : 0),

        storageItems: acc.storageItems + cur.storageItems,
        storageItemDomains:
          acc.storageItemDomains + (cur.storageItems > 0 ? 1 : 0),
        trkStorageItems: acc.trkStorageItems + cur.trkStorageItems,
        trkStorageItemDomains:
          acc.trkStorageItemDomains + (cur.trkStorageItems > 0 ? 1 : 0),
        trkStorageItemFlows: acc.trkStorageItemFlows + cur.trkStorageItemFlows,
        trkStorageItemFlowDomains:
          acc.trkStorageItemFlowDomains + (cur.trkStorageItemFlows > 0 ? 1 : 0),

        tfAggregateReport: tfReduceGlobalAggregateReport(
          acc.tfAggregateReport,
          cur.tfAggregateReport
        ),

        ffAggregateReport: ffReduceGlobalAggregateReport(
          acc.ffAggregateReport,
          cur.ffAggregateReport
        ),
        fxAggregateReport: fxReduceGlobalAggregateReport(
          acc.fxAggregateReport,
          cur.fxAggregateReport
        ),
        brAggregateReport: brReduceGlobalAggregateReport(
          acc.brAggregateReport,
          cur.brAggregateReport
        ),
        bxAggregateReport: bxReduceGlobalAggregateReport(
          acc.bxAggregateReport,
          cur.bxAggregateReport
        ),
      };
    },
    {
      cookies: 0,
      cookieDomains: 0,
      trkCookies: 0,
      trkCookieDomains: 0,
      cookieFlows: 0,
      labeledCookieFlows: 0,
      trkCookieFlows: 0,
      trkCookieFlowDomains: 0,

      storageItems: 0,
      storageItemDomains: 0,
      trkStorageItems: 0,
      trkStorageItemDomains: 0,
      trkStorageItemFlows: 0,
      trkStorageItemFlowDomains: 0,

      tfAggregateReport: globalAggregateReportBase,

      ffAggregateReport: globalAggregateReportBase,
      fxAggregateReport: globalAggregateReportBase,
      brAggregateReport: globalAggregateReportBase,
      bxAggregateReport: globalAggregateReportBase,
    }
  );
};

const rankTrackers = (
  siteAggregateReports: SiteAggregateReport[]
): TrackerRankingEntry[] => {
  const popularityMap = siteAggregateReports.reduce(
    (map, siteAggregateReport) => {
      for (const tracker of siteAggregateReport.trackers) {
        const currentPopularity = map.get(tracker) ?? 0;
        map.set(tracker, currentPopularity + 1);
      }
      return map;
    },
    new Map<string, number>()
  );

  return [...popularityMap.entries()]
    .map(
      ([tracker, popularity]): TrackerRankingEntry => ({ tracker, popularity })
    )
    .sort((a, b) => -(a.popularity - b.popularity))
    .filter(({ popularity }) => popularity > 1);
};
