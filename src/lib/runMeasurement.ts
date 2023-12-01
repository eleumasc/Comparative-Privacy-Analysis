import assert from "assert";
import { Config } from "./Config";
import { cookieSwapPartyHeuristics } from "./measurement/cookieSwapPartyHeuristics";
import { Flow, createFlow, equalsFlow, isTainted } from "./measurement/Flow";
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
  ssTrkFlows: number;
  cdssTrkFlows: number;
  trackers: string[];
  ssTrackers: string[];
  cdssTrackers: string[];
}

export const runMeasurement = async (config: Config) => {
  const outputPath = process.argv[2];
  assert(typeof outputPath === "string");

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
  console.log("totalCount", totalCount);
  console.log("successCount", successCount);
  console.log("navigationErrorCount", navigationErrorCount);
  console.log("successRate", successRate);

  const siteReports = (
    await mapSequentialAsync(
      successSitesEntries.slice(0, 250), // TODO: remove slicing
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
  const actualSite = tf1AFrame.url;
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
  const ssTrkFlows = trkFlows.filter((flow) =>
    allowedTargetSites.includes(flow.targetSite)
  );
  const cdssTrkFlows = trkFlows.filter(
    (flow) => !allowedTargetSites.includes(flow.targetSite)
  );

  const trackers = distinct(trkFlows.map((flow) => flow.targetSite));

  const ssTrackers = distinct(ssTrkFlows.map((flow) => flow.targetSite));
  const cdssTrackers = distinct(cdssTrkFlows.map((flow) => flow.targetSite));

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
  //       flow.cookieKeys.some((key) => cookieKeys.includes(key)) ||
  //       flow.storageItemKeys.some((key) => storageItemKeys.includes(key)) ||
  //       targetSites.includes(flow.targetSite) ||
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
    ssTrkFlows: ssTrkFlows.length, // 3.C
    cdssTrkFlows: cdssTrkFlows.length, // 3.C
    trackers, // 3.D, 3.F
    ssTrackers, // 3.E
    cdssTrackers, // 3.E

    // ffMatchedTrackingFlows: ffResult.matchedTrackingFlows.length,
    // fxMatchedTrackingFlows: fxResult.matchedTrackingFlows.length,
    // brMatchedTrackingFlows: brResult.matchedTrackingFlows.length,
    // bxMatchedTrackingFlows: bxResult.matchedTrackingFlows.length,
  };
};

const aggregate = (siteReports: SiteReport[]) => {};
