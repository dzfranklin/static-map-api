import { createServer } from "node:http";
import fs from "node:fs";
import { z } from "zod";
import * as dotenv from "dotenv";
import * as crypto from "crypto";
import pino from "pino";
import handleDevTemplate from "./routes/dev/template";
import createRouter from "./routes/router";
import Renderer from "./renderer";

dotenv.config({ path: [".env.local", ".env"] });

const appEnv = process.env.APP_ENV || "production";

export const PayloadSchema = z.object({
  width: z.number().default(800),
  height: z.number().default(600),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  padding: z.number().default(20),
  source: z.unknown(),
  layers: z.array(z.unknown()),
});

export type Payload = z.infer<typeof PayloadSchema>;

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    appEnv === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

const mapboxAccessToken = process.env.MAPBOX_ACCESS_TOKEN;
if (!mapboxAccessToken) {
  throw new Error("MAPBOX_ACCESS_TOKEN is required");
}

const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000");
if (isNaN(port)) {
  throw new Error("Invalid port number");
}

let buildDir = process.env.BUILD_DIR;
if (!buildDir && appEnv === "development") {
  buildDir = __dirname + "/build";
}
if (!buildDir) {
  console.error("BUILD_DIR is required");
}

async function main() {
  logger.info({ appEnv, hostname, port }, "Starting");

  const renderer = await Renderer.launch();
  logger.info("Renderer ready");

  const router = createRouter({
    appEnv,
    selfEndpoint: `http://${hostname}:${port}`,
    mapboxAccessToken,
    renderer,
    logger,
    buildDir,
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${hostname}:${port}`);
    router(url, req, res);
  });

  server.listen(port, hostname, () => {
    logger.info(`Server running at http://${hostname}:${port}/`);
  });

  const shutdown = async () => {
    console.log("Shutting down...");
    server.close();
    server.on("close", async () => {
      await renderer.close();
      process.exit();
    });
  };
  ["SIGINT", "SIGTERM"].forEach((signal) => process.on(signal, shutdown));
}

main();
