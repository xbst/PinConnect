const SCALE = 3.0;

function f1(n) { return n.toFixed(1); }

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
          .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function rotateCW(dx, dy, deg) {
  const t = deg * Math.PI / 180;
  const c = Math.cos(t), s = Math.sin(t);
  return [dx * c - dy * s, dx * s + dy * c];
}

// Body path generators (all draw at 0 deg orientation)

function bodyPathLatch(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow);
  const H = geo.height;
  const wall = geo.wall;
  if (nPerRow < 2) {
    return `M 0,0 L ${f1(W)},0 L ${f1(W)},${f1(H)} L 0,${f1(H)} Z`;
  }
  const pxs = geo.pinCentersX(nPerRow);
  const fp = pxs[0], lp = pxs[pxs.length - 1];
  const ns1 = Math.max(0, fp - 2), ne1 = Math.min(W, fp + 4);
  const ns2 = Math.max(ne1, lp - 4), ne2 = Math.min(W, lp + 2);
  const hy = H - wall;
  if (ns2 <= ne1 + wall) {
    return (
      `M 0,0 L ${f1(W)},0 L ${f1(W)},${f1(H)} ` +
      `L ${f1(ne2)},${f1(H)} L ${f1(ne2)},${f1(hy)} ` +
      `L ${f1(ns1)},${f1(hy)} L ${f1(ns1)},${f1(H)} ` +
      `L 0,${f1(H)} Z`
    );
  }
  return (
    `M 0,0 L ${f1(W)},0 L ${f1(W)},${f1(H)} ` +
    `L ${f1(ne2)},${f1(H)} L ${f1(ne2)},${f1(hy)} ` +
    `L ${f1(ns2)},${f1(hy)} L ${f1(ns2)},${f1(H)} ` +
    `L ${f1(ne1)},${f1(H)} L ${f1(ne1)},${f1(hy)} ` +
    `L ${f1(ns1)},${f1(hy)} L ${f1(ns1)},${f1(H)} ` +
    `L 0,${f1(H)} Z`
  );
}

function bodyPathBox(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow);
  const H = geo.height;
  const r = Math.min(2.0, geo.wall);
  return (
    `M ${f1(r)},0 L ${f1(W - r)},0 A ${f1(r)},${f1(r)} 0 0 1 ${f1(W)},${f1(r)} ` +
    `L ${f1(W)},${f1(H - r)} A ${f1(r)},${f1(r)} 0 0 1 ${f1(W - r)},${f1(H)} ` +
    `L ${f1(r)},${f1(H)} A ${f1(r)},${f1(r)} 0 0 1 0,${f1(H - r)} ` +
    `L 0,${f1(r)} A ${f1(r)},${f1(r)} 0 0 1 ${f1(r)},0 Z`
  );
}

function bodyPathGrid(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow);
  const H = geo.height;
  const cx = W / 2;
  const key_h = 4.0, key_hw = 4.2;
  const kx1 = Math.max(0, cx - key_hw), kx2 = Math.min(W, cx + key_hw);
  const mb_top = key_h, mb_bot = H - 2.0;
  const nw = 3.2, ng = 1.6;
  const n1x1 = Math.max(0, cx - ng - nw), n1x2 = cx - ng;
  const n2x1 = cx + ng, n2x2 = Math.min(W, cx + ng + nw);
  return (
    `M 0,${f1(mb_top)} ` +
    `L ${f1(kx1)},${f1(mb_top)} L ${f1(kx1)},0 ` +
    `L ${f1(kx2)},0 L ${f1(kx2)},${f1(mb_top)} ` +
    `L ${f1(W)},${f1(mb_top)} L ${f1(W)},${f1(mb_bot)} ` +
    `L ${f1(n2x2)},${f1(mb_bot)} L ${f1(n2x2)},${f1(H)} ` +
    `L ${f1(n2x1)},${f1(H)} L ${f1(n2x1)},${f1(mb_bot)} ` +
    `L ${f1(n1x2)},${f1(mb_bot)} L ${f1(n1x2)},${f1(H)} ` +
    `L ${f1(n1x1)},${f1(H)} L ${f1(n1x1)},${f1(mb_bot)} ` +
    `L 0,${f1(mb_bot)} Z`
  );
}

