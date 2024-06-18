import fs from "node:fs";

const jsDeps = ["node_modules/mapbox-gl/dist/mapbox-gl.js"].map((path) =>
  fs.readFileSync(path, "utf8")
);
const cssDeps = ["node_modules/mapbox-gl/dist/mapbox-gl.css"].map((path) =>
  fs.readFileSync(path, "utf8")
);

const tmpl = fs.readFileSync("template.html", "utf8");

const html = tmpl.replace(
  "</head>",
  `
  <style>${cssDeps.join("\n")}</style>
  <script>${jsDeps.join("\n")}</script>
</head>`
);

fs.mkdirSync(__dirname + "/build", { recursive: true });
fs.writeFileSync(__dirname + "/build/template.html", html);
