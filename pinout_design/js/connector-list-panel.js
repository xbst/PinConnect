import { previewSymbol } from "./runtime.js";

// The list uses BoardState's existing selection and mutation events, so source,
// board hotspots, the connector editor and undo all follow the same order.
export class ConnectorListPanel {
  constructor(container, state) {
    this.container = container;
    this.state = state;
    this._dragId = null;
    this.count = document.getElementById("connector-list-count");
    this.status = document.getElementById("connector-list-status");
    this.moveUp = document.getElementById("move-connector-up");
    this.moveDown = document.getElementById("move-connector-down");

    this.list = document.createElement("ul");
    this.list.className = "connector-list";
    this.list.setAttribute("aria-label", "Connectors");
    this.list.setAttribute("aria-describedby", "connector-list-hint");
    this.empty = document.createElement("p");
    this.empty.className = "connector-list-empty";
    this.empty.textContent = "No connectors yet. Open a board image, then use + Add Connector above the board to draw your first hotspot.";
    this.container.append(this.list, this.empty);

    for (const event of ["board-changed", "connector-added", "connector-removed",
      "connector-changed", "connectors-reordered", "pin-changed", "catalogs-loaded"]) {
      state.on(event, () => this._render());
    }
    state.on("connector-renamed", ({ oldId, newId }) => {
      const row = [...this.list.children].find(row => row.dataset.id === oldId);
      if (row) row.dataset.id = newId;
      this._render();
    });
    state.on("selection-changed", () => this._highlightSelected());
    state.on("draw-mode-changed", ({ active }) => {
      document.getElementById("connector-list-hint").textContent = active
        ? "Draw a box on the board image to add a connector."
        : "Drag to reorder · Alt+↑/↓ to move a connector";
    });
    this.moveUp.addEventListener("click", () => this._moveSelection(-1));
    this.moveDown.addEventListener("click", () => this._moveSelection(1));
    this.container.addEventListener("click", e => this._onClick(e));
    this.container.addEventListener("keydown", e => this._onKeyDown(e));
    this._bindDragEvents();
    this._render();
  }

  _connectors() { return this.state.board?.connectors || []; }

  _label(connector) { return connector.name || connector.id; }

  _button(action, label, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.className = action === "select" ? "connector-list-select" : "connector-list-action";
    button.setAttribute("aria-label", label);
    button.title = label;
    if (text) button.textContent = text;
    return button;
  }

  _render() {
    const connectors = this._connectors();
    const focused = this.container.contains(document.activeElement) ? document.activeElement : null;
    const focusedRow = focused?.closest(".connector-list-row");
    const focusId = focusedRow?.dataset.id;
    const focusIndex = focusedRow ? [...this.list.children].indexOf(focusedRow) : -1;
    const focusAction = focused?.dataset.action || "select";
    const existing = new Map([...this.list.children].map(row => [row.dataset.id, row]));
    let position = this.list.firstElementChild;

    for (const conn of connectors) {
      const label = this._label(conn);
      let row = existing.get(conn.id);
      if (!row) {
        row = document.createElement("li");
        row.className = "connector-list-row";
        row.dataset.id = conn.id;
        row.draggable = true;

        const handle = document.createElement("span");
        handle.className = "connector-list-handle";
        handle.textContent = "⠿";
        handle.title = "Drag to reorder";
        handle.setAttribute("aria-hidden", "true");

        const select = this._button("select", `Select ${label}`);
        const nameLine = document.createElement("span");
        nameLine.className = "connector-list-name-line";
        const name = document.createElement("span");
        name.className = "connector-list-name";
        nameLine.append(name);
        const symbol = document.createElement("span");
        symbol.className = "connector-list-symbol";
        symbol.setAttribute("aria-hidden", "true");
        nameLine.append(symbol);
        const detail = document.createElement("span");
        detail.className = "connector-list-detail";
        select.append(nameLine, detail);

        const duplicate = this._button("duplicate", `Duplicate ${label}`, "⧉");
        const remove = this._button("delete", `Delete ${label}`, "×");
        remove.classList.add("danger");
        row.append(handle, select, duplicate, remove);
      }
      // Field edits commit on blur, between mousedown and click. Preserve the
      // actual row/buttons so updating their labels cannot swallow that click.
      this._updateRow(row, conn);
      if (row !== position) this.list.insertBefore(row, position);
      position = row.nextElementSibling;
      existing.delete(conn.id);
    }
    for (const row of existing.values()) row.remove();
    this.empty.hidden = connectors.length > 0;
    this.count.textContent = `${connectors.length} ${connectors.length === 1 ? "connector" : "connectors"}`;
    this._highlightSelected();

    // Updating a name in the connector editor must never steal its focus. If a
    // list action rebuilt this list, keep that action usable with the keyboard.
    if (focused) {
      const nextId = connectors.some(c => c.id === focusId)
        ? focusId : connectors[Math.min(focusIndex, connectors.length - 1)]?.id;
      if (nextId) this._focusConnector(nextId, focusAction);
      else document.getElementById("tab-connectors").focus();
    }
  }

