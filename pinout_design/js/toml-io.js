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
    return val.slice(1, end).replace(/\\(u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)/g, (m, esc) => {
      if (esc === "n") return "\n";
      if (esc === "t") return "\t";
      if (esc === "r") return "\r";
      if (esc === "b") return "\b";
      if (esc === "f") return "\f";
      if (esc === '"' || esc === "\\") return esc;
      if (esc[0] === "u" || esc[0] === "U") {
        const point = parseInt(esc.slice(1), 16);
        if (!Number.isFinite(point) || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
          throw new TomlParseError("Invalid Unicode escape", lineNum);
        }
        return String.fromCodePoint(point);
      }
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
  const ranges = buildSourceMap(text).connectors;
  const seenIds = new Set();
  for (const [index, conn] of (raw.connector || []).entries()) {
    const line = (ranges[index]?.start ?? 0) + 1;
    if (typeof conn.id !== "string" || conn.id.length === 0) {
      throw new TomlParseError("Each connector needs a nonempty string id", line);
    }
    if (seenIds.has(conn.id)) throw new TomlParseError(`Duplicate connector id: ${conn.id}`, line);
    seenIds.add(conn.id);
    if (conn.symbol !== undefined && typeof conn.symbol !== "string") {
      throw new TomlParseError("Connector symbol must be a string", line);
    }
  }
  const board = boardFields(b);
  const connectors = (raw.connector || []).map(c => ({
    ...connectorFields(c),
    pins: (c.pin || []).map(pinFields),
  }));

  return { board, connectors };
}

// The model's reading of the board, a connector, or a pin table. Patches
// compare through these too, so a line is only rewritten when the model sees a
// different value.
function boardFields(b) {
  // Use ?? (not ||) for fields with a non-empty default, so an explicit empty
  // string the user typed (e.g. title = "") survives the round-trip instead of
  // being silently replaced by the default.
  return {
    title: b.title ?? "Pinout",
    image: b.image ?? "",
    width: b.width || 0,
    height: b.height || 0,
    connector_dir: b.connector_dir ?? "./connectors",
    theme: b.theme ?? "default",
    theme_dir: b.theme_dir ?? "./themes",
  };
}

function connectorFields(c) {
  return {
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
  };
}

function pinFields(p) {
  return {
    name: p.name || "",
    color: p.color || "#888888",
    row: p.row || 1,
  };
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

    if (/^\[\s*board\s*\]$/.test(trimmed)) {
      map.board = { start: i, end: i };
      scope = "board"; currentConn = null; currentPin = null;
      continue;
    }
    if (/^\[\[\s*connector\s*\]\]$/.test(trimmed)) {
      // fieldsEnd bounds the connector's own keys, which patches edit in place;
      // blockEnd also covers its pins and opaque subtables, which move with it.
      currentConn = { start: i, blockEnd: i, fieldsEnd: i, id: null, pins: [] };
      currentPin = null; scope = "connector";
      map.connectors.push(currentConn);
      continue;
    }
    if (/^\[\[\s*connector\s*\.\s*pin\s*\]\]$/.test(trimmed)) {
      currentPin = { start: i, end: i, blockEnd: i };
      scope = "pin";
      if (currentConn) {
        currentConn.pins.push(currentPin);
        currentConn.blockEnd = i;
      }
      continue;
    }
    if (trimmed.startsWith("[")) {
      // A pin's own subtables likewise move and delete with that pin.
      if (currentConn && currentPin && /^\[\[?\s*connector\s*\.\s*pin\s*\./.test(trimmed)) {
        currentPin.blockEnd = i;
        currentConn.blockEnd = i;
        scope = "pin-descendant";
        continue;
      }
      // Unknown descendant tables still belong to their connector. The
      // designer does not edit them, but moving/copying/removing only their
      // parent would orphan them or attach them to a different connector.
      if (currentConn && /^\[\[?\s*connector\s*\./.test(trimmed)) {
        currentConn.blockEnd = i;
        scope = "descendant"; currentPin = null;
        continue;
      }
      // An unrelated table closes the current connector or board block.
      scope = null; currentConn = null; currentPin = null;
      continue;
    }

    // A key = value content line extends only the innermost open block.
    if (scope === "pin" && currentPin) {
      currentPin.end = i;
      currentPin.blockEnd = i;
      if (currentConn) currentConn.blockEnd = i;
    } else if (scope === "connector" && currentConn) {
      currentConn.blockEnd = i;
      currentConn.fieldsEnd = i;
      if (currentConn.id === null) {
        const m = trimmed.match(/^id\s*=\s*(.+)$/);
        if (m) {
          try { currentConn.id = parseTomlValue(m[1].trim(), i + 1); } catch { /* leave null */ }
        }
      }
    } else if (scope === "pin-descendant" && currentPin) {
      currentPin.blockEnd = i;
      currentConn.blockEnd = i;
    } else if (scope === "descendant" && currentConn) {
      currentConn.blockEnd = i;
    } else if (scope === "board" && map.board) {
      map.board.end = i;
    }
  }

  // A comment separator introduces the following connector or pin. Include
  // that leading whitespace/comment run when moving, copying or deleting,
  // while keeping start at the actual header for field patches. Footer
  // comments stay at the end of the document instead of joining the last pin.
  const introduction = start => {
    while (start > 0 && !stripComment(lines[start - 1]).trim()) start--;
    return start;
  };
  for (const conn of map.connectors) {
    conn.blockStart = introduction(conn.start);
    for (const pin of conn.pins) pin.blockStart = introduction(pin.start);
  }
  return map;
}

// Keep line terminators separate from content. A last block without a final
// newline gains a normal separator when moved into the middle, while the new
// final line retains the document's original end-of-file convention.
function sourceLines(text) {
  const parts = text.split(/(\r?\n)/);
  const lines = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (i === parts.length - 1 && parts[i] === "") break;
    lines.push({ text: parts[i], ending: parts[i + 1] || "" });
  }
  return lines;
}

function joinSourceLines(lines, original) {
  const separator = original.match(/\r?\n/)?.[0] || "\n";
  const finalEnding = original.match(/\r?\n$/)?.[0] || "";
  return lines.map((line, i) => line.text + (i === lines.length - 1
    ? finalEnding : line.ending || separator)).join("");
}

function lineContents(lines) { return lines.map(line => line.text).join("\n"); }

// Move complete line ranges, including nested pin tables and leading comments.
// Rebuild after removal: the destination's line numbers have now changed.
export function moveConnectorBlock(sourceText, fromIndex, toIndex) {
  const map = buildSourceMap(sourceText);
  const count = map.connectors.length;
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) ||
      fromIndex < 0 || fromIndex >= count || toIndex < 0 || toIndex >= count || fromIndex === toIndex) return sourceText;
  const lines = sourceLines(sourceText);
  const range = map.connectors[fromIndex];
  const block = lines.splice(range.blockStart, range.blockEnd - range.blockStart + 1);
  const remaining = buildSourceMap(lineContents(lines)).connectors;
  const insertion = toIndex < remaining.length
    ? remaining[toIndex].blockStart
    : remaining[remaining.length - 1].blockEnd + 1;
  lines.splice(insertion, 0, ...block);
  return joinSourceLines(lines, sourceText);
}

// Rewrite the key lines of one table in place, from its header line to its
// last key line. The keys managed are those read() knows and data carries. A
// value is rewritten only when the model reads it differently, so notation,
// quoting, spacing and inline comments survive. A missing key is added after
// the last one, unless it holds the default.
function patchKeyLines(lines, header, last, data, read, separator) {
  const defaults = read({});
  const values = new Map(Object.keys(defaults).filter(key => key in data).map(key => [key, data[key]]));
  const seen = new Set();
  const valueText = value => typeof value === "string" ? quoteStr(value) : String(value);
  let indent = lines[header].text.match(/^\s*/)[0];
  for (let i = header + 1; i <= last; i++) {
    const code = stripComment(lines[i].text);
    const match = code.match(/^(\s*([A-Za-z0-9_.-]+)\s*=\s*)(.*?)(\s*)$/);
    if (!match || !values.has(match[2])) continue;
    const key = match[2], value = values.get(key);
    seen.add(key);
    indent = match[1].match(/^\s*/)[0];
    try { if (read({ [key]: parseTomlValue(match[3], i + 1) })[key] === value) continue; } catch { /* replace below */ }
    const formatted = typeof value === "string" && match[3].startsWith("'") && !/['\u0000-\u001f]/.test(value)
      ? `'${value}'` : valueText(value);
    lines[i].text = match[1] + formatted + match[4] + lines[i].text.slice(code.length);
  }
  const missing = [...values].filter(([key, value]) => !seen.has(key) && value !== defaults[key])
    .map(([key, value]) => ({ text: `${indent}${key} = ${valueText(value)}`, ending: separator }));
  lines.splice(last + 1, 0, ...missing);
}

// Bring one connector's lines in step with the model, bottom up so earlier
// line numbers stay valid. Only the keys conn carries are managed. Pins match
// by position, so a reordered or deleted pin must be moved or removed as a
// block first (movePinBlock, removePinBlock) for its comments to follow it.
function patchConnectorLines(lines, range, conn, separator) {
  if (Array.isArray(conn.pins)) {
    const pins = range.pins;
    if (conn.pins.length > pins.length) {
      const at = pins.length ? pins[pins.length - 1].blockEnd + 1 : range.fieldsEnd + 1;
      lines.splice(at, 0, ...conn.pins.slice(pins.length).flatMap(pin => serializePinLines(pin))
        .map(text => ({ text, ending: separator })));
    }
    // Surplus pins remain only if no removePinBlock came first; drop them
    // from the end so the text and the model still agree.
    for (let i = pins.length - 1; i >= conn.pins.length; i--) {
      lines.splice(pins[i].blockStart, pins[i].blockEnd - pins[i].blockStart + 1);
    }
    for (let i = Math.min(pins.length, conn.pins.length) - 1; i >= 0; i--) {
      patchKeyLines(lines, pins[i].start, pins[i].end, conn.pins[i], pinFields, separator);
    }
  }
  patchKeyLines(lines, range.start, range.fieldsEnd, conn, connectorFields, separator);
}

// A copy keeps the original's indentation, spacing, inline comments, and every
// per-pin line; only its identity and displaced bounds differ.
function patchCopiedConnector(block, conn, separator) {
  const lines = block.map(line => ({ ...line }));
  patchConnectorLines(lines, buildSourceMap(lineContents(lines)).connectors[0], conn, separator);
  return lines;
}

export function duplicateConnectorBlock(sourceText, sourceIndex, newConn) {
  const map = buildSourceMap(sourceText);
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= map.connectors.length) return sourceText;
  const range = map.connectors[sourceIndex];
  const lines = sourceLines(sourceText);
  const original = lines.slice(range.blockStart, range.blockEnd + 1);
  const separator = sourceText.match(/\r?\n/)?.[0] || "\n";
  const copy = patchCopiedConnector(original, newConn, separator);
  lines.splice(range.blockEnd + 1, 0, ...copy);
  return joinSourceLines(lines, sourceText);
}

export function removeConnectorBlock(sourceText, range) {
  if (!range) return sourceText;
  const lines = sourceLines(sourceText);
  lines.splice(range.blockStart, range.blockEnd - range.blockStart + 1);
  return joinSourceLines(lines, sourceText);
}

// Pins follow the connector rules within their connector's range: a pin's
// lines take the comments introducing it and its own subtables along, and
// toIndex is the pin's final index.
export function movePinBlock(sourceText, range, fromIndex, toIndex) {
  const count = range ? range.pins.length : 0;
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) ||
      fromIndex < 0 || fromIndex >= count || toIndex < 0 || toIndex >= count || fromIndex === toIndex) return sourceText;
  const lines = sourceLines(sourceText);
  const pin = range.pins[fromIndex];
  const block = lines.splice(pin.blockStart, pin.blockEnd - pin.blockStart + 1);
  // The header sits above every pin, so its line number survives the removal.
  const remaining = buildSourceMap(lineContents(lines)).connectors.find(c => c.start === range.start)?.pins;
  if (!remaining?.length) return sourceText;
  const insertion = toIndex < remaining.length
    ? remaining[toIndex].blockStart
    : remaining[remaining.length - 1].blockEnd + 1;
  lines.splice(insertion, 0, ...block);
  return joinSourceLines(lines, sourceText);
}

