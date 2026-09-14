import { Board, Connector, Pin } from "./board-model.js";
import { BoardState } from "./state.js";
import { EditorPanel } from "./editor-panel.js";
import { BoardPanel } from "./board-panel.js";
import { ConnectorPanel } from "./connector-panel.js";
import { ConnectorListPanel } from "./connector-list-panel.js";
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
  const drawButtons = document.querySelectorAll("[data-draw-mode]");
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
      for (const btn of drawButtons) {
        btn.disabled = true;
        btn.title = "The renderer could not start, so connector types are unavailable.";
      }
      return;
    }
    el.className = "runtime-status" + (phase === "ready" ? " ready" : "");
    el.textContent = labels[phase] ?? "";
    el.title = "";
    const ready = phase === "ready";
    genBtn.disabled = !ready;
    // Drawing a box creates a connector, which needs a type from the catalog.
    for (const btn of drawButtons) {
      btn.disabled = !ready;
      btn.title = ready ? "Draw a hotspot on the board image" : "Waiting for the renderer to start…";
    }
  });
}

function setupPanelTabs(editorPanel) {
  const tabs = [...document.querySelectorAll(".panel-tab")];
  const storageKey = "pinconnect-designer-tab";
  const activate = (tab, remember = true) => {
    // Finish a pending TOML keystroke before exposing controls that act on the
    // model. Invalid source stays visible with the editor's parse error.
    const leavingToml = document.getElementById("tab-toml").getAttribute("aria-selected") === "true";
    if (tab.id === "tab-connectors" && leavingToml && !editorPanel.flushChanges()) {
      editorPanel.textarea.focus();
      return false;
    }
    for (const candidate of tabs) {
      const active = candidate === tab;
      candidate.setAttribute("aria-selected", String(active));
      candidate.tabIndex = active ? 0 : -1;
      document.getElementById(candidate.getAttribute("aria-controls")).hidden = !active;
    }
    if (remember) {
      try { localStorage.setItem(storageKey, tab.id); } catch (_) { /* storage can be blocked */ }
    }
    return true;
  };
  for (const tab of tabs) {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (e) => {
      const index = tabs.indexOf(tab);
      let next;
      if (e.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(index + tabs.length - 1) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      else return;
      e.preventDefault();
      if (activate(next)) next.focus();
    });
  }
  let initial = tabs[0];
  try { initial = tabs.find(tab => tab.id === localStorage.getItem(storageKey)) || initial; } catch (_) { /* use default */ }
  activate(initial, false);
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

// The board's title: the one [board] field with no other visual control, since
// the image sets the dimensions and the toolbar has the theme. Like the
// connector fields it commits on change (Enter, or leaving the field), so a
// retyped title is a single undo step.
function setupBoardTitle() {
  const input = document.getElementById("board-title");
  const refresh = () => {
    const title = state.board ? state.board.title : "";
    if (input.value !== title) input.value = title;
  };
  // Pending TOML that does not parse cancels the change; show the title that stands.
  input.addEventListener("change", () => { if (!state.setTitle(input.value, "visual")) refresh(); });
  state.on("board-changed", refresh);
  refresh();
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

// The config as it was last saved or opened. Comparing the editor's text
// against it is what "unsaved changes" means here, and it is the only measure
// that behaves: state.dirty is set by loading a file as much as by editing one,
// so both opening a config and the default config at startup would look unsaved.
let savedText = null;

function markSaved(text) {
  savedText = text;
}

function hasUnsavedChanges(editorPanel) {
  return savedText !== null && editorPanel.getValue() !== savedText;
}

// Text fields commit on change, which the browser fires when a field loses
// focus. Keyboard shortcuts and closing the page act without moving focus, so a
// value still being typed would be missing from a save, and undo would discard
// it and take back the step before. Run such an action the way its toolbar
// button does: commit the focused field first, exactly as leaving it would and
// only once, so leaving it later adds no second undo step. Then return focus
// and the caret to the field.
function withActiveField(action = () => {}) {
  const field = document.activeElement;
  if (!(field instanceof HTMLInputElement) || field.type !== "text") return action();
  const { id, selectionStart, selectionEnd, selectionDirection } = field;
  field.blur();
  action();
  // The commit or the action can re-render the field's form (a rename or an
  // undo does), so find the field again by id when the original has gone.
  const target = field.isConnected ? field : id && document.getElementById(id);
  if (!target) return;
  target.focus();
  target.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
}

// Ask before losing work. The browser writes the wording and ignores anything
// we pass, so the only choice here is whether to ask at all.
function setupUnloadGuard(editorPanel) {
  addEventListener("beforeunload", (e) => {
    withActiveField();
    if (!hasUnsavedChanges(editorPanel)) return;
    e.preventDefault();
    e.returnValue = "";   // older browsers need a value assigned, not just the default prevented
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
      // An invalid file must expose its error instead of leaving the old
      // connector list available to mutate against the newly opened source.
      if (!editorPanel.flushChanges()) {
        document.getElementById("tab-toml").click();
        editorPanel.textarea.focus();
      }
      // Just opened: there is nothing unsaved yet, whatever the editor's own
      // parse did to the model on the way in.
      markSaved(editorPanel.getValue());
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
        markSaved(text);
        return;
      } catch (e) {
        // Cancelling the picker is not a save, so the document stays dirty.
        if (e.name === "AbortError") return;
      }
    }
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "board.toml";
    a.click();
    URL.revokeObjectURL(a.href);
    markSaved(text);
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
  const connectorListPanel = new ConnectorListPanel(
    document.getElementById("connector-list-container"), state
  );

  setupPanelTabs(editorPanel);
  state.on("source-error", () => {
    document.getElementById("tab-toml").click();
    editorPanel.textarea.focus();
  });
  setupResizers();
  setupFileIO(editorPanel);
  setupThemeSelect();
  setupBoardTitle();

  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  const updateUndoButtons = () => {
    undoBtn.disabled = !state.canUndo;
    redoBtn.disabled = !state.canRedo;
  };
  state.on("undo-changed", updateUndoButtons);
  // Commit pending typing before navigating history, in a field as in the TOML
  // editor, so Ctrl+Z takes back just that typing, as the Undo button (which
  // takes focus from a field first) already did. A parse error must not
  // disable Undo: returning to a saved snapshot is also a way to fix it.
  const undo = () => withActiveField(() => { editorPanel.flushChanges(); state.undo(); });
  const redo = () => withActiveField(() => { editorPanel.flushChanges(); state.redo(); });
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);

  document.addEventListener("keydown", (e) => {
    // A dialog is on top: its own keys (Escape, typing in its controls) are its
    // business, and the board must not change behind it. Delete used to remove
    // the selected connector while the Generate preview sat there showing the
    // pinout that still contained it, and Ctrl+Z would rewrite the TOML the
    // open dialog had already captured.
    if (e.defaultPrevented || document.querySelector(".modal-backdrop, .new-conn-dialog")) return;

    // Normalize the letter: with Shift held (or Caps Lock), e.key for a letter
    // is uppercase, so `e.key === "z"` never matched for Ctrl+Shift+Z (redo).
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const typing = document.activeElement?.matches("input, textarea, select") || document.activeElement?.isContentEditable;
    if (!typing && state.selectedConnectorId) {
      if (key === "Delete") {
        e.preventDefault();
        if (editorPanel.flushChanges()) state.removeConnector(state.selectedConnectorId, "visual");
      } else if (key === "d" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (editorPanel.flushChanges()) state.duplicateConnector(state.selectedConnectorId, "visual");
      }
    }
    if (key === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      withActiveField(() => document.getElementById("save-toml").click());
    }
    if (key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if ((key === "y" && (e.ctrlKey || e.metaKey)) ||
        (key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });

  const defaultToml = `[board]
title = "Pinout"
image = "board.png"
width = 800
height = 600
`;
  editorPanel.setValue(defaultToml);
  // An untouched board is not unsaved work, so this is the starting baseline.
  markSaved(editorPanel.getValue());
  setupUnloadGuard(editorPanel);

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
        for (const btn of document.querySelectorAll("[data-draw-mode]")) btn.disabled = true;
      }
    });

  maybeShowAboutOnFirstVisit();
}

init();