  _updateRow(row, conn) {
    const label = this._label(conn);
    const pins = `${conn.pins.length} ${conn.pins.length === 1 ? "pin" : "pins"}`;
    const select = row.querySelector(".connector-list-select");
    const name = row.querySelector(".connector-list-name");
    if (name.textContent !== label) name.textContent = label;
    row.querySelector(".connector-list-detail").textContent = `${conn.type || "No type"} · ${pins}`;
    select.setAttribute("aria-label", `Select ${label}, ${conn.type || "no type"}, ${pins}${conn.symbol ? `, symbol ${conn.symbol}` : ""}`);
    select.title = `${label} (${conn.id})`;
    for (const [action, verb] of [["duplicate", "Duplicate"], ["delete", "Delete"]]) {
      const button = row.querySelector(`[data-action="${action}"]`);
      button.setAttribute("aria-label", `${verb} ${label}`);
      button.title = `${verb} ${label}`;
    }
    const symbol = row.querySelector(".connector-list-symbol");
    let markup = null;
    try { markup = previewSymbol(String(conn.symbol || "")); } catch (_) { /* keep bad content from breaking the catalog/UI */ }
    const contentKey = markup === null ? `text:${conn.symbol}` : `html:${markup}`;
    if (symbol.dataset.content !== contentKey) {
      // The Python renderer escapes literal symbols; no raw user HTML enters
      // this path. Before boot or on a preview error, use plain text.
      if (markup === null) symbol.textContent = String(conn.symbol || "");
      else symbol.innerHTML = markup;
      symbol.dataset.content = contentKey;
    }
    symbol.hidden = !conn.symbol || markup === "";
    symbol.title = `Symbol: ${conn.symbol}`;
  }

  _highlightSelected() {
    const connectors = this._connectors();
    const selectedId = this.state.selectedConnectorId;
    const selectedIndex = connectors.findIndex(conn => conn.id === selectedId);
    for (const [index, row] of [...this.list.children].entries()) {
      const selected = row.dataset.id === selectedId;
      row.classList.toggle("selected", selected);
      row.querySelector(".connector-list-select").setAttribute("aria-pressed", String(selected));
      row.querySelector(".connector-list-select").tabIndex = selected || (selectedIndex < 0 && index === 0) ? 0 : -1;
    }
    this.moveUp.disabled = selectedIndex <= 0;
    this.moveDown.disabled = selectedIndex < 0 || selectedIndex >= connectors.length - 1;
  }

  _focusConnector(id, action = "select") {
    // IDs come from user-authored TOML: compare dataset values rather than
    // interpolating an ID into a CSS selector.
    const row = [...this.list.children].find(candidate => candidate.dataset.id === id);
    if (!row) return;
    row.querySelector(`[data-action="${action}"]`).focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest" });
  }

  _select(id) {
    this.state.selectConnector(id);
    this._focusConnector(id);
  }

  _duplicate(id) {
    const copy = this.state.duplicateConnector(id, "visual");
    if (!copy) return;
    this._focusConnector(copy.id);
    this.status.textContent = `Created ${this._label(copy)}.`;
  }

