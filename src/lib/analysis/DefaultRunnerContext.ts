import { SessionEntry } from "./Session";
import { Logger, SiteLogger } from "./Logger";
import { AnalysisResult } from "../model";
import { isWebsiteAvailable } from "../util/isWebsiteAvailable";
import { getOrCreateMapValue } from "../util/map";
import { RunnerContext, SiteEntry } from "./Runner";

export class DefaultRunnerContext implements RunnerContext {
  private siteLoggerMap: Map<number, SiteLogger> = new Map();

  constructor(readonly logger: Logger) {}

  async runAnalysis(
    siteId: number,
    siteEntry: SiteEntry,
    sessionEntry: SessionEntry
  ): Promise<void> {
    const { site, siteIndex, url } = siteEntry;
    const {
      browserId: sessionBrowserId,
      name: sessionName,
      controller: sessionController,
    } = sessionEntry;

    const siteLogger = getOrCreateMapValue(this.siteLoggerMap, siteId, () =>
      this.logger.createSiteLogger(site, siteIndex)
    );

    if (siteLogger.getFailureError(sessionBrowserId)) return;

    const logResult = (name: string, result: AnalysisResult) => {
      siteLogger.addLogfile(sessionBrowserId, name, JSON.stringify(result));
    };

    console.log(
      `begin analysis ${siteIndex}: ${site} [${sessionName}] (${Date()})`
    );

    const run = async (runId: string) => {
      const name = `${sessionName}${runId}`;
      const result = await sessionController.runAnalysis(url);
      if (result.status === "success") {
        console.log(`success ${siteIndex}: ${site} [${sessionName}]`);
        logResult(name, result);
      } else {
        console.log(`failure ${siteIndex}: ${site} [${sessionName}]`);
        throw new Error(`failure ${name}: ${result.reason}`);
      }
    };

    try {
      await run("A");
      await run("B");
    } catch (e) {
      siteLogger.setFailureError(
        sessionBrowserId,
        sessionBrowserId === "foxhound"
          ? (await isWebsiteAvailable(url))
            ? "AnalysisError"
            : "NavigationError"
          : "AnalysisError"
      );
      console.log(e);
    }

    console.log(`end analysis ${siteIndex}: ${site} [${sessionName}]`);
  }

  async endSiteAnalysis(siteId: number, siteEntry: SiteEntry): Promise<void> {
    const { site, siteIndex } = siteEntry;

    const siteLogger = this.siteLoggerMap.get(siteId)!;
    await siteLogger.persist();

    this.siteLoggerMap.delete(siteId);

    console.log(`*** DONE ${siteIndex}: ${site}`);
  }
}
