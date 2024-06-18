#!/usr/bin/env -S npx ts-node
import fs from "node:fs";
import Renderer from "../renderer/index";
import pino from "pino";
import { execSync } from "node:child_process";
import * as dotenv from "dotenv";

process.chdir(__dirname + "/..");
const cwd = process.cwd();

const renderCount = parseInt(process.argv[2] || "10");
if (isNaN(renderCount)) {
  throw new Error("Invalid argument");
}

dotenv.config({ path: [".env.local", ".env"] });

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

const args = {
  mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
  source: {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [-4.38795285, 56.87985996, 512],
        [-4.38780236, 56.87985753, 498],
        [-4.42286917, 56.87317189, 592],
        [-4.45245967, 56.85366183, 965],
        [-4.24606251, 56.93516234, 415],
      ],
    },
  },
  layers: [
    {
      id: "track",
      type: "line",
      layout: {
        "line-cap": "round",
      },
      paint: {
        "line-color": "#2563eb",
        "line-width": 4,
      },
    },
  ],
  bbox: [-4.45245967, 56.85366183, -4.24606251, 56.93516234],
  padding: 50,
};

function testCase(renderer: Renderer) {
  return renderer.render(
    l,
    { width: 800, height: 600 },
    `file:///${cwd}/build/template.html`,
    args
  );
}

function roundedSecs(ms: number): number {
  const secs = ms / 1000;
  return Math.round(secs * 1000) / 1000;
}

function stddev(arr: number[]): number {
  var n = arr.length;
  var sum = 0;

  arr.map(function (data) {
    sum += data;
  });

  var mean = sum / n;

  var variance = 0.0;
  var v1 = 0.0;
  var v2 = 0.0;

  for (var i = 0; i < n; i++) {
    v1 = v1 + (arr[i] - mean) * (arr[i] - mean);
    v2 = v2 + (arr[i] - mean);
  }

  v2 = (v2 * v2) / n;
  variance = (v1 - v2) / (n - 1);
  if (variance < 0) {
    variance = 0;
  }
  return Math.sqrt(variance);
}

async function run() {
  l.info(`Profiling ${renderCount} times`);

  try {
    fs.rmSync("build/profile", { recursive: true });
  } catch (e) {}
  fs.mkdirSync("build/profile", { recursive: true });
  execSync("npm run build");

  const renderer = await Renderer.launch();

  const times = [];
  for (let i = 0; i < renderCount; i++) {
    const start = performance.now();
    const value = await testCase(renderer);
    times.push(performance.now() - start);
    fs.writeFileSync(`build/profile/profile-${i}.png`, value);
  }

  const summary = {
    min: roundedSecs(Math.min(...times)),
    max: roundedSecs(Math.max(...times)),
    median: roundedSecs(times.sort()[Math.floor(times.length / 2)]),
    stdDev: stddev(times.map(roundedSecs)),
  };
  l.info(`Summary: ${JSON.stringify(summary)}`);
  l.info(`Times: ${JSON.stringify(times.map(roundedSecs))}`);

  await renderer.close();
}

run();
