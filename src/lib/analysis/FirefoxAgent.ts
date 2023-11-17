import { connection as WebSocket, Message } from "websocket";
import Completer from "../util/Completer";

export interface FirefoxAgent {
  assignTask(command: string, parameter: any): Promise<TaskResult>;
  close(): void;
}

interface Task {
  id: string;
  command: string;
  parameter: any;
}

interface BaseTaskResult {
  taskId: string;
  status: string;
}

interface SuccessfulTaskResult extends BaseTaskResult {
  status: "success";
  detail: any;
}

interface FailedTaskResult extends BaseTaskResult {
  status: "failure";
  reason: string;
}

export type TaskResult = SuccessfulTaskResult | FailedTaskResult;

export class DefaultFirefoxAgent implements FirefoxAgent {
  private taskCompleters = new Map<string, Completer<TaskResult>>();

  constructor(readonly socket: WebSocket) {
    socket.on("message", (message) => {
      this.onSocketMessage(message);
    });

    socket.on("close", (code, desc) => {
      this.onSocketClose(code, desc);
    });
  }

  async assignTask(command: string, parameter: any): Promise<TaskResult> {
    const taskId = crypto.randomUUID();
    const taskCompleter = new Completer<any>();
    this.taskCompleters.set(taskId, taskCompleter);
    const task = <Task>{
      id: taskId,
      command,
      parameter,
    };
    this.socket.send(JSON.stringify(task));
    try {
      return await taskCompleter.promise;
    } finally {
      this.taskCompleters.delete(taskId);
    }
  }

  private onSocketMessage(message: Message): void {
    if (message.type === "utf8") {
      const taskResult = JSON.parse(message.utf8Data) as TaskResult;
      const { taskId } = taskResult;
      const taskCompleter = this.taskCompleters.get(taskId);
      if (taskCompleter) {
        taskCompleter.complete(taskResult);
      }
    }
  }

  private onSocketClose(code: number, desc: string): void {
    for (const taskCompleter of this.taskCompleters.values()) {
      taskCompleter.completeError(
        new Error(`Socket has been closed: ${desc} (${code})`)
      );
    }
    this.taskCompleters.clear();
  }

  close(): void {
    this.socket.close();
  }
}
