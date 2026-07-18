import { parseBoardToml, buildSourceMap, serializeBoardToml, serializeConnectorBlock, patchConnectorInSource, TomlParseError } from "./toml-io.js";
import { Board, Connector, Pin } from "./board-model.js";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function span(cls, text) {
  return `<span class="${cls}">${text}</span>`;
}

function highlightTomlLine(line) {
  // Comment line or trailing comment
  const commentIdx = findUnquotedHash(line);
  let code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
  const comment = commentIdx >= 0 ? line.slice(commentIdx) : "";

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

function highlightValue(val) {
  const trimmed = val.trim();
  const lead = esc(val.slice(0, val.indexOf(trimmed)));
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return lead + span("hl-string", esc(trimmed));
  }
  if (trimmed === "true" || trimmed === "false") {
    return lead + span("hl-bool", esc(trimmed));
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return lead + span("hl-number", esc(trimmed));
  }
  return esc(val);
}

function findUnquotedHash(line) {
  let inStr = false, quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr) { if (ch === quote && line[i - 1] !== "\\") inStr = false; }
    else if (ch === '"' || ch === "'") { inStr = true; quote = ch; }
    else if (ch === "#") return i;
  }
  return -1;
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
    this.state.on("board-changed", ({ origin }) => {
      if (origin === "editor") return;
      this._suppressSync = true;
      this._syncFromState();
      this._suppressSync = false;
    });

    this.state.on("connector-changed", ({ connectorId, origin }) => {
      if (origin === "editor") return;
      this._patchConnector(connectorId);
    });

    this.state.on("connector-added", ({ connectorId, origin }) => {
      if (origin === "editor") return;
      this._appendConnector(connectorId);
    });

    this.state.on("connector-removed", ({ connectorId, origin }) => {
      if (origin === "editor") return;
      this._removeConnectorFromSource(connectorId);
    });

    this.state.on("connector-renamed", ({ oldId, newId, origin }) => {
      if (origin === "editor") return;
      this._patchConnector(newId, oldId);
    });

    this.state.on("pin-changed", ({ connectorId, origin }) => {
      if (origin === "editor") return;
      this._patchConnector(connectorId);
    });

    this.state.on("pins-reordered", ({ connectorId, origin }) => {
      if (origin === "editor") return;
      this._patchConnector(connectorId);
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
    } catch (e) {
      this.errorEl.textContent = e instanceof TomlParseError
        ? `Line ${e.line}: ${e.message}`
        : e.message;
      this.errorEl.style.display = "block";
    }
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
    this.textarea.value = text;
    this._updateHighlight();
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
    this.textarea.value = patchConnectorInSource(text, range, this._connData(conn));
    this._updateHighlight();
    this._suppressSync = false;
  }

  // Append a newly-added connector's block rather than regenerating the whole
  // document, so hand-written comments and formatting elsewhere survive.
  _appendConnector(connectorId) {
    const conn = this.state.getConnector(connectorId);
    if (!conn) return;
    let text = this.textarea.value;
    if (text && !text.endsWith("\n")) text += "\n";
    this._suppressSync = true;
    this.textarea.value = text + "\n" + serializeConnectorBlock(this._connData(conn)) + "\n";
    this._updateHighlight();
    this._suppressSync = false;
  }

  // Delete just the removed connector's block (found by id), plus one blank
  // separator above it, leaving the rest of the document — including comments —
  // untouched. The connector is already gone from state, so match on the text.
  _removeConnectorFromSource(connectorId) {
    const text = this.textarea.value;
    const range = buildSourceMap(text).connectors.find(c => c.id === connectorId);
    if (!range) {
      this._suppressSync = true;
      this._syncFromState();
      this._suppressSync = false;
      return;
    }
    const lines = text.split("\n");
    let from = range.start;
    if (from > 0 && lines[from - 1].trim() === "") from--;
    this._suppressSync = true;
    this.textarea.value = [...lines.slice(0, from), ...lines.slice(range.end + 1)].join("\n");
    this._updateHighlight();
    this._suppressSync = false;
  }

  setValue(text) {
    this.textarea.value = text;
    this._updateHighlight();
    this._parseAndSync();
  }

  getValue() {
    return this.textarea.value;
  }
}
