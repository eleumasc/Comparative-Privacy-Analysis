import { BrowserId } from "../BrowserId";
import { AnalysisResult } from "../model";

export interface Session {
  runAnalysis(url: string): Promise<AnalysisResult>;
  terminate(force?: boolean): Promise<void>;
}

export interface SessionController extends Session {}

export interface SessionEntry {
  browserId: BrowserId;
  name: string;
  controller: SessionController;
}
