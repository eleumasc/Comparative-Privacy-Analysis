import { writeFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { FailureErrorEntry, SitesEntry } from "../model";
import { BrowserId } from "../BrowserId";

interface Logfile {
  name: string;
  payload: string;
}

export class Logger {
  private sitesEntries: SitesEntry[] = [];

  constructor(readonly outputBasePath: string) {}

  createSiteLogger(site: string, siteIndex: number): SiteLogger {
    return new SiteLogger(this, site, siteIndex);
  }

  async updateSites(newEntry: SitesEntry): Promise<void> {
    const filePath = path.join(this.outputBasePath, `sites.json`);

    const updatedEntries = (this.sitesEntries = [
      ...this.sitesEntries,
      newEntry,
    ]);

    writeFileSync(filePath, JSON.stringify(updatedEntries));
  }
}

interface SiteLoggerBrowserState {
  logfiles: Logfile[];
  failureError: string | null;
}

const createSiteLoggerBrowserState = () => {
  return { logfiles: [], failureError: null };
};

type SiteLoggerBrowserStateRecord = Record<BrowserId, SiteLoggerBrowserState>;

export class SiteLogger {
  private stateRecord: SiteLoggerBrowserStateRecord = {
    foxhound: createSiteLoggerBrowserState(),
    firefox: createSiteLoggerBrowserState(),
    "firefox-nops": createSiteLoggerBrowserState(),
    brave: createSiteLoggerBrowserState(),
    "brave-aggr": createSiteLoggerBrowserState(),
  };
  private startTime = +new Date();

  constructor(
    readonly logger: Logger,
    readonly site: string,
    readonly siteIndex: number
  ) {}

  addLogfile(browserId: BrowserId, name: string, payload: string): void {
    const state = this.stateRecord[browserId];
    state.logfiles = [...state.logfiles, { name, payload }];
  }

  getFailureError(browserId: BrowserId): string | null {
    return this.stateRecord[browserId].failureError;
  }

  setFailureError(browserId: BrowserId, failureError: string | null): void {
    const state = this.stateRecord[browserId];
    state.failureError = failureError;
  }

  async persist(): Promise<void> {
    const logger = this.logger;
    const { outputBasePath } = logger;

    await mkdir(outputBasePath, { recursive: true });

    for (const state of Object.values(this.stateRecord)) {
      if (state.failureError === null) {
        for (const logfile of state.logfiles) {
          await writeFile(
            path.join(outputBasePath, `${this.site}+${logfile.name}.json`),
            logfile.payload
          );
        }
      }
    }

    const sitesEntry: SitesEntry = {
      site: this.site,
      siteIndex: this.siteIndex,
      startTime: this.startTime,
      failureErrorEntries: Object.entries(this.stateRecord).map(
        ([browserId, state]): FailureErrorEntry => {
          return {
            browserId: browserId as BrowserId,
            failureError: state.failureError,
          };
        }
      ),
    };
    await logger.updateSites(sitesEntry);
  }
}
