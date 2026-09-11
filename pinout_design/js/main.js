import { Board, Connector, Pin } from "./board-model.js";
import { BoardState } from "./state.js";
import { EditorPanel } from "./editor-panel.js";
import { BoardPanel } from "./board-panel.js";
import { ConnectorPanel } from "./connector-panel.js";
import { serializeBoardToml } from "./toml-io.js";
import * as runtime from "./runtime.js";
import { openGenerate, openAbout, maybeShowAboutOnFirstVisit } from "./dialogs.js";

const state = new BoardState();

// Connector geometry, themes and the symbol list all come from pinout-gen
// itself now, so there is nothing here to keep in step with the Python side.
async function loadCatalogs() {
  const [connectors, themes, symbols] = await Promise.all([
    runtime.connectorCatalog(), runtime.themeCatalog(), runtime.symbolCatalog(),
  ]);
  state.connectorTypes.clear();
  for (const ct of connectors) {
    state.connectorTypes.set(ct.slug, { name: ct.name, style: ct.style, geometry: ct.geometry });
  }
  state.themes = themes;
  state.symbolNames = symbols;
}

// Boot progress lives in the toolbar. Loading an image and drawing hotspots
// works while this runs; only the connector drawing and Generate have to wait.
function setupRuntimeStatus() {
  const el = document.getElementById("runtime-status");
  const genBtn = document.getElementById("generate-btn");
  const drawBtn = document.getElementById("draw-mode-btn");
  const labels = {
    runtime: "Starting renderer…",
    package: "Loading connectors…",
    ready: "",
  };
  runtime.onProgress((phase, detail) => {
    if (phase === "error") {
      el.className = "runtime-status error";
      el.textContent = "Renderer unavailable";
      el.title = detail;
      genBtn.disabled = true;
      drawBtn.disabled = true;
      drawBtn.title = "The renderer could not start, so connector types are unavailable.";
      return;
    }
    el.className = "runtime-status" + (phase === "ready" ? " ready" : "");
    el.textContent = labels[phase] ?? "";
    el.title = "";
    const ready = phase === "ready";
    genBtn.disabled = !ready;
    // Drawing a box creates a connector, which needs a type from the catalog.
    drawBtn.disabled = !ready;
    drawBtn.title = ready ? "" : "Waiting for the renderer to start…";
  });
}

function setupThemeSelect() {
  const sel = document.getElementById("theme-select");
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const refresh = () => {
    const cur = (state.board && state.board.theme) || "default";
    const list = state.themes.slice();
    if (!list.some(t => t.name === cur)) list.push({ name: cur, display: cur });
    sel.innerHTML = list.map(t =>
      `<option value="${esc(t.name)}"${t.name === cur ? " selected" : ""}>${esc(t.display)}</option>`
    ).join("");
  };
  refresh();
  sel.addEventListener("change", () => state.setTheme(sel.value, "visual"));
  state.on("board-changed", refresh);
  state.on("catalogs-loaded", refresh);
}

