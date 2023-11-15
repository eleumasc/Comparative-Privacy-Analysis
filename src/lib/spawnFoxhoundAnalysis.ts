import { ChildProcess, spawn } from "child_process";

export interface FoxhoundAnalysisOptions {
  executablePath: string;
  profilePath: string;
  headless?: boolean;
  trackingProtection?: boolean;
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
    pref("toolkit.startup.max_resumed_crashes", -1),
    ...trackingProtectionPrefs(options.trackingProtection ?? true),
    options.headless ?? true ? ["--arg=--headless"] : [],
  ].flat();

  return spawn("web-ext", webExtArgs);
};

type PrefType = boolean | number | string;

const pref = (key: string, value: PrefType) => {
  return ["--pref", `${key}=${value}`];
};

const trackingProtectionPrefs = (enabled: boolean): string[][] => {
  return [
    pref("browser.contentblocking.category", enabled ? "standard" : "custom"),
    pref("network.cookie.cookieBehavior", enabled ? 5 : 0),
    pref("privacy.trackingprotection.pbmode.enabled", enabled),
    pref("privacy.trackingprotection.emailtracking.pbmode.enabled", enabled),
    pref("privacy.trackingprotection.cryptomining.enabled", enabled),
    pref("privacy.trackingprotection.fingerprinting.enabled", enabled),
    pref("privacy.fingerprintingProtection.pbmode", enabled),
  ];
};
