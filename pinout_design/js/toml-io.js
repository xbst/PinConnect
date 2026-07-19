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
  let inStr = false, quote = null, escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr) {
      if (escaped) { escaped = false; continue; }
      // Escapes only exist in basic (double-quoted) strings, not literal ones.
      if (ch === "\\" && quote === '"') { escaped = true; continue; }
      if (ch === quote) inStr = false;
    }
    else if (ch === '"' || ch === "'") { inStr = true; quote = ch; }
    else if (ch === "#") return line.slice(0, i);
  }
  return line;
}

function parseTomlValue(val, lineNum) {
  // Quoted string (double)
  if (val.startsWith('"')) {
    let end = -1;
    for (let i = 1; i < val.length; i++) {
      if (val[i] === "\\") { i++; continue; }
      if (val[i] === '"') { end = i; break; }
    }
    if (end === -1) throw new TomlParseError("Unterminated string", lineNum);
    // Single left-to-right pass so "\\n" is a backslash + n, not a newline.
    return val.slice(1, end).replace(/\\(u[0-9A-Fa-f]{4}|.)/g, (m, esc) => {
      if (esc === "n") return "\n";
      if (esc === "t") return "\t";
      if (esc === "r") return "\r";
      if (esc === '"' || esc === "\\") return esc;
      if (esc[0] === "u") return String.fromCharCode(parseInt(esc.slice(1), 16));
      return m;
    });
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
  // Number — accept the forms tomllib does (was stricter, so valid TOML like
  // 1_000, +90, 1e3, 0xFF flagged a false parse error in the editor).
  const num = parseTomlNumber(val);
  if (num !== undefined) return num;

  throw new TomlParseError(`Cannot parse value: ${val}`, lineNum);
}

// Parse a TOML numeric value, or return undefined if it isn't one. Covers the
// forms tomllib accepts: optional +/- sign, digit-group underscores, decimals,
// exponents, hex/octal/binary integers, and inf/nan.
function parseTomlNumber(val) {
  const special = val.match(/^([+-]?)(inf|nan)$/);
  if (special) return special[2] === "nan" ? NaN : (special[1] === "-" ? -Infinity : Infinity);
  if (/^0x[0-9A-Fa-f](_?[0-9A-Fa-f])*$/.test(val)) return parseInt(val.slice(2).replace(/_/g, ""), 16);
  if (/^0o[0-7](_?[0-7])*$/.test(val)) return parseInt(val.slice(2).replace(/_/g, ""), 8);
  if (/^0b[01](_?[01])*$/.test(val)) return parseInt(val.slice(2).replace(/_/g, ""), 2);
  if (/^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/.test(val)) {
    const clean = val.replace(/_/g, "");
    return /[.eE]/.test(clean) ? parseFloat(clean) : parseInt(clean, 10);
  }
  return undefined;
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
  // Use ?? (not ||) for fields with a non-empty default, so an explicit empty
  // string the user typed (e.g. title = "") survives the round-trip instead of
  // being silently replaced by the default.
  const board = {
    title: b.title ?? "Pinout",
    image: b.image ?? "",
    width: b.width || 0,
    height: b.height || 0,
    connector_dir: b.connector_dir ?? "./connectors",
    theme: b.theme ?? "default",
    theme_dir: b.theme_dir ?? "./themes",
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
    label_style: c.label_style || "staggered",
    symbol: c.symbol || "",
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
  let scope = null;          // "board" | "connector" | "pin" | null
  let currentConn = null;
  let currentPin = null;

  for (let i = 0; i < lines.length; i++) {
    // Classify on the comment-stripped, trimmed line. A blank or comment-only
    // line is never part of a block's range, so ranges end at the last real
    // content line — trailing blanks/comments between blocks are preserved.
    const trimmed = stripComment(lines[i]).trim();
    if (!trimmed) continue;

    if (trimmed === "[board]") {
      map.board = { start: i, end: i };
      scope = "board"; currentConn = null; currentPin = null;
      continue;
    }
    if (trimmed === "[[connector]]") {
      currentConn = { start: i, end: i, id: null, pins: [] };
      currentPin = null; scope = "connector";
      map.connectors.push(currentConn);
      continue;
    }
    if (trimmed === "[[connector.pin]]") {
      currentPin = { start: i, end: i };
      scope = "pin";
      if (currentConn) { currentConn.pins.push(currentPin); currentConn.end = i; }
      continue;
    }
    if (trimmed.startsWith("[")) {
      // Any other table header closes the current block, so its lines aren't
      // swallowed into the previous connector's (or board's) range.
      scope = null; currentConn = null; currentPin = null;
      continue;
    }

    // A key = value content line extends only the innermost open block.
    if (scope === "pin" && currentPin) {
      currentPin.end = i;
      if (currentConn) currentConn.end = i;
    } else if (scope === "connector" && currentConn) {
      currentConn.end = i;
      if (currentConn.id === null) {
        const m = trimmed.match(/^id\s*=\s*(.+)$/);
        if (m) {
          try { currentConn.id = parseTomlValue(m[1].trim(), i + 1); } catch { /* leave null */ }
        }
      }
    } else if (scope === "board" && map.board) {
      map.board.end = i;
    }
  }

  return map;
}

// --- Serialization ---

function quoteStr(s) {
  return '"' + s.replace(/[\\"\u0000-\u001f]/g, (ch) => {
    if (ch === "\\") return "\\\\";
    if (ch === '"') return '\\"';
    if (ch === "\n") return "\\n";
    if (ch === "\t") return "\\t";
    if (ch === "\r") return "\\r";
    return "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase();
  }) + '"';
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
  if (conn.label_style && conn.label_style !== "staggered") lines.push(`label_style = ${quoteStr(conn.label_style)}`);
  if (conn.symbol) lines.push(`symbol = ${quoteStr(conn.symbol)}`);

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
  if (boardData.theme && boardData.theme !== "default") {
    lines.push(`theme = ${quoteStr(boardData.theme)}`);
  }
  if (boardData.theme_dir && boardData.theme_dir !== "./themes") {
    lines.push(`theme_dir = ${quoteStr(boardData.theme_dir)}`);
  }

  for (const conn of connectors) {
    lines.push("");
    lines.push(serializeConnectorBlock(conn));
  }

  return lines.join("\n") + "\n";
}

export function patchConnectorInSource(sourceText, range, newConn) {
  if (!range) return sourceText;
  const lines = sourceText.split("\n");
  const newLines = serializeConnectorBlock(newConn).split("\n");
  const before = lines.slice(0, range.start);
  const after = lines.slice(range.end + 1);
  return [...before, ...newLines, ...after].join("\n");
}
