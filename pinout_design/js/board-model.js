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

export class Connector {
  constructor(data = {}) {
    this.id = data.id ?? "";
    this.name = data.name ?? "";
    this.type = data.type ?? "";
    this.pins = (data.pins ?? []).map(
      p => p instanceof Pin ? p : new Pin(p.name, p.color, p.row)
    );
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
