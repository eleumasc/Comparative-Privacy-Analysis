import { Session } from "./analysis/Session";
import { FirefoxSession } from "./analysis/FirefoxSession";
import { waitForever } from "./util/async";
import { useFirefoxController } from "./analysis/useFirefoxController";
import { persistData } from "./persistData";
import { FaultAwareSession } from "./analysis/FaultAwareSession";
import { Config } from "./Config";
import { ChromiumSession } from "./analysis/ChromiumSession";
import path from "path";
import { FailureAwareSession } from "./analysis/FailureAwareSession";

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
  const outputDir = path.join(outputBasePath, analysisTime);

  const failSafeSession = (sessionFactory: () => Promise<Session>): Session => {
    const faultAwareSession = new FaultAwareSession(sessionFactory);
    return new FailureAwareSession(faultAwareSession, { maxAttempts: 5 });
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
      const formatAnalysisName = (suffix: string) => `${site}+${suffix}`;

      await Promise.allSettled([
        (async () => {
          try {
            const resultA = await tfSession.runAnalysis(url);
            const resultB = await tfSession.runAnalysis(url);
            await persistData(resultA, outputDir, formatAnalysisName("tfA"));
            await persistData(resultB, outputDir, formatAnalysisName("tfB"));
          } catch (e) {
            console.log(e); // TODO: persist error log
          }
        })(),
        (async () => {
          try {
            const result = await ffSession.runAnalysis(url);
            await persistData(result, outputDir, formatAnalysisName("ff"));
          } catch (e) {
            console.log(e); // TODO: persist error log
          }
        })(),
        (async () => {
          try {
            const result = await brSession.runAnalysis(url);
            await persistData(result, outputDir, formatAnalysisName("br"));
          } catch (e) {
            console.log(e); // TODO: persist error log
          }
        })(),
      ]);
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
