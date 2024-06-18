#!/usr/bin/env -S npx ts-node
import fs from "node:fs";
import Renderer from "../renderer/index";
import pino from "pino";

const cwd = __dirname;

const renderCount = parseInt(process.argv[2] || "10");
if (isNaN(renderCount)) {
  throw new Error("Invalid argument");
}

const l = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
    },
  },
});

async function run() {
  fs.rmSync("build/profileEmpty", { recursive: true });
  fs.mkdirSync("build/profileEmpty", { recursive: true });
  const renderer = await Renderer.launch();

  const times = [];
  for (let i = 0; i < renderCount; i++) {
    const start = performance.now();
    const value = await renderer.render(
      l,
      { width: 800, height: 600 },
      `file:///${cwd}/../empty.html`,
      {}
    );
    times.push(performance.now() - start);
    fs.writeFileSync(`build/profileEmpty/empty-${i}.png`, value);
  }

  l.info(`Times: ${times.map((t) => (t / 1000).toFixed(2)).join(", ")}`);

  await renderer.close();
}

run();
