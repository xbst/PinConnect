import { previewConnectorSvg } from "./runtime.js";
import { Pin, Setting, parseJumper } from "./board-model.js";

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
    // Jumper settings editing, for the connector named by _settingsFor: the
    // setting the drawing shows (null: every group on its default), the
    // setting pin picking adds jumpers to and the pin picked first, and a
    // one-off note such as which jumpers a pin deletion took with it.
    this._settingsFor = null;
    this._activeSetting = null;
    this._pick = null;
    this._notice = "";

    this._closePopupBound = (e) => this._closePopupOnOutsideClick(e);
    this._bindState();
  }

  _bindState() {
    this.state.on("selection-changed", () => this._render());
    this.state.on("connector-changed", ({ connectorId }) => {
      if (connectorId !== this.state.selectedConnectorId) return;
      // A connector field edit fires `change` on blur — so if we rebuilt the
      // whole panel here, we'd destroy the element the user is clicking (e.g.
      // "+ Add Pin", a delete button, a swatch) before the click completes,
      // silently losing it. Only re-render when the pin-row structure actually
      // changes (dual-row-ness, or whether the type takes jumper settings, from
      // a type change); otherwise just refresh the drawing, leaving the form
      // and the pending click intact.
      const conn = this.state.getSelectedConnector();
      const ct = conn && this.state.connectorTypes.get(conn.type);
      const rowCount = ct ? ct.geometry.rows : 1;
      if (rowCount !== this._rowCount || this._settingsMode(conn) !== this._renderedSettingsMode) this._render();
      else this._updateSvgPreview();
    });
    // A notice reports what one action did, so the next one clears it.
    this.state.on("pin-changed", ({ connectorId, pinIndex, droppedJumpers, origin }) => {
      if (connectorId !== this.state.selectedConnectorId) return;
      this._clearNotice();
      if (droppedJumpers && droppedJumpers.length) {
        this._notice = "Deleting the pin removed " + droppedJumpers
          .map(d => `jumper ${d.jumper} from “${d.label}”`).join(", ") + ".";
      }
      if (origin === "visual" && pinIndex >= 0) {
        this._updateSvgPreview();
      } else {
        this._render();
      }
    });
    // Same rule as connector fields: text edits only redraw, so the field the
    // user tabbed to survives; adding, deleting or re-defaulting rebuilds.
    this.state.on("settings-changed", ({ connectorId }) => {
      if (connectorId !== this.state.selectedConnectorId) return;
      this._clearNotice();
      const conn = this.state.getSelectedConnector();
      if (conn && this._settingsKey(conn) !== this._renderedSettingsKey) this._render();
      else this._updateSvgPreview();
    });
    this.state.on("pins-reordered", ({ connectorId }) => {
      if (connectorId !== this.state.selectedConnectorId) return;
      this._clearNotice();
      this._render();
    });
    // A renamed connector is still the one being edited: keep its picking.
    this.state.on("connector-renamed", ({ oldId, newId }) => {
      if (this._settingsFor === oldId) this._settingsFor = newId;
    });
    // Undo, redo and TOML edits: the last action's notice no longer applies.
    this.state.on("board-changed", () => { this._clearNotice(); this._render(); });
    // The drawing needs pinout-gen, so redraw once it has booted.
    this.state.on("catalogs-loaded", () => this._render());
  }

  _updateSvgPreview() {
    const conn = this.state.getSelectedConnector();
    if (!conn) return;
    const ct = this.state.connectorTypes.get(conn.type);
    const previewEl = this.container.querySelector(".conn-svg-preview");
    if (previewEl && ct) {
      // A stale drawing would show jumpers that are no longer there, so an
      // error replaces it rather than leaving the last good one up.
      try { previewEl.innerHTML = this._previewHtml(conn); }
      catch (e) { previewEl.innerHTML = this._errorHtml(e); }
      this._decoratePreview(conn);
    }
  }

  _errorHtml(e) {
    return `<div class="conn-svg-error">${this._esc(e.message)}</div>`;
  }

  _clearNotice() {
    this._notice = "";
    this.container.querySelector(".setting-note.notice")?.remove();
  }

  // Jumper settings are offered on pin headers, and shown on any connector
  // that already has some, so a type change never hides them; on another type
  // the section says why they do not draw.
  _settingsMode(conn) {
    const ct = conn && this.state.connectorTypes.get(conn.type);
    const header = !!ct && ct.style === "header-male";
    if (header) return "header";
    return conn && conn.settings.length > 0 ? "stranded" : "none";
  }

  // What a rebuild of the settings section depends on beyond its text fields.
  _settingsKey(conn) {
    return conn.settings.map(s => `${s.default}`).join(",") + `|${conn.settings.length}`;
  }

  // The settings the drawing shows: each group's default (or first), except
  // that the setting being edited stands in for its own group. While picking,
  // that is always the setting the clicks edit.
  _shownSettings(conn) {
    const groups = new Map();
    conn.settings.forEach((s, i) => {
      if (!groups.has(s.group)) groups.set(s.group, []);
      groups.get(s.group).push(i);
    });
    const edited = this._pick ? this._pick.setting : this._activeSetting;
    const active = conn.settings[edited] ? edited : null;
    const shown = new Set();
    for (const idxs of groups.values()) {
      if (active !== null && idxs.includes(active)) shown.add(active);
      else shown.add(idxs.find(i => conn.settings[i].default === true) ?? idxs[0]);
    }
    return shown;
  }

  // The generated page switches settings by toggling the drawing's setting
  // groups; the preview does the same for the setting being edited, dims the
  // pins it leaves alone, and in pick mode numbers the pins and makes them
  // clickable.
  _decoratePreview(conn) {
    const svg = this.container.querySelector(".conn-svg-preview svg");
    if (!svg || !conn.settings.length) return;
    const shown = this._shownSettings(conn);
    const bridged = new Set();
    svg.querySelectorAll("[data-setting]").forEach(g => {
      if (!shown.has(parseInt(g.dataset.setting, 10))) { g.setAttribute("display", "none"); return; }
      g.removeAttribute("display");
      g.dataset.pins.split(" ").forEach(p => bridged.add(p));
    });
    svg.classList.toggle("pc-dim", bridged.size > 0 && !this._pick);
    svg.querySelectorAll("[data-pin]").forEach(e => e.classList.toggle("pc-on", bridged.has(e.dataset.pin)));
    if (this._pick) this._addPickTargets(conn, svg);
  }

  _addPickTargets(conn, svg) {
    const NS = "http://www.w3.org/2000/svg";
    const dots = [...svg.querySelectorAll("circle[data-pin]")].map(c => ({
      pin: parseInt(c.dataset.pin, 10), x: +c.getAttribute("cx"), y: +c.getAttribute("cy"),
    }));
    if (!dots.length) return;
    // Neighbors sit one pitch apart: the smallest gap between any two pins.
    let pitch = Infinity;
    for (const a of dots) for (const b of dots) {
      if (a !== b) pitch = Math.min(pitch, Math.hypot(a.x - b.x, a.y - b.y));
    }
    if (!Number.isFinite(pitch)) pitch = 10;
    this._pickPitch = pitch;
    this._pickDots = dots;
    const layer = document.createElementNS(NS, "g");
    layer.setAttribute("class", "pick-layer");
    for (const d of dots) {
      const hit = document.createElementNS(NS, "circle");
      hit.setAttribute("cx", d.x); hit.setAttribute("cy", d.y);
      hit.setAttribute("r", (pitch * 0.45).toFixed(1));
      hit.setAttribute("class", "pick-hit" + (this._pick.first === d.pin ? " first" : ""));
      hit.dataset.pickPin = d.pin;
      const num = document.createElementNS(NS, "text");
      num.setAttribute("x", (d.x + pitch * 0.3).toFixed(1));
      num.setAttribute("y", (d.y - pitch * 0.22).toFixed(1));
      num.setAttribute("font-size", (pitch * 0.3).toFixed(1));
      num.setAttribute("class", "pick-num");
      num.textContent = d.pin;
      layer.append(hit, num);
    }
    svg.appendChild(layer);
    svg.classList.add("picking");
    // Pointerdown, not click: a field with an uncommitted edit commits on this
    // same press, and the redraw that follows would remove the target before
    // a click could land. Committing it first keeps that edit, too.
    layer.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      const hit = e.target.closest(".pick-hit");
      if (!hit) return;
      e.preventDefault();
      const pin = parseInt(hit.dataset.pickPin, 10);
      const focused = document.activeElement;
      if (focused && focused !== document.body && this.container.contains(focused)) focused.blur();
      const current = this.state.getSelectedConnector();
      if (current) this._pickPin(current, pin);
    });
  }

  // First click marks a pin; a second click on a neighbor adds the jumper
  // between them to the setting being picked, or removes it if it is there.
  _pickPin(conn, pin) {
    const pick = this._pick;
    const s = conn.settings[pick && pick.setting];
    if (!s) return;
    if (pick.first === null || pick.first === pin) {
      pick.first = pick.first === pin ? null : pin;
      this._clearNotice();
      this._updateSvgPreview();
      return;
    }
    const a = Math.min(pick.first, pin), b = Math.max(pick.first, pin);
    pick.first = null;
    const pos = n => this._pickDots.find(d => d.pin === n);
    const pa = pos(a), pb = pos(b);
    const jumpers = Array.isArray(s.jumpers) ? [...s.jumpers] : [];
    const existing = jumpers.findIndex(j => {
      const p = parseJumper(j);
      return p && Math.min(...p) === a && Math.max(...p) === b;
    });
    if (existing >= 0) {
      jumpers.splice(existing, 1);
    } else if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > this._pickPitch * 1.2) {
      this._notice = `Pins ${a} and ${b} are not next to each other; a jumper cap only bridges neighboring pins.`;
      this._render();
      return;
    } else {
      const busy = [a, b].find(n => jumpers.some(j => (parseJumper(j) || []).includes(n)));
      if (busy !== undefined) {
        this._notice = `Pin ${busy} already carries a jumper in “${s.label}”.`;
        this._render();
        return;
      }
      jumpers.push(`${a}-${b}`);
    }
    this._notice = "";
    this._editSetting(conn, pick.setting, { jumpers });
    this._render();
  }

  _editSetting(conn, index, changes) {
    const settings = conn.settings.map(s => new Setting(s));
    Object.assign(settings[index], changes);
    this.state.setSettings(conn.id, settings, "visual");
  }

  // The drawing for a connector, or a note in its place for the "none" type,
  // which renders nothing because it only marks a spot on the board.
  _previewHtml(conn) {
    const svg = previewConnectorSvg(conn);
    if (svg === null) {
      return '<span class="conn-svg-none">Starting the renderer…</span>';
    }
    return svg || '<span class="conn-svg-none">No drawing — marks a spot on the board</span>';
  }

  _render() {
    this._closePopup();
    const conn = this.state.getSelectedConnector();
    if (!conn) {
      this.container.innerHTML = '<div class="connector-empty">Select a connector to edit</div>';
      return;
    }

    const ct = this.state.connectorTypes.get(conn.type);
    const rowCount = ct ? ct.geometry.rows : 1;
    this._rowCount = rowCount;
    if (this._settingsFor !== conn.id) {
      this._settingsFor = conn.id;
      this._activeSetting = null;
      this._pick = null;
      this._notice = "";
    }
    if (this._pick && !conn.settings[this._pick.setting]) this._pick = null;
    this._renderedSettingsMode = this._settingsMode(conn);
    const showSettings = this._renderedSettingsMode !== "none";
    this._renderedSettingsKey = this._settingsKey(conn);

    let svgHtml = "";
    if (ct) {
      try { svgHtml = this._previewHtml(conn); }
      catch (e) { svgHtml = this._errorHtml(e); }
    } else {
      svgHtml = `<div style="color:var(--text-muted);font-size:12px">Unknown type: ${this._esc(conn.type)}</div>`;
    }

    const typeOptions = [...this.state.connectorTypes.keys()]
      .map(k => `<option value="${k}" ${k === conn.type ? "selected" : ""}>${k}</option>`)
      .join("");

    const orientOptions = [0, 90, 180, 270]
      .map(d => `<option value="${d}" ${d === conn.orientation ? "selected" : ""}>${d}°</option>`)
      .join("");

    const labelStyleOptions = ["staggered", "staircase", "flat"]
      .map(s => `<option value="${s}" ${s === (conn.label_style || "staggered") ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`)
      .join("");

    const symbolOptions = (this.state.symbolNames || [])
      .map(n => `<option value="${n}">`).join("");

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
          <label>Labels</label>
          <select id="conn-label-style">${labelStyleOptions}</select>
        </div>
        <div class="conn-form-row">
          <label>Desc.</label>
          <input type="text" id="conn-desc" value="${this._esc(conn.description)}">
        </div>
        <div class="conn-form-row">
          <label>Symbol</label>
          <input type="text" id="conn-symbol" list="conn-symbol-list"
            value="${this._esc(conn.symbol)}" placeholder="none · power · &#9889;">
        </div>
        <datalist id="conn-symbol-list">${symbolOptions}</datalist>

        <div class="conn-svg-preview">${svgHtml}</div>

        <div class="pin-list">
          <div class="pin-list-header">
            <span>Pins (${conn.pins.length})</span>
            <button class="pin-add-btn" id="pin-add-btn">+ Add Pin</button>
          </div>
          ${conn.pins.map((p, i) => this._renderPinRow(p, i, rowCount, showSettings)).join("")}
        </div>
        ${showSettings ? this._renderSettings(conn, ct) : ""}
      </div>
    `;

    this._bindForm(conn);
    this._bindSettings(conn);
    this._decoratePreview(conn);
  }

  _renderSettings(conn, ct) {
    const isHeader = ct && ct.style === "header-male";
    const note = isHeader ? "" :
      '<div class="setting-note error">Jumper settings only draw on pin header types; change the type or delete them.</div>';
    const notice = this._notice ? `<div class="setting-note notice">${this._esc(this._notice)}</div>` : "";
    const pickHelp = this._pick
      ? '<div class="setting-note pick-help">Click two neighboring pins in the drawing to add a jumper, or a fitted pair to remove it.</div>'
      : "";
    const empty = conn.settings.length ? "" :
      '<div class="setting-note">Add a setting for each way the header can be jumpered, such as "5V" with a jumper on 1-2 and "VIN" on 2-3, or "Off" with no jumper. Pins are numbered as in the list above.</div>';
    return `
      <div class="setting-list">
        <div class="pin-list-header">
          <span>Jumper settings (${conn.settings.length})</span>
          <button class="pin-add-btn" id="setting-add-btn">+ Add Setting</button>
        </div>
        ${note}${notice}${pickHelp}${empty}
        ${conn.settings.map((s, i) => this._renderSettingCard(s, i)).join("")}
      </div>`;
  }

  _renderSettingCard(s, i) {
    const jumpers = Array.isArray(s.jumpers) ? s.jumpers.join(", ") : String(s.jumpers ?? "");
    const picking = this._pick && this._pick.setting === i;
    return `
      <div class="setting-card${this._activeSetting === i ? " active" : ""}" data-sidx="${i}">
        <div class="setting-row">
          <input type="text" class="setting-label" data-sidx="${i}" value="${this._esc(s.label)}" placeholder="Label" title="Label: the button text in the pinout">
          <input type="text" class="setting-group" data-sidx="${i}" value="${this._esc(s.group)}" placeholder="Group" title="Group: settings with the same group are alternatives; leave empty for one group">
          <label class="setting-default" title="Shown first, and marked default"><input type="checkbox" class="setting-default-cb" data-sidx="${i}" ${s.default === true ? "checked" : ""}>Default</label>
          <button class="pin-delete-btn setting-delete-btn" data-sidx="${i}" title="Delete setting">×</button>
        </div>
        <div class="setting-row">
          <span class="setting-key">Jumpers</span>
          <input type="text" class="setting-jumpers" data-sidx="${i}" value="${this._esc(jumpers)}" placeholder="none: no jumper fitted" title="Pin pairs, like 1-2, 3-4">
          <button class="pin-add-btn setting-pick-btn${picking ? " on" : ""}" data-sidx="${i}">${picking ? "Done" : "Pick"}</button>
        </div>
        <input type="text" class="setting-desc" data-sidx="${i}" value="${this._esc(s.description)}" placeholder="Description (optional)">
      </div>`;
  }

  _bindSettings(conn) {
    const cid = conn.id;
    const list = this.container.querySelector(".setting-list");
    if (!list) return;
    const current = () => this.state.getConnector(cid);
    const idx = el => parseInt(el.dataset.sidx, 10);

    // Working in a card shows that setting in the drawing.
    list.querySelectorAll(".setting-card").forEach(card => {
      card.addEventListener("focusin", () => this._activate(idx(card)));
      card.addEventListener("pointerdown", () => this._activate(idx(card)));
    });

    const onText = (cls, key, read = v => v) => {
      list.querySelectorAll(cls).forEach(el => el.addEventListener("change", () => {
        const c = current();
        if (c && c.settings[idx(el)]) this._editSetting(c, idx(el), { [key]: read(el.value) });
      }));
    };
    onText(".setting-label", "label");
    onText(".setting-group", "group");
    onText(".setting-desc", "description");
    // Any separator works: "1-2, 3-4", "1-2 3-4" or "1-2;3-4".
    onText(".setting-jumpers", "jumpers", v => v.split(/[\s,;]+/).filter(Boolean));

    // One default per group: marking one clears the rest of its group.
    list.querySelectorAll(".setting-default-cb").forEach(el => el.addEventListener("change", () => {
      const c = current();
      const i = idx(el);
      if (!c || !c.settings[i]) return;
      const settings = c.settings.map(s => new Setting(s));
      if (el.checked) {
        settings.forEach((s, k) => { if (s.group === settings[i].group) s.default = k === i; });
      } else {
        settings[i].default = false;
      }
      this.state.setSettings(cid, settings, "visual");
    }));

    list.querySelectorAll(".setting-delete-btn").forEach(el => el.addEventListener("click", () => {
      const c = current();
      const i = idx(el);
      if (!c || !c.settings[i]) return;
      const settings = c.settings.filter((_, k) => k !== i).map(s => new Setting(s));
      const shift = k => k === null || k === i ? null : k > i ? k - 1 : k;
      this._activeSetting = shift(this._activeSetting);
      if (this._pick) {
        const setting = shift(this._pick.setting);
        this._pick = setting === null ? null : { ...this._pick, setting };
        // The drawing and the clicks must keep pointing at the same setting.
        if (this._pick) this._activeSetting = this._pick.setting;
      }
      this.state.setSettings(cid, settings, "visual", i);
    }));

    list.querySelectorAll(".setting-pick-btn").forEach(el => el.addEventListener("click", () => {
      const i = idx(el);
      this._pick = this._pick && this._pick.setting === i ? null : { setting: i, first: null };
      this._activeSetting = i;
      this._notice = "";
      this._render();
      // Picking happens on the drawing, which a long pin list scrolls away.
      if (this._pick) this.container.querySelector(".conn-svg-preview")?.scrollIntoView({ block: "nearest" });
    }));

    const addBtn = list.querySelector("#setting-add-btn");
    if (addBtn) addBtn.addEventListener("click", () => {
      const c = current();
      if (!c) return;
      // A new setting joins the last one's group, the usual next step, under
      // a label nothing in that group uses yet (labels are unique per group).
      const last = c.settings[c.settings.length - 1];
      const settings = [...c.settings.map(s => new Setting(s)),
        new Setting({ label: `Setting ${c.settings.length + 1}`, group: last ? last.group : "" })];
      this._activeSetting = settings.length - 1;
      this.state.setSettings(cid, settings, "visual");
    });
  }

  _activate(i) {
    // Moving to another card ends picking, so the drawing never shows one
    // setting while pin clicks edit another. No rebuild: that would destroy
    // the control being clicked or focused.
    if (this._pick && this._pick.setting !== i) {
      this._pick = null;
      this.container.querySelectorAll(".setting-pick-btn.on").forEach(b => {
        b.classList.remove("on");
        b.textContent = "Pick";
      });
      this.container.querySelector(".setting-note.pick-help")?.remove();
    } else if (this._activeSetting === i) {
      return;
    }
    this._activeSetting = i;
    this.container.querySelectorAll(".setting-card").forEach(card =>
      card.classList.toggle("active", parseInt(card.dataset.sidx, 10) === i));
    this._updateSvgPreview();
  }

  _renderPinRow(pin, index, rowCount, numbered = false) {
    const rowSel = rowCount >= 2
      ? `<select class="pin-row-select" data-idx="${index}">
           ${Array.from({ length: Math.min(rowCount, 3) }, (_, r) =>
             `<option value="${r + 1}" ${pin.row === r + 1 ? "selected" : ""}>R${r + 1}</option>`).join("")}
         </select>`
      : "";
    return `
      <div class="pin-row" data-idx="${index}">
        <span class="pin-drag-handle" draggable="true" data-idx="${index}">≡</span>
        ${numbered ? `<span class="pin-num" title="Pin number, as jumper settings use it">${index + 1}</span>` : ""}
        <div class="pin-color-swatch" data-idx="${index}" style="background:${this._esc(pin.color)}" title="${this._esc(pin.color)}"></div>
        <input type="text" id="pin-name-${index}" class="pin-name-input" data-idx="${index}" value="${this._esc(pin.name)}">
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
        // Only 3- or 6-digit hex is a valid solid color; 4/5-digit values used
        // to be accepted and stored as invalid colors.
        if (/^([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex)) {
          this._applyColor(swatchEl, connId, pinIndex, "#" + hex);
          this._closePopup();
        } else {
          hexInput.style.borderColor = "var(--danger)";
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
          if (!this.state.renameConnector(oldId, val.trim(), "visual")) {
            this._render(); // invalid (empty/duplicate) — restore the current ID
          }
        } else {
          this.state.updateConnector(cid, { [key]: val }, "visual");
        }
      });
    };

    onFieldChange("#conn-id", "id");
    onFieldChange("#conn-name", "name");
    // Type change gets a custom handler: switching to a type with fewer rows
    // would strand pins on a row it lacks (no selector entry to fix them,
    // mis-rendered at y=0), so pull them back to row 1 in the same update.
    const typeEl = this.container.querySelector("#conn-type");
    if (typeEl) {
      typeEl.addEventListener("change", () => {
        const newType = typeEl.value;
        const c = this.state.getConnector(cid);
        const ct = this.state.connectorTypes.get(newType);
        const rowCount = ct ? ct.geometry.rows : 1;
        if (c && c.pins.some(p => p.row > rowCount)) {
          const pins = c.pins.map(p => new Pin(p.name, p.color, p.row > rowCount ? 1 : p.row));
          this.state.updateConnector(cid, { type: newType, pins }, "visual");
        } else {
          this.state.updateConnector(cid, { type: newType }, "visual");
        }
      });
    }
    onFieldChange("#conn-orient", "orientation", v => parseInt(v));
    onFieldChange("#conn-label-style", "label_style");
    onFieldChange("#conn-desc", "description");
    onFieldChange("#conn-symbol", "symbol", v => v.trim());

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

    // A custom drag type marks our own pin-reorder drags, so dropping arbitrary
    // external text/files onto a pin row can't be parsed as an index and
    // silently reorder a pin (parseInt of stray text was NaN -> spliced pin 0).
    const PIN_DND = "application/x-pinconnect-pin";
    this.container.querySelectorAll(".pin-drag-handle").forEach(el => {
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData(PIN_DND, el.dataset.idx);
        e.dataTransfer.setData("text/plain", el.dataset.idx);
        e.dataTransfer.effectAllowed = "move";
      });
    });

    this.container.querySelectorAll(".pin-row").forEach(row => {
      row.addEventListener("dragover", (e) => {
        if (![...e.dataTransfer.types].includes(PIN_DND)) return; // not our drag
        e.preventDefault(); e.dataTransfer.dropEffect = "move";
      });
      row.addEventListener("drop", (e) => {
        const raw = e.dataTransfer.getData(PIN_DND);
        if (raw === "") return; // not a pin-reorder drag
        e.preventDefault();
        const from = parseInt(raw, 10);
        const to = parseInt(row.dataset.idx, 10);
        const c = this.state.getConnector(cid);
        if (!c || !Number.isInteger(from) || from < 0 || from >= c.pins.length) return;
        if (from !== to) this.state.reorderPins(cid, from, to, "visual");
      });
    });
  }

  _esc(s) {
    // String(): a setting can hold a value pinout-gen will reject, like a number.
    return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")
                          .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
