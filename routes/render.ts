import { IncomingMessage, ServerResponse } from "http";
import Renderer from "../renderer";
import { Logger } from "pino";
import crypto from "node:crypto";
import z from "zod";

const PayloadSchema = z.object({
  width: z.number().default(800),
  height: z.number().default(600),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  padding: z.number().default(20),
  source: z.unknown(),
  layers: z.array(z.unknown()),
});

type Payload = z.infer<typeof PayloadSchema>;

export default async function handleRender(
  _url: URL,
  req: IncomingMessage,
  res: ServerResponse,
  logger: Logger,
  renderer: Renderer,
  mapboxAccessToken: string,
  buildDir: string
) {
  let requestID = req.headers["x-request-id"];
  if (!requestID) {
    requestID =
      "assigned-by-static-map-" + crypto.randomBytes(16).toString("hex");
  }
  logger = logger.child({ requestID });

  const body = await getBody(req);
  let payload: Payload;
  try {
    payload = PayloadSchema.parse(JSON.parse(body));
  } catch (e) {
    res.statusCode = 400;
    res.end("Invalid payload: " + e.message);
    return;
  }

  const start = performance.now();

  const img = await renderer.render(
    logger,
    { width: payload.width, height: payload.height },
    `file:///${buildDir}/template.html`,
    {
      source: payload.source,
      layers: payload.layers,
      bbox: payload.bbox,
      padding: payload.padding,
      mapboxAccessToken,
    }
  );

  logger.info(
    "Rendered in %ss",
    ((performance.now() - start) / 1000).toFixed(2)
  );

  res.setHeader("Content-Type", "image/png");
  res.end(img);
}

function getBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const bodyParts = [];
    request
      .on("data", (chunk) => {
        bodyParts.push(chunk);

        if (bodyParts.length > 1e6) {
          request.destroy();
          reject(new Error("Request too large"));
        }
      })
      .on("end", () => {
        const body = Buffer.concat(bodyParts).toString("utf-8");
        resolve(body);
      });
  });
}
