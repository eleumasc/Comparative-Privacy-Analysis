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
    siteAnalysisId: number,
    siteDetail: SiteEntry,
    sessionEntry: SessionEntry
  ): Promise<void>;
  endSiteAnalysis(siteAnalysisId: number, siteDetail: SiteEntry): Promise<void>;
}
