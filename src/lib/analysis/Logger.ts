import { writeFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { SitesEntry } from "../model";

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

export class SiteLogger {
  private logfiles: Logfile[] = [];
  private failureError: string | null = null;
  private startTime = +new Date();

  constructor(
    readonly logger: Logger,
    readonly site: string,
    readonly siteIndex: number
  ) {}

  addLogfile(name: string, payload: string): void {
    this.logfiles = [...this.logfiles, { name, payload }];
  }

  failure(failureError: string): void {
    this.failureError = failureError;
  }

  async persist(): Promise<void> {
    const logger = this.logger;
    const { outputBasePath } = logger;

    await mkdir(outputBasePath, { recursive: true });

    if (this.failureError === null) {
      for (const logfile of this.logfiles) {
        await writeFile(
          path.join(outputBasePath, `${this.site}+${logfile.name}.json`),
          logfile.payload
        );
      }
    }

    const sitesEntry: SitesEntry = {
      site: this.site,
      siteIndex: this.siteIndex,
      failureError: this.failureError,
      startTime: this.startTime,
    };
    await logger.updateSites(sitesEntry);
  }
}