export function removePinBlock(sourceText, range, pinIndex) {
  const pin = range?.pins[pinIndex];
  if (!pin) return sourceText;
  const lines = sourceLines(sourceText);
  lines.splice(pin.blockStart, pin.blockEnd - pin.blockStart + 1);
  return joinSourceLines(lines, sourceText);
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

  for (const pin of conn.pins) lines.push(...serializePinLines(pin));

  return lines.join("\n");
}

function serializePinLines(pin) {
  const lines = ["", "  [[connector.pin]]", `  name = ${quoteStr(pin.name)}`];
  if (pin.color !== "#888888") lines.push(`  color = ${quoteStr(pin.color)}`);
  if (pin.row !== 1) lines.push(`  row = ${pin.row}`);
  return lines;
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

// Update a connector's lines in place rather than reserializing its block, so
// comments, formatting and unmanaged keys inside it survive every edit.
export function patchConnectorInSource(sourceText, range, newConn) {
  if (!range) return sourceText;
  const lines = sourceLines(sourceText);
  patchConnectorLines(lines, range, newConn, sourceText.match(/\r?\n/)?.[0] || "\n");
  return joinSourceLines(lines, sourceText);
}

// Update only the [board] table's key lines in place, as connector patches do,
// so comments, formatting, unknown keys, and every connector block survive. A
// missing key is added only when it is not at its default, so a minimal board
// stays minimal.
export function patchBoardInSource(sourceText, range, boardData) {
  if (!range) return sourceText;
  const lines = sourceLines(sourceText);
  patchKeyLines(lines, range.start, range.end, boardData, boardFields, sourceText.match(/\r?\n/)?.[0] || "\n");
  return joinSourceLines(lines, sourceText);
}
