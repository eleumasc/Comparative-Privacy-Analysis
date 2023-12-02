import { SessionEntry } from "./Session";
import { RunnerContext, SiteEntry } from "./Runner";

export class DummyRunnerContext implements RunnerContext {
  constructor() {}

  async runAnalysis(
    siteId: number,
    siteEntry: SiteEntry,
    sessionEntry: SessionEntry
  ): Promise<void> {
    console.log(`begin analysis ${siteId} [${sessionEntry.name}]`);

    await sessionEntry.controller.runAnalysis(siteEntry.url);

    console.log(`end analysis ${siteId} [${sessionEntry.name}]`);
  }

  async endSiteAnalysis(siteId: number, _siteEntry: SiteEntry): Promise<void> {
    console.log(`*** DONE ${siteId}`);
  }
}
