import assert from "assert";
import { Session } from "./Session";
import model from "../model";
import { timeBomb } from "../util/async";

export class FaultAwareSession implements Session {
  private session: Session | null = null;

  constructor(
    readonly sessionFactory: () => Promise<Session>,
    readonly timeoutMs?: number
  ) {}

  async runAnalysis(url: string): Promise<model.AnalysisResult> {
    const tryOnce = async () => {
      const currentSession =
        this.session ?? (this.session = await this.sessionFactory.call(null));
      const timeoutMs = this.timeoutMs;
      try {
        if (typeof timeoutMs === "undefined") {
          return await currentSession.runAnalysis(url);
        } else {
          assert(timeoutMs > 0);
          return await timeBomb(currentSession.runAnalysis(url), timeoutMs);
        }
      } catch (e) {
        this.terminate(true);
        throw e;
      }
    };

    try {
      return await tryOnce();
    } catch {
      return await tryOnce();
    }
  }

  async terminate(force?: boolean): Promise<void> {
    await this.session?.terminate(force);
    this.session = null;
  }
}