function bodyPathButton(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow);
  const H = geo.height;
  const r = Math.min(1.0, Math.min(W, H) * 0.08);
  return (
    `M ${f1(r)},0 L ${f1(W - r)},0 A ${f1(r)},${f1(r)} 0 0 1 ${f1(W)},${f1(r)} ` +
    `L ${f1(W)},${f1(H - r)} A ${f1(r)},${f1(r)} 0 0 1 ${f1(W - r)},${f1(H)} ` +
    `L ${f1(r)},${f1(H)} A ${f1(r)},${f1(r)} 0 0 1 0,${f1(H - r)} ` +
    `L 0,${f1(r)} A ${f1(r)},${f1(r)} 0 0 1 ${f1(r)},0 Z`
  );
}

function bodyPathHeaderFemale(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow), H = geo.height;
  const chamfer = Math.min(geo.pin_pitch * 0.10, W / 4, H / 4);
  const notch = Math.min(geo.pin_pitch * 0.20, H / 3);
  const notchHalfWidth = geo.pin_pitch * 0.10;
  const points = [[0, chamfer], [chamfer, 0]];
  for (let slot = 1; slot < nPerRow; slot++) {
    const x = geo.padding_left + (slot - 0.5) * geo.pin_pitch;
    points.push([x - notchHalfWidth, 0], [x, notch], [x + notchHalfWidth, 0]);
  }
  points.push([W - chamfer, 0], [W, chamfer], [W, H - chamfer], [W - chamfer, H]);
  for (let slot = nPerRow - 1; slot > 0; slot--) {
    const x = geo.padding_left + (slot - 0.5) * geo.pin_pitch;
    points.push([x + notchHalfWidth, H], [x, H - notch], [x - notchHalfWidth, H]);
  }
  points.push([chamfer, H], [0, H - chamfer]);
  let d = `M ${f1(points[0][0])},${f1(points[0][1])}`;
  for (let i = 1; i < points.length; i++) d += ` L ${f1(points[i][0])},${f1(points[i][1])}`;
  return d + " Z";
}

function headerFemaleCavities(geo, nPerRow) {
  const cavity = geo.cavity_size > 0 ? geo.cavity_size : Math.min(geo.pin_pitch * 0.25, geo.height * 0.25);
  const half = cavity / 2;
  const fill = 'fill="var(--conn-cavity,#d0d0c8)"';
  const stk = 'stroke="var(--conn-stroke,#555)" stroke-width="0.7"';
  return geo.pinCentersX(nPerRow).map((px) =>
    `<rect x="${f1(px - half)}" y="${f1(geo.pin_cy - half)}" ` +
    `width="${f1(cavity)}" height="${f1(cavity)}" ${fill} ${stk}/>`
  ).join("\n");
}

function bodyPathScrewTerminal(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow), H = geo.height;
  const r = Math.min(geo.pin_pitch * 0.06, geo.wall, W / 4, H / 4);
  return (
    `M ${f1(r)},0 L ${f1(W - r)},0 A ${f1(r)},${f1(r)} 0 0 1 ${f1(W)},${f1(r)} ` +
    `L ${f1(W)},${f1(H - r)} A ${f1(r)},${f1(r)} 0 0 1 ${f1(W - r)},${f1(H)} ` +
    `L ${f1(r)},${f1(H)} A ${f1(r)},${f1(r)} 0 0 1 0,${f1(H - r)} ` +
    `L 0,${f1(r)} A ${f1(r)},${f1(r)} 0 0 1 ${f1(r)},0 Z`
  );
}