  _remove(id) {
    const index = this.state.getConnectorIndex(id);
    const removed = this.state.getConnector(id);
    if (!removed) return;
    this.state.removeConnector(id, "visual");
    if (this.state.getConnector(id)) return; // invalid pending source can cancel the mutation
    const connectors = this._connectors();
    const next = connectors[Math.min(index, connectors.length - 1)];
    if (next) this._select(next.id);
    this.status.textContent = `Deleted ${this._label(removed)}.`;
  }

  _moveSelection(direction) {
    const id = this.state.selectedConnectorId;
    const from = this.state.getConnectorIndex(id);
    if (!this.state.moveConnector(from, from + direction, "visual")) return;
    this._focusConnector(id);
    this.status.textContent = `Moved ${this._label(this.state.getConnector(id))} to position ${from + direction + 1}.`;
  }

  _onClick(e) {
    const row = e.target.closest(".connector-list-row");
    if (!row) return;
    const action = e.target.closest("button")?.dataset.action || "select";
    if (action === "duplicate") this._duplicate(row.dataset.id);
    else if (action === "delete") this._remove(row.dataset.id);
    else this._select(row.dataset.id);
  }

  _onKeyDown(e) {
    if (document.querySelector(".modal-backdrop, .new-conn-dialog")) return;
    const row = e.target.closest(".connector-list-row");
    if (!row) return;
    const connectors = this._connectors();
    const index = this.state.getConnectorIndex(row.dataset.id);
    const key = e.key.toLowerCase();
    if (key === "delete") {
      e.preventDefault();
      this._remove(row.dataset.id);
    } else if (key === "d" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      this._duplicate(row.dataset.id);
    } else if (!e.ctrlKey && !e.metaKey && ["arrowup", "arrowdown", "home", "end"].includes(key)) {
      e.preventDefault();
      if (e.altKey && (key === "arrowup" || key === "arrowdown")) {
        if (this.state.selectedConnectorId !== row.dataset.id) this.state.selectConnector(row.dataset.id);
        this._moveSelection(key === "arrowup" ? -1 : 1);
      } else if (!e.altKey) {
        const nextIndex = key === "home" ? 0 : key === "end" ? connectors.length - 1
          : Math.max(0, Math.min(connectors.length - 1, index + (key === "arrowup" ? -1 : 1)));
        if (connectors[nextIndex]) this._select(connectors[nextIndex].id);
      }
    }
  }

  _clearDragFeedback() {
    for (const row of this.list.children) row.classList.remove("dragging", "drop-before", "drop-after");
  }

  _dropTarget(e) {
    const rows = [...this.list.children];
    const row = e.target.closest(".connector-list-row");
    if (!row) return { row: rows[rows.length - 1], after: true, boundary: rows.length };
    const rect = row.getBoundingClientRect();
    const after = e.clientY >= rect.top + rect.height / 2;
    return { row, after, boundary: rows.indexOf(row) + (after ? 1 : 0) };
  }

  _bindDragEvents() {
    this.container.addEventListener("dragstart", e => {
      const row = e.target.closest(".connector-list-row");
      if (!row || !e.dataTransfer) return;
      this._dragId = row.dataset.id;
      this.state.selectConnector(this._dragId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", this._dragId);
      row.classList.add("dragging");
    });
    this.container.addEventListener("dragover", e => {
      if (this._dragId === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      this._clearDragFeedback();
      const target = this._dropTarget(e);
      target.row?.classList.add(target.after ? "drop-after" : "drop-before");
    });
    this.container.addEventListener("dragleave", e => {
      if (!this.container.contains(e.relatedTarget)) this._clearDragFeedback();
    });
    this.container.addEventListener("drop", e => {
      if (this._dragId === null) return;
      e.preventDefault();
      const id = this._dragId;
      const from = this.state.getConnectorIndex(id);
      const { boundary } = this._dropTarget(e);
      const to = boundary - (from < boundary ? 1 : 0);
      this._dragId = null;
      this._clearDragFeedback();
      if (this.state.moveConnector(from, to, "visual")) {
        this._focusConnector(id);
        this.status.textContent = `Moved ${this._label(this.state.getConnector(id))} to position ${to + 1}.`;
      }
    });
    this.container.addEventListener("dragend", () => {
      this._dragId = null;
      this._clearDragFeedback();
    });
  }
}
