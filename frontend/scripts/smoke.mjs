// Headless render smoke test: mount the built app in happy-dom against the live
// FastAPI backend (127.0.0.1:8000), let the solves resolve, and assert the DOM
// contains the numbers we expect. Not a substitute for a real browser, but it
// exercises the full React + fetch + component path, not just the type-checker.
//
//   node scripts/smoke.mjs
//
// Requires: `pnpm build` (dist/) done, and uvicorn running on :8000.

import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const BASE = "http://127.0.0.1:8000";

const win = new Window({ url: "http://localhost:5173/" });
const doc = win.document;
doc.body.innerHTML = '<div id="root"></div>';

// Shim the pieces recharts / the canvas Grid reach for that happy-dom lacks.
const canvasProto = win.HTMLCanvasElement.prototype;
canvasProto.getContext = () =>
  new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === "canvas" ? doc.createElement("canvas") : () => {},
      set: () => true,
    },
  );
win.devicePixelRatio = 1;
if (!win.ResizeObserver) {
  win.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// Give recharts' ResponsiveContainer a non-zero size to render into.
Object.defineProperty(win.HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get: () => 640,
});
Object.defineProperty(win.HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get: () => 260,
});

// Expose happy-dom's DOM as globals for the bundle.
for (const k of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "SVGElement",
  "customElements",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "matchMedia",
  "ResizeObserver",
  "MutationObserver",
  "devicePixelRatio",
  "CSSStyleSheet",
  "DOMParser",
]) {
  if (win[k] !== undefined && globalThis[k] === undefined) globalThis[k] = win[k];
}
globalThis.window = win;
globalThis.document = doc;
globalThis.matchMedia =
  win.matchMedia?.bind(win) ??
  (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

// Rewrite the app's relative /api calls onto the real backend.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) =>
  realFetch(typeof url === "string" && url.startsWith("/") ? BASE + url : url, opts);

// Import the built bundle (it mounts <App/> on import).
const assets = "dist/assets";
const bundle = readdirSync(assets).find(
  (f) => f.startsWith("index-") && f.endsWith(".js"),
);
if (!bundle) throw new Error("no built bundle in dist/assets — run `pnpm build`");
readFileSync(`${assets}/${bundle}`); // fail early if unreadable
await import(pathToFileURL(`${assets}/${bundle}`).href);

// Let the puzzle fetch + the two solves resolve.
await new Promise((r) => setTimeout(r, 4000));

const text = doc.body.textContent.replace(/\s+/g, " ").trim();
const checks = {
  "renders masthead": /Enclose Horse/i.test(text),
  "shows IP score 76": /IP score\s*76/.test(text),
  "shows optimalScore 76": /optimalScore\s*76/.test(text),
  "shows integrality gap heading": /Integrality gap/.test(text),
  "shows LP ceiling 77.4": /77\.4/.test(text),
  "shows shadow price readout": /marginal value of the next wall/.test(text),
  "inspector lists closure family": /closure/.test(text),
  "inspector lists flow conservation": /flow conservation/.test(text),
  "no React error boundary text": !/something went wrong/i.test(text),
};

let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}
console.log("\n--- rendered text (first 600 chars) ---");
console.log(text.slice(0, 600));

await win.happyDOM?.close?.();
process.exit(ok ? 0 : 1);
