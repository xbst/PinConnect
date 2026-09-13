import { parseBoardToml, buildSourceMap, serializeBoardToml, serializeConnectorBlock, patchConnectorInSource, patchBoardInSource, moveConnectorBlock, duplicateConnectorBlock, removeConnectorBlock, movePinBlock, removePinBlock, stripComment, TomlParseError } from "./toml-io.js";
import { Board, Connector, Pin } from "./board-model.js";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function span(cls, text) {
  return `<span class="${cls}">${text}</span>`;
}

function highlightTomlLine(line) {
  // Comment line or trailing comment, split exactly where the parser splits it
  const code = stripComment(line);
  const comment = line.slice(code.length);

  let result = "";

  const trimmed = code.trim();

  // Array of tables: [[...]]
  if (/^\s*\[\[.+\]\]\s*$/.test(trimmed)) {
    result = span("hl-table-array", esc(code));
  }
  // Table: [...]
  else if (/^\s*\[[^\]]+\]\s*$/.test(trimmed)) {
    result = span("hl-table", esc(code));
  }
  // Key = value
  else if (code.includes("=")) {
    const eqIdx = code.indexOf("=");
    const key = code.slice(0, eqIdx);
    const val = code.slice(eqIdx + 1);
    result = span("hl-key", esc(key)) + esc("=") + highlightValue(val);
  }
  else {
    result = esc(code);
  }

  if (comment) result += span("hl-comment", esc(comment));
  return result;
}

// Return every character of val, whitespace included: the highlight sits under
// a transparent textarea, so a dropped space shifts the rest of the line away
// from the caret.
function highlightValue(val) {
  const trimmed = val.trim();
  const start = val.indexOf(trimmed);
  const lead = esc(val.slice(0, start));
  const trail = esc(val.slice(start + trimmed.length));
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return lead + span("hl-string", esc(trimmed)) + trail;
  }
  if (trimmed === "true" || trimmed === "false") {
    return lead + span("hl-bool", esc(trimmed)) + trail;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return lead + span("hl-number", esc(trimmed)) + trail;
  }
  return esc(val);
}

function highlightToml(text) {
  return text.split("\n").map(highlightTomlLine).join("\n");
}

export class EditorPanel {
  constructor(container, state) {
    this.state = state;
    this.container = container;
    this._suppressSync = false;
    this._debounceTimer = null;
    this._sourceMap = buildSourceMap("");

    this._buildDOM();
    this._bindEvents();
    this._bindState();
  }

  _buildDOM() {
    this.container.innerHTML = `
      <div class="code-editor">
        <div class="code-gutter" id="code-gutter"></div>
        <div class="code-body">
          <pre class="code-highlight" id="code-highlight"></pre>
          <textarea class="code-input" id="code-input" spellcheck="false"
            autocomplete="off" autocorrect="off" autocapitalize="off"></textarea>
        </div>
      </div>
      <div class="code-error" id="code-error"></div>
    `;

    this.textarea = this.container.querySelector("#code-input");
    this.highlight = this.container.querySelector("#code-highlight");
    this.gutter = this.container.querySelector("#code-gutter");
    this.errorEl = this.container.querySelector("#code-error");
  }

  _bindEvents() {
    this.textarea.addEventListener("input", () => this._onInput());
    this.textarea.addEventListener("scroll", () => this._syncScroll());
    this.textarea.addEventListener("keydown", (e) => this._onKeyDown(e));
  }

