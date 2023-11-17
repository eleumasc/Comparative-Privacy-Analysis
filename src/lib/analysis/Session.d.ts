export interface Session {
  runAnalysis(url: string): Promise<model.AnalysisResult>;
  terminate(force?: boolean): Promise<void>;
}
