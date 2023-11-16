import { ChildProcess, spawn } from "child_process";

export interface FirefoxOptions {
  executablePath: string;
  profilePath: string;
  headless?: boolean;
  trackingProtection?: boolean;
  debugMode?: boolean;
}

export const spawnFirefox = (
  options: FirefoxOptions,
  startUrl?: string
): ChildProcess => {
  const webExtArgs: string[] = [
    "run",
    `--source-dir=firefox-agent`,
    `--firefox=${options.executablePath}`,
    `--firefox-profile=${options.profilePath}`,
    "--profile-create-if-missing",
    "--keep-profile-changes",
    "--no-reload",
    startUrl ? ["--start-url", startUrl] : [],
    pref("toolkit.startup.max_resumed_crashes", -1),
    ...trackingProtectionPrefs(options.trackingProtection ?? true),
    options.headless ?? true ? ["--arg=--headless"] : [],
    options.debugMode ? ["--verbose"] : [],
  ].flat();

  const browserProcess = spawn("web-ext", webExtArgs);

  if (options.debugMode) {
    browserProcess.stdout.pipe(process.stdout);
    browserProcess.stderr.pipe(process.stderr);
  }

  return browserProcess;
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
