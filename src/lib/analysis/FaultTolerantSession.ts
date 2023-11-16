import { Session } from "./Session";

export class FaultTolerantSession implements Session {
  private session: Session | null = null;

  constructor(readonly sessionFactory: () => Promise<Session>) {}

  async runAnalysis(url: string): Promise<any> {
    const currentSession =
      this.session ?? (this.session = await this.sessionFactory.call(null));
    try {
      return await currentSession.runAnalysis(url);
    } catch (e) {
      console.log(e); // TODO: persist error log
      currentSession.terminate(true);
      this.session = null;
    }
  }

  async terminate(force?: boolean): Promise<void> {
    await this.session?.terminate(force);
  }
}
