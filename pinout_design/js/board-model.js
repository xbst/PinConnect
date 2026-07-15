export class ConnectorGeometry {
  constructor(data = {}) {
    this.pin_pitch = data.pin_pitch ?? 10.0;
    this.padding_left = data.padding_left ?? 10.0;
    this.padding_right = data.padding_right ?? 10.0;
    this.height = data.height ?? 23.0;
    this.wall = data.wall ?? 2.6;
    this.pin_cy = data.pin_cy ?? 13.5;
    this.pin_radius = data.pin_radius ?? 3.0;
    this.pinout_side = data.pinout_side ?? "bottom";
    this.line_length = data.line_length ?? 20.0;
    this.rows = data.rows ?? 1;
    this.row2_pin_cy = data.row2_pin_cy ?? 0.0;
    this.row2_pinout_side = data.row2_pinout_side ?? "top";
    this.row2_line_length = data.row2_line_length ?? 20.0;
    this.row2_padding_left = data.row2_padding_left ?? -1.0;
    this.row2_pin_pitch_y = data.row2_pin_pitch_y ?? 0.0;
    this.row2_pin_radius = data.row2_pin_radius ?? -1.0;
    this.cavity_size = data.cavity_size ?? 0.0;
    this.mating_pin_scale = data.mating_pin_scale ?? 1.0;
  }

  connectorWidth(nPins) {
    if (nPins < 1) return this.padding_left + this.padding_right;
    return this.padding_left + (nPins - 1) * this.pin_pitch + this.padding_right;
  }

  pinCentersX(nPins) {
    const centers = [];
    for (let i = 0; i < nPins; i++) {
      centers.push(this.padding_left + i * this.pin_pitch);
    }
    return centers;
  }
}

export class ConnectorType {
  constructor(name, style, geometry) {
    this.name = name;
    this.style = style;
    this.geometry = geometry instanceof ConnectorGeometry
      ? geometry
      : new ConnectorGeometry(geometry);
  }
}

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
  }
}

export class Board {
  constructor(data = {}) {
    this.title = data.title ?? "Pinout";
    this.image = data.image ?? "";
    this.width = data.width ?? 0;
    this.height = data.height ?? 0;
    this.connector_dir = data.connector_dir ?? "./connectors";
    this.connectors = (data.connectors ?? []).map(
      c => c instanceof Connector ? c : new Connector(c)
    );
  }
}
