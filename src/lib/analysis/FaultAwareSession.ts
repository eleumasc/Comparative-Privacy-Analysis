import { Session } from "./Session";
import model from "../model";

export class FaultAwareSession implements Session {
  private session: Session | null = null;

  constructor(readonly sessionFactory: () => Promise<Session>) {}

  async runAnalysis(url: string): Promise<model.AnalysisResult> {
    const tryOnce = async () => {
      const currentSession =
        this.session ?? (this.session = await this.sessionFactory.call(null));
      try {
        return await currentSession.runAnalysis(url);
      } catch (e) {
        currentSession.terminate(true);
        this.session = null;
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
  }
}