function screwTerminalCavities(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow), H = geo.height;
  const screwR = Math.min(geo.cavity_size > 0 ? geo.cavity_size / 2 : geo.pin_pitch * 0.40, geo.pin_pitch * 0.44);
  const fill = 'fill="var(--conn-cavity,#d0d0c8)"';
  const stk = 'stroke="var(--conn-stroke,#555)" stroke-width="0.7"';
  const parts = [];
  const edge = geo.pin_pitch * 0.06;
  const railInset = geo.pin_pitch * 0.08;
  const rearDepth = geo.pin_pitch * 0.64;
  const frontDepth = geo.pin_pitch * 0.61;

  parts.push(
    `<rect x="${f1(edge)}" y="${f1(edge)}" width="${f1(W - 2 * edge)}" ` +
    `height="${f1(rearDepth - edge)}" ` +
    `fill="var(--conn-stroke,#555)" fill-opacity="0.10" stroke="none"/>`
  );
  parts.push(
    `<rect x="${f1(edge)}" y="${f1(H - frontDepth)}" width="${f1(W - 2 * edge)}" ` +
    `height="${f1(frontDepth - edge)}" ` +
    `fill="var(--conn-stroke,#555)" fill-opacity="0.08" stroke="none"/>`
  );
  parts.push(
    `<path d="M ${f1(railInset)},${f1(rearDepth)} L ${f1(railInset)},${f1(railInset)} ` +
    `L ${f1(W - railInset)},${f1(railInset)} L ${f1(W - railInset)},${f1(rearDepth)}" ` +
    `fill="none" stroke="var(--conn-stroke,#555)" stroke-width="0.7" stroke-opacity="0.65"/>`
  );
  for (let slot = 1; slot < nPerRow; slot++) {
    const x = geo.padding_left + (slot - 0.5) * geo.pin_pitch;
    parts.push(
      `<line x1="${f1(x)}" y1="${f1(geo.pin_pitch * 0.10)}" ` +
      `x2="${f1(x)}" y2="${f1(H - geo.pin_pitch * 0.10)}" ` +
      `stroke="var(--conn-stroke,#555)" stroke-width="0.6" stroke-opacity="0.55"/>`
    );
  }

  for (const px of geo.pinCentersX(nPerRow)) {
    parts.push(
      `<circle cx="${f1(px)}" cy="${f1(geo.pin_cy)}" r="${f1(screwR + geo.pin_pitch * 0.07)}" ` +
      `fill="var(--conn-body,#e8e8e0)" ${stk}/>`
    );
    parts.push(`<circle cx="${f1(px)}" cy="${f1(geo.pin_cy)}" r="${f1(screwR)}" ${fill} ${stk}/>`);
    parts.push(
      `<line x1="${f1(px - screwR * 0.62)}" y1="${f1(geo.pin_cy)}" ` +
      `x2="${f1(px + screwR * 0.62)}" y2="${f1(geo.pin_cy)}" ` +
      `stroke="var(--conn-stroke,#555)" stroke-width="1.4" stroke-linecap="round"/>`
    );

    const mouthW = geo.pin_pitch * 0.55;
    const mouthH = geo.pin_pitch * 0.21;
    const mouthX = px - mouthW / 2;
    const mouthY = H - mouthH;
    parts.push(
      `<rect x="${f1(mouthX)}" y="${f1(mouthY)}" width="${f1(mouthW)}" height="${f1(mouthH)}" ` +
      `fill="var(--conn-stroke,#555)" stroke="var(--conn-stroke,#555)" stroke-width="0.7"/>`
    );
    const clampW = Math.min(geo.pin_pitch * 0.39 * geo.mating_pin_scale, mouthW * 0.88);
    const clampH = Math.min(geo.pin_pitch * 0.10 * geo.mating_pin_scale, mouthH * 0.78);
    parts.push(
      `<rect x="${f1(px - clampW / 2)}" y="${f1(mouthY + geo.pin_pitch * 0.01)}" ` +
      `width="${f1(clampW)}" height="${f1(clampH)}" ${fill}/>`
    );
  }
  return parts.join("\n");
}

function bodyPathOpenAir(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow), H = geo.height;
  return `M 0,0 L ${f1(W)},0 L ${f1(W)},${f1(H)} L 0,${f1(H)} Z`;
}

