import { Cookie, Frame, TaintReport } from "../model";
import { distinct } from "../util/array";
import { findLCSubstring } from "../util/findLCSubstring";

export interface ClassifyResult {
  flow: Flow;
  totalCookieSourcesCount: number;
  unmatchableCookieSourcesCount: number;
  unmatchedCookieSourcesCount: number;
}

export interface Flow {
  cookieKeys: string[];
  storageItemKeys: string[];
  sink: string;
  targetHostname: string;
  sinkScriptUrl: string;
}

interface NetworkSink {
  targetURL: URL;
  data: string | null;
  scriptURL: URL;
}

const classifyNetworkSink = (
  taintReport: TaintReport,
  baseUrl: string
): NetworkSink => {
  const { sink, str, sinkOperation, scriptUrl } = taintReport;
  const scriptURL = new URL(scriptUrl);

  const createTargetURL = (relativeUrl: string): URL => {
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
      return { targetURL: createTargetURL(str), data: null, scriptURL };

    case "navigator.sendBeacon(body)":
    case "fetch.body":
    case "WebSocket.send":
    case "XMLHttpRequest.open(username)":
    case "XMLHttpRequest.open(password)":
    case "XMLHttpRequest.send":
    case "XMLHttpRequest.setRequestHeader(value)":
    case "XMLHttpRequest.setRequestHeader(name)":
      return {
        targetURL: createTargetURL(sinkOperation.arguments[0]),
        data: str,
        scriptURL,
      };

    default:
      throw new Error(`Not a network sink: ${sink}`);
  }
};

const findMatchingCookieKeys = (
  value: string,
  cookies: Cookie[]
): string[] | null => {
  if (value.length < 8) {
    return null; // unmatchable!
  }
  return cookies
    .filter((cookie) => findLCSubstring(cookie.value, value).str.length >= 8)
    .map(({ key }) => key);
};

export const classifyFlow = (
  taintReport: TaintReport,
  frame: Frame
): ClassifyResult => {
  const { targetURL: sinkTargetURL, scriptURL: sinkScriptURL } =
    classifyNetworkSink(taintReport, frame.baseUrl);

  const { str, sink, taint } = taintReport;

  let totalCookieSourcesCount: number = 0;
  let unmatchableCookieSourcesCount: number = 0;
  let unmatchedCookieSourcesCount: number = 0;
  const cookieKeys = distinct(
    taint
      .filter((taintFlow) => {
        const { operation: opType } = taintFlow.operation;
        return opType === "document.cookie";
      })
      .flatMap((taintFlow): string[] => {
        totalCookieSourcesCount += 1;
        const matches = findMatchingCookieKeys(
          str.substring(taintFlow.begin, taintFlow.end),
          frame.cookies
        );
        if (!matches) {
          unmatchableCookieSourcesCount += 1;
          return [];
        } else if (matches.length === 0) {
          unmatchedCookieSourcesCount += 1;
          return [];
        } else {
          return matches;
        }
      })
  );

  const storageItemKeys = distinct(
    taint
      .filter((taintFlow) => {
        const { operation: opType } = taintFlow.operation;
        return opType === "localStorage.getItem";
      })
      .map((taintFlow): string => taintFlow.operation.arguments[0])
  );

  return {
    flow: {
      cookieKeys,
      storageItemKeys,
      sink,
      targetHostname: sinkTargetURL.hostname,
      sinkScriptUrl: sinkScriptURL.origin + sinkScriptURL.pathname,
    },
    totalCookieSourcesCount,
    unmatchableCookieSourcesCount,
    unmatchedCookieSourcesCount,
  };
};

export const equalsFlow = (x: Flow, y: Flow): boolean => {
  return (
    x.cookieKeys.length === y.cookieKeys.length &&
    x.cookieKeys.every((xKey) => y.cookieKeys.includes(xKey)) &&
    x.storageItemKeys.length === y.storageItemKeys.length &&
    x.storageItemKeys.every((xKey) => y.storageItemKeys.includes(xKey)) &&
    x.sink === y.sink &&
    x.targetHostname === y.targetHostname &&
    x.sinkScriptUrl === y.sinkScriptUrl
  );
};
