import { IncomingMessage, ServerResponse } from "http";
import Renderer from "../renderer";
import { Logger } from "pino";

export default async function handleHealth(
  _url: URL,
  _req: IncomingMessage,
  res: ServerResponse,
  logger: Logger,
  renderer: Renderer
) {
  res.setHeader("Content-Type", "text/plain");

  if (!(await renderer.isConnected())) {
    res.statusCode = 500;
    res.end("Renderer is not connected");
    return;
  }

  res.end("OK");
}
