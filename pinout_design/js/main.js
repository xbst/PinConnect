import { ConnectorType, ConnectorGeometry, Board, Connector, Pin } from "./board-model.js";
import { BoardState } from "./state.js";
import { EditorPanel } from "./editor-panel.js";
import { BoardPanel } from "./board-panel.js";
import { ConnectorPanel } from "./connector-panel.js";
import { serializeBoardToml } from "./toml-io.js";

const state = new BoardState();

async function loadConnectorTypes() {
  const fetchOptions = { cache: "no-store" };
  const resp = await fetch("connectors/index.json", fetchOptions);
  const names = await resp.json();
  for (const name of names) {
    const r = await fetch(`connectors/${name}.json`, fetchOptions);
    const data = await r.json();
    state.connectorTypes.set(name, new ConnectorType(
      data.name, data.style, new ConnectorGeometry(data.geometry)
    ));
  }
}

async function loadThemes() {
  try {
    const resp = await fetch("themes/index.json", { cache: "no-store" });
    state.themes = await resp.json();
  } catch (e) {
    state.themes = [{ name: "default", display: "Default" }];
  }
}

async function loadSymbols() {
  try {
    const resp = await fetch("symbols.json", { cache: "no-store" });
    state.symbolNames = await resp.json();
  } catch (e) {
    state.symbolNames = [];
  }
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
  await loadConnectorTypes();
  await loadThemes();
  await loadSymbols();

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
    if (e.key === "Delete" && state.selectedConnectorId) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      state.removeConnector(state.selectedConnectorId, "visual");
    }
    if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById("save-toml").click();
    }
    if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      state.undo();
      editorPanel._syncFromState();
    }
    if ((e.key === "y" && (e.ctrlKey || e.metaKey)) ||
        (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
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
}

init();
