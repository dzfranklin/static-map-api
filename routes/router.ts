import { IncomingMessage, ServerResponse } from "node:http";
import handleDevTemplate from "./dev/template";
import { Logger } from "pino";
import Renderer from "../renderer";
import handleHealth from "./health";
import handleRender from "./render";
import { handleDevSample, handleDevSamplePNG } from "./dev/sample";
import handleMetrics from "./metrics";

export default function createRouter(config: {
  appEnv: string;
  selfEndpoint: string;
  mapboxAccessToken: string;
  renderer: Renderer;
  logger: Logger;
  buildDir: string;
}) {
  const { appEnv } = config;
  return async (url: URL, req: IncomingMessage, res: ServerResponse) => {
    try {
      if (appEnv === "development" && url.pathname.startsWith("/dev")) {
        switch (url.pathname) {
          case "/dev/template":
            await handleDevTemplate(url, req, res, config.mapboxAccessToken);
            return;
          case "/dev/sample":
            await handleDevSample(url, req, res);
            return;
          case "/dev/sample.png":
            await handleDevSamplePNG(
              url,
              req,
              res,
              config.selfEndpoint,
              config.mapboxAccessToken
            );
            return;
        }
      }

      switch (url.pathname) {
        case "/health":
          await handleHealth(url, req, res, config.logger, config.renderer);
          return;
        case "/metrics":
          await handleMetrics(url, req, res);
          return;
        case "/render":
          await handleRender(
            url,
            req,
            res,
            config.logger,
            config.renderer,
            config.mapboxAccessToken,
            config.buildDir
          );
          return;
      }

      res.statusCode = 404;
      res.end("Not found");
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      if (appEnv === "development") {
        res.end("Internal server error: " + e.message);
      } else {
        res.end("Internal server error");
      }
    }
  };
}
