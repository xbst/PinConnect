// Loads pinout-gen into the page under Pyodide.
//
// The designer used to carry a hand-written JavaScript copy of the renderer,
// which meant every connector style had to be drawn twice and the two copies
// could disagree. Running the real package instead means the preview and the
// downloaded file come from the same code as the `pinout-gen` command.

export const PYODIDE_VERSION = "v314.0.6";

const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const PAYLOAD_URL = "pinout_gen.zip";
const ROOT_DIR = "/pinconnect";
const PKG_DIR = `${ROOT_DIR}/pkg`;

let _boot = null;
let _bridge = null;
let _failure = null;
const _listeners = [];

/** Subscribe to boot progress. Phases: runtime, package, ready, error. */
export function onProgress(cb) {
  _listeners.push(cb);
  return () => {
    const i = _listeners.indexOf(cb);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

function emit(phase, detail = "") {
  for (const cb of _listeners) {
    try { cb(phase, detail); } catch (e) { /* a bad listener must not stop boot */ }
  }
}

async function boot() {
  emit("runtime");
  let loadPyodide;
  try {
    ({ loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`));
  } catch (e) {
    throw new Error(
      "Could not download the Python runtime from cdn.jsdelivr.net. Check your " +
      "network or allowlist that host, or use the pinout-gen command line tool."
    );
  }
  const py = await loadPyodide({ indexURL: PYODIDE_BASE });

  emit("package");
  const resp = await fetch(PAYLOAD_URL, { cache: "no-store" });
  if (!resp.ok) {
    throw new Error(
      `Could not load ${PAYLOAD_URL} (HTTP ${resp.status}). If you are serving ` +
      "this folder yourself, run tools/build-payload.py first."
    );
  }
  const bytes = new Uint8Array(await resp.arrayBuffer());

  // Extract with Python's own zipfile rather than a Pyodide helper, so this
  // depends only on the filesystem API, which is stable across releases.
  py.FS.mkdirTree(ROOT_DIR);
  py.FS.writeFile(`${ROOT_DIR}/payload.zip`, bytes);
  py.runPython(`
import sys, zipfile
with zipfile.ZipFile("${ROOT_DIR}/payload.zip") as z:
    z.extractall("${PKG_DIR}")
if "${PKG_DIR}" not in sys.path:
    sys.path.insert(0, "${PKG_DIR}")
`);

  _bridge = py.pyimport("bridge");
  emit("ready");
  return py;
}

/** Resolves once pinout-gen is importable. Safe to call repeatedly. */
export function ready() {
  if (!_boot) {
    _boot = boot().catch((e) => {
      // Keep the rejected promise so a blocked CDN does not restart the whole
      // download on every keystroke. Recovery goes through retry().
      _failure = e;
      emit("error", e && e.message ? e.message : String(e));
      throw e;
    });
  }
  return _boot;
}

/** Discard a failed boot and start over, for a Retry control. */
export function retry() {
  _boot = null;
  _failure = null;
  return ready();
}

export function failure() {
  return _failure;
}

async function bridge() {
  await ready();
  return _bridge;
}

/** True once pinout-gen is importable, for callers that cannot await. */
export function isReady() {
  return _bridge !== null;
}

// ── Catalogs ────────────────────────────────────────────────────────

export async function connectorCatalog() {
  return JSON.parse((await bridge()).connector_catalog());
}

export async function themeCatalog() {
  return JSON.parse((await bridge()).theme_catalog());
}

export async function symbolCatalog() {
  return JSON.parse((await bridge()).symbol_catalog());
}

// ── Rendering ───────────────────────────────────────────────────────

/**
 * SVG for one connector, drawn by the same renderer the CLI uses.
 *
 * Deliberately synchronous: this sits on the connector editor's redraw path,
 * which builds its markup in one pass, and a render measures well under a
 * millisecond. Returns null before the runtime is ready, so callers show a
 * placeholder and redraw when it lands.
 */
export function previewConnectorSvg(connector) {
  if (!_bridge) return null;
  return _bridge.preview_connector_svg(JSON.stringify(connector));
}

/**
 * Render a board TOML to a finished pinout page.
 * Passing an image data URI embeds the image; omitting it leaves the page
 * referencing the image by the relative path in the config.
 */
export async function generate(boardToml, { imageDataUri = "", themeName = "" } = {}) {
  return (await bridge()).generate(boardToml, imageDataUri, themeName);
}
