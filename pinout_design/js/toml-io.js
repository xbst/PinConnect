export class TomlParseError extends Error {
  constructor(message, line) {
    super(message);
    this.line = line;
  }
}

export function parseToml(text) {
  const result = {};
  let currentTable = result;
  const aotParents = {};
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = stripComment(raw).trim();
    if (!line) continue;

    // Array of tables: [[a.b.c]]
    const aot = line.match(/^\[\[([^\]]+)\]\]$/);
    if (aot) {
      const parts = aot[1].trim().split(".").map(s => s.trim());
      if (parts.length === 1) {
        if (!result[parts[0]]) result[parts[0]] = [];
        const entry = {};
        result[parts[0]].push(entry);
        currentTable = entry;
        aotParents[parts[0]] = entry;
      } else {
        // e.g. [[connector.pin]] -> append to last connector's pin array
        const parentKey = parts.slice(0, -1).join(".");
        const childKey = parts[parts.length - 1];
        const parent = aotParents[parentKey];
        if (parent) {
          if (!parent[childKey]) parent[childKey] = [];
          const entry = {};
          parent[childKey].push(entry);
          currentTable = entry;
        }
      }
      continue;
    }

    // Table header: [name]
    const tbl = line.match(/^\[([^\]]+)\]$/);
    if (tbl) {
      const key = tbl[1].trim();
      if (!result[key]) result[key] = {};
      currentTable = result[key];
      continue;
    }

    // Key = value
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (kv) {
      const key = kv[1].trim();
      const val = parseTomlValue(kv[2].trim(), i + 1);
      currentTable[key] = val;
      continue;
    }

    throw new TomlParseError(`Unexpected syntax: ${raw.trim()}`, i + 1);
  }

  return result;
}

function stripComment(line) {
  let inStr = false, quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr) { if (ch === quote && line[i - 1] !== "\\") inStr = false; }
    else if (ch === '"' || ch === "'") { inStr = true; quote = ch; }
    else if (ch === "#") return line.slice(0, i);
  }
  return line;
}

function parseTomlValue(val, lineNum) {
  // Quoted string (double)
  if (val.startsWith('"')) {
    const end = val.indexOf('"', 1);
    if (end === -1) throw new TomlParseError("Unterminated string", lineNum);
    return val.slice(1, end)
      .replace(/\\n/g, "\n").replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\").replace(/\\"/g, '"');
  }
  // Quoted string (single)
  if (val.startsWith("'")) {
    const end = val.indexOf("'", 1);
    if (end === -1) throw new TomlParseError("Unterminated string", lineNum);
    return val.slice(1, end);
  }
  // Boolean
  if (val === "true") return true;
  if (val === "false") return false;
  // Inline array
  if (val.startsWith("[")) {
    return parseInlineArray(val, lineNum);
  }
  // Number (float)
  if (val.includes(".") && !isNaN(Number(val))) return parseFloat(val);
  // Number (int)
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);

  throw new TomlParseError(`Cannot parse value: ${val}`, lineNum);
}

function parseInlineArray(val, lineNum) {
  const inner = val.slice(1, val.lastIndexOf("]")).trim();
  if (!inner) return [];
  return inner.split(",").map(v => parseTomlValue(v.trim(), lineNum));
}

// --- Parsing board.toml specifically ---

export function parseBoardToml(text) {
  const raw = parseToml(text);
  const b = raw.board || {};
  const board = {
    title: b.title || "Pinout",
    image: b.image || "",
    width: b.width || 0,
    height: b.height || 0,
    connector_dir: b.connector_dir || "./connectors",
  };

  const connectors = (raw.connector || []).map(c => ({
    id: c.id || "",
    name: c.name || "",
    type: c.type || "",
    x1: c.x1 || 0,
    y1: c.y1 || 0,
    x2: c.x2 || 0,
    y2: c.y2 || 0,
    orientation: c.orientation || 0,
    description: c.description || "",
    pins: (c.pin || []).map(p => ({
      name: p.name || "",
      color: p.color || "#888888",
      row: p.row || 1,
    })),
  }));

  return { board, connectors };
}

// --- Source map: line ranges for each connector block ---

export function buildSourceMap(text) {
  const lines = text.split("\n");
  const map = { board: null, connectors: [] };
  let currentConn = null;
  let currentPin = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed.startsWith("[board]")) {
      map.board = { start: i, end: i };
      continue;
    }

    if (trimmed === "[[connector]]") {
      if (currentConn) currentConn.end = i - 1;
      currentConn = { start: i, end: i, pins: [] };
      currentPin = null;
      map.connectors.push(currentConn);
      continue;
    }

    if (trimmed === "[[connector.pin]]") {
      currentPin = { start: i, end: i };
      if (currentConn) currentConn.pins.push(currentPin);
      continue;
    }

    if (currentPin) currentPin.end = i;
    else if (currentConn) currentConn.end = i;
    else if (map.board) map.board.end = i;
  }

  if (currentConn) {
    currentConn.end = lines.length - 1;
    while (currentConn.end > currentConn.start && !lines[currentConn.end].trim()) {
      currentConn.end--;
    }
  }

  return map;
}

// --- Serialization ---

function quoteStr(s) {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function serializeConnectorBlock(conn) {
  const lines = ["[[connector]]"];
  lines.push(`id = ${quoteStr(conn.id)}`);
  lines.push(`name = ${quoteStr(conn.name)}`);
  lines.push(`type = ${quoteStr(conn.type)}`);
  lines.push(`x1 = ${conn.x1}`);
  lines.push(`y1 = ${conn.y1}`);
  lines.push(`x2 = ${conn.x2}`);
  lines.push(`y2 = ${conn.y2}`);
  if (conn.orientation) lines.push(`orientation = ${conn.orientation}`);
  if (conn.description) lines.push(`description = ${quoteStr(conn.description)}`);

  for (const pin of conn.pins) {
    lines.push("");
    lines.push("  [[connector.pin]]");
    lines.push(`  name = ${quoteStr(pin.name)}`);
    if (pin.color !== "#888888") lines.push(`  color = ${quoteStr(pin.color)}`);
    if (pin.row !== 1) lines.push(`  row = ${pin.row}`);
  }

  return lines.join("\n");
}

export function serializeBoardToml(boardData, connectors) {
  const lines = [];
  lines.push("[board]");
  lines.push(`title = ${quoteStr(boardData.title)}`);
  lines.push(`image = ${quoteStr(boardData.image)}`);
  lines.push(`width = ${boardData.width}`);
  lines.push(`height = ${boardData.height}`);
  if (boardData.connector_dir && boardData.connector_dir !== "./connectors") {
    lines.push(`connector_dir = ${quoteStr(boardData.connector_dir)}`);
  }

  for (const conn of connectors) {
    lines.push("");
    lines.push(serializeConnectorBlock(conn));
  }

  return lines.join("\n") + "\n";
}

export function patchConnectorInSource(sourceText, sourceMap, connIndex, newConn) {
  const lines = sourceText.split("\n");
  const range = sourceMap.connectors[connIndex];
  if (!range) return sourceText;

  const newBlock = serializeConnectorBlock(newConn);
  const newLines = newBlock.split("\n");
  const before = lines.slice(0, range.start);
  const after = lines.slice(range.end + 1);

  return [...before, ...newLines, ...after].join("\n");
}