function openAirDetails(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow), H = geo.height, p = geo.pin_pitch;
  const screwR = Math.min(geo.cavity_size > 0 ? geo.cavity_size / 2 : p * 0.40, p * 0.42);
  const frameFill = 'fill="var(--conn-body,#e8e8e0)"';
  const metalFill = 'fill="var(--conn-cavity,#d0d0c8)"';
  const stk = 'stroke="var(--conn-stroke,#555)" stroke-width="0.7"';
  const parts = [];

  const railH = p * 0.11, sideW = p * 0.08;
  parts.push(`<rect x="0" y="0" width="${f1(W)}" height="${f1(railH)}" ${frameFill} ${stk}/>`);
  parts.push(`<rect x="0" y="${f1(H - railH)}" width="${f1(W)}" height="${f1(railH)}" ${frameFill} ${stk}/>`);
  parts.push(`<rect x="0" y="0" width="${f1(sideW)}" height="${f1(H)}" ${frameFill} ${stk}/>`);
  parts.push(`<rect x="${f1(W - sideW)}" y="0" width="${f1(sideW)}" height="${f1(H)}" ${frameFill} ${stk}/>`);

  for (let slot = 1; slot < nPerRow; slot++) {
    const x = geo.padding_left + (slot - 0.5) * p;
    parts.push(
      `<rect x="${f1(x - sideW / 2)}" y="0" width="${f1(sideW)}" height="${f1(H)}" ${frameFill} ${stk}/>`
    );
  }

  const cageW = p * 0.82, cageY = p * 0.23;
  const cageH = H - 2 * cageY;
  const clampW = p * 0.64, clampH = p * 0.10;
  for (const px of geo.pinCentersX(nPerRow)) {
    parts.push(
      `<rect x="${f1(px - cageW / 2)}" y="${f1(cageY)}" width="${f1(cageW)}" ` +
      `height="${f1(cageH)}" rx="${f1(p * 0.03)}" ${metalFill} ${stk}/>`
    );
    parts.push(
      `<rect x="${f1(px - clampW / 2)}" y="${f1(p * 0.20)}" width="${f1(clampW)}" ` +
      `height="${f1(clampH)}" ${frameFill} ${stk}/>`
    );
    parts.push(
      `<rect x="${f1(px - clampW / 2)}" y="${f1(H - p * 0.30)}" width="${f1(clampW)}" ` +
      `height="${f1(clampH)}" ${frameFill} ${stk}/>`
    );

    parts.push(`<circle cx="${f1(px)}" cy="${f1(geo.pin_cy)}" r="${f1(screwR)}" ${frameFill} ${stk}/>`);
    parts.push(
      `<circle cx="${f1(px)}" cy="${f1(geo.pin_cy)}" r="${f1(screwR * 0.73)}" ${metalFill} ${stk}/>`
    );
    const arm = screwR * 0.60;
    parts.push(
      `<path d="M ${f1(px - arm)},${f1(geo.pin_cy)} L ${f1(px + arm)},${f1(geo.pin_cy)} ` +
      `M ${f1(px)},${f1(geo.pin_cy - arm)} L ${f1(px)},${f1(geo.pin_cy + arm)}" ` +
      `stroke="var(--conn-stroke,#555)" stroke-width="${f1(p * 0.11)}" stroke-linecap="round"/>`
    );
    parts.push(
      `<circle cx="${f1(px)}" cy="${f1(geo.pin_cy)}" r="${f1(p * 0.09)}" ${frameFill} ${stk}/>`
    );
  }
  return parts.join("\n");
}

function buttonCavities(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow);
  const H = geo.height;
  const cx = W / 2;
  const cy = H / 2;
  const parts = [];
  const fill = 'fill="var(--conn-cavity,#d0d0c8)"';
  const stk = 'stroke="var(--conn-stroke,#555)" stroke-width="0.7"';

  const cr = Math.min(W, H) * 0.34;
  parts.push(
    `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(cr)}" ${fill} ${stk}/>`
  );

  const padW = Math.max(0.4, W * 0.016);
  const padH = H * 0.48;
  const padY = cy - padH / 2;
  const padOffset = W * 0.177;
  parts.push(
    `<rect x="${f1(padOffset - padW / 2)}" y="${f1(padY)}" ` +
    `width="${f1(padW)}" height="${f1(padH)}" ${fill} ${stk}/>`
  );
  parts.push(
    `<rect x="${f1(W - padOffset - padW / 2)}" y="${f1(padY)}" ` +
    `width="${f1(padW)}" height="${f1(padH)}" ${fill} ${stk}/>`
  );
  return parts.join("\n");
}

