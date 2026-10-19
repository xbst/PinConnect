// The board model the designer edits. Connector type geometry is not modelled
// here: it comes from pinout-gen through the Python bridge, so there is one
// definition of a connector's shape rather than two that can disagree.

export class Pin {
  constructor(name, color = "#888888", row = 1) {
    this.name = name;
    this.color = color;
    this.row = row;
  }
}

// One way of fitting a header's jumpers. jumpers holds "a-b" strings of 1-based
// pin-list positions, as written in the TOML; a value that is not a list is
// kept as read, so pinout-gen reports it rather than the designer hiding it.
export class Setting {
  constructor(data = {}) {
    this.label = data.label ?? "";
    this.jumpers = Array.isArray(data.jumpers) ? [...data.jumpers] : (data.jumpers ?? []);
    this.default = data.default ?? false;
    this.group = data.group ?? "";
    this.description = data.description ?? "";
    // Keys the TOML gave this setting that it has no field for: kept so the
    // preview can reject them exactly as Generate will.
    this.unknown = [...(data.unknown ?? [])];
  }
}

// The two pin numbers of a "a-b" jumper, or null for anything else.
export function parseJumper(j) {
  const m = typeof j === "string" && j.match(/^\s*([0-9]+)\s*-\s*([0-9]+)\s*$/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

// Renumber every setting's jumpers after the pin list changed. newNumber maps
// an old pin number (1..count) to its new one, or to null when that pin is
// gone; a jumper that loses a pin is dropped and reported. Numbers that named
// no pin, and entries that are not jumpers, are left alone for pinout-gen to
// report.
export function renumberJumpers(settings, count, newNumber) {
  const dropped = [];
  const renumber = n => n >= 1 && n <= count ? newNumber(n) : n;
  const out = settings.map(s => {
    if (!Array.isArray(s.jumpers)) return new Setting(s);
    const jumpers = [];
    for (const j of s.jumpers) {
      const pair = parseJumper(j);
      if (!pair) { jumpers.push(j); continue; }
      const [a, b] = pair.map(renumber);
      if (a !== null && b !== null) jumpers.push(`${a}-${b}`);
      else dropped.push({ label: s.label, jumper: j });
    }
    return new Setting({ ...s, jumpers });
  });
  return { settings: out, dropped };
}

export class Connector {
  constructor(data = {}) {
    this.id = data.id ?? "";
    this.name = data.name ?? "";
    this.type = data.type ?? "";
    this.pins = (data.pins ?? []).map(
      p => p instanceof Pin ? p : new Pin(p.name, p.color, p.row)
    );
    // Always copied, so a duplicated or restored connector never shares its
    // settings with another one.
    this.settings = (data.settings ?? []).map(s => new Setting(s));
    this.x1 = data.x1 ?? 0;
    this.y1 = data.y1 ?? 0;
    this.x2 = data.x2 ?? 0;
    this.y2 = data.y2 ?? 0;
    this.orientation = data.orientation ?? 0;
    this.description = data.description ?? "";
    this.label_style = data.label_style ?? "staggered";
    this.symbol = data.symbol ?? "";
  }
}

export class Board {
  constructor(data = {}) {
    this.title = data.title ?? "Pinout";
    this.image = data.image ?? "";
    this.width = data.width ?? 0;
    this.height = data.height ?? 0;
    this.connector_dir = data.connector_dir ?? "./connectors";
    this.theme = data.theme ?? "default";
    this.theme_dir = data.theme_dir ?? "./themes";
    this.connectors = (data.connectors ?? []).map(
      c => c instanceof Connector ? c : new Connector(c)
    );
  }
}
