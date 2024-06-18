import { IncomingMessage, ServerResponse } from "http";
import { registry } from "../metrics";

export default async function handleMetrics(
  _url: URL,
  _req: IncomingMessage,
  res: ServerResponse
) {
  const metrics = await registry.metrics();
  res.setHeader("Content-Type", "text/plain");
  res.end(metrics);
}