function setupResizers() {
  const resizerH = document.getElementById("resizer-h");
  const panelEditor = document.getElementById("panel-editor");
  let startX, startW;

  resizerH.addEventListener("mousedown", (e) => {
    startX = e.clientX;
    startW = panelEditor.offsetWidth;
    resizerH.classList.add("active");
    const onMove = (e) => {
      panelEditor.style.width = Math.max(150, startW + e.clientX - startX) + "px";
      panelEditor.style.flex = "none";
    };
    const onUp = () => {
      resizerH.classList.remove("active");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  const resizerV = document.getElementById("resizer-v");
  const panelBoard = document.getElementById("panel-board");
  let startY, startH;

  resizerV.addEventListener("mousedown", (e) => {
    startY = e.clientY;
    startH = panelBoard.offsetHeight;
    resizerV.classList.add("active");
    const onMove = (e) => {
      panelBoard.style.height = Math.max(100, startH + e.clientY - startY) + "px";
      panelBoard.style.flex = "none";
    };
    const onUp = () => {
      resizerV.classList.remove("active");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function setupFileIO(editorPanel) {
  document.getElementById("open-image").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        if (!state.board) {
          state.setBoard(new Board({ title: "Pinout" }), "init");
        }
        state.setImage(reader.result, file.name, img.naturalWidth, img.naturalHeight);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  });

  document.getElementById("open-toml").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      editorPanel.setValue(reader.result);
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("save-toml").addEventListener("click", async () => {
    const text = editorPanel.getValue();
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: "board.toml",
          types: [{ description: "TOML", accept: { "text/plain": [".toml"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        return;
      } catch (e) { if (e.name === "AbortError") return; }
    }
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "board.toml";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

async function init() {
  setupRuntimeStatus();

  const editorPanel = new EditorPanel(
    document.getElementById("editor-container"), state
  );
  const boardPanel = new BoardPanel(
    document.getElementById("board-body"), state
  );
  const connectorPanel = new ConnectorPanel(
    document.getElementById("connector-body"), state
  );

  setupResizers();
  setupFileIO(editorPanel);
  setupThemeSelect();

  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  const updateUndoButtons = () => {
    undoBtn.disabled = !state.canUndo;
    redoBtn.disabled = !state.canRedo;
  };
  state.on("undo-changed", updateUndoButtons);
  undoBtn.addEventListener("click", () => { state.undo(); editorPanel._syncFromState(); });
  redoBtn.addEventListener("click", () => { state.redo(); editorPanel._syncFromState(); });

  document.addEventListener("keydown", (e) => {
    // A dialog is on top: its own keys (Escape, typing in its controls) are its
    // business, and the board must not change behind it. Delete used to remove
    // the selected connector while the Generate preview sat there showing the
    // pinout that still contained it, and Ctrl+Z would rewrite the TOML the
    // open dialog had already captured.
    if (document.querySelector(".modal-backdrop")) return;

    if (e.key === "Delete" && state.selectedConnectorId) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      state.removeConnector(state.selectedConnectorId, "visual");
    }
    // Normalize the letter: with Shift held (or Caps Lock), e.key for a letter
    // is uppercase, so `e.key === "z"` never matched for Ctrl+Shift+Z (redo).
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById("save-toml").click();
    }
    if (key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      state.undo();
      editorPanel._syncFromState();
    }
    if ((key === "y" && (e.ctrlKey || e.metaKey)) ||
        (key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
      e.preventDefault();
      state.redo();
      editorPanel._syncFromState();
    }
  });

  const defaultToml = `[board]
title = "Pinout"
image = "board.png"
width = 800
height = 600
`;
  editorPanel.setValue(defaultToml);

  document.getElementById("generate-btn").addEventListener("click", () => {
    openGenerate(state, editorPanel.getValue());
  });
  document.getElementById("about-btn").addEventListener("click", openAbout);

  // The renderer boots in the background. Refresh the pieces that depend on it
  // with a dedicated event: board-changed would make the editor regenerate the
  // TOML from the model and throw away the user's comments.
  loadCatalogs()
    .then(() => state.emit("catalogs-loaded", {}))
    .catch((e) => {
      // Only a boot failure reaches the toolbar on its own. If the runtime
      // started and a catalog call then threw, nothing reported it: the status
      // read "ready" while the designer had no connector types at all, so every
      // connector drew as "Unknown type" and Generate produced errors.
      const el = document.getElementById("runtime-status");
      if (el && !el.classList.contains("error")) {
        el.className = "runtime-status error";
        el.textContent = "Connector types unavailable";
        el.title = e && e.message ? e.message : String(e);
        document.getElementById("generate-btn").disabled = true;
        document.getElementById("draw-mode-btn").disabled = true;
      }
    });

  maybeShowAboutOnFirstVisit();
}

init();
