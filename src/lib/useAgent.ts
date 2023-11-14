import express from "express";

export interface UseAgentOptions {
  navigationUrl: string;
  onReceiveDataListener: (data: any) => void;
}

export const useAgent = async (
  options: UseAgentOptions,
  callback: (willThink: Promise<void>) => Promise<void>
) => {
  const run = async () => {
    const { navigationUrl, onReceiveDataListener } = options;

    let notifyDidThink: (() => void) | null = null;
    const willThink = new Promise<void>((resolve) => {
      notifyDidThink = () => resolve();
    });

    const antiHangTimeout = setTimeout(() => {
      console.log("hanged!");
      didHang = true;
      notifyDidThink!();
    }, 60_000);

    const app = express();

    app.use(express.json({ limit: "100mb" }));

    app.post("/", (request, response) => {
      const { action, ...body } = request.body;
      switch (action) {
        case "GetNavigationUrl":
          return response.json({ navigationUrl });
        case "SendData":
          clearTimeout(antiHangTimeout);
          onReceiveDataListener(body.data);
          notifyDidThink!();
          return response.status(204).end();
        default:
          return response.status(404).end();
      }
    });

    const server = app.listen(8040);
    try {
      await callback(willThink);
    } finally {
      server.close();
    }
  };

  let didHang;
  do {
    didHang = false;
    await run();
  } while (didHang);
};
