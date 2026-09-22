// Local dev server for the admin API. Run with: npm run dev:admin
// Lets you exercise /products, /applications, /messages, /health without deploying.

import { createServer, IncomingMessage, ServerResponse } from "http";
import { loadConfig } from "../../shared/config";
import { routeAdmin } from "./router";

const config = loadConfig();

const server = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";

    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
    }
    const body = raw ? JSON.parse(raw) : undefined;

    const result = await routeAdmin(method, url, body, config);

    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
  },
);

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Admin API listening on http://localhost:${port}`);
});
