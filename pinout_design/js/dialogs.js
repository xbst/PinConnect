// The Generate preview and the About box.
//
// Generate renders through the same code path as the `pinout-gen` command, so
// what the preview shows is what the downloaded file contains.

import * as runtime from "./runtime.js";

const REPO_URL = "https://github.com/xbst/PinConnect";
const DOCS_URL = "https://docs.isiks.tech";
const ABOUT_SEEN_KEY = "pinconnect.about.seen";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A modal shell. Returns the body element plus a close function. */
function openModal(title, { wide = false } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML =
    `<div class="modal${wide ? " modal-wide" : ""}" role="dialog" aria-modal="true">` +
    `<div class="modal-head"><span class="modal-title">${esc(title)}</span>` +
    `<button class="modal-close" title="Close">&times;</button></div>` +
    `<div class="modal-body"></div></div>`;

  const cleanups = [];
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    for (const fn of cleanups) { try { fn(); } catch (e) { /* keep closing */ } }
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };

  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(backdrop);

  return { body: backdrop.querySelector(".modal-body"), close, onClose: (fn) => cleanups.push(fn) };
}

function saveFile(text, suggestedName, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  // Revoke on the next frame; revoking immediately can cancel the download.
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

// ── Generate ────────────────────────────────────────────────────────

export async function openGenerate(state, tomlText) {
  const { body, close, onClose } = openModal("Generate pinout", { wide: true });
  const board = state.board;
  const hasImage = !!state.imageDataUrl;
  const themes = runtime.isReady() ? await runtime.themeCatalog() : [];
  const current = (board && board.theme) || "default";
  if (!themes.some((t) => t.name === current)) {
    themes.push({ name: current, display: current });
  }

  body.innerHTML =
    `<div class="gen-bar">` +
    `<label class="gen-theme">Theme <select id="gen-theme">` +
    themes.map((t) =>
      `<option value="${esc(t.name)}"${t.name === current ? " selected" : ""}>${esc(t.display)}</option>`
    ).join("") +
    `</select></label>` +
    `<span class="gen-status" id="gen-status">Rendering…</span>` +
    `<span class="gen-spacer"></span>` +
    `<button id="gen-dl-embed"${hasImage ? "" : " disabled"}>Download (image included)</button>` +
    `<button id="gen-dl-plain">Download (image separate)</button>` +
    `</div>` +
    `<div class="gen-preview" id="gen-preview"></div>` +
    `<p class="gen-note">${hasImage
      ? "The included-image file is one self-contained HTML file. The separate version is smaller but needs the board image beside it."
      : "No board image is loaded, so the page will reference the image named in the config."}</p>`;

  const statusEl = body.querySelector("#gen-status");
  const previewEl = body.querySelector("#gen-preview");
  const themeEl = body.querySelector("#gen-theme");
  let previewUrl = null;
  onClose(() => { if (previewUrl) URL.revokeObjectURL(previewUrl); });

  const render = async (embed) =>
    runtime.generate(tomlText, {
      imageDataUri: embed && hasImage ? state.imageDataUrl : "",
      themeName: themeEl.value,
    });

  const refresh = async () => {
    statusEl.textContent = "Rendering…";
    try {
      // Always embed for the preview: a referenced image cannot resolve from a
      // blob URL, so the board would show as broken art in the iframe.
      const html = await render(true);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      previewEl.innerHTML = `<iframe src="${previewUrl}" title="Pinout preview"></iframe>`;
      statusEl.textContent = `${(html.length / 1024).toFixed(0)} KB`;
    } catch (e) {
      previewEl.innerHTML = `<pre class="gen-error">${esc(e && e.message ? e.message : e)}</pre>`;
      statusEl.textContent = "Failed";
    }
  };

  const stem = (board && board.image ? board.image.replace(/\.[^.]+$/, "") : "") || "board";
  const download = async (embed) => {
    try {
      saveFile(await render(embed), `${stem}.pinout.html`, "text/html");
    } catch (e) {
      statusEl.textContent = "Failed";
    }
  };

  themeEl.addEventListener("change", refresh);
  body.querySelector("#gen-dl-embed").addEventListener("click", () => download(true));
  body.querySelector("#gen-dl-plain").addEventListener("click", () => download(false));

  await refresh();
  return close;
}

// ── About ───────────────────────────────────────────────────────────

export function openAbout() {
  const { body } = openModal("About PinConnect");
  body.innerHTML =
    `<p>PinConnect turns a photo of a circuit board into an interactive pinout ` +
    `diagram. Load a board image, draw a box over each connector, label the pins, ` +
    `then press <strong>Generate</strong> to get a single HTML file you can open ` +
    `in a browser or embed in a documentation site.</p>` +
    `<p>This designer runs the real generator in your browser, so nothing is ` +
    `uploaded and the preview matches what the command line tool produces. There ` +
    `is also a <code>pinout-gen</code> command for regenerating pinouts from a ` +
    `saved config.</p>` +
    `<p class="about-links">` +
    `<a href="${DOCS_URL}" target="_blank" rel="noopener">Documentation</a>` +
    `<a href="${REPO_URL}" target="_blank" rel="noopener">Source on GitHub</a>` +
    `</p>`;
}

/** Show the About box once per browser, for someone arriving with no context. */
export function maybeShowAboutOnFirstVisit() {
  let seen = null;
  try { seen = localStorage.getItem(ABOUT_SEEN_KEY); } catch (e) { seen = "1"; }
  if (seen) return;
  try { localStorage.setItem(ABOUT_SEEN_KEY, "1"); } catch (e) { /* private window */ }
  openAbout();
}
