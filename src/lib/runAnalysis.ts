import path from "path";
import { Config } from "./Config";
import { Session, SessionController, SessionEntry } from "./analysis/Session";
import { useFirefoxController } from "./analysis/useFirefoxController";
import { FirefoxSession } from "./analysis/FirefoxSession";
import { ChromiumSession } from "./analysis/ChromiumSession";
import { DefaultSessionController } from "./analysis/DefaultSessionController";
import { Logger, SiteLogger } from "./analysis/Logger";
import { AnalysisResult } from "./model";
import { FailureAwareSessionController } from "./analysis/FailureAwareSessionController";
import {
  CookieBehavior,
  TRACKING_PROTECTION_DISABLED,
  TRACKING_PROTECTION_STANDARD,
} from "./analysis/spawnFirefox";
import { isWebsiteAvailable } from "./util/isWebsiteAvailable";
import { SchedulingContext, SiteDetail, schedule } from "./analysis/scheduling";
import { getOrCreateMapValue } from "./util/map";

const DEFAULT_SESSION_TIMEOUT = 60_000;
const DEFAULT_SESSION_MAX_ATTEMPTS = 3;

const DEFAULT_CONCURRENCY_LEVEL = 8;
const DEFAULT_COINCIDENCE_LEVEL = 4;
const DEFAULT_BATCH_SIZE = 2;

export const runAnalysis = async (config: Config) => {
  const {
    debugMode,
    outputBasePath,
    profilesBasePath,
    foxhound,
    firefox,
    brave,
    siteList,
  } = config;

  const analysisTime = `${+new Date()}`;
  const outputPath = path.join(outputBasePath, analysisTime);

  await useFirefoxController({}, async (firefoxController) => {
    const createSessionController = (
      sessionFactory: () => Promise<Session>
    ): Session => {
      const defaultController = new DefaultSessionController(
        sessionFactory,
        DEFAULT_SESSION_TIMEOUT
      );
      return new FailureAwareSessionController(defaultController, {
        maxAttempts: DEFAULT_SESSION_MAX_ATTEMPTS,
      });
    };

    const tfSessionController = (profileName: string): SessionController => {
      return createSessionController(
        async () =>
          await FirefoxSession.create(firefoxController, {
            firefoxOptions: {
              executablePath: foxhound.executablePath,
              profilePath: path.join(profilesBasePath, profileName),
              headless: false,
              trackingProtectionOptions: TRACKING_PROTECTION_DISABLED,
            },
            isFoxhound: true,
          })
      );
    };

    const ffSessionController = (
      profileName: string,
      noStoragePartitioning?: boolean
    ): SessionController => {
      return createSessionController(
        async () =>
          await FirefoxSession.create(firefoxController, {
            firefoxOptions: {
              executablePath: firefox.executablePath,
              profilePath: path.join(profilesBasePath, profileName),
              headless: false,
              trackingProtectionOptions:
                noStoragePartitioning ?? false
                  ? {
                      ...TRACKING_PROTECTION_STANDARD,
                      cookieBehavior: CookieBehavior.REJECT_TRACKERS,
                    }
                  : TRACKING_PROTECTION_STANDARD,
            },
          })
      );
    };

    const brSessionController = (
      profileName: string,
      aggressiveShields?: boolean
    ): SessionController => {
      return createSessionController(
        async () =>
          await ChromiumSession.create({
            chromiumOptions: {
              executablePath: brave.executablePath,
              profilePath: path.join(profilesBasePath, profileName),
              headless: false,
            },
            aggressiveShields,
          })
      );
    };

    const sessionEntries: SessionEntry[] = Object.entries({
      // tf1: createFoxhoundSession("tf1"),
      // tf2: createFoxhoundSession("tf2"),
      // ff1: createFirefoxSession("ff1"),
      // ff2: createFirefoxSession("ff2"),
      // ff3: createFirefoxSession("ff3"),
      // ff4: createFirefoxSession("ff4"),
      // ff5: createFirefoxSession("ff5"),
      // fx1: createFirefoxSession("fx1", true),
      // fx2: createFirefoxSession("fx2", true),
      // fx3: createFirefoxSession("fx3", true),
      // fx4: createFirefoxSession("fx4", true),
      // fx5: createFirefoxSession("fx5", true),
      // br1: createBraveSession("br1"),
      // br2: createBraveSession("br2"),
      // br3: createBraveSession("br3"),
      // br4: createBraveSession("br4"),
      // br5: createBraveSession("br5"),
      // bx1: createBraveSession("bx1", true),
      // bx2: createBraveSession("bx2", true),
      // bx3: createBraveSession("bx3", true),
      // bx4: createBraveSession("bx4", true),
      // bx5: createBraveSession("bx5", true),

      tf1: tfSessionController("tf1"),
      tf2: tfSessionController("tf2"),
      br1: brSessionController("br1"),
      br2: brSessionController("br2"),
      ff1: ffSessionController("ff1"),
      ff2: ffSessionController("ff2"),
      br3: brSessionController("br3"),
      br4: brSessionController("br4"),
      ff3: ffSessionController("ff3"),
      ff4: ffSessionController("ff4"),
      br5: brSessionController("br5"),
      bx1: brSessionController("bx1", true),
      ff5: ffSessionController("ff5"),
      fx1: ffSessionController("fx1", true),
      bx2: brSessionController("bx2", true),
      bx3: brSessionController("bx3", true),
      fx2: ffSessionController("fx2", true),
      fx3: ffSessionController("fx3", true),
      bx4: brSessionController("bx4", true),
      bx5: brSessionController("bx5", true),
      fx4: ffSessionController("fx4", true),
      fx5: ffSessionController("fx5", true),
    }).map(([name, controller]) => ({ name, controller }));

    const logger = new Logger(outputPath);
    const schedulingContext = new DefaultSchedulingContext(logger);
    await schedule(siteList, sessionEntries, schedulingContext, 6, 4, 2);
  });
};

interface DefaultSchedulingContextState {
  siteLogger: SiteLogger;
  failure: boolean;
}

class DefaultSchedulingContext implements SchedulingContext {
  stateMap: Map<number, DefaultSchedulingContextState> = new Map();

  constructor(readonly logger: Logger) {}

  async runAnalysis(
    siteAnalysisId: number,
    siteDetail: SiteDetail,
    sessionEntry: SessionEntry
  ): Promise<void> {
    const { site, siteIndex, url } = siteDetail;
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
      `run analysis ${siteIndex}: ${site} [${sessionName}] (${Date()})`
    );

    const runAnalysis = async (runId: string) => {
      const name = `${sessionName}${runId}`;
      const result = await sessionController.runAnalysis(url);
      if (result.status === "success") {
        logResult(name, result);
      } else {
        throw new Error(`failure ${name}`);
      }
    };

    try {
      await runAnalysis("A");
      await runAnalysis("B");
    } catch (e) {
      state.failure = true;
      console.log(e);
    }
  }

  async endSiteAnalysis(
    siteAnalysisId: number,
    siteDetail: SiteDetail
  ): Promise<void> {
    const { site, siteIndex, url } = siteDetail;

    const { siteLogger, failure } = this.stateMap.get(siteAnalysisId)!;

    if (failure) {
      siteLogger.failure(
        (await isWebsiteAvailable(url)) ? "AnalysisError" : "NavigationError"
      );
    }
    await siteLogger.persist();

    this.stateMap.delete(siteAnalysisId);

    console.log(`end analysis ${siteIndex}: ${site}`);
  }
}
