export interface Config {
  debugMode?: boolean;
  outputBasePath: string;
  profilesBasePath: string;
  foxhound: BrowserConfig;
  firefox: BrowserConfig;
  brave: BrowserConfig;
  concurrencyLevel?: number;
  coincidenceLevel?: number;
  batchSize?: number;
  siteList: string[];
}

export interface BrowserConfig {
  executablePath: string;
}
