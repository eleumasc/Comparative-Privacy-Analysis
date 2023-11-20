import { Config } from "./Config";
import { readFile } from "fs/promises";
import path from "path";
import { AnalysisResult } from "./analysis/model";

interface AnalysisResultCollection {
  site: string;
  tf1: AnalysisResult;
  tf2: AnalysisResult;
  ff1: AnalysisResult;
  ff2: AnalysisResult;
  ff3: AnalysisResult;
  ff4: AnalysisResult;
  ff5: AnalysisResult;
  br1: AnalysisResult;
  br2: AnalysisResult;
  br3: AnalysisResult;
  br4: AnalysisResult;
  br5: AnalysisResult;
}

export const runMeasurement = async (config: Config) => {
  const { siteList } = config;

  for await (const resultCollection of readAnalysisResultCollections(
    siteList,
    // "/home/osboxes/results/..."
    ""
  )) {
    await processSite(resultCollection);
  }
};

const readAnalysisResultCollections = async function* (
  siteList: string[],
  outputPath: string
): AsyncGenerator<AnalysisResultCollection, void> {
  for (const site of siteList) {
    const readAnalysisResultFromLogfile = async (suffix: string) => {
      return JSON.parse(
        (
          await readFile(path.join(outputPath, `${site}+${suffix}.json`))
        ).toString()
      ) as AnalysisResult;
    };

    yield {
      site,
      tf1: await readAnalysisResultFromLogfile("tf1"),
      tf2: await readAnalysisResultFromLogfile("tf2"),
      ff1: await readAnalysisResultFromLogfile("ff1"),
      ff2: await readAnalysisResultFromLogfile("ff2"),
      ff3: await readAnalysisResultFromLogfile("ff3"),
      ff4: await readAnalysisResultFromLogfile("ff4"),
      ff5: await readAnalysisResultFromLogfile("ff5"),
      br1: await readAnalysisResultFromLogfile("br1"),
      br2: await readAnalysisResultFromLogfile("br2"),
      br3: await readAnalysisResultFromLogfile("br3"),
      br4: await readAnalysisResultFromLogfile("br4"),
      br5: await readAnalysisResultFromLogfile("br5"),
    };
  }
};

const processSite = async (
  resultCollection: AnalysisResultCollection
): Promise<void> => {
  const { site, tf1, tf2, ff1, ff2, ff3, ff4, ff5, br1, br2, br3, br4, br5 } =
    resultCollection;

  if (
    tf1.status === "failure" ||
    tf2.status === "failure" ||
    ff1.status === "failure" ||
    ff2.status === "failure" ||
    ff3.status === "failure" ||
    ff4.status === "failure" ||
    ff5.status === "failure" ||
    br1.status === "failure" ||
    br2.status === "failure" ||
    br3.status === "failure" ||
    br4.status === "failure" ||
    br5.status === "failure"
  ) {
    return;
  }
};

interface PrivacySensitiveFlow {
  source: ClientSideIdentifier[];
  sink: NetworkSink;
}

interface ClientSideIdentifier {
  type: "cookie" | "storageItem";
  key: string;
  scriptUrl: string;
}

interface NetworkSink {
  requestUrl: string;
  scriptUrl: string;
}

// const computeNetworkSink = (taintReport: TaintReport) => {
//   const { sink, str } = taintReport;
//   switch (sink) {
//     case "navigator.sendBeacon(url)":
//       return str;
//     case "navigator.sendBeacon(body)":
//       return ...;
//   }
// };

// const classifyTaintReport = (
//   taintReport: TaintReport,
//   frame: Frame
// ): PrivacySensitiveFlow | null => {
//   const { taint } = taintReport;

//   const storageItemCSIs = taint
//     .filter((taintFlow) => {
//       const { operation: opType } = taintFlow.operation;
//       return opType === "localStorage.getItem";
//     })
//     .map((taintFlow): ClientSideIdentifier => {
//       const { arguments: opArgs, location: opLocation } = taintFlow.operation;
//       const key = opArgs[0];
//       const scriptUrl = opLocation.filename;
//       return {
//         type: "storageItem",
//         key,
//         scriptUrl,
//       };
//     });

//   const cookieCSIs = taint
//     .filter((taintFlow) => {
//       const { operation: opType } = taintFlow.operation;
//       return opType === "document.cookie";
//     })
//     .map((taintFlow): ClientSideIdentifier => {});
// };
