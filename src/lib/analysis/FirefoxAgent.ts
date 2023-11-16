import { connection as WebSocket, Message } from "websocket";
import Completer from "../util/Completer";

export interface FirefoxAgent {
  assignTask(command: string, parameter: any): Promise<any>;
  close(): void;
}

interface Task {
  id: string;
  command: string;
  parameter: any;
}

interface TaskResult {
  taskId: string;
  status: "success" | "failure";
  detail: any;
}

export class DefaultFirefoxAgent implements FirefoxAgent {
  private taskCompleters = new Map<string, Completer<any>>();

  constructor(readonly socket: WebSocket) {
    socket.on("message", (message) => {
      this.onSocketMessage(message);
    });

    socket.on("close", (code, desc) => {
      this.onSocketClose(code, desc);
    });
  }

  async assignTask(command: string, parameter: any): Promise<any> {
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
      const { taskId, detail } = taskResult;
      const taskCompleter = this.taskCompleters.get(taskId);
      if (taskCompleter) {
        taskCompleter.complete(detail);
      }
    }
  }

  private onSocketClose(_code: number, _desc: string): void {
    for (const taskCompleter of this.taskCompleters.values()) {
      taskCompleter.completeError();
    }
    this.taskCompleters.clear();
  }

  close(): void {
    this.socket.close();
  }
}
