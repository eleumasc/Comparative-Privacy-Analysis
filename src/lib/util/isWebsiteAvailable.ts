import fetch from "node-fetch";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0";
const DEFAULT_TIMEOUT = 30_000;

export const isWebsiteAvailable = async (url: string): Promise<boolean> => {
  try {
    await fetch(url, {
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
      },
      timeout: DEFAULT_TIMEOUT,
    });
    return true;
  } catch (e) {
    return false;
  }
};
