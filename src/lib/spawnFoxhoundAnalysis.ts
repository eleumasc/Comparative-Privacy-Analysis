import { ChildProcess, spawn } from "child_process";

export interface FoxhoundAnalysisOptions {
  executablePath: string;
  profilePath: string;
  headless?: boolean;
}

export const spawnFoxhoundAnalysis = (
  options: FoxhoundAnalysisOptions
): ChildProcess => {
  const webExtArgs: string[] = [
    "run",
    `--source-dir=foxhound-analysis`,
    `--firefox=${options.executablePath}`,
    `--firefox-profile=${options.profilePath}`,
    "--profile-create-if-missing",
    "--keep-profile-changes",
    "--no-reload",
    ...["--pref", "toolkit.startup.max_resumed_crashes=-1"],
    ...(options.headless ?? false ? ["--arg=--headless"] : []),
  ];

  return spawn("web-ext", webExtArgs);
};
