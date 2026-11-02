// The connector type dropdowns and the names they give each type. A board names
// a type by its ID (HDR-254-2R); the designer shows the menu name its TOML gives
// it (2.54mm Dual Row) under its category (Pin Header). The catalog arrives in
// menu order with both filled in (bridge.connector_catalog), so building the
// menu is only a matter of starting a group wherever the category changes.

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")
                        .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A type <select>'s options, grouped by category, with `selected` chosen. */
export function typeOptionsHtml(types, selected) {
  let html = "";
  let category = null;
  for (const [slug, ct] of types) {
    if (ct.category !== category) {
      if (category !== null) html += "</optgroup>";
      category = ct.category;
      html += `<optgroup label="${esc(category)}">`;
    }
    html += `<option value="${esc(slug)}"${slug === selected ? " selected" : ""}>${esc(ct.menuName)}</option>`;
  }
  if (category !== null) html += "</optgroup>";
  // A type the designer has no definition for (one from the board's own
  // connector_dir) still shows as chosen, rather than the first entry seeming
  // to be and then not firing a change when it is picked.
  if (selected && !types.has(selected)) {
    html = `<option value="${esc(selected)}" selected>${esc(selected)}</option>` + html;
  }
  return html;
}

/** What the designer calls a type: its menu name, or its ID if it has none. */
export function typeName(types, slug) {
  return types.get(slug)?.menuName || slug;
}

/** The type's full place in the menu, e.g. "Pin Header › 2.54mm Dual Row". */
export function typePath(types, slug) {
  const ct = types.get(slug);
  return ct ? `${ct.category} › ${ct.menuName}` : slug;
}
