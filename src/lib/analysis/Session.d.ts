import { AnalysisResult } from "./model";

export interface Session {
  runAnalysis(url: string): Promise<AnalysisResult>;
  terminate(force?: boolean): Promise<void>;
}

interface SessionEntry {
  name: string;
  session: Session;
}
