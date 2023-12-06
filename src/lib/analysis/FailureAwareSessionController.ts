import assert from "assert";
import model from "../model";
import { SessionController } from "./Session";

export interface FailureAwareSessionControllerOptions {
  maxAttempts: number;
}

export class FailureAwareSessionController implements SessionController {
  constructor(
    readonly controller: SessionController,
    readonly options: FailureAwareSessionControllerOptions
  ) {
    assert(options.maxAttempts > 0);
  }

  async runAnalysis(url: string): Promise<model.AnalysisResult> {
    let lastResult: model.AnalysisResult;
    const maxAttempts = this.options.maxAttempts;
    for (let i = 0; i < maxAttempts; i += 1) {
      lastResult = await this.controller.runAnalysis(url);
      if (lastResult.status === "success") {
        return lastResult;
      } else {
        await this.terminate();
      }
    }
    return lastResult!;
  }

  async terminate(force?: boolean): Promise<void> {
    await this.controller.terminate(force);
  }
}
