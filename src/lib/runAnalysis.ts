import path from "path";
import { Config } from "./Config";
import { Session, SessionController, SessionEntry } from "./analysis/Session";
import { useFirefoxController } from "./analysis/useFirefoxController";
import { FirefoxSession } from "./analysis/FirefoxSession";
import { ChromiumSession } from "./analysis/ChromiumSession";
import { DefaultSessionController } from "./analysis/DefaultSessionController";
import { Logger } from "./analysis/Logger";
import { FailureAwareSessionController } from "./analysis/FailureAwareSessionController";
import {
  CookieBehavior,
  TRACKING_PROTECTION_DISABLED,
  TRACKING_PROTECTION_STANDARD,
} from "./analysis/spawnFirefox";
import { DefaultRunner } from "./analysis/DefaultRunner";
import { SiteEntry } from "./analysis/Runner";
import { DefaultRunnerContext } from "./analysis/DefaultRunnerContext";
import { getBrowserSignature } from "./BrowserId";

const DEFAULT_SESSION_TIMEOUT = 75_000;
const DEFAULT_SESSION_MAX_ATTEMPTS = 2;

const DEFAULT_CONCURRENCY_LEVEL = 6;
const DEFAULT_COINCIDENCE_LEVEL = 4;
const DEFAULT_BATCH_SIZE = 2;

export const runAnalysis = async (config: Config) => {
  const {
    outputBasePath,
    profilesBasePath,
    foxhound,
    firefox,
    brave,
    concurrencyLevel,
    coincidenceLevel,
    batchSize,
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

    const tfSessionEntry = (index: number): SessionEntry => {
      const name = `${getBrowserSignature("foxhound")}${index}`;
      return {
        browserId: "foxhound",
        name,
        controller: tfSessionController(name),
      };
    };

    const ffSessionEntry = (index: number): SessionEntry => {
      const name = `${getBrowserSignature("firefox")}${index}`;
      return {
        browserId: "firefox",
        name,
        controller: ffSessionController(name),
      };
    };

    const fxSessionEntry = (index: number): SessionEntry => {
      const name = `${getBrowserSignature("firefox-nops")}${index}`;
      return {
        browserId: "firefox-nops",
        name,
        controller: ffSessionController(name, true),
      };
    };

    const brSessionEntry = (index: number): SessionEntry => {
      const name = `${getBrowserSignature("brave")}${index}`;
      return {
        browserId: "brave",
        name,
        controller: brSessionController(name),
      };
    };

    const bxSessionEntry = (index: number): SessionEntry => {
      const name = `${getBrowserSignature("brave-aggr")}${index}`;
      return {
        browserId: "brave-aggr",
        name,
        controller: brSessionController(name, true),
      };
    };

    const sessionEntries: SessionEntry[] = [
      tfSessionEntry(1),
      tfSessionEntry(2),

      brSessionEntry(1),
      brSessionEntry(2),

      ffSessionEntry(1),
      ffSessionEntry(2),

      brSessionEntry(3),
      brSessionEntry(4),

      ffSessionEntry(3),
      ffSessionEntry(4),

      brSessionEntry(5),
      bxSessionEntry(1),

      ffSessionEntry(5),
      fxSessionEntry(1),

      bxSessionEntry(2),
      bxSessionEntry(3),

      fxSessionEntry(2),
      fxSessionEntry(3),

      bxSessionEntry(4),
      bxSessionEntry(5),

      fxSessionEntry(4),
      fxSessionEntry(5),
    ];

    const siteEntries: SiteEntry[] = siteList.map((site, siteIndex) => ({
      site,
      siteIndex,
      url: `http://${site}/`,
    }));

    const logger = new Logger(outputPath);
    const runner = new DefaultRunner({
      concurrencyLevel: concurrencyLevel ?? DEFAULT_CONCURRENCY_LEVEL,
      coincidenceLevel: coincidenceLevel ?? DEFAULT_COINCIDENCE_LEVEL,
      batchSize: batchSize ?? DEFAULT_BATCH_SIZE,
    });
    const runnerContext = new DefaultRunnerContext(logger);

    await runner.runAnalysis(siteEntries, sessionEntries, runnerContext);
  });
};
