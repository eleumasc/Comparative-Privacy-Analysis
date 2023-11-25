import { ChildProcess, spawn } from "child_process";

export interface FirefoxOptions {
  executablePath: string;
  profilePath: string;
  headless?: boolean;
  trackingProtectionOptions?: TrackingProtectionOptions;
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
    ...trackingProtectionPrefs(
      options.trackingProtectionOptions ?? TRACKING_PROTECTION_STANDARD
    ),
    options.headless ?? true ? ["--arg=--headless"] : [],
  ].flat();

  const browserProcess = spawn("web-ext", webExtArgs);

  return browserProcess;
};

type PrefType = boolean | number | string;

const pref = (key: string, value: PrefType) => {
  return ["--pref", `${key}=${value}`];
};

export enum CookieBehavior {
  REJECT_TRACKERS_PARTITION_STORAGE = 5,
  REJECT_TRACKERS = 4,
  ALLOW_ALL = 0,
}

export interface TrackingProtectionOptions {
  cookieBehavior: CookieBehavior;
  trackingContentBlocked: boolean;
  cryptominingBlocked: boolean;
  knownFingerprintingBlocked: boolean;
  suspiciousFingerprintingBlocked: boolean;
}

export const TRACKING_PROTECTION_STANDARD: TrackingProtectionOptions = {
  cookieBehavior: CookieBehavior.REJECT_TRACKERS_PARTITION_STORAGE,
  trackingContentBlocked: false,
  cryptominingBlocked: true,
  knownFingerprintingBlocked: true,
  suspiciousFingerprintingBlocked: false,
};

export const TRACKING_PROTECTION_DISABLED: TrackingProtectionOptions = {
  cookieBehavior: CookieBehavior.ALLOW_ALL,
  trackingContentBlocked: false,
  cryptominingBlocked: false,
  knownFingerprintingBlocked: false,
  suspiciousFingerprintingBlocked: false,
};

const trackingProtectionPrefs = (
  options: TrackingProtectionOptions
): string[][] => {
  const {
    cookieBehavior,
    trackingContentBlocked,
    cryptominingBlocked,
    knownFingerprintingBlocked,
    suspiciousFingerprintingBlocked,
  } = options;
  return [
    pref("browser.contentblocking.category", "custom"),
    pref("network.cookie.cookieBehavior", cookieBehavior),
    pref("privacy.trackingprotection.pbmode.enabled", trackingContentBlocked),
    pref("privacy.trackingprotection.enabled", trackingContentBlocked),
    pref(
      "privacy.trackingprotection.emailtracking.pbmode.enabled",
      trackingContentBlocked
    ),
    pref(
      "privacy.trackingprotection.emailtracking.enabled",
      trackingContentBlocked
    ),
    pref("privacy.trackingprotection.enabled", trackingContentBlocked),
    pref(
      "privacy.trackingprotection.cryptomining.enabled",
      cryptominingBlocked
    ),
    pref(
      "privacy.trackingprotection.fingerprinting.enabled",
      knownFingerprintingBlocked
    ),
    pref(
      "privacy.fingerprintingProtection.pbmode",
      suspiciousFingerprintingBlocked
    ),
    pref("privacy.fingerprintingProtection", suspiciousFingerprintingBlocked),
  ];
};
