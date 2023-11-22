import { ChildProcess } from "child_process";
import model from "../model";
import { Session } from "./Session";
import { FirefoxOptions, spawnFirefox } from "./spawnFirefox";
import { timeBomb } from "../util/async";
import { FirefoxController } from "./FirefoxController";
import { FirefoxAgent } from "./FirefoxAgent";

export interface FirefoxSessionOptions {
  firefoxOptions: FirefoxOptions;
  isFoxhound?: boolean;
}

export class FirefoxSession implements Session {
  constructor(
    readonly agent: FirefoxAgent,
    readonly browserProcess: ChildProcess,
    readonly options: FirefoxSessionOptions
  ) {}

  async runAnalysis(url: string): Promise<model.AnalysisResult> {
    const isFoxhound = this.options.isFoxhound ?? false;
    const taskResult = await this.agent.assignTask("RunAnalysis", {
      url,
      isFoxhound,
    });
    const { status } = taskResult;
    if (status === "success") {
      const { detail } = taskResult;
      return { status, detail };
    } else if (status === "failure") {
      const { reason } = taskResult;
      return { status, reason };
    } else {
      throw new Error("Unknown status"); // This should never happen
    }
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
    options: FirefoxSessionOptions
  ): Promise<FirefoxSession> {
    const agentId = controller.generateAgentId();
    const connectUrl = controller.getConnectUrl(agentId);

    const willCreate = async () => {
      const browserProcess = spawnFirefox(options.firefoxOptions, connectUrl);
      const agent = await controller.waitForAgent(agentId);
      return new FirefoxSession(agent, browserProcess, options);
    };

    try {
      return await timeBomb(willCreate(), 30_000);
    } catch (e) {
      throw new Error(`Cannot create instance of FirefoxSession: ${e}`);
    }
  }
}
