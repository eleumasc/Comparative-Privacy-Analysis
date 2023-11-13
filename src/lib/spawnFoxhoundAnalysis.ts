import { ChildProcess, spawn } from "child_process";

export interface FoxhoundAnalysisOptions {
  sourceDir: string;
  executablePath: string;
  profilePath: string;
}

export const spawnFoxhoundAnalysis = (
  options: FoxhoundAnalysisOptions
): ChildProcess => {
  const webExtArgs: string[] = [
    "run",
    `--source-dir=${options.sourceDir}`,
    `--firefox=${options.executablePath}`,
    `--firefox-profile=${options.profilePath}`,
    "--profile-create-if-missing",
    "--keep-profile-changes",
    "--no-reload",
    ...["--pref", "toolkit.startup.max_resumed_crashes=-1"],
    "--arg=--headless",
  ];

  return spawn("web-ext", webExtArgs);
};
