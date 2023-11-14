import { spawnFoxhoundAnalysis } from "./spawnFoxhoundAnalysis";
import { useAgent } from "./useAgent";
import { persistData } from "./persistData";

export interface Config {
  outputBasePath: string;
  executablePath: string;
  profilePath: string;
  siteList: string[];
}

export const runAnalysis = async (config: Config) => {
  const { outputBasePath, executablePath, profilePath, siteList } = config;

  const outputDir = `${outputBasePath}/${+new Date()}`;

  const runOne = async (site: string, analysisName: string) => {
    console.log("begin analysis", analysisName);
    await useAgent(
      {
        navigationUrl: `http://${site}/`,
        onReceiveDataListener: async (data) => {
          await persistData(data, outputDir, analysisName);
        },
      },
      async (willThink) => {
        const browserProcess = spawnFoxhoundAnalysis({
          executablePath,
          profilePath,
        });
        // browserProcess.stdout?.pipe(process.stdout); // DEBUG

        await willThink;

        browserProcess.kill("SIGINT");
      }
    );
    console.log("end analysis", analysisName);
  };

  for (const site of siteList) {
    const formatAnalysisName = (sequence: number) => `${site}+${sequence}`;

    try {
      await runOne(site, formatAnalysisName(1));
      await runOne(site, formatAnalysisName(2));
    } catch (e) {
      console.error(e);
    }
  }
};
