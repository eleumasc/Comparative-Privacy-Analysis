import assert from "assert";
import { Config } from "./Config";
import { cookieSwapPartyHeuristics } from "./measurement/cookieSwapPartyHeuristics";
import {
  ClassifyResult,
  Flow,
  classifyFlow,
  equalsFlow,
  isTainted,
} from "./measurement/Flow";
import { SiteAnalysisResult } from "./measurement/SiteAnalysisResult";
import { Frame, Request, TaintReport } from "./model";
import { distinct } from "./util/array";
import { inspect } from "util";

export const runMeasurement = async (config: Config) => {
  const { siteList } = config; // TODO: sites.json in results folder

  for (const site of siteList) {
    const siteResult = await SiteAnalysisResult.fromFile(
      "/home/osboxes/results/1700482812150",
      site
    );
    try {
      console.log(site, inspect(processSite(siteResult), false, null, true));
    } catch (e) {
      console.log(site, String(e));
    }
  }
};

const processSite = (siteResult: SiteAnalysisResult): any => {
  try {
    assert(
      siteResult.all().every((result) => result.status === "success"),
      "Not all results are successful"
    );
  } catch {
    if (siteResult.all().every((result) => result.status === "failure")) {
      throw new Error("Navigation error");
    } else {
      throw new Error("Analysis error");
    }
  }

  const tf1A = siteResult.selectSuccess({
    browserId: "foxhound",
    sequence: 1,
    runId: "A",
  })[0];
  const tf1B = siteResult.selectSuccess({
    browserId: "foxhound",
    sequence: 1,
    runId: "B",
  })[0];
  const tf2A = siteResult.selectSuccess({
    browserId: "foxhound",
    sequence: 2,
    runId: "A",
  })[0];

  const tf1AFrame = tf1A.detail.frames[0]; // TODO: consider subframes?
  assert(typeof tf1AFrame !== "undefined", "Frame does not exist");
  // const tf1BFrame = tf1B.detail.frames.find(
  //   (frame) => frame.url === tf1AFrame.url
  // );
  // const tf2AFrame = tf2A.detail.frames.find(
  //   (frame) => frame.url === tf1AFrame.url
  // );
  const tf1BFrame = tf1B.detail.frames[0];
  const tf2AFrame = tf2A.detail.frames[0];
  assert(
    typeof tf1BFrame !== "undefined" && typeof tf2AFrame !== "undefined",
    "Frame matching failed"
  );

  const trackingCookieKeys = cookieSwapPartyHeuristics(
    tf1AFrame.cookies,
    tf1BFrame.cookies,
    tf2AFrame.cookies,
    true
  );
  const trackingStorageItemKeys = cookieSwapPartyHeuristics(
    tf1AFrame.storageItems,
    tf1BFrame.storageItems,
    tf2AFrame.storageItems
  );

  const computeClassifyResults = (
    taintReports: TaintReport[],
    frame: Frame
  ): ClassifyResult[] => {
    return taintReports.flatMap((taintReport) => {
      try {
        return [classifyFlow(taintReport, frame)];
      } catch {
        return [];
      }
    });
  };

  const taintReportsA = tf1AFrame.taintReports!;
  const classifyResultsA = computeClassifyResults(taintReportsA, tf1AFrame);
  const taintReportsB = tf1BFrame.taintReports!;
  const classifyResultsB = computeClassifyResults(taintReportsB, tf1BFrame);

  const computeTrackingFlows = (classifyResults: ClassifyResult[]): Flow[] => {
    return distinct(
      classifyResults
        .map(({ flow }) => flow)
        .map((flow): Flow => {
          return {
            ...flow,
            cookieKeys: flow.cookieKeys.filter((key) =>
              trackingCookieKeys.includes(key)
            ),
            storageItemKeys: flow.storageItemKeys.filter((key) =>
              trackingStorageItemKeys.includes(key)
            ),
          };
        })
        .filter((flow) => isTainted(flow)),
      equalsFlow
    );
  };

  const trackingFlowsA = computeTrackingFlows(classifyResultsA);
  const trackingFlowsB = computeTrackingFlows(classifyResultsB);
  const trackingFlowsUnion = distinct(
    [...trackingFlowsA, ...trackingFlowsB],
    equalsFlow
  );

  const computeAllowedTargets = (requests: Request[]): string[] => {
    return distinct(
      requests
        .filter((request) => request.resourceType === "script")
        .map((request) => new URL(request.url).hostname)
    );
  };

  const allowedTargetsA = computeAllowedTargets(tf1A.detail.requests);
  const allowedTargetsB = computeAllowedTargets(tf1B.detail.requests);
  const allowedTargetsUnion = distinct([
    ...allowedTargetsA,
    ...allowedTargetsB,
  ]);

  let ssTrackingFlows: Flow[] = [];
  let cdssTrackingFlows: Flow[] = [];
  for (const flow of trackingFlowsUnion) {
    if (allowedTargetsUnion.includes(flow.targetHostname)) {
      ssTrackingFlows = [...ssTrackingFlows, flow];
    } else {
      cdssTrackingFlows = [...cdssTrackingFlows, flow];
    }
  }

  const statsClassifyResults = (classifyResults: ClassifyResult[]) => {
    return classifyResults.reduce(
      (acc, cur) => {
        return {
          totalFlows: acc.totalFlows + 1,
          taintedFlows: acc.taintedFlows + (isTainted(cur.flow) ? 1 : 0),
          cookieMatchingEffective:
            acc.cookieMatchingEffective + (cur.cookieMatchingEffective ? 1 : 0),
        };
      },
      {
        totalFlows: 0,
        taintedFlows: 0,
        cookieMatchingEffective: 0,
      }
    );
  };

  return {
    // taintReportsA: taintReportsA.length,
    // taintReportsB: taintReportsB.length,

    // classifyResultsA: statsClassifyResults(classifyResultsA),
    // classifyResultsB: statsClassifyResults(classifyResultsB),

    // trackingFlowsA: trackingFlowsA.length,
    // trackingFlowsB: trackingFlowsB.length,

    // trackingFlowsUnion,

    allowedTargetsUnion,
    ssTrackingFlows,
    cdssTrackingFlows,
  };
};