function bodyPathXt30(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow);
  const H = geo.height;
  const sx = W / 15.5;
  const sy = H / 5.2;
  const mb_l = Math.round(0.800 * sx * 10) / 10;
  const mb_r = Math.round(14.700 * sx * 10) / 10;
  const gt_t = Math.round((H - 2.900 * sy) * 10) / 10;
  const gt_b = Math.round((H - 2.300 * sy) * 10) / 10;
  return (
    `M ${f1(mb_l)},0 L ${f1(mb_r)},0 ` +
    `L ${f1(mb_r)},${f1(gt_t)} L ${f1(W)},${f1(gt_t)} ` +
    `L ${f1(W)},${f1(gt_b)} L ${f1(mb_r)},${f1(gt_b)} ` +
    `L ${f1(mb_r)},${f1(H)} L ${f1(mb_l)},${f1(H)} ` +
    `L ${f1(mb_l)},${f1(gt_b)} L 0,${f1(gt_b)} ` +
    `L 0,${f1(gt_t)} L ${f1(mb_l)},${f1(gt_t)} Z`
  );
}

function xt30Cavities(geo, nPerRow) {
  const W = geo.connectorWidth(nPerRow);
  const H = geo.height;
  const sx = W / 15.5;
  const sy = H / 5.2;
  const parts = [];
  const fill = 'fill="var(--conn-cavity,#d0d0c8)"';
  const stk = 'stroke="var(--conn-stroke,#555)" stroke-width="0.7"';

  const s_x1 = 1.900 * sx, s_x2 = 4.300 * sx;
  const s_y1 = H - 4.600 * sy, s_y2 = H - 0.600 * sy;
  parts.push(
    `<rect x="${f1(s_x1)}" y="${f1(s_y1)}" ` +
    `width="${f1(s_x2 - s_x1)}" height="${f1(s_y2 - s_y1)}" ` +
    `${fill} ${stk}/>`
  );

  function p(x, y) {
    return [Math.round(x * sx * 10) / 10, Math.round((H - y * sy) * 10) / 10];
  }

  const v = [
    p(5.100, 3.600), p(6.100, 4.600), p(9.700, 4.600),
    p(9.700, 4.250), p(10.500, 4.250), p(10.500, 4.600),
    p(14.100, 4.600), p(14.100, 0.600), p(6.100, 0.600),
    p(5.100, 1.600),
  ];
  let d = `M ${v[0][0]},${v[0][1]}`;
  for (let i = 1; i < v.length; i++) {
    d += ` L ${v[i][0]},${v[i][1]}`;
  }
  d += " Z";
  parts.push(`<path d="${d}" ${fill} ${stk} stroke-linejoin="round"/>`);
  return parts.join("\n");
}

