import assert from "assert";
import { Config } from "./Config";
import { cookieSwapPartyHeuristics } from "./measurement/cookieSwapPartyHeuristics";
import { Flow, createFlow, equalsFlow } from "./measurement/Flow";
import { BrowserId, SiteAnalysisData } from "./measurement/SiteAnalysisResult";
import { Frame, KeyValuePair, Request, SitesEntry, TaintReport } from "./model";
import { distinct, mapSequentialAsync } from "./util/array";
import { getSiteFromHostname } from "./measurement/getSiteFromHostname";
import { readFile } from "fs/promises";
import path from "path";

interface SiteReport {
  cookies: number;
  cookieDomains: number;
  trkCookies: number;
  trkCookieDomains: number;
  trkCookieFlows: number;
  trkCookieFlowDomains: number;
  cookieAssignmentLabeledFlows: number;

  storageItems: number;
  storageItemDomains: number;
  trkStorageItems: number;
  trkStorageItemDomain: number;
  trkStorageItemFlows: number;
  trkStorageItemFlowDomains: number;

  trkFlows: number;
  trkFlowDomains: number;
  intnSameSiteTrkFlows: number;
  xdomSameSiteTrkFlows: number;
  trackers: string[];
  trackerDomains: number;
  intnSameSiteTrackers: string[];
  xdomSameSiteTrackers: string[];
}

interface AggregateReport {
  cookies: number;
  cookieDomains: number;
  trkCookies: number;
  trkCookieDomains: number;
  trkCookieFlows: number;
  trkCookieFlowDomains: number;
  cookieAssignmentLabeledFlows: number;