  _bindState() {
    this.state.on("before-mutation", request => {
      if (this.flushChanges()) return;
      request.cancel = true;
      this.state.emit("source-error", {});
    });
    this.state.on("board-changed", ({ origin }) => {
      if (origin === "editor") return;
      if (origin === "undo" && this.state.sourceText !== null) {
        this._setSourceText(this.state.sourceText);
        return;
      }
      // Theme selection ("visual") and image load ("image") change only the
      // [board] fields, so patch that block in place -- hand-written comments
      // and every connector block survive. Initialization without saved source
      // text falls back to a full regen.
      if (origin === "image" || origin === "visual") {
        this._patchBoard();
      } else {
        this._suppressSync = true;
        this._syncFromState();
        this._suppressSync = false;
      }
    });

    this.state.on("connector-changed", ({ connectorId, origin }) => {
      if (origin === "editor") return;
      this._patchConnector(connectorId);
    });

    this.state.on("connector-added", ({ connectorId, sourceConnectorId, origin }) => {
      if (origin === "editor") return;
      if (sourceConnectorId !== undefined) this._duplicateConnectorInSource(sourceConnectorId, connectorId);
      else this._appendConnector(connectorId);
    });

    this.state.on("connectors-reordered", ({ fromIndex, toIndex, origin }) => {
      if (origin === "editor") return;
      this._setSourceText(moveConnectorBlock(this.textarea.value, fromIndex, toIndex));
    });

    this.state.on("connector-removed", ({ connectorId, origin }) => {
      if (origin === "editor") return;
      this._removeConnectorFromSource(connectorId);
    });

    this.state.on("connector-renamed", ({ oldId, newId, origin }) => {
      if (origin === "editor") return;
      this._patchConnector(newId, oldId);
    });

    this.state.on("pin-changed", ({ connectorId, removedIndex, origin }) => {
      if (origin === "editor") return;
      if (removedIndex === undefined) this._patchConnector(connectorId);
      else this._editPins(connectorId, (text, range) => removePinBlock(text, range, removedIndex));
    });

    this.state.on("pins-reordered", ({ connectorId, fromIndex, toIndex, origin }) => {
      if (origin === "editor") return;
      this._editPins(connectorId, (text, range) => movePinBlock(text, range, fromIndex, toIndex));
    });
  }

