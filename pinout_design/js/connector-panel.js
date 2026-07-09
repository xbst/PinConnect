import { renderConnectorSVG } from "./svg-renderer.js";
import { Pin } from "./board-model.js";

const COLOR_PRESETS = [
  { color: "#E74C3C", label: "Red" },
  { color: "#2C3E50", label: "Black" },
  { color: "#FFBF00", label: "Yellow" },
  { color: "#3498DB", label: "Blue" },
  { color: "#2ECC71", label: "Green" },
  { color: "#888888", label: "Gray" },
  { color: "#FFFFFF", label: "White" },
  { color: "#F39C12", label: "Orange" },
  { color: "#9B59B6", label: "Purple" },
  { color: "#1ABC9C", label: "Teal" },
];

export class ConnectorPanel {
  constructor(container, state) {
    this.state = state;
    this.container = container;
    this._activePopup = null;

    this._closePopupBound = (e) => this._closePopupOnOutsideClick(e);
    this._bindState();
  }

  _bindState() {
    this.state.on("selection-changed", () => this._render());
    this.state.on("connector-changed", ({ connectorId }) => {
      if (connectorId === this.state.selectedConnectorId) this._render();
    });
    this.state.on("pin-changed", ({ connectorId, pinIndex, origin }) => {
      if (connectorId !== this.state.selectedConnectorId) return;
      if (origin === "visual" && pinIndex >= 0) {
        this._updateSvgPreview();
      } else {
        this._render();
      }
    });
    this.state.on("pins-reordered", ({ connectorId }) => {
      if (connectorId === this.state.selectedConnectorId) this._render();
    });
    this.state.on("board-changed", () => this._render());
  }

  _updateSvgPreview() {
    const conn = this.state.getSelectedConnector();
    if (!conn) return;
    const ct = this.state.connectorTypes.get(conn.type);
    const previewEl = this.container.querySelector(".conn-svg-preview");
    if (previewEl && ct) {
      try { previewEl.innerHTML = renderConnectorSVG(conn, ct); }
      catch (e) { /* keep existing preview on error */ }
    }
  }

  _render() {
    this._closePopup();
    const conn = this.state.getSelectedConnector();
    if (!conn) {
      this.container.innerHTML = '<div class="connector-empty">Select a connector to edit</div>';
      return;
    }

    const ct = this.state.connectorTypes.get(conn.type);
    const isDualRow = ct && ct.geometry.rows >= 2;

    let svgHtml = "";
    if (ct) {
      try { svgHtml = renderConnectorSVG(conn, ct); }
      catch (e) { svgHtml = `<div style="color:var(--danger);font-size:12px">Render error: ${e.message}</div>`; }
    } else {
      svgHtml = `<div style="color:var(--text-muted);font-size:12px">Unknown type: ${conn.type}</div>`;
    }

    const typeOptions = [...this.state.connectorTypes.keys()]
      .map(k => `<option value="${k}" ${k === conn.type ? "selected" : ""}>${k}</option>`)
      .join("");

    const orientOptions = [0, 90, 180, 270]
      .map(d => `<option value="${d}" ${d === conn.orientation ? "selected" : ""}>${d}°</option>`)
      .join("");

    this.container.innerHTML = `
      <div class="conn-form">
        <div class="conn-form-row">
          <label>ID</label>
          <input type="text" id="conn-id" value="${this._esc(conn.id)}">
        </div>
        <div class="conn-form-row">
          <label>Name</label>
          <input type="text" id="conn-name" value="${this._esc(conn.name)}">
        </div>
        <div class="conn-form-row">
          <label>Type</label>
          <select id="conn-type">${typeOptions}</select>
          <label style="width:auto">Orient.</label>
          <select id="conn-orient" style="width:70px;flex:none">${orientOptions}</select>
        </div>
        <div class="conn-form-row">
          <label>Desc.</label>
          <input type="text" id="conn-desc" value="${this._esc(conn.description)}">
        </div>

        <div class="conn-svg-preview">${svgHtml}</div>

        <div class="pin-list">
          <div class="pin-list-header">
            <span>Pins (${conn.pins.length})</span>
            <button class="pin-add-btn" id="pin-add-btn">+ Add Pin</button>
          </div>
          ${conn.pins.map((p, i) => this._renderPinRow(p, i, isDualRow)).join("")}
        </div>
      </div>
    `;

    this._bindForm(conn);
  }

  _renderPinRow(pin, index, isDualRow) {
    const rowSel = isDualRow
      ? `<select class="pin-row-select" data-idx="${index}">
           <option value="1" ${pin.row === 1 ? "selected" : ""}>R1</option>
           <option value="2" ${pin.row === 2 ? "selected" : ""}>R2</option>
         </select>`
      : "";
    return `
      <div class="pin-row" data-idx="${index}">
        <span class="pin-drag-handle" draggable="true" data-idx="${index}">≡</span>
        <div class="pin-color-swatch" data-idx="${index}" style="background:${pin.color}" title="${pin.color}"></div>
        <input type="text" class="pin-name-input" data-idx="${index}" value="${this._esc(pin.name)}">
        ${rowSel}
        <button class="pin-delete-btn" data-idx="${index}">×</button>
      </div>
    `;
  }