  storageItems: number;
  storageItemDomains: number;
  trkStorageItems: number;
  trkStorageItemDomain: number;
  trkStorageItemFlows: number;
  trkStorageItemFlowDomains: number;

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
  ).slice(0, 50); // TODO: remove slicing

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

  console.log(aggregate(siteReports));
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

  const createFlows = (taintReports: TaintReport[], frame: Frame): Flow[] => {
    return taintReports.flatMap((taintReport) => {
      try {
        return [createFlow(taintReport, frame)];
      } catch {
        return [];
      }
    });
  };
  const actualSite = getSiteFromHostname(new URL(tf1AFrame.url).hostname);
  const flows = distinct(
    [
      ...createFlows(tf1AFrame.taintReports!, tf1AFrame),
      ...createFlows(tf1BFrame.taintReports!, tf1BFrame),
    ],
    equalsFlow
  ).filter((flow) => flow.targetSite !== actualSite); // consider just cross-site flows

  const readingDocumentCookieFlows = flows.filter(
    (flow) => flow._readingDocumentCookie
  );
  const taintCookieFlows = readingDocumentCookieFlows.filter(
    (flow) => flow.cookieKeys.length > 0
  ); // NOTE: taintCookieFlows.length / readingDocumentCookieFlows.length gives the "effectiveness" percentage of "cookie assignment" heuristics
  const trkCookieFlows = taintCookieFlows.filter((flow) =>
    flow.cookieKeys.some((key) => trkCookieKeys.includes(key))
  );

  const trkStorageItemFlows = flows
    .filter((flow) => flow.storageItemKeys.length > 0)
    .filter((flow) =>
      flow.storageItemKeys.some((key) => trkStorageItemKeys.includes(key))
    );

  const trkFlows = distinct(
    [...trkCookieFlows, ...trkStorageItemFlows],
    equalsFlow
  );

  const selectAllowedTargetSites = (
    requests: Request[],
    frameId: string
  ): string[] => {
    return distinct(
      requests
        .filter((request) => request.frameId === frameId)
        .filter((request) => request.resourceType === "script")
        .map((request) => getSiteFromHostname(new URL(request.url).hostname))
    );
  };
  const allowedTargetSites = distinct([
    ...selectAllowedTargetSites(tf1A.requests, tf1AFrame.frameId),
    ...selectAllowedTargetSites(tf1B.requests, tf1BFrame.frameId),
  ]);
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

  // const compareBrowser = (browserId: BrowserId) => {
  //   const details = data.select({ browserId });
  //   const frames = details.map((br) => br.frames[0]);
  //   assert(
  //     frames.every(
  //       (frame): frame is NonNullable<typeof frame> =>
  //         typeof frame !== "undefined"
  //     )
  //   );
  //   const cookieKeys = distinct(
  //     frames.flatMap((frame) => frame.cookies.map(({ key }) => key))
  //   );
  //   const storageItemKeys = distinct(
  //     frames.flatMap((frame) => frame.storageItems.map(({ key }) => key))
  //   );
  //   const requests = details.flatMap((br) =>
  //     br.requests.filter((request) => request.frameId === br.frames[0].frameId)
  //   );
  //   const targetSites = requests.map((request) =>
  //     getSiteFromHostname(new URL(request.url).hostname)
  //   );
  //   const includedScripts = distinct(
  //     requests
  //       .filter((request) => request.resourceType === "script")
  //       .map((request) => {
  //         const scriptURL = new URL(request.url);
  //         return scriptURL.origin + scriptURL.pathname;
  //       })
  //   );
  //   const matchedTrackingFlows = trkFlows.filter(
  //     (flow) =>
  //       flow.cookieKeys.some((key) => cookieKeys.includes(key)) &&
  //       flow.storageItemKeys.some((key) => storageItemKeys.includes(key)) &&
  //       targetSites.includes(flow.targetSite) &&
  //       includedScripts.includes(flow.sinkScriptUrl)
  //   );
  //   return {
  //     cookieKeys,
  //     storageItemKeys,
  //     targetSites,
  //     includedScripts,
  //     matchedTrackingFlows,
  //   };
  // };

  // const ffResult = compareBrowser("firefox");
  // const fxResult = compareBrowser("firefox-nops");
  // const brResult = compareBrowser("brave");
  // const bxResult = compareBrowser("brave-aggr");

  return {
    cookies: cookieKeys.length, // 1.A
    cookieDomains: cookieKeys.length > 0 ? 1 : 0, // 1.A
    trkCookies: trkCookieKeys.length, // 1.B
    trkCookieDomains: trkCookieKeys.length > 0 ? 1 : 0, // 1.B
    trkCookieFlows: trkCookieFlows.length, // 1.C
    trkCookieFlowDomains: trkCookieFlows.length > 0 ? 1 : 0, // 1.C
    cookieAssignmentLabeledFlows: taintCookieFlows.length, // 1.D

    storageItems: storageItemKeys.length, // 2.A
    storageItemDomains: storageItemKeys.length > 0 ? 1 : 0, // 2.A
    trkStorageItems: trkStorageItemKeys.length, // 2.B
    trkStorageItemDomain: trkStorageItemKeys.length > 0 ? 1 : 0, // 2.B
    trkStorageItemFlows: trkStorageItemFlows.length, // 2.C
    trkStorageItemFlowDomains: trkStorageItemFlows.length > 0 ? 1 : 0, // 2.C

    trkFlows: trkFlows.length, // 3.A
    trkFlowDomains: trkFlows.length > 0 ? 1 : 0, // 3.B
    intnSameSiteTrkFlows: intnSameSiteTrkFlows.length, // 3.C
    xdomSameSiteTrkFlows: xdomSameSiteTrkFlows.length, // 3.C
    trackers, // 3.D, 3.F
    trackerDomains: trackers.length > 0 ? 1 : 0, // 3.D
    intnSameSiteTrackers, // 3.E
    xdomSameSiteTrackers, // 3.E

    // ffMatchedTrackingFlows: ffResult.matchedTrackingFlows.length,
    // fxMatchedTrackingFlows: fxResult.matchedTrackingFlows.length,
    // brMatchedTrackingFlows: brResult.matchedTrackingFlows.length,
    // bxMatchedTrackingFlows: bxResult.matchedTrackingFlows.length,
  };
};

