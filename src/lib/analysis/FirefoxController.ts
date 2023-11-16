import Completer from "../util/Completer";
import { FirefoxAgent } from "./FirefoxAgent";

export const FIREFOX_AGENT = "firefox-agent";

export interface FirefoxController {
  generateAgentId(): string;
  getConnectUrl(agentId: string): string;
  waitForAgent(agentId: string): Promise<FirefoxAgent>;
}

export class DefaultFirefoxController implements FirefoxController {
  constructor(
    readonly connectCompleters: Map<string, Completer<FirefoxAgent>>,
    readonly port: number
  ) {}

  generateAgentId(): string {
    return crypto.randomUUID();
  }

  getConnectUrl(agentId: string): string {
    return `http://127.0.0.1:${this.port}/${FIREFOX_AGENT}/${agentId}`;
  }

  async waitForAgent(agentId: string): Promise<FirefoxAgent> {
    const connectCompleter = new Completer<FirefoxAgent>();
    this.connectCompleters.set(agentId, connectCompleter);
    try {
      return await connectCompleter.promise;
    } finally {
      this.connectCompleters.delete(agentId);
    }
  }
}
