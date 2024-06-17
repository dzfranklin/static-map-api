import { createServer } from "node:http";
import fs from "node:fs";
import { z } from "zod";
import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as metrics from "prom-client";
import { envelope as computeEnvelope } from "@turf/envelope";
import * as crypto from 'crypto';

dotenv.config({ path: ['.env.local', '.env'] })

const appEnv = process.env.APP_ENV || "production";
const debugMode = 'DEBUG_MODE' in process.env;

const mapboxAccessToken = process.env.MAPBOX_ACCESS_TOKEN;
if (!mapboxAccessToken) {
  console.error("MAPBOX_ACCESS_TOKEN is required");
  process.exit(1);
}

const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000");
if (isNaN(port)) {
  console.error("Invalid port number");
  process.exit(1);
}

console.log({ appEnv, hostname, port });

const PayloadSchema = z.object({
  width: z.number().default(800),
  height: z.number().default(600),
  source: z.unknown(),
  layers: z.array(z.unknown()),
});

const registry = new metrics.Registry();
const durationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 15.0];
const renderCounter = new metrics.Counter({ name: "render_counter", help: "Render count", registers: [registry] });
const pageCreationHistogram = new metrics.Histogram({ name: "page_creation_duration_v2", help: "Time to create page in seconds", buckets: durationBuckets, registers: [registry] });
const pageContentHistogram = new metrics.Histogram({ name: "page_content_duration_v2", help: "Time to set page content in seconds", buckets: durationBuckets, registers: [registry] });
const pageLoadHistogram = new metrics.Histogram({ name: "page_load_duration_v2", help: "Time to load page in seconds", buckets: durationBuckets, registers: [registry] });
const screenshotHistogram = new metrics.Histogram({ name: "screenshot_duration_v2", help: "Time to take screenshot in seconds", buckets: durationBuckets, registers: [registry] });
const renderHistogram = new metrics.Histogram({ name: "render_total_duration_v2", help: "Total time to render in seconds", buckets: durationBuckets, registers: [registry] });

const templateHTML = fs.readFileSync("template.html", "utf8");