export function renderConnectorSVG(connector, connType) {
  const geo = connType.geometry;
  const pins = connector.pins;
  const n = pins.length;
  const ori = connector.orientation % 360;

  const r1Global = [], r2Global = [];
  for (let i = 0; i < n; i++) {
    if (pins[i].row === 2) r2Global.push(i);
    else r1Global.push(i);
  }

  let nPerRow;
  if (geo.rows >= 2 && r2Global.length && geo.row2_pin_pitch_y > 0) {
    nPerRow = Math.max(r1Global.length, 1);
  } else if (geo.rows >= 2 && r2Global.length) {
    nPerRow = Math.max(r1Global.length, r2Global.length, 1);
  } else {
    nPerRow = n;
  }

  const pinMap = new Map();
  r1Global.forEach((gi, rowIdx) => pinMap.set(gi, [rowIdx, 1]));
  r2Global.forEach((gi, rowIdx) => pinMap.set(gi, [rowIdx, 2]));

  const pxs0 = geo.pinCentersX(nPerRow);
  const connW = geo.connectorWidth(nPerRow);
  const connH = geo.height;
  const cx0 = connW / 2, cy0 = connH / 2;

  let rotW, rotH;
  if (ori === 0 || ori === 180) { rotW = connW; rotH = connH; }
  else { rotW = connH; rotH = connW; }

  const sides = ["bottom", "left", "top", "right"];
  const r1Eff = sides[(sides.indexOf(geo.pinout_side) + Math.floor(ori / 90)) % 4];
  const r1Line = geo.line_length;
  let r2Eff, r2Line;
  if (r2Global.length && geo.rows >= 2) {
    r2Eff = sides[(sides.indexOf(geo.row2_pinout_side) + Math.floor(ori / 90)) % 4];
    r2Line = geo.row2_line_length;
  } else {
    r2Eff = r1Eff;
    r2Line = r1Line;
  }

  const margin = 5;
  const bodyStrokeW = 1.3;
  let maxName = 3;
  for (const p of pins) { if (p.name.length > maxName) maxName = p.name.length; }
  const charW = 0.6;
  let fontSize = 6.0;
  if (nPerRow > 1 && maxName > 0) {
    fontSize = Math.min(fontSize, geo.pin_pitch * 0.9 / (maxName * charW));
  }
  fontSize = Math.round(Math.max(3.5, fontSize) * 10) / 10;
  const textH = fontSize + 3;
  const maxTextW = maxName * fontSize * charW + 4;

  const effSides = new Set([r1Eff]);
  if (r2Global.length) effSides.add(r2Eff);
  const maxLine = Math.max(r1Line, r2Line);

  const pad = {};
  for (const s of sides) pad[s] = margin;
  for (const s of effSides) {
    pad[s] = maxLine + ((s === "bottom" || s === "top") ? textH : maxTextW);
  }

  const svgW = pad["left"] + rotW + pad["right"];
  const svgH = pad["top"] + rotH + pad["bottom"];
  const connCx = pad["left"] + rotW / 2;
  const connCy = pad["top"] + rotH / 2;

  const bodyTop = connCy - rotH / 2;
  const bodyBot = connCy + rotH / 2;
  const bodyLft = connCx - rotW / 2;
  const bodyRgt = connCx + rotW / 2;

  const pxW = Math.round(svgW * SCALE);
  const pxH = Math.round(svgH * SCALE);

  function pinPos(pinIdx) {
    const [rowSlot, rowNum] = pinMap.get(pinIdx);
    let px0, py0;
    if (rowNum === 2 && geo.row2_pin_pitch_y > 0) {
      const r2Pl = geo.row2_padding_left >= 0 ? geo.row2_padding_left : geo.padding_left;
      px0 = r2Pl;
      const nR2 = r2Global.length;
      py0 = geo.row2_pin_cy + (rowSlot - (nR2 - 1) / 2) * geo.row2_pin_pitch_y;
    } else {
      px0 = pxs0[rowSlot];
      py0 = rowNum !== 2 ? geo.pin_cy : geo.row2_pin_cy;
    }
    const dx = px0 - cx0, dy = py0 - cy0;
    const [rdx, rdy] = rotateCW(dx, dy, ori);
    return [connCx + rdx, connCy + rdy];
  }

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="0 0 ${f1(svgW)} ${f1(svgH)}" ` +
    `width="${pxW}" height="${pxH}" ` +
    `style="font-family:Roboto,sans-serif">`
  );

  // 1. Lines (lowest z)
  for (let i = 0; i < n; i++) {
    const [, rowNum] = pinMap.get(i);
    const eff = rowNum === 2 ? r2Eff : r1Eff;
    const ll = rowNum === 2 ? r2Line : r1Line;
    const [rpx, rpy] = pinPos(i);
    const col = pins[i].color;
    let lx2, ly2;
    if (eff === "bottom")     { lx2 = rpx; ly2 = bodyBot + ll; }
    else if (eff === "top")   { lx2 = rpx; ly2 = bodyTop - ll; }
    else if (eff === "right") { lx2 = bodyRgt + ll; ly2 = rpy; }
    else                      { lx2 = bodyLft - ll; ly2 = rpy; }
    parts.push(
      `<line x1="${f1(rpx)}" y1="${f1(rpy)}" ` +
      `x2="${f1(lx2)}" y2="${f1(ly2)}" ` +
      `stroke="${col}" stroke-width="1" stroke-opacity="0.65"/>`
    );
  }

  // 2. Body group (rotated)
  parts.push(
    `<g transform="translate(${f1(connCx)},${f1(connCy)}) ` +
    `rotate(${ori}) translate(${f1(-cx0)},${f1(-cy0)})">`
  );

  const style = connType.style;
  let pathD;
  if (style === "latch")      pathD = bodyPathLatch(geo, nPerRow);
  else if (style === "grid")  pathD = bodyPathGrid(geo, nPerRow);
  else if (style === "xt30")  pathD = bodyPathXt30(geo, nPerRow);
  else if (style === "header-female") pathD = bodyPathHeaderFemale(geo, nPerRow);
  else if (style === "screw-terminal") pathD = bodyPathScrewTerminal(geo, nPerRow);
  else if (style === "open-air") pathD = bodyPathOpenAir(geo, nPerRow);
  else if (style === "button") pathD = bodyPathButton(geo, nPerRow);
  else                        pathD = bodyPathBox(geo, nPerRow);

  parts.push(
    `<path d="${pathD}" ` +
    `fill="var(--conn-body,#e8e8e0)" stroke="var(--conn-stroke,#555)" ` +
    `stroke-width="${bodyStrokeW}" stroke-linejoin="round"/>`
  );

  // Inner cavities
  const w = geo.wall;
  if (style === "xt30") {
    parts.push(xt30Cavities(geo, nPerRow));
  } else if (style === "header-female") {
    parts.push(headerFemaleCavities(geo, nPerRow));
  } else if (style === "screw-terminal") {
    parts.push(screwTerminalCavities(geo, nPerRow));
  } else if (style === "open-air") {
    parts.push(openAirDetails(geo, nPerRow));
  } else if (style === "button") {
    parts.push(buttonCavities(geo, nPerRow));
  } else if (style === "grid" && geo.cavity_size > 0) {
    const half = geo.cavity_size / 2;
    const rowCys = [geo.pin_cy];
    if (geo.rows >= 2) rowCys.push(geo.row2_pin_cy);
    for (let slot = 0; slot < nPerRow; slot++) {
      const px = pxs0[slot];
      for (const rcy of rowCys) {
        parts.push(
          `<rect x="${f1(px - half)}" y="${f1(rcy - half)}" ` +
          `width="${f1(geo.cavity_size)}" height="${f1(geo.cavity_size)}" ` +
          `fill="var(--conn-cavity,#d0d0c8)" ` +
          `stroke="var(--conn-stroke,#555)" stroke-width="0.7"/>`
        );
      }
    }
  } else {
    const iw = connW - 2 * w, ih = connH - 2 * w;
    if (iw > 0 && ih > 0) {
      parts.push(
        `<rect x="${f1(w)}" y="${f1(w)}" width="${f1(iw)}" height="${f1(ih)}" ` +
        `fill="var(--conn-cavity,#d0d0c8)" ` +
        `stroke="var(--conn-stroke,#555)" stroke-width="0.7"/>`
      );
    }
  }

  parts.push("</g>");

  // 3. Pin circles + labels (top z)
  for (let i = 0; i < n; i++) {
    const [, rowNum] = pinMap.get(i);
    const eff = rowNum === 2 ? r2Eff : r1Eff;
    const ll = rowNum === 2 ? r2Line : r1Line;
    const [rpx, rpy] = pinPos(i);
    const col = pins[i].color;
    const name = escapeHtml(pins[i].name);

    const pr = (rowNum === 2 && geo.row2_pin_radius >= 0) ? geo.row2_pin_radius : geo.pin_radius;
    parts.push(
      `<circle cx="${f1(rpx)}" cy="${f1(rpy)}" r="${f1(pr)}" ` +
      `fill="${col}" stroke="var(--conn-stroke,#555)" stroke-width="0.9"/>`
    );

    let tx, ty, ta, tb;
    if (eff === "bottom") {
      tx = rpx; ty = bodyBot + ll + textH - 2; ta = "middle"; tb = "auto";
    } else if (eff === "top") {
      tx = rpx; ty = bodyTop - ll - 3; ta = "middle"; tb = "auto";
    } else if (eff === "right") {
      tx = bodyRgt + ll + 3; ty = rpy; ta = "start"; tb = "central";
    } else {
      tx = bodyLft - ll - 3; ty = rpy; ta = "end"; tb = "central";
    }

    parts.push(
      `<text x="${f1(tx)}" y="${f1(ty)}" font-size="${fontSize}" font-weight="500" ` +
      `text-anchor="${ta}" dominant-baseline="${tb}" ` +
      `fill="var(--label-color,#333)">${name}</text>`
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}
