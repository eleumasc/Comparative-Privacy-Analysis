import assert from "assert";
import model from "../model";
import { Session } from "./Session";

export interface FailureAwareSessionOptions {
  maxAttempts: number;
}

export class FailureAwareSession implements Session {
  constructor(
    readonly session: Session,
    readonly options: FailureAwareSessionOptions
  ) {
    assert(options.maxAttempts > 0);
  }

  async runAnalysis(url: string): Promise<model.AnalysisResult> {
    let lastResult: model.AnalysisResult;
    const maxAttempts = this.options.maxAttempts;
    for (let i = 0; i < maxAttempts; i += 1) {
      lastResult = await this.session.runAnalysis(url);
      if (lastResult.status === "success") {
        return lastResult;
      }
    }
    return lastResult!;
  }

  async terminate(force?: boolean): Promise<void> {
    await this.session.terminate(force);
  }
}
