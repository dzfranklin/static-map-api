import { IncomingMessage, ServerResponse } from "http";
import { loadSampleData } from "./loadSampleData";
import fs from "node:fs";

export default async function handleDevTemplate(
  _url: URL,
  _req: IncomingMessage,
  res: ServerResponse,
  mapboxAccessToken: string
) {
  let args = await loadSampleData(mapboxAccessToken);

  const template = await fs.promises.readFile(
    __dirname + "/../../build/template.html",
    "utf8"
  );

  const html = template.replace(
    "</body>",
    `<script>
      const args = JSON.parse(${JSON.stringify(JSON.stringify(args))});
      window.renderStaticMap(args)
        .then(() => console.info('Done!'))
        .catch(err => console.error(err));
    </script>`
  );

  res.setHeader("Content-Type", "text/html");
  res.end(html);
}
