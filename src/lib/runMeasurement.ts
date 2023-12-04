import assert from "assert";
import { Config } from "./Config";
import { cookieSwapPartyHeuristics } from "./measurement/cookieSwapPartyHeuristics";
import { Flow, equalsFlow, getFlowsFromTaintReport } from "./measurement/Flow";
import { BrowserId, SiteAnalysisData } from "./measurement/SiteAnalysisResult";
import { Frame, KeyValuePair, Request, SitesEntry, TaintReport } from "./model";
import { distinct, mapSequentialAsync } from "./util/array";
import { getSiteFromHostname } from "./measurement/getSiteFromHostname";
import { readFile } from "fs/promises";
import path from "path";
import { unionSet } from "./util/set";

interface SiteReport {
  cookies: number;
  trkCookies: number;
  cookieFlows: number;
  labeledCookieFlows: number;
  trkCookieFlows: number;

  storageItems: number;
  trkStorageItems: number;
  trkStorageItemFlows: number;

  tfAggregateReport: SiteAggregateReport;

  brAggregateReport: SiteAggregateReport;
}

interface SiteAggregateReport {
  trkFlows: Flow[];
  intnSameSiteTrkFlows: Flow[];
  xdomSameSiteTrkFlows: Flow[];
  trackers: string[];
  intnSameSiteTrackers: string[];
  xdomSameSiteTrackers: string[];

  // xsTrkCookies: number; // distinct tracking cookie keys that we observe in a 3rd-party context
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

  brAggregateReport: GlobalAggregateReport;
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
  const outputPath = process.argv[2];
  assert(typeof outputPath === "string");

  const sitesEntries = (
    JSON.parse(
      (await readFile(path.join(outputPath, "sites.json"))).toString()
    ) as SitesEntry[]
  ).slice(0, 250); // TODO: remove slicing

  const totalCount = sitesEntries.length;
  const successSitesEntries = sitesEntries.filter(
    (sitesEntry) => sitesEntry.failureError === null
  );
  const successCount = successSitesEntries.length;
  const navigationErrorCount = sitesEntries.filter(
    (sitesEntry) => sitesEntry.failureError === "NavigationError"
  ).length;
  const successRate = successCount / (totalCount - navigationErrorCount);
  console.log("totalCount", totalCount);
  console.log("successCount", successCount);
  console.log("navigationErrorCount", navigationErrorCount);
  console.log("successRate", successRate);

  const siteReports = (
    await mapSequentialAsync(
      successSitesEntries,
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

  console.log(getGlobalReport(siteReports));
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

  const tf1AFrame = tf1A.frames[0];
  assert(typeof tf1AFrame !== "undefined", "Main frame does not exist");
  const tf1BFrame = tf1B.frames[0];
  const tf2AFrame = tf2A.frames[0];
  assert(
    typeof tf1BFrame !== "undefined" && typeof tf2AFrame !== "undefined",
    "No matching frame found"
  );

  const equalsKey = (
    { key: k1 }: KeyValuePair,
    { key: k2 }: KeyValuePair
  ): boolean => k1 === k2;
  const cookies1A = distinct(tf1AFrame.cookies, equalsKey);
  const cookies1B = distinct(tf1BFrame.cookies, equalsKey);
  const cookies2A = distinct(tf2AFrame.cookies, equalsKey);
  const cookieKeys = distinct([
    ...cookies1A.map((cookie) => cookie.key),
    ...cookies1B.map((cookie) => cookie.key),
  ]);
  const trkCookieKeys = cookieSwapPartyHeuristics(
    cookies1A,
    cookies1B,
    cookies2A,
    true
  );
  const storageItems1A = distinct(tf1AFrame.storageItems, equalsKey);
  const storageItems1B = distinct(tf1BFrame.storageItems, equalsKey);
  const storageItems2A = distinct(tf2AFrame.storageItems, equalsKey);
  const storageItemKeys = distinct([
    ...storageItems1A.map((storageItem) => storageItem.key),
    ...storageItems1B.map((storageItem) => storageItem.key),
  ]);
  const trkStorageItemKeys = cookieSwapPartyHeuristics(
    storageItems1A,
    storageItems1B,
    storageItems2A
  );

  const getFlowsFromTaintReports = (
    taintReports: TaintReport[],
    frame: Frame
  ): Flow[] => {
    return taintReports.flatMap((taintReport) =>
      getFlowsFromTaintReport(taintReport, frame)
    );
  };
  const frameSite = getSiteFromHostname(new URL(tf1AFrame.url).hostname);
  const flows = distinct(
    [
      ...getFlowsFromTaintReports(tf1AFrame.taintReports!, tf1AFrame),
      ...getFlowsFromTaintReports(tf1BFrame.taintReports!, tf1BFrame),
    ],
    equalsFlow
  ).filter((flow) => flow.targetSite !== frameSite); // consider just cross-site flows

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

  const requests = [
    ...selectRequestsByFrameId(tf1A.requests, tf1AFrame.frameId),
    ...selectRequestsByFrameId(tf1B.requests, tf1BFrame.frameId),
  ];
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

  const brAggregateReport = getAggregateReportForOtherBrowser("brave");

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

    brAggregateReport,
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
  const createGetGlobalAggregateReport = (
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

  const getTfGlobalAggregateReport = createGetGlobalAggregateReport(
    siteReports.map(({ tfAggregateReport }) => tfAggregateReport)
  );
  const getBrGlobalAggregateReport = createGetGlobalAggregateReport(
    siteReports.map(({ brAggregateReport }) => brAggregateReport)
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

        tfAggregateReport: getTfGlobalAggregateReport(
          acc.tfAggregateReport,
          cur.tfAggregateReport
        ),
        brAggregateReport: getBrGlobalAggregateReport(
          acc.brAggregateReport,
          cur.brAggregateReport
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

      brAggregateReport: globalAggregateReportBase,
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
