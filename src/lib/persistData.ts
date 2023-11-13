import { mkdir, writeFile } from "fs/promises";
import path from "path";

export const persistData = async (
  data: any,
  outputDir: string,
  analysisName: string
): Promise<void> => {
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir!, `${analysisName}.json`),
    JSON.stringify(data)
  );
};
