import { IncomingMessage, ServerResponse } from "node:http";
import { loadSampleData } from "./loadSampleData";

export async function handleDevSample(
  url: URL,
  req: IncomingMessage,
  res: ServerResponse
) {
  const smoke = url.searchParams.get("smoke");
  const width = parseInt(url.searchParams.get("width") || "800");
  const height = parseInt(url.searchParams.get("height") || "600");
  if (isNaN(width) || isNaN(height)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html");
    res.end("Bad Request: width and height must be numbers");
    return;
  }

  let src = `/dev/sample.png?width=${width}&height=${height}`;
  if (smoke) src += "&smoke=" + encodeURIComponent(smoke);

  res.setHeader("Content-Type", "text/html");
  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Sample</title>
      </head>
      <body>
        <img src="${src}" width="${width}" height="${height}" />
      </body>
    </html>
  `);
}

export async function handleDevSamplePNG(
  url: URL,
  _req: IncomingMessage,
  res: ServerResponse,
  selfEndpoint: string,
  mapboxAccessToken: string
) {
  const samplePayload = await loadSampleData(mapboxAccessToken);

  const width = parseInt(url.searchParams.get("width"));
  const height = parseInt(url.searchParams.get("height"));
  if (isNaN(width) || isNaN(height)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html");
    res.end("Bad Request: width and height must be numbers");
    return;
  }
  const smoke = url.searchParams.get("smoke");

  const endpoint = smoke ? `${smoke}/render` : `${selfEndpoint}/render`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...samplePayload, width, height }),
  });
  if (!resp.ok) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html");
    res.end("Internal Server Error: render failed");
    return;
  }

  const buffer = await resp.arrayBuffer();
  const screenshot = Buffer.from(buffer);

  res.setHeader("Content-Type", "image/png");
  res.end(screenshot);
}
