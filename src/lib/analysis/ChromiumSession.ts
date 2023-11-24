import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Browser, Page } from "puppeteer-core";
import model, { RequestBody } from "../model";
import { Session } from "./Session";
import { asyncDelay } from "../util/async";
import { URLSearchParams } from "url";

export interface ChromiumOptions {
  executablePath: string;
  profilePath: string;
  headless?: boolean;
}

export interface ChromiumSessionOptions {
  chromiumOptions: ChromiumOptions;
}

export class ChromiumSession implements Session {
  constructor(readonly browser: Browser) {}

  async runAnalysis(url: string): Promise<model.AnalysisResult> {
    const browser = this.browser;

    const process = async (page: Page): Promise<model.Detail> => {
      let requests: model.Request[] = [];
      page.on("request", (interceptedRequest) => {
        const processBody = (): RequestBody | null => {
          const postData = interceptedRequest.postData();
          if (!postData) {
            return null;
          }
          const contentType = interceptedRequest.headers()["content-type"];
          // NOTE: multipart/form-data body seems to be unsupported by Puppeteer (see https://github.com/puppeteer/puppeteer/issues/9106)
          if (contentType.includes("application/x-www-form-urlencoded")) {
            const searchParams = [...new URLSearchParams(postData)];
            return {
              formData: searchParams.map(([key, value]) => ({ key, value })),
            };
          } else {
            return {
              raw: postData,
            };
          }
        };

        const frame = interceptedRequest.frame();
        const requestURL = new URL(interceptedRequest.url());
        const { protocol } = requestURL;
        if (frame && (protocol === "http:" || protocol === "https:")) {
          // @ts-ignore
          const requestId = interceptedRequest._requestId as string;
          // @ts-ignore
          const frameId = frame._id as string;
          const method = interceptedRequest.method();
          const url = interceptedRequest.url();
          const resourceType = interceptedRequest.resourceType();

          requests = [
            ...requests,
            {
              requestId,
              frameId,
              method,
              url,
              body: processBody(),
              resourceType,
            },
          ];
        }

        interceptedRequest.continue();
      });
      await page.setRequestInterception(true);

      await page.goto(url, { timeout: 30_000 });
      await asyncDelay(5_000);

      let frames: model.Frame[] = [];
      for (const frame of page.frames()) {
        try {
          // @ts-ignore
          const frameId = frame._id as string;
          const evalResult = (await frame.evaluate(
            `(${EVAL_FUNCTION})()`
          )) as any;
          frames = [...frames, { frameId, ...evalResult }];
        } catch {}
      }

      return { requests, frames };
    };

    const page = await browser.newPage();
    try {
      const detail = await process(page);
      return { status: "success", detail };
    } catch (e) {
      return { status: "failure", reason: String(e) };
    } finally {
      await page.close();
    }
  }

  async terminate(_force?: boolean): Promise<void> {
    await this.browser.close();
  }

  static async create(options: ChromiumSessionOptions) {
    const { chromiumOptions } = options;
    puppeteer.use(StealthPlugin());
    const browser = await puppeteer.launch({
      executablePath: chromiumOptions.executablePath,
      userDataDir: chromiumOptions.profilePath,
      headless: chromiumOptions.headless ?? true,
    });
    await closeUnnecessaryPages(browser);
    return new ChromiumSession(browser);
  }
}

const closeUnnecessaryPages = async (browser: Browser): Promise<void> => {
  const unnecessaryPages = (await browser.pages()).slice(1);
  for (const page of unnecessaryPages) {
    await page.close();
  }
};

const EVAL_FUNCTION = `() => {
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

  return {
    url: document.URL,
    baseUrl: document.baseURI,
    cookies: getCookies(),
    storageItems: getStorageItems(),
  };
}`;
