import { Board, Connector, Pin } from "./board-model.js";

export class BoardState {
  constructor() {
    this.board = null;
    this.connectorTypes = new Map();
    this.themes = [];          // [{name, display}] mirrored from the bundled themes
    this.symbolNames = [];     // named-icon list for the connector symbol field
    this.selectedConnectorId = null;
    this.imageDataUrl = null;
    // The editor keeps the last successfully synchronized source here so
    // structural undo/redo can restore comments and formatting as well.
    this.sourceText = null;
    this.dirty = false;
    this._listeners = new Map();
    this._origin = null;
    this._undoStack = [];
    this._redoStack = [];
    this._isRestoring = false;
  }

  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(callback);
  }

  off(event, callback) {
    const cbs = this._listeners.get(event);
    if (cbs) {
      const idx = cbs.indexOf(callback);
      if (idx >= 0) cbs.splice(idx, 1);
    }
  }

  emit(event, data) {
    const cbs = this._listeners.get(event);
    if (cbs) cbs.forEach(cb => cb(data));
  }

  get origin() { return this._origin; }
  get canUndo() { return this._undoStack.length > 0; }
  get canRedo() { return this._redoStack.length > 0; }

  _prepareMutation(origin) {
    if (origin === "editor" || origin === "init" || this._isRestoring) return true;
    // The source editor may still have a pending keystroke. Flush it before
    // looking up objects or taking an undo snapshot; invalid source cancels
    // the visual action rather than allowing the two representations to drift.
    const request = { origin, cancel: false };
    this.emit("before-mutation", request);
    return !request.cancel;
  }

  _snapshot() {
    if (!this.board) return null;
    return {
      title: this.board.title,
      image: this.board.image,
      width: this.board.width,
      height: this.board.height,
      connector_dir: this.board.connector_dir,
      theme: this.board.theme,
      theme_dir: this.board.theme_dir,
      connectors: this.board.connectors.map(c => ({
        id: c.id, name: c.name, type: c.type,
        x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2,
        orientation: c.orientation, description: c.description,
        label_style: c.label_style, symbol: c.symbol,
        pins: c.pins.map(p => ({ name: p.name, color: p.color, row: p.row })),
      })),
      selectedConnectorId: this.selectedConnectorId,
      sourceText: this.sourceText,
    };
  }

  _pushUndo() {
    if (this._isRestoring) return;
    const snap = this._snapshot();
    if (!snap) return;
    this._undoStack.push(snap);
    if (this._undoStack.length > 100) this._undoStack.shift();
    this._redoStack = [];
    this.emit("undo-changed", {});
  }

  _restoreSnapshot(snap) {
    this._isRestoring = true;
    this.board = new Board({
      ...snap,
      connectors: snap.connectors.map(c => new Connector({
        ...c,
        pins: c.pins.map(p => new Pin(p.name, p.color, p.row)),
      })),
    });
    this.selectedConnectorId = snap.selectedConnectorId;
    this.sourceText = snap.sourceText ?? null;
    this._origin = "undo";
    this.dirty = true;
    this.emit("board-changed", { board: this.board, origin: "undo" });
    this.emit("selection-changed", { connectorId: this.selectedConnectorId });
    this._origin = null;
    this._isRestoring = false;
    this.emit("undo-changed", {});
  }

  undo() {
    if (!this.canUndo) return;
    const current = this._snapshot();
    if (current) this._redoStack.push(current);
    this._restoreSnapshot(this._undoStack.pop());
  }

  redo() {
    if (!this.canRedo) return;
    const current = this._snapshot();
    if (current) this._undoStack.push(current);
    this._restoreSnapshot(this._redoStack.pop());
  }

  setBoard(board, origin = "init") {
    if (!this._prepareMutation(origin)) return;
    if (origin !== "init") this._pushUndo();
    this._origin = origin;
    this.board = board instanceof Board ? board : new Board(board);
    this.dirty = origin !== "init";
    this.emit("board-changed", { board: this.board, origin });
    this._origin = null;
  }

  setImage(dataUrl, imageName, width, height) {
    if (!this._prepareMutation("image")) return;
    this.imageDataUrl = dataUrl;
    if (this.board) {
      this.board.image = imageName;
      this.board.width = width;
      this.board.height = height;
      this.dirty = true;
    }
    this.emit("image-changed", { dataUrl, width, height });
    // Board fields changed too; emit board-changed so the editor TOML and
    // panels sync immediately instead of on the next unrelated mutation.
    if (this.board) {
      this._origin = "image";
      this.emit("board-changed", { board: this.board, origin: "image" });
      this._origin = null;
    }
  }

  setTheme(theme, origin = "visual") {
    if (!this._prepareMutation(origin)) return;
    if (!this.board || this.board.theme === theme) return;
    this._pushUndo();
    this._origin = origin;
    this.board.theme = theme;
    this.dirty = true;
    this.emit("board-changed", { board: this.board, origin });
    this._origin = null;
  }

  selectConnector(id) {
    this.selectedConnectorId = id;
    this.emit("selection-changed", { connectorId: id });
  }

  getConnector(id) {
    if (!this.board) return null;
    return this.board.connectors.find(c => c.id === id) || null;
  }

  getConnectorIndex(id) {
    if (!this.board) return -1;
    return this.board.connectors.findIndex(c => c.id === id);
  }

  getSelectedConnector() {
    return this.selectedConnectorId ? this.getConnector(this.selectedConnectorId) : null;
  }

  updateConnector(id, changes, origin = "visual") {
    if (!this._prepareMutation(origin)) return;
    const conn = this.getConnector(id);
    if (!conn) return;
    this._pushUndo();
    this._origin = origin;
    Object.assign(conn, changes);
    this.dirty = true;
    this.emit("connector-changed", { connectorId: id, connector: conn, origin });
    this._origin = null;
  }

  // ID changes must go through renameConnector, not updateConnector: the id is
  // the key used by events, the canvas DOM, and the selection pointer.
  renameConnector(oldId, newId, origin = "visual") {
    if (!this._prepareMutation(origin)) return false;
    const conn = this.getConnector(oldId);
    if (!conn) return false;
    if (newId === oldId) return true;
    if (!newId || this.getConnector(newId)) return false;
    this._pushUndo();
    this._origin = origin;
    conn.id = newId;
    this.dirty = true;
    this.emit("connector-renamed", { oldId, newId, connector: conn, origin });
    if (this.selectedConnectorId === oldId) {
      this.selectedConnectorId = newId;
      this.emit("selection-changed", { connectorId: newId });
    }
    this._origin = null;
    return true;
  }

  addConnector(data, origin = "visual") {
    if (!this._prepareMutation(origin)) return null;
    if (!this.board) return;
    const conn = data instanceof Connector ? data : new Connector(data);
    if (!conn.id || this.getConnector(conn.id)) return null;
    this._pushUndo();
    this._origin = origin;
    this.board.connectors.push(conn);
    this.dirty = true;
    this.emit("connector-added", { connectorId: conn.id, connector: conn, origin });
    this._origin = null;
    return conn;
  }

  duplicateConnector(id, origin = "visual") {
    if (!this._prepareMutation(origin)) return null;
    const source = this.getConnector(id);
    if (!source) return null;
    const ids = new Set(this.board.connectors.map(c => c.id));
    const names = new Set(this.board.connectors.map(c => c.name));
    const baseId = source.id || "connector";
    const baseName = source.name || source.id || "Connector";
    let copyId = `${baseId}_copy`, copyName = `${baseName} (copy)`;
    for (let n = 2; ids.has(copyId); n++) copyId = `${baseId}_copy_${n}`;
    for (let n = 2; names.has(copyName); n++) copyName = `${baseName} (copy ${n})`;

    // Move inward when the source touches an edge, keeping its size. With
    // unknown board dimensions there is no upper bound yet; move positively.
    const offset = (a, b, limit) => {
      if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
      if (!Number.isFinite(limit) || limit <= 0) return 10;
      const low = -Math.min(a, b), high = limit - Math.max(a, b);
      if (low > high) return 0; // an already oversized imported hotspot
      if (high >= 10) return Math.max(low, 10);
      if (low <= -10) return Math.min(high, -10);
      return Math.abs(high) >= Math.abs(low) ? high : low;
    };
    const dx = offset(source.x1, source.x2, this.board.width);
    const dy = offset(source.y1, source.y2, this.board.height);
    const conn = new Connector({
      ...source, id: copyId, name: copyName,
      x1: source.x1 + dx, x2: source.x2 + dx,
      y1: source.y1 + dy, y2: source.y2 + dy,
      pins: source.pins.map(p => new Pin(p.name, p.color, p.row)),
    });
    this._pushUndo();
    this._origin = origin;
    const index = this.getConnectorIndex(id) + 1;
    this.board.connectors.splice(index, 0, conn);
    this.dirty = true;
    this.emit("connector-added", {
      connectorId: conn.id, connector: conn, sourceConnectorId: id, index, origin,
    });
    this.selectConnector(conn.id);
    this._origin = null;
    return conn;
  }

  // toIndex is the connector's final index, after removal from fromIndex.
  moveConnector(fromIndex, toIndex, origin = "visual") {
    if (!this._prepareMutation(origin)) return false;
    if (!this.board || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return false;
    const count = this.board.connectors.length;
    if (fromIndex < 0 || fromIndex >= count || toIndex < 0 || toIndex >= count || fromIndex === toIndex) return false;
    this._pushUndo();
    this._origin = origin;
    const [conn] = this.board.connectors.splice(fromIndex, 1);
    this.board.connectors.splice(toIndex, 0, conn);
    this.dirty = true;
    this.emit("connectors-reordered", { connectorId: conn.id, fromIndex, toIndex, origin });
    this._origin = null;
    return true;
  }

  removeConnector(id, origin = "visual") {
    if (!this._prepareMutation(origin)) return;
    if (!this.board) return;
    const idx = this.getConnectorIndex(id);
    if (idx < 0) return;
    this._pushUndo();
    this._origin = origin;
    this.board.connectors.splice(idx, 1);
    const removedSelection = this.selectedConnectorId === id;
    if (removedSelection) this.selectedConnectorId = null;
    this.dirty = true;
    this.emit("connector-removed", { connectorId: id, origin });
    if (removedSelection) this.emit("selection-changed", { connectorId: null });
    this._origin = null;
  }

  updatePin(connectorId, pinIndex, changes, origin = "visual") {
    if (!this._prepareMutation(origin)) return;
    const conn = this.getConnector(connectorId);
    if (!conn || !conn.pins[pinIndex]) return;
    this._pushUndo();
    this._origin = origin;
    Object.assign(conn.pins[pinIndex], changes);
    this.dirty = true;
    this.emit("pin-changed", {
      connectorId, pinIndex, pin: conn.pins[pinIndex], origin
    });
    this._origin = null;
  }

  addPin(connectorId, pin, origin = "visual") {
    if (!this._prepareMutation(origin)) return;
    const conn = this.getConnector(connectorId);
    if (!conn) return;
    this._pushUndo();
    this._origin = origin;
    conn.pins.push(pin instanceof Pin ? pin : new Pin(pin.name, pin.color, pin.row));
    this.dirty = true;
    // pinIndex -1 marks a structural change (same as removePin), so listeners
    // rebuild the pin list instead of treating this as an in-place row edit.
    this.emit("pin-changed", { connectorId, pinIndex: -1, origin });
    this._origin = null;
  }

  removePin(connectorId, pinIndex, origin = "visual") {
    if (!this._prepareMutation(origin)) return;
    const conn = this.getConnector(connectorId);
    if (!conn || !conn.pins[pinIndex]) return;
    this._pushUndo();
    this._origin = origin;
    conn.pins.splice(pinIndex, 1);
    this.dirty = true;
    // removedIndex lets the editor delete that pin's own lines and comments.
    this.emit("pin-changed", { connectorId, pinIndex: -1, removedIndex: pinIndex, origin });
    this._origin = null;
  }

  // toIndex is the pin's final index, after removal from fromIndex.
  reorderPins(connectorId, fromIndex, toIndex, origin = "visual") {
    if (!this._prepareMutation(origin)) return false;
    const conn = this.getConnector(connectorId);
    if (!conn || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return false;
    const count = conn.pins.length;
    if (fromIndex < 0 || fromIndex >= count || toIndex < 0 || toIndex >= count || fromIndex === toIndex) return false;
    this._pushUndo();
    this._origin = origin;
    const [pin] = conn.pins.splice(fromIndex, 1);
    conn.pins.splice(toIndex, 0, pin);
    this.dirty = true;
    this.emit("pins-reordered", { connectorId, fromIndex, toIndex, origin });
    this._origin = null;
    return true;
  }
}
