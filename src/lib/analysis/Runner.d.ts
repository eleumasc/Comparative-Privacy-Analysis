export interface Runner {
  runAnalysis(
    siteEntries: SiteEntry[],
    sessionEntries: SessionEntry[],
    context: RunnerContext
  ): Promise<void>;
}

export interface SiteEntry {
  site: string;
  siteIndex: number;
  url: string;
}

export interface RunnerContext {
  runAnalysis(
    siteId: number,
    siteEntry: SiteEntry,
    sessionEntry: SessionEntry
  ): Promise<void>;
  endSiteAnalysis(siteId: number, siteEntry: SiteEntry): Promise<void>;
}
