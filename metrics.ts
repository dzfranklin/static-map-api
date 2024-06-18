import { Counter, Histogram, Registry } from "prom-client";

export const registry = new Registry();

const durationBuckets = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0,
  8.0, 9.0, 10.0, 15.0,
];

export const renderCounter = new Counter({
  name: "render_counter",
  help: "Render count",
  registers: [registry],
});

export const pageCreationHistogram = new Histogram({
  name: "page_creation_duration_v2",
  help: "Time to create page in seconds",
  buckets: durationBuckets,
  registers: [registry],
});

export const templateLoadHistogram = new Histogram({
  name: "template_load_duration",
  help: "Time to load page in seconds",
  buckets: durationBuckets,
  registers: [registry],
});

export const pageReadyHistogram = new Histogram({
  name: "page_ready_duration",
  help: "Time to page ready in seconds",
  buckets: durationBuckets,
  registers: [registry],
});

export const screenshotHistogram = new Histogram({
  name: "screenshot_duration_v2",
  help: "Time to take screenshot in seconds",
  buckets: durationBuckets,
  registers: [registry],
});

export const contextCloseHistogram = new Histogram({
  name: "context_close_duration",
  help: "Time to close context in seconds",
  buckets: durationBuckets,
  registers: [registry],
});

export const renderHistogram = new Histogram({
  name: "render_total_duration_v2",
  help: "Total time to render in seconds",
  buckets: durationBuckets,
  registers: [registry],
});
