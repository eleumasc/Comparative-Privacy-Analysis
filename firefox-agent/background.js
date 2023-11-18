class Completer {
  constructor() {
    let complete = null;
    let completeError = null;
    this.promise = new Promise((resolve, reject) => {
      complete = (value) => {
        resolve(value);
      };
      completeError = (reason) => {
        reject(reason);
      };
    });
    this.complete = complete;
    this.completeError = completeError;
  }
}

const asyncDelay = (timeoutMs) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeoutMs);
  });
};

const timeBomb = async (promise, timeoutMs) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Promise timed out after ${timeoutMs} ms`));
      }, timeoutMs);

      const clearAndReject = () => {
        clearTimeout(timeoutId);
        reject();
      };

      promise.then(clearAndReject, clearAndReject);
    }),
  ]);
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
  const navigateCompleter = new Completer();

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

  const onCommitted = filterEvents(async () => {
    switch (state) {
      case STATE_START:
        state = STATE_COMMITTED;
        break;
      case STATE_ERROR:
        navigateCompleter.completeError(
          new Error(`Navigation error: ${lastError}`)
        );
        break;
      default:
    }
  });

  const onCompleted = filterEvents(() => {
    navigateCompleter.complete();
  });

  const onErrorOccurred = filterEvents((details) => {
    state = STATE_ERROR;
    lastError = details.error;
  });

  const webNavigation = browser.webNavigation;
  const webNavigationFilter = { url: [{ schemes: ["http", "https"] }] };
  webNavigation.onBeforeNavigate.addListener(
    onBeforeNavigate,
    webNavigationFilter
  );
  webNavigation.onCommitted.addListener(onCommitted, webNavigationFilter);
  webNavigation.onCompleted.addListener(onCompleted, webNavigationFilter);
  webNavigation.onErrorOccurred.addListener(
    onErrorOccurred,
    webNavigationFilter
  );
  try {
    await browser.tabs.update(tabId, { url });
    await navigateCompleter.promise;
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
    await callback(tabId);
  } finally {
    await browser.tabs.remove(tabId);
  }
};

const useNetworkLogging = async (tabId, callback) => {
  const state = { requests: [] };

  const onBeforeRequest = (details) => {
    const {
      requestId,
      frameId,
      method,
      url,
      type: resourceType,
      urlClassification,
    } = details;

    state.requests = [
      ...state.requests,
      {
        requestId,
        frameId: String(frameId),
        method,
        url,
        resourceType,
        urlClassification,
      },
    ];
  };

  const webRequest = browser.webRequest;
  const webRequestFilter = { urls: ["*://*/*"], tabId };
  webRequest.onBeforeRequest.addListener(onBeforeRequest, webRequestFilter);
  try {
    await callback(state);
  } finally {
    webRequest.onBeforeRequest.removeListener(onBeforeRequest);
  }
};

const runAnalysis = async ({ url, isFoxhound }) => {
  const process = async (tabId, networkLoggingState) => {
    await timeBomb(navigate(tabId, url), 30_000);
    await asyncDelay(5_000);

    const requests = networkLoggingState.requests;
    const frames = (
      await Promise.all(
        (
          await browser.webNavigation.getAllFrames({ tabId })
        ).map(async ({ frameId }) => {
          try {
            return await browser.tabs.sendMessage(
              tabId,
              { action: "Snapshot", isFoxhound },
              { frameId }
            );
          } catch (e) {
            return null;
          }
        })
      )
    ).filter((element) => element !== null);

    return { requests, frames };
  };

  let result = null;
  await useTab(
    async (tabId) =>
      await useNetworkLogging(tabId, async (networkLoggingState) => {
        result = await process(tabId, networkLoggingState);
      })
  );

  return result;
};

const dispatchTask = async (command, parameter) => {
  switch (command) {
    case "RunAnalysis": {
      return await runAnalysis(parameter);
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
    return { taskId, status: "failure", reason: String(e) };
  }
};

const closeBrowser = async () => {
  await browser.tabs.remove(
    (await browser.tabs.query({})).map(({ id: tabId }) => tabId)
  );
};

const getConnectUrlFromStartTab = () => {
  const PREFIX = "firefox-agent:";

  return poll(
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
