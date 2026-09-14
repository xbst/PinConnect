import { Connector, Pin } from "./board-model.js";

const HANDLE_SIZE = 12;
// The invisible touch target around each handle, in screen pixels. It lies
// beneath every box, so it only takes touches on empty board beside a handle.
const HANDLE_HIT_SIZE = 40;
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
    // Touch pointers down on the board (pointerId -> client position), the
    // pinch in progress, and whether two fingers have been down since the last
    // time the board had none.
    this._touches = new Map();
    this._pinch = null;
    this._gesture = false;

    this._bindState();
    this._bindDrawButton();
    this._bindViewportEvents();
    this._bindGlobalDragEvents();
    this._bindTouchGestures();
    // A breakpoint or panel resize changes the available board viewport even
    // when the image dimensions stay the same.
    this._resizeObserver = new ResizeObserver(() => this.fitToView());
    this._resizeObserver.observe(this.container);
  }

  _bindGlobalDragEvents() {
    // Continue and finish drags at the document level so a drag is never
    // stranded when the pointer is released outside the SVG (past the board
    // edge, over a panel, over the toolbar, or outside the window). Pointer
    // events cover mouse, pen and touch alike. Bound once; the handlers only
    // act on the pointer that started the drag, so a second finger is ignored.
    const ownPointer = (e) => this._drag && e.pointerId === this._drag.pointerId;
    document.addEventListener("pointermove", (e) => { if (ownPointer(e)) this._onPointerMove(e); });
    document.addEventListener("pointerup", (e) => { if (ownPointer(e)) this._onPointerUp(e); });
    document.addEventListener("pointercancel", (e) => { if (ownPointer(e)) this._cancelDrag(); });
  }

  _bindDrawButton() {
    for (const btn of document.querySelectorAll("[data-draw-mode]")) {
      btn.addEventListener("click", () => this.setDrawMode(!this.drawMode));
    }
  }

  // Both Add buttons operate the same board interaction and stay in step when
  // creating a connector ends draw mode.
  setDrawMode(active) {
    this.drawMode = active;
    for (const btn of document.querySelectorAll("[data-draw-mode]")) {
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
      btn.textContent = active ? "Cancel Draw" : "+ Add Connector";
    }
    if (this.svg) this.svg.style.cursor = active ? "crosshair" : "";
    this.state.emit("draw-mode-changed", { active });
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

  // Two fingers on the board pinch to zoom and move together to pan: the touch
  // counterparts of the wheel and the right-button drag. One finger keeps its
  // jobs (drawing, moving, resizing, or scrolling the page from empty board),
  // and a second finger landing mid-drag turns that drag into a pinch.
  _bindTouchGestures() {
    this.container.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._touches.size === 2) this._startPinch();
    });
    document.addEventListener("pointermove", (e) => {
      const touch = this._touches.get(e.pointerId);
      if (!touch) return;
      touch.x = e.clientX;
      touch.y = e.clientY;
      if (this._pinch) this._updatePinch();
    });
    const lift = (e) => {
      if (!this._touches.delete(e.pointerId)) return;
      // With a third finger down, carry on pinching with the two that remain.
      if (this._touches.size >= 2) this._startPinch();
      else this._pinch = null;
      if (this._touches.size === 0) this._gesture = false;
    };
    document.addEventListener("pointerup", lift);
    document.addEventListener("pointercancel", lift);

    // While two fingers work the board the page must neither scroll nor zoom,
    // even with one finger left down afterward. touch-action on the board
    // already rules out page zoom that starts there; these also keep a
    // two-finger pan from scrolling the page. The touch list is checked
    // directly, so this does not depend on pointer and touch event order.
    const onBoard = (touches) => [...touches].filter(t => this.container.contains(t.target)).length;
    this.container.addEventListener("touchstart", (e) => {
      if (onBoard(e.touches) < 2) return;
      this._gesture = true;
      e.preventDefault();
    }, { passive: false });
    this.container.addEventListener("touchmove", (e) => {
      if (this._gesture && e.cancelable) e.preventDefault();
    }, { passive: false });
  }

  _startPinch() {
    // A pinch replaces whatever the first finger had started.
    if (this._drag) this._cancelDrag();
    this._gesture = true;
    const [a, b] = this._touches.values();
    const rect = this.container.getBoundingClientRect();
    this._pinch = {
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      x: (a.x + b.x) / 2 - rect.left,
      y: (a.y + b.y) / 2 - rect.top,
      zoom: this._zoom, panX: this._panX, panY: this._panY,
    };
  }

  _updatePinch() {
    const [a, b] = this._touches.values();
    const p = this._pinch;
    const rect = this.container.getBoundingClientRect();
    const oldZoom = this._zoom;
    this._zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, p.zoom * Math.hypot(b.x - a.x, b.y - a.y) / p.dist));
    // Keep the board point that was under the fingers' starting midpoint under
    // their current midpoint, so zoom and pan both follow the fingers.
    const x = (a.x + b.x) / 2 - rect.left;
    const y = (a.y + b.y) / 2 - rect.top;
    this._panX = x - (p.x - p.panX) * (this._zoom / p.zoom);
    this._panY = y - (p.y - p.panY) * (this._zoom / p.zoom);
    this._applyTransform();
    // Handle geometry is baked in at draw time, so re-draw at the new scale.
    if (this._zoom !== oldZoom) this._highlightSelected(this.state.selectedConnectorId);
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
    this.state.on("connectors-reordered", () => this._renderRects());
    this.state.on("connector-renamed", ({ oldId, newId }) => {
      if (!this.svg) return;
      const g = this._rectGroup(oldId);
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
        // parseFloat, not parseInt: with a fractional board width/height,
        // parseInt truncated the stored value so oldW never equalled w and
        // fitToView reset the user's zoom/pan on every board-changed.
        const oldW = parseFloat(this.wrapper.style.width);
        const oldH = parseFloat(this.wrapper.style.height);
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
    this.svg.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    // A touch that starts a drag must not also scroll the page or begin a long
    // press that selects text. Decide from what was touched, matching the
    // branches in _onPointerDown, so this does not depend on whether the
    // browser delivers pointerdown or touchstart first. A touch on empty board
    // outside draw mode keeps its default and still scrolls the page.
    this.svg.addEventListener("touchstart", (e) => {
      if (this.drawMode || e.target.closest(".resize-handle, .resize-hit, .board-rect")) e.preventDefault();
    }, { passive: false });
    this.svg.addEventListener("click", (e) => {
      // A drag ends with a trailing click, but pointerup has already nulled
      // _drag, so guard on a flag instead. Without it, a drag that ends over
      // empty space would run the deselect branch below and wrongly clear the
      // selection of the connector just dragged.
      if (this._suppressNextClick) { this._suppressNextClick = false; return; }
      const g = e.target.closest("g[data-id]");
      if (g) this.state.selectConnector(g.getAttribute("data-id"));
      else if (!this.drawMode) this.state.selectConnector(null);
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

  _onPointerDown(e) {
    // The primary mouse button, or a pen or finger touching down; a second
    // finger is not a new drag.
    if (e.button !== 0 || !e.isPrimary) return;
    // A press can only follow an unfinished drag if its release never arrived;
    // drop that drag rather than leave its connector half-moved.
    if (this._drag) this._cancelDrag();
    this._suppressNextClick = false;
    const pt = this._svgPoint(e);
    const pointerId = e.pointerId;

    if (this.drawMode) {
      this._drag = { type: "draw", pointerId, startX: pt.x, startY: pt.y, moved: false };
      this._ensurePreviewRect();
      this._updatePreviewRect(pt.x, pt.y, pt.x, pt.y);
      e.preventDefault();
      return;
    }

    // A handle, or the invisible touch target around one. Targets sit outside
    // any connector's group, but handles only ever belong to the selected
    // connector, and a target stands for whichever handle is nearest.
    const handle = e.target.closest(".resize-handle, .resize-hit");
    if (handle) {
      const id = handle.closest("g[data-id]")?.dataset.id ?? this.state.selectedConnectorId;
      const conn = this.state.getConnector(id);
      if (conn) {
        this._drag = {
          type: "resize", pointerId, id,
          handle: handle.classList.contains("resize-hit") ? this._nearestHandle(conn, pt) : handle.dataset.handle,
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
          type: "move", pointerId, id,
          origX1: conn.x1, origY1: conn.y1, origX2: conn.x2, origY2: conn.y2,
          startX: pt.x, startY: pt.y, moved: false,
        };
        e.preventDefault();
      }
    }
  }

  _onPointerMove(e) {
    if (!this._drag) return;
    // If the button was released where we never saw the pointerup (outside the
    // window), the next move arrives with no buttons held. Finalize the drag
    // instead of letting the connector follow the loose cursor.
    if (e.buttons === 0) { this._onPointerUp(e); return; }
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

  _onPointerUp(e) {
    if (!this._drag) return;
    const drag = this._drag;
    this._drag = null;
    // A drag that actually moved should swallow its trailing click.
    this._suppressNextClick = drag.moved;

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

  // End a drag without committing it: the browser took the pointer away (an
  // interrupted touch, say) or its release never arrived. A moved or resized
  // connector returns to where the drag started.
  _cancelDrag() {
    const drag = this._drag;
    if (!drag) return;
    this._drag = null;
    this._removePreviewRect();
    if (drag.type === "move" || drag.type === "resize") {
      const conn = this.state.getConnector(drag.id);
      if (conn) {
        conn.x1 = drag.origX1; conn.y1 = drag.origY1;
        conn.x2 = drag.origX2; conn.y2 = drag.origY2;
        this._updateRect(drag.id);
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
      this.setDrawMode(false);
    });

    dialog.querySelector("#new-conn-id").focus();
    dialog.querySelector("#new-conn-id").select();
  }

  // --- Rendering ---

  _rectGroup(id) {
    return this.svg && [...this.svg.querySelectorAll("g[data-id]")].find(g => g.dataset.id === id);
  }

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
    const g = this._rectGroup(connectorId);
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
      this.svg.querySelectorAll(".resize-hit").forEach(t => t.remove());
      this._addHandles(g, x, y, w, h);
    }
  }

  _highlightSelected(selectedId) {
    if (!this.svg) return;

    this.svg.querySelectorAll(".board-rect").forEach(r => r.classList.remove("selected"));
    this.svg.querySelectorAll(".resize-handle, .resize-hit").forEach(h => h.remove());

    if (selectedId) {
      const g = this._rectGroup(selectedId);
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

  _handlePositions(x, y, w, h) {
    return [
      { handle: "tl", cx: x, cy: y },
      { handle: "t",  cx: x + w / 2, cy: y },
      { handle: "tr", cx: x + w, cy: y },
      { handle: "l",  cx: x, cy: y + h / 2 },
      { handle: "r",  cx: x + w, cy: y + h / 2 },
      { handle: "bl", cx: x, cy: y + h },
      { handle: "b",  cx: x + w / 2, cy: y + h },
      { handle: "br", cx: x + w, cy: y + h },
    ];
  }

  // The handle a touch target stands for: the one nearest the touch, which
  // also settles overlapping targets on a small box.
  _nearestHandle(conn, pt) {
    const x = Math.min(conn.x1, conn.x2), y = Math.min(conn.y1, conn.y2);
    const positions = this._handlePositions(x, y, Math.abs(conn.x2 - conn.x1), Math.abs(conn.y2 - conn.y1));
    const distance = (p) => Math.hypot(p.cx - pt.x, p.cy - pt.y);
    return positions.reduce((best, p) => distance(p) < distance(best) ? p : best).handle;
  }

  _addHandles(g, x, y, w, h) {
    const ns = "http://www.w3.org/2000/svg";
    const k = this._chromeK();
    const hs = HANDLE_SIZE * k;
    const hit = HANDLE_HIT_SIZE * k;
    const targets = document.createDocumentFragment();

    for (const p of this._handlePositions(x, y, w, h)) {
      const target = document.createElementNS(ns, "rect");
      target.setAttribute("class", "resize-hit");
      target.setAttribute("x", p.cx - hit / 2);
      target.setAttribute("y", p.cy - hit / 2);
      target.setAttribute("width", hit);
      target.setAttribute("height", hit);
      targets.appendChild(target);

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
    // The targets go beneath every box, so a touch on any box still selects or
    // moves that box; only empty board beside a handle reaches them.
    this.svg.insertBefore(targets, this.svg.firstChild);
  }

  _handleCursor(handle) {
    const map = { tl: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize", br: "nwse-resize",
                  t: "ns-resize", b: "ns-resize", l: "ew-resize", r: "ew-resize" };
    return map[handle] || "pointer";
  }
}
