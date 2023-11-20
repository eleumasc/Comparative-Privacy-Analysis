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
