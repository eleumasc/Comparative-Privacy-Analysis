import assert from "assert";
import { Session, SessionController } from "./Session";
import model from "../model";
import { timeBomb } from "../util/async";

export class DefaultSessionController implements SessionController {
  private session: Session | null = null;

  constructor(
    readonly sessionFactory: () => Promise<Session>,
    readonly timeoutMs?: number
  ) {
    if (typeof timeoutMs !== "undefined") {
      assert(timeoutMs > 0);
    }
  }

  async runAnalysis(url: string): Promise<model.AnalysisResult> {
    const tryOnce = async () => {
      const timeoutMs = this.timeoutMs;

      const currentSession =
        this.session ?? (this.session = await this.sessionFactory.call(null));

      try {
        if (typeof timeoutMs === "undefined") {
          return await currentSession.runAnalysis(url);
        } else {
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
    try {
      await this.session?.terminate(force);
    } catch {}

    this.session = null;
  }
}
