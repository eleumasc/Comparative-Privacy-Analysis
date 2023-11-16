import http from "http";
import { server as WebSocketServer } from "websocket";
import Completer from "../util/Completer";
import { DefaultFirefoxAgent, FirefoxAgent } from "./FirefoxAgent";

const FIREFOX_AGENT = "firefox-agent";
const DEFAULT_PORT = 8040;

export interface FirefoxController {
  generateAgentId(): string;
  getConnectUrl(agentId: string): string;
  waitForAgent(agentId: string): Promise<FirefoxAgent>;
}

export interface FirefoxControllerOptions {
  port?: number;
}

export const useFirefoxController = async (
  options: FirefoxControllerOptions,
  callback: (controller: FirefoxController) => Promise<void>
) => {
  const port = options.port ?? DEFAULT_PORT;

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const pathTokens = url.pathname.split("/");
    if (pathTokens.length === 3 && pathTokens[1] === FIREFOX_AGENT) {
      const wsUrl = new URL(url);
      wsUrl.protocol = "ws";
      res.writeHead(200, undefined, { "Content-Type": "text/html" });
      res.end(`<title>${FIREFOX_AGENT}:${wsUrl.href}</title>`);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  httpServer.listen(port);

  const wsServer = new WebSocketServer({
    httpServer,
    autoAcceptConnections: false,
  });

  const connectCompleters = new Map<string, Completer<FirefoxAgent>>();

  wsServer.on("request", (request) => {
    const pathTokens = request.resourceURL.path?.split("/");
    if (
      pathTokens &&
      pathTokens.length === 3 &&
      pathTokens[1] === FIREFOX_AGENT
    ) {
      const agentId = pathTokens[2];
      const connectCompleter = connectCompleters.get(agentId);
      if (connectCompleter) {
        const socket = request.accept(null, request.origin);
        connectCompleter.complete(new DefaultFirefoxAgent(socket));
      }
    }
  });

  const controller: FirefoxController = {
    generateAgentId() {
      return crypto.randomUUID();
    },
    getConnectUrl(agentId: string): string {
      return `http://127.0.0.1:${port}/${FIREFOX_AGENT}/${agentId}`;
    },
    async waitForAgent(agentId) {
      const connectCompleter = new Completer<FirefoxAgent>();
      connectCompleters.set(agentId, connectCompleter);
      try {
        return await connectCompleter.promise;
      } finally {
        connectCompleters.delete(agentId);
      }
    },
  };

  try {
    return await callback(controller);
  } finally {
    wsServer.closeAllConnections();
    httpServer.close();
  }
};