  _showColorPicker(swatchEl, connId, pinIndex) {
    this._closePopup();

    const conn = this.state.getConnector(connId);
    if (!conn || !conn.pins[pinIndex]) return;
    const currentColor = conn.pins[pinIndex].color;

    const popup = document.createElement("div");
    popup.className = "color-picker-popup";

    const presets = document.createElement("div");
    presets.className = "color-picker-presets";
    for (const p of COLOR_PRESETS) {
      const swatch = document.createElement("div");
      swatch.className = "color-preset";
      if (p.color.toUpperCase() === currentColor.toUpperCase()) swatch.classList.add("active");
      swatch.style.background = p.color;
      swatch.title = p.label;
      swatch.dataset.color = p.color;
      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        this._applyColor(swatchEl, connId, pinIndex, p.color);
        this._closePopup();
      });
      presets.appendChild(swatch);
    }
    popup.appendChild(presets);

    const hexRow = document.createElement("div");
    hexRow.className = "color-picker-hex-row";
    const hashSpan = document.createElement("span");
    hashSpan.textContent = "#";
    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.className = "color-picker-hex";
    hexInput.value = currentColor.replace("#", "");
    hexInput.maxLength = 6;
    hexInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const hex = hexInput.value.trim();
        if (/^[0-9A-Fa-f]{3,6}$/.test(hex)) {
          this._applyColor(swatchEl, connId, pinIndex, "#" + hex);
          this._closePopup();
        }
      }
      e.stopPropagation();
    });
    hexInput.addEventListener("click", (e) => e.stopPropagation());
    hexRow.appendChild(hashSpan);
    hexRow.appendChild(hexInput);
    popup.appendChild(hexRow);

    const rect = swatchEl.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    popup.style.position = "absolute";
    popup.style.left = (rect.left - containerRect.left) + "px";
    popup.style.top = (rect.bottom - containerRect.top + 4) + "px";

    this.container.style.position = "relative";
    this.container.appendChild(popup);
    this._activePopup = popup;

    hexInput.focus();
    hexInput.select();

    setTimeout(() => {
      document.addEventListener("click", this._closePopupBound);
    }, 0);
  }

  _applyColor(swatchEl, connId, pinIndex, color) {
    swatchEl.style.background = color;
    swatchEl.title = color;
    this.state.updatePin(connId, pinIndex, { color }, "visual");
  }

  _closePopupOnOutsideClick(e) {
    if (this._activePopup && !this._activePopup.contains(e.target)) {
      this._closePopup();
    }
  }

  _closePopup() {
    if (this._activePopup) {
      this._activePopup.remove();
      this._activePopup = null;
    }
    document.removeEventListener("click", this._closePopupBound);
  }

  _bindForm(conn) {
    const cid = conn.id;

    const onFieldChange = (selector, key, transform = v => v) => {
      const el = this.container.querySelector(selector);
      if (!el) return;
      el.addEventListener("change", () => {
        const val = transform(el.value);
        if (key === "id") {
          const oldId = this.state.selectedConnectorId;
          this.state.updateConnector(oldId, { id: val }, "visual");
          this.state.selectConnector(val);
        } else {
          this.state.updateConnector(cid, { [key]: val }, "visual");
        }
      });
    };

    onFieldChange("#conn-id", "id");
    onFieldChange("#conn-name", "name");
    onFieldChange("#conn-type", "type");
    onFieldChange("#conn-orient", "orientation", v => parseInt(v));
    onFieldChange("#conn-desc", "description");

    this.container.querySelectorAll(".pin-name-input").forEach(el => {
      el.addEventListener("change", () => {
        const idx = parseInt(el.dataset.idx);
        this.state.updatePin(cid, idx, { name: el.value }, "visual");
      });
    });

    this.container.querySelectorAll(".pin-color-swatch").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(el.dataset.idx);
        this._showColorPicker(el, cid, idx);
      });
    });

    this.container.querySelectorAll(".pin-row-select").forEach(el => {
      el.addEventListener("change", () => {
        const idx = parseInt(el.dataset.idx);
        this.state.updatePin(cid, idx, { row: parseInt(el.value) }, "visual");
      });
    });

    this.container.querySelectorAll(".pin-delete-btn").forEach(el => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.idx);
        this.state.removePin(cid, idx, "visual");
      });
    });

    const addBtn = this.container.querySelector("#pin-add-btn");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        this.state.addPin(cid, new Pin("NEW", "#888888", 1), "visual");
      });
    }

    this.container.querySelectorAll(".pin-drag-handle").forEach(el => {
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", el.dataset.idx);
        e.dataTransfer.effectAllowed = "move";
      });
    });

    this.container.querySelectorAll(".pin-row").forEach(row => {
      row.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData("text/plain"));
        const to = parseInt(row.dataset.idx);
        if (from !== to) this.state.reorderPins(cid, from, to, "visual");
      });
    });
  }

  _esc(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")
                     .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
