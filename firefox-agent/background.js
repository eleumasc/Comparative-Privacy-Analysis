const asyncDelay = async (timeoutMs) => {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeoutMs);
  });
};

const poll = async (callback, ttl, timeoutMs) => {
  while (true) {
    try {
      return await callback();
    } catch (e) {
      ttl -= 1;
      if (ttl > 0) {
        await asyncDelay(timeoutMs);
      } else {
        throw e;
      }
    }
  }
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

const useTab = async (callback) => {
  const { id: tabId } = await browser.tabs.create({});
  try {
    return await callback(tabId);
  } finally {
    await browser.tabs.remove(tabId);
  }
};

const useNetworkLogging = async (tabId, callback) => {
  const state = { requests: [] };

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

  const webRequest = browser.webRequest;
  const webRequestFilter = { urls: ["*://*/*"] };
  webRequest.onBeforeRequest.addListener(onBeforeRequest, webRequestFilter);
  try {
    return await callback(state);
  } finally {
    webRequest.onBeforeRequest.removeListener(onBeforeRequest);
  }
};

const runAnalysis = async (url) => {
  return await useTab(async (tabId) => {
    return await useNetworkLogging(tabId, async (networkLoggingState) => {
      try {
        const resolved = await Promise.race([
          (async () => (await navigate(tabId, url), true))(),
          asyncDelay(30000),
        ]);
        if (resolved === true) {
          await asyncDelay(5000);
        }
      } catch {
        throw new Error("Navigation error");
      }

      const pageData = (
        await Promise.all(
          (
            await browser.webNavigation.getAllFrames({ tabId })
          ).map(async ({ frameId }) => {
            try {
              const result = await browser.tabs.sendMessage(
                tabId,
                { action: "Snapshot" },
                { frameId }
              );
              return result;
            } catch (e) {
              return null;
            }
          })
        )
      ).filter((element) => element !== null);
      const networkData = { ...networkLoggingState };
      const data = { pageData, networkData };

      return data;
    });
  });
};

const dispatchTask = async (command, parameter) => {
  switch (command) {
    case "RunAnalysis": {
      const { url } = parameter;
      return await runAnalysis(url);
    }
    case "Shutdown": {
      shutdownFlagged = true;
      return true;
    }
  }
};

const acceptTask = async (task) => {
  const { id: taskId, command, parameter } = task;
  try {
    const result = await dispatchTask(command, parameter);
    return { taskId, status: "success", detail: result };
  } catch (e) {
    return { taskId, status: "failure", detail: { error: String(e) } };
  }
};

const closeBrowser = async () => {
  await browser.tabs.remove(
    (await browser.tabs.query({})).map(({ id: tabId }) => tabId)
  );
};

const getConnectUrlFromStartTab = async () => {
  const PREFIX = "firefox-agent:";

  return await poll(
    async () => {
      const allTabs = await browser.tabs.query({});
      const targetTab = allTabs.find((tab) => tab.title.startsWith(PREFIX));
      if (targetTab) {
        const connectUrl = targetTab.title.substring(PREFIX.length);
        return connectUrl;
      } else {
        throw new Error("Connect URL not found");
      }
    },
    100,
    100
  );
};

let shutdownFlagged = false;

const main = async () => {
  const connectUrl = await getConnectUrlFromStartTab();

  const socket = new WebSocket(connectUrl);

  socket.addEventListener("message", async (event) => {
    const task = JSON.parse(event.data);
    const taskResult = await acceptTask(task);
    socket.send(JSON.stringify(taskResult));

    if (shutdownFlagged) {
      await closeBrowser();
    }
  });
};

main();
