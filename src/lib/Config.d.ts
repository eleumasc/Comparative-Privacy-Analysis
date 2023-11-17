export interface Config {
  debugMode?: boolean;
  outputBasePath: string;
  profilesBasePath: string;
  foxhound: BrowserConfig;
  firefox: BrowserConfig;
  brave: BrowserConfig;
  siteList: string[];
}

export interface BrowserConfig {
  executablePath: string;
}
