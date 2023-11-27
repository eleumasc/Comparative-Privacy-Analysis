import { mkdir, writeFile } from "fs/promises";
import path from "path";

interface Logfile {
  name: string;
  payload: string;
}

interface SitesEntry {
  site: string;
  failureError: string | null;
}

export class Logger {
  private sitesEntries: SitesEntry[] = [];

  constructor(readonly outputBasePath: string) {}

  createSiteLogger(site: string): SiteLogger {
    return new SiteLogger(this, site);
  }

  async updateSites(newEntry: SitesEntry): Promise<void> {
    const filePath = path.join(this.outputBasePath, `sites.json`);

    const updatedEntries = (this.sitesEntries = [
      ...this.sitesEntries,
      newEntry,
    ]);

    await writeFile(filePath, JSON.stringify(updatedEntries));
  }
}

export class SiteLogger {
  private logfiles: Logfile[] = [];
  private failureError: string | null = null;

  constructor(readonly logger: Logger, readonly site: string) {}

  addLogfile(name: string, payload: string): void {
    this.logfiles = [...this.logfiles, { name, payload }];
  }

  reject(failureError: string): void {
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

    await logger.updateSites(<SitesEntry>{
      site: this.site,
      failureError: this.failureError,
    });
  }
}
