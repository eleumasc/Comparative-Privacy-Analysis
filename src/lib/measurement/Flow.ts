import { Cookie, Frame, TaintReport } from "../model";
import { distinct } from "../util/array";
import { findLCSubstring } from "../util/findLCSubstring";
import { getSiteFromHostname } from "./getSiteFromHostname";

export interface Flow {
  cookieKeys: string[];
  storageItemKeys: string[];
  sink: string;
  targetSite: string;
  sinkScriptUrl: string;
  _readingDocumentCookie: boolean;
}

interface NetworkSink {
  targetURL: URL;
  data: string | null;
  scriptURL: URL;
}

const createNetworkSink = (
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

export const createFlow = (taintReport: TaintReport, frame: Frame): Flow => {
  const { targetURL: sinkTargetURL, scriptURL: sinkScriptURL } =
    createNetworkSink(taintReport, frame.baseUrl);

  const { str, sink, taint } = taintReport;

  const cookieSources = taint.filter((taintFlow) => {
    const { operation: opType } = taintFlow.operation;
    return opType === "document.cookie";
  });
  const cookieKeys = distinct(
    cookieSources.flatMap((taintFlow): string[] => {
      return (
        findMatchingCookieKeys(
          str.substring(taintFlow.begin, taintFlow.end),
          frame.cookies
        ) ?? []
      );
    })
  );

  const storageItemSources = taint.filter((taintFlow) => {
    const { operation: opType } = taintFlow.operation;
    return opType === "localStorage.getItem";
  });
  const storageItemKeys = distinct(
    storageItemSources.map(
      (taintFlow): string => taintFlow.operation.arguments[0]
    )
  );

  return {
    cookieKeys,
    storageItemKeys,
    sink,
    targetSite: getSiteFromHostname(sinkTargetURL.hostname),
    sinkScriptUrl: sinkScriptURL.origin + sinkScriptURL.pathname,
    _readingDocumentCookie: cookieSources.length > 0,
  };
};

export const isTainted = (flow: Flow): boolean => {
  return flow.cookieKeys.length > 0 || flow.storageItemKeys.length > 0;
};

export const equalsFlow = (x: Flow, y: Flow): boolean => {
  return (
    x.cookieKeys.length === y.cookieKeys.length &&
    x.cookieKeys.every((xKey) => y.cookieKeys.includes(xKey)) &&
    x.storageItemKeys.length === y.storageItemKeys.length &&
    x.storageItemKeys.every((xKey) => y.storageItemKeys.includes(xKey)) &&
    x.sink === y.sink &&
    x.targetSite === y.targetSite &&
    x.sinkScriptUrl === y.sinkScriptUrl &&
    x._readingDocumentCookie === y._readingDocumentCookie
  );
};
