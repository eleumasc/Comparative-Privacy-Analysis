import { AnalysisResult } from "../model";
import { asyncDelay } from "../util/async";
import { SessionController } from "./Session";

export class DummySessionController implements SessionController {
  private working = false;

  async runAnalysis(url: string): Promise<AnalysisResult> {
    console.log("runAnalysis", url);

    this.working = true;
    await asyncDelay(Math.round(Math.random() * 1_000));
    this.working = false;

    return {} as AnalysisResult;
  }

  async terminate(force?: boolean | undefined): Promise<void> {
    if (this.working) {
      throw new Error("Interrupted");
    }
    console.log("terminate", force);
  }
}