const aggregate = (siteReports: SiteReport[]): AggregateReport => {
  const trackers = distinct(
    siteReports.flatMap((siteReport) => siteReport.trackers)
  );
  const intnSameSiteTrackers = distinct(
    siteReports.flatMap((siteReport) => siteReport.intnSameSiteTrackers)
  );
  const xdomSameSiteTrackers = distinct(
    siteReports.flatMap((siteReport) => siteReport.xdomSameSiteTrackers)
  );
  const trackerRanking = rankTrackers(siteReports);

  return siteReports.reduce<AggregateReport>(
    (acc, cur) => {
      return {
        cookies: acc.cookies + cur.cookies,
        cookieDomains: acc.cookieDomains + cur.cookieDomains,
        trkCookies: acc.trkCookies + cur.trkCookies,
        trkCookieDomains: acc.trkCookieDomains + cur.trkCookieDomains,
        trkCookieFlows: acc.trkCookieFlows + cur.trkCookieFlows,
        trkCookieFlowDomains:
          acc.trkCookieFlowDomains + cur.trkCookieFlowDomains,
        cookieAssignmentLabeledFlows:
          acc.cookieAssignmentLabeledFlows + cur.cookieAssignmentLabeledFlows,

        storageItems: acc.storageItems + cur.storageItems,
        storageItemDomains: acc.storageItemDomains + cur.storageItemDomains,
        trkStorageItems: acc.trkStorageItems + cur.trkStorageItems,
        trkStorageItemDomain:
          acc.trkStorageItemDomain + cur.trkStorageItemDomain,
        trkStorageItemFlows: acc.trkStorageItemFlows + cur.trkStorageItemFlows,
        trkStorageItemFlowDomains:
          acc.trkStorageItemFlowDomains + cur.trkStorageItemFlowDomains,

        trkFlows: acc.trkFlows + cur.trkFlows,
        trkFlowDomains: acc.trkFlowDomains + cur.trkFlowDomains,
        intnSameSiteTrkFlows:
          acc.intnSameSiteTrkFlows + cur.intnSameSiteTrkFlows,
        xdomSameSiteTrkFlows:
          acc.xdomSameSiteTrkFlows + cur.xdomSameSiteTrkFlows,
        trackers: trackers.length,
        trackerDomains: acc.trackerDomains + cur.trackerDomains,
        intnSameSiteTrackers: intnSameSiteTrackers,
        xdomSameSiteTrackers: xdomSameSiteTrackers,
        trackerRanking,
      };
    },
    {
      cookies: 0,
      cookieDomains: 0,
      trkCookies: 0,
      trkCookieDomains: 0,
      trkCookieFlows: 0,
      trkCookieFlowDomains: 0,
      cookieAssignmentLabeledFlows: 0,

      storageItems: 0,
      storageItemDomains: 0,
      trkStorageItems: 0,
      trkStorageItemDomain: 0,
      trkStorageItemFlows: 0,
      trkStorageItemFlowDomains: 0,

      trkFlows: 0,
      trkFlowDomains: 0,
      intnSameSiteTrkFlows: 0,
      xdomSameSiteTrkFlows: 0,
      trackers: 0,
      trackerDomains: 0,
      intnSameSiteTrackers: [],
      xdomSameSiteTrackers: [],
      trackerRanking: [],
    }
  );
};

const rankTrackers = (siteReports: SiteReport[]): TrackerRankingEntry[] => {
  const popularityMap = siteReports.reduce((map, siteReport) => {
    for (const tracker of siteReport.trackers) {
      const currentPopularity = map.get(tracker) ?? 0;
      map.set(tracker, currentPopularity + 1);
    }
    return map;
  }, new Map<string, number>());

  return [...popularityMap.entries()]
    .map(
      ([tracker, popularity]): TrackerRankingEntry => ({ tracker, popularity })
    )
    .sort((a, b) => -(a.popularity - b.popularity));
};
