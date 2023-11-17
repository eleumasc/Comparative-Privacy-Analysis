export interface BaseAnalysisResult {
  status: string;
}

export interface SuccessfulAnalysisResult extends BaseAnalysisResult {
  status: "success";
  detail: Detail;
}

export interface FailedAnalysisResult extends BaseAnalysisResult {
  status: "failure";
  reason: string;
}

export type AnalysisResult = SuccessfulAnalysisResult | FailedAnalysisResult;

export interface Detail {
  requests: Request[];
  frames: Frame[];
}

export interface Request {
  requestId: string;
  frameId: string;
  method: string;
  url: string;
  resourceType: string;
  urlClassification?: UrlClassification;
}

export interface UrlClassification {
  firstParty: string[];
  thirdParty: string[];
}

export interface Frame {
  frameId: string;
  url: string;
  baseUrl: string;
  cookies: Cookie[];
  storageItems: StorageItem[];
  taintReports?: TaintReport[];
}

export interface Cookie {
  key: string;
  value: string;
}

export interface StorageItem {
  key: string;
  value: string;
}

export interface TaintReport {
  // TODO: specify
}
