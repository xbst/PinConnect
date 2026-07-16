import { Board, Connector, Pin, ConnectorType, ConnectorGeometry } from "./board-model.js";

export class BoardState {
  constructor() {
    this.board = null;
    this.connectorTypes = new Map();
    this.selectedConnectorId = null;
    this.imageDataUrl = null;
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

  _snapshot() {
    if (!this.board) return null;
    return {
      title: this.board.title,
      image: this.board.image,
      width: this.board.width,
      height: this.board.height,
      connector_dir: this.board.connector_dir,
      connectors: this.board.connectors.map(c => ({
        id: c.id, name: c.name, type: c.type,
        x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2,
        orientation: c.orientation, description: c.description,
        label_style: c.label_style,
        pins: c.pins.map(p => ({ name: p.name, color: p.color, row: p.row })),
      })),
      selectedConnectorId: this.selectedConnectorId,
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
    if (origin !== "init") this._pushUndo();
    this._origin = origin;
    this.board = board instanceof Board ? board : new Board(board);
    this.dirty = origin !== "init";
    this.emit("board-changed", { board: this.board, origin });
    this._origin = null;
  }

  setImage(dataUrl, imageName, width, height) {
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
    const conn = this.getConnector(id);
    if (!conn) return;
    this._pushUndo();
    this._origin = origin;
    Object.assign(conn, changes);
    this.dirty = true;
    this.emit("connector-changed", { connectorId: id, connector: conn, origin });
    this._origin = null;
  }

  addConnector(data, origin = "visual") {
    if (!this.board) return;
    this._pushUndo();
    this._origin = origin;
    const conn = data instanceof Connector ? data : new Connector(data);
    this.board.connectors.push(conn);
    this.dirty = true;
    this.emit("connector-added", { connectorId: conn.id, connector: conn, origin });
    this._origin = null;
    return conn;
  }

  removeConnector(id, origin = "visual") {
    if (!this.board) return;
    const idx = this.getConnectorIndex(id);
    if (idx < 0) return;
    this._pushUndo();
    this._origin = origin;
    this.board.connectors.splice(idx, 1);
    if (this.selectedConnectorId === id) this.selectedConnectorId = null;
    this.dirty = true;
    this.emit("connector-removed", { connectorId: id, origin });
    this._origin = null;
  }

  updatePin(connectorId, pinIndex, changes, origin = "visual") {
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
    const conn = this.getConnector(connectorId);
    if (!conn || !conn.pins[pinIndex]) return;
    this._pushUndo();
    this._origin = origin;
    conn.pins.splice(pinIndex, 1);
    this.dirty = true;
    this.emit("pin-changed", { connectorId, pinIndex: -1, origin });
    this._origin = null;
  }

  reorderPins(connectorId, fromIndex, toIndex, origin = "visual") {
    const conn = this.getConnector(connectorId);
    if (!conn) return;
    this._pushUndo();
    this._origin = origin;
    const [pin] = conn.pins.splice(fromIndex, 1);
    conn.pins.splice(toIndex, 0, pin);
    this.dirty = true;
    this.emit("pins-reordered", { connectorId, origin });
    this._origin = null;
  }
}
