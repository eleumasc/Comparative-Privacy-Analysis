import { lcsMatches } from "./lcsMatches";
import { CSSI, Cookie, Frame, TaintReport } from "../model";
import { getSiteFromHostname } from "./getSiteFromHostname";
import { syntacticallyMatchesUrl } from "./syntacticallyMatchesUrl";

export interface Flow {
  source: Source;
  sourceKeys: string[];
  sink: string;
  targetSite: string;
  sinkScriptUrl: string;
  syntacticMatching: boolean;
}

export type Source = "cookie" | "storageItem";

interface NetworkSink {
  targetURL: URL;
  data: string | null;
  scriptURL: URL;
}

const getNetworkSinkFromTaintReport = (
  taintReport: TaintReport,
  baseUrl: string
): NetworkSink | null => {
  try {
    const { sink, str, sinkOperation, scriptUrl } = taintReport;
    const scriptURL = new URL(scriptUrl);

    const getTargetURL = (relativeUrl: string): URL => {
      return new URL(relativeUrl, baseUrl);
    };

    switch (sink) {
      case "navigator.sendBeacon(url)":
      case "window.open":
      case "fetch.url":
      case "embed.src":
      case "iframe.src":
      case "media.src":
      case "object.data":
      case "script.src":
      case "track.src":
      case "img.src":
      case "input.src":
      case "source.src":
      case "WebSocket":
      case "XMLHttpRequest.open(url)":
        return { targetURL: getTargetURL(str), data: null, scriptURL };

      case "navigator.sendBeacon(body)":
      case "fetch.body":
      case "WebSocket.send":
      case "XMLHttpRequest.open(username)":
      case "XMLHttpRequest.open(password)":
      case "XMLHttpRequest.send":
      case "XMLHttpRequest.setRequestHeader(value)":
      case "XMLHttpRequest.setRequestHeader(name)":
        return {
          targetURL: getTargetURL(sinkOperation.arguments[0]),
          data: str,
          scriptURL,
        };

      default:
        throw new Error(`Not a network sink: ${sink}`);
    }
  } catch {
    return null;
  }
};

const assignCookieKeys = (value: string, cookies: Cookie[]): string[] => {
  return cookies
    .filter((cookie) => lcsMatches(cookie.value, value))
    .map(({ key }) => key);
};

export const getFrameFlows = (frame: Frame): Flow[] => {
  return frame.taintReports!.flatMap((taintReport) => {
    const networkSink = getNetworkSinkFromTaintReport(
      taintReport,
      frame.baseUrl
    );
    if (!networkSink) {
      return [];
    }
    const { targetURL: sinkTargetURL, scriptURL: sinkScriptURL } = networkSink;

    const { str, sink, taint } = taintReport;

    const targetSite = getSiteFromHostname(sinkTargetURL.hostname);
    const sinkScriptUrl = sinkScriptURL.origin + sinkScriptURL.pathname;
    const createSingleFlow = (source: Source, sourceKeys: string[]): Flow => {
      return {
        source,
        sourceKeys,
        sink,
        targetSite,
        sinkScriptUrl,
        syntacticMatching: ((): boolean => {
          return sourceKeys.some((sourceKey) => {
            const cssis: CSSI[] =
              source === "cookie" ? frame.cookies : frame.storageItems;
            const cssi = cssis.find((cssi) => cssi.key === sourceKey);
            if (typeof cssi === "undefined") {
              return false;
            }
            return syntacticallyMatchesUrl(cssi.value, sinkTargetURL);
          });
        })(),
      };
    };

    const cookieFlows = taint
      .filter((taintFlow) => {
        const { operation: opType } = taintFlow.operation;
        return opType === "document.cookie";
      })
      .map(
        (taintFlow): Flow =>
          createSingleFlow(
            "cookie",
            assignCookieKeys(
              str.substring(taintFlow.begin, taintFlow.end),
              frame.cookies
            )
          )
      );

    const storageItemFlows = taint
      .filter((taintFlow) => {
        const { operation: opType } = taintFlow.operation;
        return opType === "localStorage.getItem";
      })
      .map(
        (taintFlow): Flow =>
          createSingleFlow("storageItem", [taintFlow.operation.arguments[0]])
      );

    return [...cookieFlows, ...storageItemFlows];
  });
};

export const equalsFlow = (x: Flow, y: Flow): boolean => {
  return (
    x.source === y.source &&
    x.sourceKeys.length === y.sourceKeys.length &&
    x.sourceKeys.every((xKey) => y.sourceKeys.includes(xKey)) &&
    x.sink === y.sink &&
    x.targetSite === y.targetSite &&
    x.sinkScriptUrl === y.sinkScriptUrl
  );
};
