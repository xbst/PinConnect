import { Connector, Pin } from "./board-model.js";

const HANDLE_SIZE = 12;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 10;
const ZOOM_FACTOR = 1.1;

export class BoardPanel {
  constructor(container, state) {
    this.state = state;
    this.container = container;
    this.wrapper = null;
    this.svg = null;
    this.drawMode = false;
    this._drag = null;
    this._pan = null;
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;

    this._bindState();
    this._bindDrawButton();
    this._bindViewportEvents();
    this._bindGlobalDragEvents();
  }

  _bindGlobalDragEvents() {
    // Continue and finish drags at the document level so a drag is never
    // stranded when the button is released outside the SVG (past the board
    // edge, over a panel, over the toolbar, or outside the window). Bound
    // once; both handlers no-op unless a drag started on the board.
    document.addEventListener("mousemove", (e) => { if (this._drag) this._onMouseMove(e); });
    document.addEventListener("mouseup", (e) => { if (this._drag) this._onMouseUp(e); });
  }

  _bindDrawButton() {
    const btn = document.getElementById("draw-mode-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        this.drawMode = !this.drawMode;
        btn.classList.toggle("active", this.drawMode);
        btn.textContent = this.drawMode ? "Cancel Draw" : "+ Add Connector";
        if (this.svg) this.svg.style.cursor = this.drawMode ? "crosshair" : "";
      });
    }
  }

  _bindViewportEvents() {
    this.container.addEventListener("wheel", (e) => {
      if (!this.wrapper) return;
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const oldZoom = this._zoom;
      const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      this._zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this._zoom * factor));

      this._panX = mx - (mx - this._panX) * (this._zoom / oldZoom);
      this._panY = my - (my - this._panY) * (this._zoom / oldZoom);
      this._applyTransform();
      // Handle geometry is baked in at draw time, so re-draw at the new scale.
      if (this._zoom !== oldZoom) this._highlightSelected(this.state.selectedConnectorId);
    }, { passive: false });

    this.container.addEventListener("mousedown", (e) => {
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        this._pan = {
          startX: e.clientX, startY: e.clientY,
          origPanX: this._panX, origPanY: this._panY,
        };
      }
    });

    this.container.addEventListener("mousemove", (e) => {
      if (!this._pan) return;
      this._panX = this._pan.origPanX + (e.clientX - this._pan.startX);
      this._panY = this._pan.origPanY + (e.clientY - this._pan.startY);
      this._applyTransform();
    });

    const stopPan = () => { this._pan = null; };
    this.container.addEventListener("mouseup", stopPan);
    this.container.addEventListener("mouseleave", stopPan);

    this.container.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // Screen-px-to-image-px factor for overlay chrome: the wrapper is scaled by
  // zoom, so 1/zoom cancels it, keeping strokes/labels/handles a constant size.
  _chromeK() {
    return this._zoom > 0 ? 1 / this._zoom : 1;
  }

  _applyTransform() {
    if (!this.wrapper) return;
    this.wrapper.style.transform = `translate(${this._panX}px, ${this._panY}px) scale(${this._zoom})`;
    this.wrapper.style.setProperty("--chrome-k", this._chromeK());
  }

  fitToView() {
    if (!this.state.board || !this.wrapper) return;
    const vw = this.container.clientWidth;
    const vh = this.container.clientHeight;
    const bw = this.state.board.width || 100;
    const bh = this.state.board.height || 100;
    const pad = 20;
    this._zoom = Math.min((vw - pad) / bw, (vh - pad) / bh);
    this._panX = (vw - bw * this._zoom) / 2;
    this._panY = (vh - bh * this._zoom) / 2;
    this._applyTransform();
    // Zoom changed after any rects were drawn, so re-scale the handles.
    this._highlightSelected(this.state.selectedConnectorId);
  }

  _bindState() {
    this.state.on("image-changed", () => { this._rebuild(); this.fitToView(); });
    this.state.on("board-changed", () => { this._ensureOverlay(); this._renderRects(); });
    this.state.on("connector-changed", ({ connectorId, origin }) => {
      if (origin === "visual") return;
      this._updateRect(connectorId);
    });
    this.state.on("connector-added", () => this._renderRects());
    this.state.on("connector-removed", () => this._renderRects());
    this.state.on("connector-renamed", ({ oldId, newId }) => {
      if (!this.svg) return;
      const g = this.svg.querySelector(`g[data-id="${oldId}"]`);
      if (!g) return;
      g.setAttribute("data-id", newId);
      const label = g.querySelector(".board-rect-label");
      if (label) label.textContent = newId;
    });
    this.state.on("selection-changed", ({ connectorId }) => this._highlightSelected(connectorId));
  }

  _ensureOverlay() {
    if (!this.state.board || (!this.state.board.width && !this.state.imageDataUrl)) return;
    const w = this.state.board.width || 100;
    const h = this.state.board.height || 100;
    if (this.svg) {
      this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      if (this.wrapper) {
        const oldW = parseInt(this.wrapper.style.width);
        const oldH = parseInt(this.wrapper.style.height);
        this.wrapper.style.width = w + "px";
        this.wrapper.style.height = h + "px";
        if (oldW !== w || oldH !== h) this.fitToView();
      }
      return;
    }
    this._rebuild();
    this.fitToView();
  }

  _rebuild() {
    const placeholder = this.container.querySelector("#board-placeholder");
    const board = this.state.board;
    if (!board || (!board.width && !this.state.imageDataUrl)) {
      if (placeholder) placeholder.style.display = "";
      if (this.wrapper) { this.wrapper.remove(); this.wrapper = null; this.svg = null; }
      return;
    }

    if (placeholder) placeholder.style.display = "none";
    if (this.wrapper) this.wrapper.remove();

    const w = board.width || 100;
    const h = board.height || 100;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "board-canvas";
    this.wrapper.style.width = w + "px";
    this.wrapper.style.height = h + "px";

    if (this.state.imageDataUrl) {
      const img = document.createElement("img");
      img.src = this.state.imageDataUrl;
      img.alt = board.title || "Board";
      img.draggable = false;
      img.style.cssText = "display:block;width:100%;height:100%;";
      this.wrapper.appendChild(img);
    } else {
      this.wrapper.style.background = "#1a1a1a";
      this.wrapper.style.border = "1px dashed #333";
    }

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "board-overlay");
    this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.wrapper.appendChild(this.svg);

    this._bindSvgEvents();
    this.container.appendChild(this.wrapper);
    this._renderRects();
    if (this.drawMode) this.svg.style.cursor = "crosshair";
  }

  _bindSvgEvents() {
    // Only the drag START and click (selection) are bound to the SVG; movement
    // and release are handled at the document level (see _bindGlobalDragEvents)
    // so a drag can't be lost when the pointer leaves the SVG mid-drag.
    this.svg.addEventListener("mousedown", (e) => this._onMouseDown(e));
    this.svg.addEventListener("click", (e) => {
      if (!this._drag || !this._drag.moved) {
        const g = e.target.closest("g[data-id]");
        if (g) this.state.selectConnector(g.getAttribute("data-id"));
        else if (!this.drawMode) this.state.selectConnector(null);
      }
    });
  }

  _svgPoint(e) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = this.svg.getScreenCTM().inverse();
    const svgPt = pt.matrixTransform(ctm);
    return { x: Math.round(svgPt.x), y: Math.round(svgPt.y) };
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    const pt = this._svgPoint(e);

    if (this.drawMode) {
      this._drag = { type: "draw", startX: pt.x, startY: pt.y, moved: false };
      this._ensurePreviewRect();
      this._updatePreviewRect(pt.x, pt.y, pt.x, pt.y);
      e.preventDefault();
      return;
    }

    const handle = e.target.closest(".resize-handle");
    if (handle) {
      const g = handle.closest("g[data-id]");
      const id = g?.getAttribute("data-id");
      const conn = this.state.getConnector(id);
      if (conn) {
        this._drag = {
          type: "resize", id, handle: handle.dataset.handle,
          origX1: conn.x1, origY1: conn.y1, origX2: conn.x2, origY2: conn.y2,
          startX: pt.x, startY: pt.y, moved: false,
        };
        e.preventDefault();
        return;
      }
    }

    const g = e.target.closest("g[data-id]");
    if (g && e.target.classList.contains("board-rect")) {
      const id = g.getAttribute("data-id");
      const conn = this.state.getConnector(id);
      if (conn) {
        this.state.selectConnector(id);
        this._drag = {
          type: "move", id,
          origX1: conn.x1, origY1: conn.y1, origX2: conn.x2, origY2: conn.y2,
          startX: pt.x, startY: pt.y, moved: false,
        };
        e.preventDefault();
      }
    }
  }

  _onMouseMove(e) {
    if (!this._drag) return;
    // If the button was released where we never saw the mouseup (outside the
    // window), the next move arrives with no buttons held. Finalize the drag
    // instead of letting the connector follow the loose cursor.
    if (e.buttons === 0) { this._onMouseUp(e); return; }
    const pt = this._svgPoint(e);
    this._drag.moved = true;

    if (this._drag.type === "draw") {
      this._updatePreviewRect(this._drag.startX, this._drag.startY, pt.x, pt.y);
      return;
    }

    if (this._drag.type === "move") {
      const dx = pt.x - this._drag.startX;
      const dy = pt.y - this._drag.startY;
      const conn = this.state.getConnector(this._drag.id);
      if (conn) {
        conn.x1 = this._drag.origX1 + dx;
        conn.y1 = this._drag.origY1 + dy;
        conn.x2 = this._drag.origX2 + dx;
        conn.y2 = this._drag.origY2 + dy;
        this._updateRect(this._drag.id);
      }
      return;
    }

    if (this._drag.type === "resize") {
      const conn = this.state.getConnector(this._drag.id);
      if (!conn) return;
      const dx = pt.x - this._drag.startX;
      const dy = pt.y - this._drag.startY;
      const h = this._drag.handle;

      conn.x1 = this._drag.origX1; conn.y1 = this._drag.origY1;
      conn.x2 = this._drag.origX2; conn.y2 = this._drag.origY2;

      if (h.includes("l")) conn.x1 = this._drag.origX1 + dx;
      if (h.includes("r")) conn.x2 = this._drag.origX2 + dx;
      if (h.includes("t")) conn.y1 = this._drag.origY1 + dy;
      if (h.includes("b")) conn.y2 = this._drag.origY2 + dy;

      this._updateRect(this._drag.id);
    }
  }

  _onMouseUp(e) {
    if (!this._drag) return;
    const drag = this._drag;
    this._drag = null;

    if (drag.type === "draw" && drag.moved) {
      this._removePreviewRect();
      const pt = this._svgPoint(e);
      const x1 = Math.min(drag.startX, pt.x), y1 = Math.min(drag.startY, pt.y);
      const x2 = Math.max(drag.startX, pt.x), y2 = Math.max(drag.startY, pt.y);
      if (x2 - x1 > 10 && y2 - y1 > 10) {
        this._showNewConnectorDialog(x1, y1, x2, y2);
      }
      return;
    }

    if (drag.type === "draw") {
      this._removePreviewRect();
      return;
    }

    if ((drag.type === "move" || drag.type === "resize") && drag.moved) {
      const conn = this.state.getConnector(drag.id);
      if (conn) {
        const { x1, y1, x2, y2 } = conn;
        if (x1 !== drag.origX1 || y1 !== drag.origY1 ||
            x2 !== drag.origX2 || y2 !== drag.origY2) {
          // The drag mutated the connector in place for live feedback; restore
          // the pre-drag coordinates so updateConnector snapshots them for undo.
          conn.x1 = drag.origX1; conn.y1 = drag.origY1;
          conn.x2 = drag.origX2; conn.y2 = drag.origY2;
          this.state.updateConnector(drag.id, { x1, y1, x2, y2 }, "visual");
        }
      }
    }
  }

  _ensurePreviewRect() {
    if (this._previewRect) return;
    const ns = "http://www.w3.org/2000/svg";
    this._previewRect = document.createElementNS(ns, "rect");
    this._previewRect.setAttribute("class", "draw-preview");
    this._previewRect.setAttribute("fill", "none");
    this._previewRect.setAttribute("stroke", "var(--accent)");
    const k = this._chromeK();
    this._previewRect.setAttribute("stroke-width", 2 * k);
    this._previewRect.setAttribute("stroke-dasharray", `${8 * k} ${4 * k}`);
    this._previewRect.setAttribute("rx", 3 * k);
    this.svg.appendChild(this._previewRect);
  }

  _updatePreviewRect(x1, y1, x2, y2) {
    if (!this._previewRect) return;
    this._previewRect.setAttribute("x", Math.min(x1, x2));
    this._previewRect.setAttribute("y", Math.min(y1, y2));
    this._previewRect.setAttribute("width", Math.abs(x2 - x1));
    this._previewRect.setAttribute("height", Math.abs(y2 - y1));
  }

  _removePreviewRect() {
    if (this._previewRect) { this._previewRect.remove(); this._previewRect = null; }
  }

  _showNewConnectorDialog(x1, y1, x2, y2) {
    const types = [...this.state.connectorTypes.keys()];
    const existing = this.state.board ? this.state.board.connectors.map(c => c.id) : [];
    let nextId = "CONN1";
    let n = 1;
    while (existing.includes(nextId)) { n++; nextId = "CONN" + n; }

    const dialog = document.createElement("div");
    dialog.className = "new-conn-dialog";
    dialog.innerHTML = `
      <div class="new-conn-dialog-title">New Connector</div>
      <div class="conn-form-row"><label>ID</label><input type="text" id="new-conn-id" value="${nextId}"></div>
      <div class="conn-form-row"><label>Name</label><input type="text" id="new-conn-name" value=""></div>
      <div class="conn-form-row"><label>Type</label>
        <select id="new-conn-type">${types.map(t => `<option value="${t}">${t}</option>`).join("")}</select>
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px">
        <button id="new-conn-cancel" class="toolbar-btn">Cancel</button>
        <button id="new-conn-ok" class="toolbar-btn primary">Create</button>
      </div>
    `;
    this.container.appendChild(dialog);

    const close = () => dialog.remove();
    dialog.querySelector("#new-conn-cancel").addEventListener("click", close);
    dialog.querySelector("#new-conn-ok").addEventListener("click", () => {
      const id = dialog.querySelector("#new-conn-id").value.trim();
      const name = dialog.querySelector("#new-conn-name").value.trim();
      const type = dialog.querySelector("#new-conn-type").value;
      if (!id || this.state.getConnector(id)) {
        dialog.querySelector("#new-conn-id").style.borderColor = "var(--danger)";
        return;
      }
      close();
      this.state.addConnector(new Connector({
        id, name: name || id, type,
        x1: Math.round(x1), y1: Math.round(y1),
        x2: Math.round(x2), y2: Math.round(y2),
        pins: [new Pin("PIN1", "#888888")],
      }), "visual");
      this.state.selectConnector(id);
      this.drawMode = false;
      const btn = document.getElementById("draw-mode-btn");
      if (btn) { btn.classList.remove("active"); btn.textContent = "+ Add Connector"; }
      if (this.svg) this.svg.style.cursor = "";
    });

    dialog.querySelector("#new-conn-id").focus();
    dialog.querySelector("#new-conn-id").select();
  }

  // --- Rendering ---

  _renderRects() {
    if (!this.svg || !this.state.board) return;
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    for (const conn of this.state.board.connectors) this._createRect(conn);
    this._highlightSelected(this.state.selectedConnectorId);
  }

  _createRect(conn) {
    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    g.setAttribute("data-id", conn.id);

    const x = Math.min(conn.x1, conn.x2);
    const y = Math.min(conn.y1, conn.y2);
    const w = Math.abs(conn.x2 - conn.x1);
    const h = Math.abs(conn.y2 - conn.y1);

    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("class", "board-rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", w);
    rect.setAttribute("height", h);
    rect.setAttribute("rx", "3");
    g.appendChild(rect);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("class", "board-rect-label");
    label.setAttribute("x", x + w / 2);
    label.setAttribute("y", y + h / 2);
    label.textContent = conn.id;
    g.appendChild(label);

    this.svg.appendChild(g);
  }

  _updateRect(connectorId) {
    if (!this.svg) return;
    const g = this.svg.querySelector(`g[data-id="${connectorId}"]`);
    if (!g) { this._renderRects(); return; }

    const conn = this.state.getConnector(connectorId);
    if (!conn) return;

    const x = Math.min(conn.x1, conn.x2);
    const y = Math.min(conn.y1, conn.y2);
    const w = Math.abs(conn.x2 - conn.x1);
    const h = Math.abs(conn.y2 - conn.y1);

    const rect = g.querySelector(".board-rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", w);
    rect.setAttribute("height", h);

    const label = g.querySelector("text");
    label.setAttribute("x", x + w / 2);
    label.setAttribute("y", y + h / 2);

    g.querySelectorAll(".resize-handle").forEach(h => h.remove());
    if (connectorId === this.state.selectedConnectorId) {
      this._addHandles(g, x, y, w, h);
    }
  }

  _highlightSelected(selectedId) {
    if (!this.svg) return;

    this.svg.querySelectorAll(".board-rect").forEach(r => r.classList.remove("selected"));
    this.svg.querySelectorAll(".resize-handle").forEach(h => h.remove());

    if (selectedId) {
      const g = this.svg.querySelector(`g[data-id="${selectedId}"]`);
      if (g) {
        g.querySelector(".board-rect").classList.add("selected");
        const conn = this.state.getConnector(selectedId);
        if (conn) {
          const x = Math.min(conn.x1, conn.x2);
          const y = Math.min(conn.y1, conn.y2);
          const w = Math.abs(conn.x2 - conn.x1);
          const h = Math.abs(conn.y2 - conn.y1);
          this._addHandles(g, x, y, w, h);
        }
      }
    }
  }

  _addHandles(g, x, y, w, h) {
    const ns = "http://www.w3.org/2000/svg";
    const k = this._chromeK();
    const hs = HANDLE_SIZE * k;
    const positions = [
      { handle: "tl", cx: x, cy: y },
      { handle: "t",  cx: x + w / 2, cy: y },
      { handle: "tr", cx: x + w, cy: y },
      { handle: "l",  cx: x, cy: y + h / 2 },
      { handle: "r",  cx: x + w, cy: y + h / 2 },
      { handle: "bl", cx: x, cy: y + h },
      { handle: "b",  cx: x + w / 2, cy: y + h },
      { handle: "br", cx: x + w, cy: y + h },
    ];

    for (const p of positions) {
      const r = document.createElementNS(ns, "rect");
      r.setAttribute("class", "resize-handle");
      r.dataset.handle = p.handle;
      r.setAttribute("x", p.cx - hs / 2);
      r.setAttribute("y", p.cy - hs / 2);
      r.setAttribute("width", hs);
      r.setAttribute("height", hs);
      r.setAttribute("fill", "var(--accent)");
      r.setAttribute("stroke", "#fff");
      r.setAttribute("stroke-width", 1 * k);
      r.setAttribute("rx", 2 * k);
      r.style.cursor = this._handleCursor(p.handle);
      g.appendChild(r);
    }
  }

  _handleCursor(handle) {
    const map = { tl: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize", br: "nwse-resize",
                  t: "ns-resize", b: "ns-resize", l: "ew-resize", r: "ew-resize" };
    return map[handle] || "pointer";
  }
}
