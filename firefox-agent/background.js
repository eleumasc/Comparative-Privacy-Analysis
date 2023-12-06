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

const navigate = async (tabId, url, timeoutMs) => {
  const loadCompleter = new Completer();
  const callback = (message, sender) => {
    if (typeof message === "object" && message.type === "load") {
      if (sender.tab.id === tabId && sender.frameId === 0) {
        loadCompleter.complete();
      }
    }
  };

  browser.runtime.onMessage.addListener(callback);
  try {
    await browser.tabs.update(tabId, { url });
    await timeBomb(loadCompleter.promise, timeoutMs);
  } finally {
    browser.runtime.onMessage.removeListener(callback);
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
  const state = { requests: [], blockedRequests: [] };

  const onBeforeRequest = (details) => {
    const processBody = () => {
      const { requestBody } = details;
      if (!requestBody) {
        return null;
      }
      if (requestBody.formData) {
        return {
          formData: Object.entries(requestBody.formData).flatMap(
            ([key, values]) => values.map((value) => ({ key, value }))
          ),
        };
      } else {
        const bytes = requestBody.raw[0]?.bytes;
        if (bytes) {
          const decoder = new TextDecoder("utf-8");
          return { raw: decoder.decode(bytes) };
        } else {
          return null;
        }
      }
    };

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
        body: processBody(),
        resourceType,
        urlClassification,
      },
    ];
  };

  const onErrorOccurred = (details) => {
    const isTrackingProtectionError = (error) => {
      switch (error) {
        case "NS_ERROR_MALWARE_URI":
        case "NS_ERROR_PHISHING_URI":
        case "NS_ERROR_TRACKING_URI":
        case "NS_ERROR_UNWANTED_URI":
        case "NS_ERROR_BLOCKED_URI":
        case "NS_ERROR_HARMFUL_URI":
        case "NS_ERROR_FINGERPRINTING_URI":
        case "NS_ERROR_CRYPTOMINING_URI":
        case "NS_ERROR_SOCIALTRACKING_URI":
          return true;
        default:
          return false;
      }
    };

    const { requestId: blockedRequestId, error } = details;
    if (isTrackingProtectionError(error)) {
      const request = state.requests.findLast(
        ({ requestId }) => requestId === blockedRequestId
      );
      state.requests = state.requests.filter(
        ({ requestId }) => requestId !== blockedRequestId
      );
      state.blockedRequests = [...state.blockedRequests, { request, error }];
    }
  };

  const webRequest = browser.webRequest;
  const webRequestFilter = { urls: ["*://*/*"], tabId };
  const webRequestExtraSpec = ["requestBody"];
  webRequest.onBeforeRequest.addListener(
    onBeforeRequest,
    webRequestFilter,
    webRequestExtraSpec
  );
  webRequest.onErrorOccurred.addListener(onErrorOccurred, webRequestFilter);
  try {
    await callback(state);
  } finally {
    webRequest.onBeforeRequest.removeListener(onBeforeRequest);
    webRequest.onErrorOccurred.removeListener(onErrorOccurred);
  }
};

const runAnalysis = async ({ url, isFoxhound }) => {
  const process = async (tabId, networkLoggingState) => {
    await navigate(tabId, url, 60_000);
    await asyncDelay(5_000);

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

    const { requests, blockedRequests } = networkLoggingState;

    return { requests, blockedRequests, frames };
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
