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
  blockedRequests?: BlockedRequest[];
  frames: Frame[];
}

export interface Request {
  requestId: string;
  frameId: string;
  method: string;
  url: string;
  body: RequestBody | null;
  resourceType: string;
  urlClassification?: UrlClassification;
}

export interface RequestBody {
  formData?: { key: string; value: string }[];
  raw?: string;
}

export interface UrlClassification {
  firstParty: string[];
  thirdParty: string[];
}

export interface BlockedRequest {
  request: Request;
  error: BlockedRequestError;
}

export type BlockedRequestError =
  | "NS_ERROR_MALWARE_URI"
  | "NS_ERROR_PHISHING_URI"
  | "NS_ERROR_TRACKING_URI"
  | "NS_ERROR_UNWANTED_URI"
  | "NS_ERROR_BLOCKED_URI"
  | "NS_ERROR_HARMFUL_URI"
  | "NS_ERROR_FINGERPRINTING_URI"
  | "NS_ERROR_CRYPTOMINING_URI"
  | "NS_ERROR_SOCIALTRACKING_URI";

export interface Frame {
  frameId: string;
  url: string;
  baseUrl: string;
  cookies: Cookie[];
  storageItems: StorageItem[];
  taintReports?: TaintReport[];
}

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface Cookie extends KeyValuePair {}

export interface StorageItem extends KeyValuePair {}

export interface TaintReport {
  loc: string;
  parentloc: string;
  referrer: string;
  scriptUrl: string;
  sink: string;
  str: string;
  subframe: boolean;
  taint: TaintFlow[];
  sinkOperation: TaintOperation;
}

export interface TaintFlow {
  begin: number;
  end: number;
  operation: TaintOperation;
}

export interface TaintOperation {
  arguments: string[];
  builtin: boolean;
  location: TaintLocation;
  operation: string;
  source: boolean;
}

export interface TaintLocation {
  filename: string;
  function: string;
  line: number;
  pos: number;
  scripthash: string;
  scriptline: number;
}
