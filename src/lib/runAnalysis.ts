import { Session } from "./analysis/Session";
import { FirefoxSession } from "./analysis/FirefoxSession";
import { waitForever } from "./util/async";
import { useFirefoxController } from "./analysis/useFirefoxController";
import { persistData } from "./persistData";
import { FaultTolerantSession } from "./analysis/FaultTolerantSession";
import { Config } from "./Config";

export const runAnalysis = async (config: Config) => {
  const { debugMode, outputBasePath, executablePath, profilePath, siteList } =
    config;

  const outputDir = `${outputBasePath}/${+new Date()}`;

  await useFirefoxController({}, async (firefoxController) => {
    const session: Session = new FaultTolerantSession(
      async () =>
        await FirefoxSession.create(firefoxController, {
          executablePath,
          profilePath,
          headless: false,
          trackingProtection: false,
          debugMode,
        })
    );

    for (const site of siteList) {
      const url = `http://${site}/`;
      const formatAnalysisName = (sequence: number) => `${site}+${sequence}`;

      try {
        const result1 = await session.runAnalysis(url);
        const result2 = await session.runAnalysis(url);
        await persistData(result1, outputDir, formatAnalysisName(1));
        await persistData(result2, outputDir, formatAnalysisName(2));
      } catch (e) {
        console.log(e); // TODO: persist error log
      }
    }

    if (debugMode) {
      console.log("Waiting forever... (you are in debug mode)");
      await waitForever();
    }

    await session.terminate();
  });
};
