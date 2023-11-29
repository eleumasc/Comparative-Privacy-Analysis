import { AnalysisResult } from "../model";

export interface Session {
  runAnalysis(url: string): Promise<AnalysisResult>;
  terminate(force?: boolean): Promise<void>;
}

export interface SessionController extends Session {}

interface SessionEntry {
  name: string;
  controller: SessionController;
}
