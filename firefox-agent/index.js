const getCookies = () => {
  let cookies = [];
  const cookieString = document.cookie;
  if (!cookieString) {
    return cookies;
  }
  const tokens = cookieString.split("; ");
  const tokensLength = tokens.length;
  for (let i = 0; i < tokensLength; i += 1) {
    const token = tokens[i];
    const index = token.indexOf("=");
    const key = token.substring(0, index);
    const value = token.substring(index + 1);
    cookies = [...cookies, { key, value }];
  }
  return cookies;
};

const getStorageItems = () => {
  let items = [];
  const length = localStorage.length;
  for (let i = 0; i < length; i += 1) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    items = [...items, { key, value }];
  }
  return items;
};

const _cloneSavedFrame = (savedFrame) => {
  const {
    asyncCause,
    asyncParent,
    column,
    functionDisplayName,
    line,
    parent,
    source,
    sourceId,
  } = savedFrame;
  return {
    asyncCause,
    asyncParent,
    column,
    functionDisplayName,
    line,
    parent: parent !== null ? _cloneSavedFrame(parent) : null,
    source,
    sourceId,
  };
};

const getTaintReports = () => {
  return taintReports.map((taintReport) => {
    const { loc, parentloc, referrer, sink, stack, str, subframe, taint } =
      taintReport;

    return {
      loc,
      parentloc,
      referrer,
      sink,
      str,
      subframe,
      scriptUrl: stack.source,
      taint: taint.map((taintFlow) => {
        const { begin, end, flow } = taintFlow;
        return {
          begin,
          end,
          operation: flow[flow.length - 1],
        };
      }),
      sinkOperation: taint[0].flow[1],
    };
  });
};

browser.runtime.onMessage.addListener((message, _, sendResponse) => {
  const { action } = message;
  switch (action) {
    case "Snapshot": {
      const { isFoxhound } = message;
      sendResponse({
        frameId: String(browser.runtime.getFrameId(window)),
        url: document.URL,
        baseUrl: document.baseURI,
        cookies: getCookies(),
        storageItems: getStorageItems(),
        ...(isFoxhound ? { taintReports: getTaintReports() } : null),
      });
      return;
    }
  }
});

window.addEventListener("load", () => {
  browser.runtime.sendMessage({ type: "load" });
});

const taintReports = [];
window.addEventListener("__taintreport", (r) => {
  const value = r.detail;
  const taint = value.str.taint;
  const taintReport = { ...value, taint };
  taintReports.push(taintReport);
});
