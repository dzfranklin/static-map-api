import { Logger } from "pino";
import { Browser, chromium } from "playwright";
import * as metrics from "../metrics";

export default class Renderer {
  static async launch() {
    const browser = await chromium.launch({});

    // prewarm
    const prewarmCtx = await browser.newContext();
    await prewarmCtx.newPage();
    await prewarmCtx.close();

    return new Renderer(browser);
  }

  private constructor(private browser: Browser) {}

  async close() {
    await this.browser.close();
  }

  async isConnected() {
    return this.browser.isConnected();
  }

  async render(
    l: Logger,
    viewport: { width: number; height: number },
    url: string,
    args: Record<string, unknown>
  ): Promise<Buffer> {
    l.debug("Starting rendering");
    const renderTimer = metrics.renderHistogram.startTimer();

    const pageCreationTimer = metrics.pageCreationHistogram.startTimer();
    const ctx = await this.browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    pageCreationTimer();

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        l.error("Page console.error: %s", msg.text());
      } else {
        l.debug("Page console.%s: %s", msg.type(), msg.text());
      }
    });
    page.on("pageerror", (err) => {
      l.error("Page error: %s", err.message);
    });
    page.on("request", (req) => {
      l.debug("Request: %s, %s", req.method(), req.url());
    });

    const templateLoadTimer = metrics.templateLoadHistogram.startTimer();
    await page.goto(url);
    await page.waitForLoadState("domcontentloaded");
    templateLoadTimer();

    const pageReadyTimer = metrics.pageReadyHistogram.startTimer();
    await page.evaluate(async (args) => {
      // @ts-ignore
      const renderFn = window.renderStaticMap;

      if (!renderFn) {
        throw new Error("window.renderStaticMap not found");
      }
      await renderFn(args);
    }, args);
    pageReadyTimer();

    const screenshotTImer = metrics.screenshotHistogram.startTimer();
    const screenshot = await page.screenshot();
    screenshotTImer();

    renderTimer();
    metrics.renderCounter.inc();

    const contextCloseTimer = metrics.contextCloseHistogram.startTimer();
    await ctx.close();
    contextCloseTimer();

    return screenshot;
  }
}
