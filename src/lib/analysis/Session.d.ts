export interface Session {
  runAnalysis(url: string): Promise<any>;
  terminate(force?: boolean): Promise<void>;
}
