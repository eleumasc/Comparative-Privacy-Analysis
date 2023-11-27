import path from "path";
import { allWithConcurrencyLimit, waitForever } from "./util/async";
import { Config } from "./Config";
import { Session, SessionEntry } from "./analysis/Session";
import { useFirefoxController } from "./analysis/useFirefoxController";
import { FirefoxSession } from "./analysis/FirefoxSession";
import { ChromiumSession } from "./analysis/ChromiumSession";
import { FaultAwareSession } from "./analysis/FaultAwareSession";
import { Logger } from "./analysis/Logger";
import { AnalysisResult } from "./model";
import { FailureAwareSession } from "./analysis/FailureAwareSession";
import {
  CookieBehavior,
  TRACKING_PROTECTION_DISABLED,
  TRACKING_PROTECTION_STANDARD,
} from "./analysis/spawnFirefox";
import { isWebsiteAvailable } from "./util/isWebsiteAvailable";

const DEFAULT_CONCURRENCY_LIMIT = 4;
const DEFAULT_SESSION_TIMEOUT = 90_000;
const DEFAULT_SESSION_MAX_ATTEMPTS = 3;

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
    const failSafeSession = (
      sessionFactory: () => Promise<Session>
    ): Session => {
      const faultAwareSession = new FaultAwareSession(
        sessionFactory,
        DEFAULT_SESSION_TIMEOUT
      );
      return new FailureAwareSession(faultAwareSession, {
        maxAttempts: DEFAULT_SESSION_MAX_ATTEMPTS,
      });
    };

    const createFoxhoundSession = (profileName: string): Session => {
      return failSafeSession(
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

    const createFirefoxSession = (
      profileName: string,
      noStoragePartitioning?: boolean
    ): Session => {
      return failSafeSession(
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

    const createBraveSession = (
      profileName: string,
      aggressiveShields?: boolean
    ): Session => {
      return failSafeSession(
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

    const sessionRecord: Record<string, Session> = {
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

      tf1: createFoxhoundSession("tf1"),
      tf2: createFoxhoundSession("tf2"),
      br1: createBraveSession("br1"),
      br2: createBraveSession("br2"),
      ff1: createFirefoxSession("ff1"),
      ff2: createFirefoxSession("ff2"),
      br3: createBraveSession("br3"),
      br4: createBraveSession("br4"),
      ff3: createFirefoxSession("ff3"),
      ff4: createFirefoxSession("ff4"),
      br5: createBraveSession("br5"),
      bx1: createBraveSession("bx1", true),
      ff5: createFirefoxSession("ff5"),
      fx1: createFirefoxSession("fx1", true),
      bx2: createBraveSession("bx2", true),
      bx3: createBraveSession("bx3", true),
      fx2: createFirefoxSession("fx2", true),
      fx3: createFirefoxSession("fx3", true),
      bx4: createBraveSession("bx4", true),
      bx5: createBraveSession("bx5", true),
      fx4: createFirefoxSession("fx4", true),
      fx5: createFirefoxSession("fx5", true),
    };

    const sessionEntries: SessionEntry[] = Object.entries(sessionRecord).map(
      ([name, session]) => ({ name, session })
    );

    const logger = new Logger(outputPath);
    for (const [siteIndex, site] of siteList.entries()) {
      const url = `http://${site}/`;

      const siteLogger = logger.createSiteLogger(site);
      const logResult = (name: string, result: AnalysisResult) => {
        siteLogger.addLogfile(name, JSON.stringify(result));
      };

      console.log(`begin analysis ${site} [${siteIndex}] (${Date()})`);
      try {
        await allWithConcurrencyLimit<void>(
          sessionEntries.map(({ name: sessionName, session }) => async () => {
            const runAnalysis = async (runId: string) => {
              const name = `${sessionName}${runId}`;
              const result = await session.runAnalysis(url);
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
              console.log(e); // TODO: persist error log
              throw e;
            } finally {
              if (debugMode) {
                console.log("Waiting forever... (you are in debug mode)");
                await waitForever();
              }
              await session.terminate();
            }
          }),
          DEFAULT_CONCURRENCY_LIMIT
        );
      } catch {
        siteLogger.reject(
          (await isWebsiteAvailable(url)) ? "AnalysisError" : "NavigationError"
        );
      }
      await siteLogger.persist();
      console.log(`end analysis ${site}`);
    }
  });
};
