import { Session } from "./analysis/Session";
import { FirefoxSession } from "./analysis/FirefoxSession";
import { waitForever } from "./util/async";
import { useFirefoxController } from "./analysis/useFirefoxController";
import { persistData } from "./persistData";
import { FaultAwareSession } from "./analysis/FaultAwareSession";
import { Config } from "./Config";

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

  const outputDir = `${outputBasePath}/${+new Date()}`;

  await useFirefoxController({}, async (firefoxController) => {
    const tfSession: Session = new FaultAwareSession(
      async () =>
        await FirefoxSession.create(
          firefoxController,
          {
            executablePath: foxhound.executablePath,
            profilePath: `${profilesBasePath}/tf`,
            headless: false,
            trackingProtection: false,
          },
          { isFoxhound: true }
        )
    );

    const ffSession: Session = new FaultAwareSession(
      async () =>
        await FirefoxSession.create(firefoxController, {
          executablePath: firefox.executablePath,
          profilePath: `${profilesBasePath}/ff`,
          headless: false,
          trackingProtection: true,
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
      ]);
    }

    if (debugMode) {
      console.log("Waiting forever... (you are in debug mode)");
      await waitForever();
    }

    await tfSession.terminate();
    await ffSession.terminate();
  });
};
