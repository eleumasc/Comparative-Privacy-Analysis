import { SessionEntry } from "./Session";
import { Logger, SiteLogger } from "./Logger";
import { AnalysisResult } from "../model";
import { isWebsiteAvailable } from "../util/isWebsiteAvailable";
import { getOrCreateMapValue } from "../util/map";
import { RunnerContext, SiteEntry } from "./Runner";

interface DefaultRunnerContextState {
  siteLogger: SiteLogger;
  failure: boolean;
}
export class DefaultRunnerContext implements RunnerContext {
  stateMap: Map<number, DefaultRunnerContextState> = new Map();

  constructor(readonly logger: Logger) {}

  async runAnalysis(
    siteAnalysisId: number,
    siteEntry: SiteEntry,
    sessionEntry: SessionEntry
  ): Promise<void> {
    const { site, siteIndex, url } = siteEntry;
    const { name: sessionName, controller: sessionController } = sessionEntry;

    const state = getOrCreateMapValue(this.stateMap, siteAnalysisId, () => ({
      siteLogger: this.logger.createSiteLogger(site, siteIndex),
      failure: false,
    }));
    const { siteLogger, failure } = state;

    if (failure) return;

    const logResult = (name: string, result: AnalysisResult) => {
      siteLogger.addLogfile(name, JSON.stringify(result));
    };

    console.log(
      `begin analysis ${siteIndex}: ${site} [${sessionName}] (${Date()})`
    );

    const run = async (runId: string) => {
      const name = `${sessionName}${runId}`;
      const result = await sessionController.runAnalysis(url);
      if (result.status === "success") {
        logResult(name, result);
      } else {
        throw new Error(`failure ${name}`);
      }
    };

    try {
      await run("A");
      await run("B");
    } catch (e) {
      state.failure = true;
      console.log(e);
    }

    console.log(`end analysis ${siteIndex}: ${site} [${sessionName}]`);
  }

  async endSiteAnalysis(
    siteAnalysisId: number,
    siteEntry: SiteEntry
  ): Promise<void> {
    const { site, siteIndex, url } = siteEntry;

    const { siteLogger, failure } = this.stateMap.get(siteAnalysisId)!;

    if (failure) {
      siteLogger.failure(
        (await isWebsiteAvailable(url)) ? "AnalysisError" : "NavigationError"
      );
    }
    await siteLogger.persist();

    this.stateMap.delete(siteAnalysisId);

    console.log(`*** DONE ${siteIndex}: ${site}`);
  }
}
