(async function () {
  const asyncDelay = async (timeoutMs) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, timeoutMs);
    });
  };

  const fetchCrawler = async (message) => {
    const response = await fetch("http://127.0.0.1:8040/", {
      method: "post",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
    });
    return await response.json();
  };

  const navigate = async (tabId, url) => {
    let complete = null;
    let completeError = null;
    const willNavigate = new Promise((resolve, reject) => {
      complete = () => resolve();
      completeError = (reason) => reject(reason);
    });

    const STATE_START = 0;
    const STATE_ERROR = 1;
    const STATE_COMMITTED = 2;
    let state = STATE_START;
    let lastError = null;

    const filterEvents = (listener) => {
      return (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
          listener(details);
        }
      };
    };

    const onBeforeNavigate = filterEvents(() => {
      state = STATE_START;
    });

    const onCommitted = filterEvents(() => {
      switch (state) {
        case STATE_START:
          state = STATE_COMMITTED;
          break;
        case STATE_ERROR:
          completeError(lastError);
          break;
        default:
      }
    });

    const onCompleted = filterEvents(() => {
      complete();
    });

    const onErrorOccurred = filterEvents((details) => {
      state = STATE_ERROR;
      lastError = details.error;
    });

    const webNavigation = browser.webNavigation;
    webNavigation.onBeforeNavigate.addListener(onBeforeNavigate);
    webNavigation.onCommitted.addListener(onCommitted);
    webNavigation.onCompleted.addListener(onCompleted);
    webNavigation.onErrorOccurred.addListener(onErrorOccurred);
    try {
      const willUpdate = browser.tabs.update(tabId, { url });
      await Promise.all([willUpdate, willNavigate]);
    } finally {
      webNavigation.onBeforeNavigate.removeListener(onBeforeNavigate);
      webNavigation.onCommitted.removeListener(onCommitted);
      webNavigation.onCompleted.removeListener(onCompleted);
      webNavigation.onErrorOccurred.removeListener(onErrorOccurred);
    }
  };

  const startNetworkLogging = (tabId) => {
    const state = { requests: [], redirects: [] };

    const filterEvents = (listener) => {
      return (details) => {
        if (details.tabId === tabId) {
          listener(details);
        }
      };
    };

    const onBeforeRequest = filterEvents((details) => {
      state.requests = [...state.requests, details];
    });

    const onBeforeRedirect = filterEvents((details) => {
      state.redirects = [...state.redirects, details];
    });

    const webRequestFilter = { urls: ["*://*/*"] };
    browser.webRequest.onBeforeRequest.addListener(
      onBeforeRequest,
      webRequestFilter
    );
    browser.webRequest.onBeforeRedirect.addListener(
      onBeforeRedirect,
      webRequestFilter
    );

    return state;
  };

  await asyncDelay(3_000); // NOTE: it seems to be a bit more stable with this...

  const { navigationUrl } = await fetchCrawler({ action: "GetNavigationUrl" });
  const { id: tabId } = await browser.tabs.create({});
  const networkLoggingState = startNetworkLogging(tabId);
  try {
    const resolved = await Promise.race([
      (async () => (await navigate(tabId, navigationUrl), true))(),
      asyncDelay(30_000),
    ]);
    if (resolved === true) {
      await asyncDelay(5_000);
    }
  } catch {
    await fetchCrawler({
      action: "SendData",
      data: { error: true },
    });
    return;
  }

  const pageData = (
    await Promise.all(
      (
        await browser.webNavigation.getAllFrames({ tabId })
      ).map(async ({ frameId }) => {
        try {
          return await browser.tabs.sendMessage(
            tabId,
            { action: "Snapshot" },
            { frameId }
          );
        } catch (e) {
          return null;
        }
      })
    )
  ).filter((element) => element !== null);
  const networkData = { ...networkLoggingState };
  const data = { pageData, networkData };

  await fetchCrawler({ action: "SendData", data });
})();
