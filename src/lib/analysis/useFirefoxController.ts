import http from "http";
import { server as WebSocketServer } from "websocket";
import Completer from "../util/Completer";
import { DefaultFirefoxAgent, FirefoxAgent } from "./FirefoxAgent";
import {
  FirefoxController,
  FIREFOX_AGENT,
  DefaultFirefoxController,
} from "./FirefoxController";

export const DEFAULT_PORT = 8040;
export const DEFAULT_MAX_RECEIVED_FRAME_SIZE = 50 * 1024 * 1024;

export interface FirefoxControllerOptions {
  port?: number;
  maxReceivedFrameSize?: number;
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
    maxReceivedFrameSize:
      options.maxReceivedFrameSize ?? DEFAULT_MAX_RECEIVED_FRAME_SIZE,
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
    } else {
      request.reject();
    }
  });

  const controller = new DefaultFirefoxController(connectCompleters, port);

  try {
    return await callback(controller);
  } finally {
    wsServer.closeAllConnections();
    httpServer.close();
  }
};