  _onInput() {
    this._updateHighlight();
    if (this._suppressSync) return;
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._parseAndSync(), 300);
  }

  _onKeyDown(e) {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = this.textarea.selectionStart;
      const end = this.textarea.selectionEnd;
      const val = this.textarea.value;
      this.textarea.value = val.substring(0, start) + "  " + val.substring(end);
      this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
      this._onInput();
    }
  }

  _updateHighlight() {
    const text = this.textarea.value;
    this.highlight.innerHTML = highlightToml(text) + "\n";
    this._updateGutter(text);
    this._syncScroll();
  }

  _updateGutter(text) {
    const count = text.split("\n").length;
    const nums = [];
    for (let i = 1; i <= count; i++) nums.push(`<div>${i}</div>`);
    this.gutter.innerHTML = nums.join("");
  }

  _syncScroll() {
    this.highlight.scrollTop = this.textarea.scrollTop;
    this.highlight.scrollLeft = this.textarea.scrollLeft;
    this.gutter.scrollTop = this.textarea.scrollTop;
  }

  _parseAndSync() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = null;
    const text = this.textarea.value;
    this.errorEl.textContent = "";
    this.errorEl.style.display = "none";

    try {
      const { board, connectors } = parseBoardToml(text);
      const boardObj = new Board({
        ...board,
        connectors: connectors.map(c => new Connector({
          ...c,
          pins: c.pins.map(p => new Pin(p.name, p.color, p.row)),
        })),
      });
      this.state.setBoard(boardObj, "editor");
      this.state.sourceText = text;
      this._sourceMap = buildSourceMap(text);
      return true;
    } catch (e) {
      this.errorEl.textContent = e instanceof TomlParseError
        ? `Line ${e.line}: ${e.message}`
        : e.message;
      this.errorEl.style.display = "block";
      return false;
    }
  }

  // Tabs call this before exposing the list, so a keystroke immediately
  // followed by a tab switch cannot leave it showing a stale connector order.
  flushChanges() {
    if (this._debounceTimer !== null || this.textarea.value !== this.state.sourceText) return this._parseAndSync();
    return this.errorEl.style.display !== "block";
  }

  _setSourceText(text) {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = null;
    this.textarea.value = text;
    this.state.sourceText = text;
    this._sourceMap = buildSourceMap(text);
    this.errorEl.textContent = "";
    this.errorEl.style.display = "none";
    this._updateHighlight();
  }

  _syncFromState() {
    if (!this.state.board) return;
    const b = this.state.board;
    const connData = b.connectors.map(c => ({
      id: c.id, name: c.name, type: c.type,
      x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2,
      orientation: c.orientation, description: c.description,
      label_style: c.label_style, symbol: c.symbol,
      pins: c.pins.map(p => ({ name: p.name, color: p.color, row: p.row })),
    }));
    const text = serializeBoardToml(
      { title: b.title, image: b.image, width: b.width, height: b.height,
        connector_dir: b.connector_dir, theme: b.theme, theme_dir: b.theme_dir },
      connData
    );
    this._setSourceText(text);
  }

  _boardData() {
    const b = this.state.board;
    return {
      title: b.title, image: b.image, width: b.width, height: b.height,
      connector_dir: b.connector_dir, theme: b.theme, theme_dir: b.theme_dir,
    };
  }

  // Update just the [board] table's keys, leaving comments and connector blocks
  // intact -- so picking a theme or loading an image doesn't wipe the document.
  // A config without a [board] table gains one rather than being regenerated.
  _patchBoard() {
    const text = this.textarea.value;
    this._suppressSync = true;
    this._setSourceText(patchBoardInSource(text, buildSourceMap(text).board, this._boardData()));
    this._suppressSync = false;
  }

  _connData(conn) {
    return {
      id: conn.id, name: conn.name, type: conn.type,
      x1: conn.x1, y1: conn.y1, x2: conn.x2, y2: conn.y2,
      orientation: conn.orientation, description: conn.description,
      label_style: conn.label_style, symbol: conn.symbol,
      pins: conn.pins.map(p => ({ name: p.name, color: p.color, row: p.row })),
    };
  }

  // Rewrite one connector's block in place. Locate it by the id it currently
  // carries in the text (lookupId — the OLD id on a rename), not by state-array
  // position: text and state can be ordered differently, and patching the
  // wrong block would corrupt an unrelated connector.
  _patchConnector(connectorId, lookupId = connectorId) {
    const text = this.textarea.value;
    const range = buildSourceMap(text).connectors.find(c => c.id === lookupId);
    const conn = this.state.getConnector(connectorId);
    if (!range || !conn) {
      this._suppressSync = true;
      this._syncFromState();
      this._suppressSync = false;
      return;
    }

    this._suppressSync = true;
    this._setSourceText(patchConnectorInSource(text, range, this._connData(conn)));
    this._suppressSync = false;
  }

  // Reordering or deleting a pin moves or removes its own lines, with the
  // comments above it, so no comment ends up describing a different pin.
  _editPins(connectorId, edit) {
    const text = this.textarea.value;
    const range = buildSourceMap(text).connectors.find(c => c.id === connectorId);
    if (range) this._setSourceText(edit(text, range));
    this._patchConnector(connectorId);
  }

  // Append a newly-added connector's block rather than regenerating the whole
  // document, so hand-written comments and formatting elsewhere survive.
  _appendConnector(connectorId) {
    const conn = this.state.getConnector(connectorId);
    if (!conn) return;
    let text = this.textarea.value;
    if (text && !text.endsWith("\n")) text += "\n";
    this._suppressSync = true;
    this._setSourceText(text + "\n" + serializeConnectorBlock(this._connData(conn)) + "\n");
    this._suppressSync = false;
  }

  _duplicateConnectorInSource(sourceConnectorId, connectorId) {
    const text = this.textarea.value;
    const index = buildSourceMap(text).connectors.findIndex(c => c.id === sourceConnectorId);
    const conn = this.state.getConnector(connectorId);
    if (index < 0 || !conn) return;
    this._setSourceText(duplicateConnectorBlock(text, index, this._connData(conn)));
  }

  // Delete the same unit that move/duplicate uses, including its introductory
  // comments; otherwise those comments would become attached to the next row.
  // The connector is already gone from state, so match on the text by id.
  _removeConnectorFromSource(connectorId) {
    const text = this.textarea.value;
    const range = buildSourceMap(text).connectors.find(c => c.id === connectorId);
    if (!range) {
      this._suppressSync = true;
      this._syncFromState();
      this._suppressSync = false;
      return;
    }
    this._suppressSync = true;
    this._setSourceText(removeConnectorBlock(text, range));
    this._suppressSync = false;
  }

  setValue(text) {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = null;
    this.textarea.value = text;
    this._updateHighlight();
    this._parseAndSync();
  }

  getValue() {
    return this.textarea.value;
  }
}
