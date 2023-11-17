import { ChildProcess } from "child_process";
import { Session } from "./Session";
import { FirefoxOptions, spawnFirefox } from "./spawnFirefox";
import { timeBomb } from "../util/async";
import { FirefoxController } from "./FirefoxController";
import { FirefoxAgent } from "./FirefoxAgent";

export interface FirefoxSessionOptions {
  isFoxhound?: boolean;
}

export class FirefoxSession implements Session {
  constructor(
    readonly agent: FirefoxAgent,
    readonly browserProcess: ChildProcess,
    readonly options?: FirefoxSessionOptions
  ) {}

  async runAnalysis(url: string): Promise<any> {
    const isFoxhound = this.options?.isFoxhound ?? false;
    return await this.agent.assignTask("RunAnalysis", { url, isFoxhound });
  }

  async terminate(force?: boolean): Promise<void> {
    if (force) {
      this.browserProcess.kill("SIGINT");
    } else {
      await this.agent.assignTask("Shutdown", null);
    }
    this.agent.close();
  }

  static async create(
    controller: FirefoxController,
    options: FirefoxOptions,
    sessionOptions?: FirefoxSessionOptions
  ): Promise<FirefoxSession> {
    const agentId = controller.generateAgentId();
    const connectUrl = controller.getConnectUrl(agentId);

    const willCreate = (async () => {
      const browserProcess = spawnFirefox(options, connectUrl);

      const agent = await controller.waitForAgent(agentId);

      return new FirefoxSession(agent, browserProcess, sessionOptions);
    })();

    try {
      return await timeBomb(willCreate, 30_000);
    } catch (e) {
      throw new Error(`Cannot create instance of FirefoxSession: ${e}`);
    }
  }
}
