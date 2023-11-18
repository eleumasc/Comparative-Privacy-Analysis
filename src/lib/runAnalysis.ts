import path from "path";
import { waitForever } from "./util/async";
import { Config } from "./Config";
import { Session } from "./analysis/Session";
import { useFirefoxController } from "./analysis/useFirefoxController";
import { FirefoxSession } from "./analysis/FirefoxSession";
import { ChromiumSession } from "./analysis/ChromiumSession";
import { FaultAwareSession } from "./analysis/FaultAwareSession";
import { Logger } from "./Logger";
import { AnalysisResult } from "./analysis/model";

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

  const failSafeSession = (sessionFactory: () => Promise<Session>): Session => {
    return new FaultAwareSession(sessionFactory);
  };

  await useFirefoxController({}, async (firefoxController) => {
    const tfSession: Session = failSafeSession(
      async () =>
        await FirefoxSession.create(firefoxController, {
          firefoxOptions: {
            executablePath: foxhound.executablePath,
            profilePath: path.join(profilesBasePath, "tf"),
            headless: false,
            trackingProtection: false,
          },
          isFoxhound: true,
        })
    );

    const ffSession: Session = failSafeSession(
      async () =>
        await FirefoxSession.create(firefoxController, {
          firefoxOptions: {
            executablePath: firefox.executablePath,
            profilePath: path.join(profilesBasePath, "ff"),
            headless: false,
            trackingProtection: true,
          },
        })
    );

    const brSession: Session = failSafeSession(
      async () =>
        await ChromiumSession.create({
          chromiumOptions: {
            executablePath: brave.executablePath,
            profilePath: path.join(profilesBasePath, "br"),
            headless: false,
          },
        })
    );

    for (const site of siteList) {
      const url = `http://${site}/`;

      const logger = new Logger(outputPath);
      const log = (suffix: string, result: AnalysisResult) => {
        logger.addLogfile(`${site}+${suffix}`, JSON.stringify(result));
      };

      await Promise.allSettled([
        (async () => {
          try {
            const resultA = await tfSession.runAnalysis(url);
            log("tfA", resultA);
            const resultB = await tfSession.runAnalysis(url);
            log("tfB", resultB);
          } catch (e) {
            console.log(e); // TODO: persist error log
          }
        })(),
        (async () => {
          try {
            const result = await ffSession.runAnalysis(url);
            log("ff", result);
          } catch (e) {
            console.log(e); // TODO: persist error log
          }
        })(),
        (async () => {
          try {
            const result = await brSession.runAnalysis(url);
            log("br", result);
          } catch (e) {
            console.log(e); // TODO: persist error log
          }
        })(),
      ]);

      await logger.persist();
    }

    if (debugMode) {
      console.log("Waiting forever... (you are in debug mode)");
      await waitForever();
    }

    await Promise.allSettled([
      tfSession.terminate(),
      ffSession.terminate(),
      brSession.terminate(),
    ]);
  });
};