const browser = await chromium.launch({
  headless: !debugMode,
});

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${hostname}:${port}`);
  const path = url.pathname;

  if (appEnv === "development" && req.url.startsWith("/dev/")) {
    switch (path) {
      case "/dev/template": handleDevTemplate(req, res).catch(err => handleError(res, err)); return;
      case "/dev/sample": handleDevSample(req, res).catch(err => handleError(res, err)); return;
    }
  }

  switch (path) {
    case "/render": handleRender(req, res).catch(err => handleError(res, err)); return;
    case "/health": handleHealth(req, res); return;
    case "/metrics": {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain");
      registry.metrics()
        .then((metrics) => res.end(metrics))
        .catch((err) => handleError(res, err));
      break;
    }
    default:
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html");
      res.end("Not found");
      return;
  }
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await browser.close();
  server.close();
  process.exit();
});

function handleError(res, err) {
  console.error(err);
  res.statusCode = 500;
  res.setHeader("Content-Type", "text/html");
  res.end("Internal Server Error");
}

async function handleRender(req, res) {
  let requestID = req.headers["x-request-id"];
  if (!requestID) {
    requestID = "assigned-by-static-map-" + crypto.randomBytes(16).toString("hex")
  }
  const log = (msg) => console.log(`[${requestID}]`, msg);

  log("Rendering")

  try {
    const start = performance.now();

    const profileBase = "x-profile-base" in req.headers;

    const body = await getBody(req);
    const payload = PayloadSchema.safeParse(JSON.parse(body));
    if (!payload.success) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/html");
      res.end("Bad Request");
      return;
    }

    const pageContent = renderTemplate(payload.data.source, payload.data.layers);

    const startPage = performance.now();
    const page = await browser.newPage({
      viewport: { width: payload.data.width, height: payload.data.height },
      deviceScaleFactor: 2,
    });
    const pageDur = (performance.now() - startPage) / 1000;
    pageCreationHistogram.observe(pageDur);

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        log('Page console.error: ' + msg.text());
      }
    });
    page.on("pageerror", (err) => {
      log('Page error: ' + err);
    });

    let startDur, loadDur;
    if (profileBase) {
      await page.setContent("<!DOCTYPE html><html><head></head><body><h1>Profile Base</h1></body></html>");
    } else {
      const startContent = performance.now();
      await page.setContent(pageContent);
      startDur = (performance.now() - startContent) / 1000;
      pageContentHistogram.observe(startDur);

      const startLoad = performance.now();
      await page.waitForSelector("body.ready");
      loadDur = (performance.now() - startLoad) / 1000;
      pageLoadHistogram.observe(loadDur);
    }

    const startScreenshot = performance.now();
    const screenshot = await page.screenshot({
      type: "png",
      scale: "device"
    });
    const screenshotDur = (performance.now() - startScreenshot) / 1000;
    screenshotHistogram.observe(screenshotDur);

    const totalDur = (performance.now() - start) / 1000;
    renderHistogram.observe(totalDur);
    renderCounter.inc();

    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.end(screenshot);

    await page.close();

    log("Rendered. Times: " + JSON.stringify({ pageDur, startDur, loadDur, screenshotDur, totalDur }));
  } catch (err) {
    log("Error: " + err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html");
    res.end("Internal Server Error");
  }
}

function handleHealth(_req, res) {
  if (!browser.isConnected()) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html");
    res.end("Internal Server Error: browser not connected");
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.end("OK");
}

async function handleDevSample(req, res) {
  const url = new URL(req.url, `http://${hostname}:${port}`);
  const width = parseInt(url.searchParams.get("width") || "800");
  const height = parseInt(url.searchParams.get("height") || "600");
  if (isNaN(width) || isNaN(height)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html");
    res.end("Bad Request: width and height must be numbers");
    return;
  }
  const smoke = url.searchParams.has("smoke");

  const endpoint = smoke ? 'http://static-map/render' : `http://${hostname}:${port}/render`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      width,
      height,
      source: JSON.parse(fs.readFileSync("samples/track.json", "utf8")),
      layers: JSON.parse(fs.readFileSync("samples/track_layers.json", "utf8")),
    }),
  });
  if (!resp.ok) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html");
    res.end("Internal Server Error: failed to fetch /render");
    return;
  }

  const buffer = await resp.arrayBuffer();
  const screenshot = Buffer.from(buffer);

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Sample</title>
      </head>
      <body>
        <img src="data:image/png;base64,${screenshot.toString("base64")}" width="${width}" height="${height}" />
      </body>
    </html>
  `);
}

async function handleDevTemplate(_req, res) {
  const source = JSON.parse(fs.readFileSync("samples/track.json", "utf8"));
  const layers = JSON.parse(fs.readFileSync("samples/track_layers.json", "utf8"))

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.end(renderTemplate(source, layers));
}

function renderTemplate(source, layers) {
  let tmpl = templateHTML;
  if (appEnv === "development") {
    tmpl = fs.readFileSync("template.html", "utf8");
    console.log("Loaded template from file (development mode)");
  }

  const bounds = computeEnvelope(source).bbox;

  const injection = `
<script>
  const SOURCE = JSON.parse(${JSON.stringify(JSON.stringify(source))});
  const LAYERS = JSON.parse(${JSON.stringify(JSON.stringify(layers))});
  const BOUNDS = JSON.parse(${JSON.stringify(JSON.stringify(bounds))});
  const MAPBOX_ACCESS_TOKEN = "${mapboxAccessToken}";
</script>`;

  return tmpl.replace("</head>", `${injection}\n</head>`);
}

function getBody(request) {
  return new Promise((resolve) => {
    const bodyParts = [];
    let body;
    request.on('data', (chunk) => {
      bodyParts.push(chunk);
    }).on('end', () => {
      body = Buffer.concat(bodyParts).toString();
      resolve(body)
    });
  });
}
