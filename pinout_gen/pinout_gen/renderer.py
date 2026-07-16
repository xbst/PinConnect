"""SVG and HTML generation for interactive pinout diagrams."""
from __future__ import annotations

import html
import json
import math

from .config import Board, Connector, ConnectorGeometry, ConnectorType, Pin

SCALE = 3.0


def _rotate_cw(dx: float, dy: float, deg: int) -> tuple[float, float]:
    """Rotate offset (dx,dy) clockwise in screen space (SVG y-down)."""
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    return dx * c - dy * s, dx * s + dy * c


# ── Body path generators (all draw at 0° orientation) ────────────────

def _body_path_latch(geo: ConnectorGeometry, n_per_row: int) -> str:
    W = geo.connector_width(n_per_row)
    H = geo.height
    wall = geo.wall
    if n_per_row < 2:
        return f"M 0,0 L {W:.1f},0 L {W:.1f},{H:.1f} L 0,{H:.1f} Z"
    pxs = geo.pin_centers_x(n_per_row)
    fp, lp = pxs[0], pxs[-1]
    ns1 = max(0, fp - 2); ne1 = min(W, fp + 4)
    ns2 = max(ne1, lp - 4); ne2 = min(W, lp + 2)
    hy = H - wall
    if ns2 <= ne1 + wall:
        return (
            f"M 0,0 L {W:.1f},0 L {W:.1f},{H:.1f} "
            f"L {ne2:.1f},{H:.1f} L {ne2:.1f},{hy:.1f} "
            f"L {ns1:.1f},{hy:.1f} L {ns1:.1f},{H:.1f} "
            f"L 0,{H:.1f} Z"
        )
    return (
        f"M 0,0 L {W:.1f},0 L {W:.1f},{H:.1f} "
        f"L {ne2:.1f},{H:.1f} L {ne2:.1f},{hy:.1f} "
        f"L {ns2:.1f},{hy:.1f} L {ns2:.1f},{H:.1f} "
        f"L {ne1:.1f},{H:.1f} L {ne1:.1f},{hy:.1f} "
        f"L {ns1:.1f},{hy:.1f} L {ns1:.1f},{H:.1f} "
        f"L 0,{H:.1f} Z"
    )


def _body_path_box(geo: ConnectorGeometry, n_per_row: int) -> str:
    W = geo.connector_width(n_per_row)
    H = geo.height
    r = min(2.0, geo.wall)
    return (
        f"M {r:.1f},0 L {W-r:.1f},0 A {r:.1f},{r:.1f} 0 0 1 {W:.1f},{r:.1f} "
        f"L {W:.1f},{H-r:.1f} A {r:.1f},{r:.1f} 0 0 1 {W-r:.1f},{H:.1f} "
        f"L {r:.1f},{H:.1f} A {r:.1f},{r:.1f} 0 0 1 0,{H-r:.1f} "
        f"L 0,{r:.1f} A {r:.1f},{r:.1f} 0 0 1 {r:.1f},0 Z"
    )


def _body_path_grid(geo: ConnectorGeometry, n_per_row: int) -> str:
    W = geo.connector_width(n_per_row)
    H = geo.height
    cx = W / 2
    key_h = 4.0; key_hw = 4.2
    kx1 = max(0, cx - key_hw); kx2 = min(W, cx + key_hw)
    mb_top = key_h; mb_bot = H - 2.0
    nw = 3.2; ng = 1.6
    n1x1 = max(0, cx-ng-nw); n1x2 = cx-ng
    n2x1 = cx+ng; n2x2 = min(W, cx+ng+nw)
    return (
        f"M 0,{mb_top:.1f} "
        f"L {kx1:.1f},{mb_top:.1f} L {kx1:.1f},0 "
        f"L {kx2:.1f},0 L {kx2:.1f},{mb_top:.1f} "
        f"L {W:.1f},{mb_top:.1f} L {W:.1f},{mb_bot:.1f} "
        f"L {n2x2:.1f},{mb_bot:.1f} L {n2x2:.1f},{H:.1f} "
        f"L {n2x1:.1f},{H:.1f} L {n2x1:.1f},{mb_bot:.1f} "
        f"L {n1x2:.1f},{mb_bot:.1f} L {n1x2:.1f},{H:.1f} "
        f"L {n1x1:.1f},{H:.1f} L {n1x1:.1f},{mb_bot:.1f} "
        f"L 0,{mb_bot:.1f} Z"
    )


def _body_path_button(geo: ConnectorGeometry, n_per_row: int) -> str:
    W = geo.connector_width(n_per_row)
    H = geo.height
    r = min(1.0, min(W, H) * 0.08)
    return (
        f"M {r:.1f},0 L {W-r:.1f},0 A {r:.1f},{r:.1f} 0 0 1 {W:.1f},{r:.1f} "
        f"L {W:.1f},{H-r:.1f} A {r:.1f},{r:.1f} 0 0 1 {W-r:.1f},{H:.1f} "
        f"L {r:.1f},{H:.1f} A {r:.1f},{r:.1f} 0 0 1 0,{H-r:.1f} "
        f"L 0,{r:.1f} A {r:.1f},{r:.1f} 0 0 1 {r:.1f},0 Z"
    )


def _body_path_header_male(geo: ConnectorGeometry, n_per_row: int) -> str:
    """Male header housing with pitch-scaled chamfers and keyed joints."""
    W, H = geo.connector_width(n_per_row), geo.height
    chamfer = min(geo.pin_pitch * 0.10, W / 4, H / 4)
    notch = min(geo.pin_pitch * 0.20, H / 3)
    notch_half_width = geo.pin_pitch * 0.10
    points: list[tuple[float, float]] = [(0, chamfer), (chamfer, 0)]
    for slot in range(1, n_per_row):
        x = geo.padding_left + (slot - 0.5) * geo.pin_pitch
        points.extend([(x - notch_half_width, 0), (x, notch), (x + notch_half_width, 0)])
    points.extend([(W - chamfer, 0), (W, chamfer), (W, H - chamfer), (W - chamfer, H)])
    for slot in range(n_per_row - 1, 0, -1):
        x = geo.padding_left + (slot - 0.5) * geo.pin_pitch
        points.extend([(x + notch_half_width, H), (x, H - notch), (x - notch_half_width, H)])
    points.extend([(chamfer, H), (0, H - chamfer)])
    d = f"M {points[0][0]:.1f},{points[0][1]:.1f}"
    for x, y in points[1:]:
        d += f" L {x:.1f},{y:.1f}"
    return d + " Z"


def _header_male_cavities(geo: ConnectorGeometry, n_per_row: int) -> str:
    cavity = geo.cavity_size if geo.cavity_size > 0 else min(geo.pin_pitch * 0.25, geo.height * 0.25)
    half = cavity / 2
    fill = 'fill="var(--conn-cavity,#d0d0c8)"'
    stk = 'stroke="var(--conn-stroke,#555)" stroke-width="0.7"'
    return '\n'.join(
        f'<rect x="{px - half:.1f}" y="{geo.pin_cy - half:.1f}" '
        f'width="{cavity:.1f}" height="{cavity:.1f}" {fill} {stk}/>'
        for px in geo.pin_centers_x(n_per_row)
    )


def _body_path_screw_terminal(geo: ConnectorGeometry, n_per_row: int) -> str:
    """Compact screw-terminal housing with subtly radiused corners."""
    W, H = geo.connector_width(n_per_row), geo.height
    r = min(geo.pin_pitch * 0.06, geo.wall, W / 4, H / 4)
    return (
        f"M {r:.1f},0 L {W-r:.1f},0 A {r:.1f},{r:.1f} 0 0 1 {W:.1f},{r:.1f} "
        f"L {W:.1f},{H-r:.1f} A {r:.1f},{r:.1f} 0 0 1 {W-r:.1f},{H:.1f} "
        f"L {r:.1f},{H:.1f} A {r:.1f},{r:.1f} 0 0 1 0,{H-r:.1f} "
        f"L 0,{r:.1f} A {r:.1f},{r:.1f} 0 0 1 {r:.1f},0 Z"
    )


def _screw_terminal_cavities(geo: ConnectorGeometry, n_per_row: int) -> str:
    """Moulded sections, recessed slotted screws, and front wire entries."""
    W, H = geo.connector_width(n_per_row), geo.height
    screw_r = min((geo.cavity_size / 2 if geo.cavity_size > 0 else geo.pin_pitch * 0.40), geo.pin_pitch * 0.44)
    fill = 'fill="var(--conn-cavity,#d0d0c8)"'
    stk = 'stroke="var(--conn-stroke,#555)" stroke-width="0.7"'
    parts: list[str] = []
    edge = geo.pin_pitch * 0.06
    rail_inset = geo.pin_pitch * 0.08
    rear_depth = geo.pin_pitch * 0.64
    front_depth = geo.pin_pitch * 0.61

    # Broad rear/front moulded bands and cell dividers reproduce the modular
    # plastic housing seen from above.
    parts.append(
        f'<rect x="{edge:.1f}" y="{edge:.1f}" width="{W - 2 * edge:.1f}" '
        f'height="{rear_depth - edge:.1f}" '
        f'fill="var(--conn-stroke,#555)" fill-opacity="0.10" stroke="none"/>'
    )
    parts.append(
        f'<rect x="{edge:.1f}" y="{H - front_depth:.1f}" width="{W - 2 * edge:.1f}" '
        f'height="{front_depth - edge:.1f}" '
        f'fill="var(--conn-stroke,#555)" fill-opacity="0.08" stroke="none"/>'
    )
    parts.append(
        f'<path d="M {rail_inset:.1f},{rear_depth:.1f} L {rail_inset:.1f},{rail_inset:.1f} '
        f'L {W - rail_inset:.1f},{rail_inset:.1f} L {W - rail_inset:.1f},{rear_depth:.1f}" '
        f'fill="none" stroke="var(--conn-stroke,#555)" stroke-width="0.7" stroke-opacity="0.65"/>'
    )
    for slot in range(1, n_per_row):
        x = geo.padding_left + (slot - 0.5) * geo.pin_pitch
        parts.append(
            f'<line x1="{x:.1f}" y1="{geo.pin_pitch * 0.10:.1f}" '
            f'x2="{x:.1f}" y2="{H - geo.pin_pitch * 0.10:.1f}" '
            f'stroke="var(--conn-stroke,#555)" stroke-width="0.6" stroke-opacity="0.55"/>'
        )

    for px in geo.pin_centers_x(n_per_row):
        # Recess, metal screw head, and screwdriver slot.
        parts.append(
            f'<circle cx="{px:.1f}" cy="{geo.pin_cy:.1f}" r="{screw_r + geo.pin_pitch * 0.07:.1f}" '
            f'fill="var(--conn-body,#e8e8e0)" {stk}/>'
        )
        parts.append(f'<circle cx="{px:.1f}" cy="{geo.pin_cy:.1f}" r="{screw_r:.1f}" {fill} {stk}/>')
        parts.append(
            f'<line x1="{px - screw_r * 0.62:.1f}" y1="{geo.pin_cy:.1f}" '
            f'x2="{px + screw_r * 0.62:.1f}" y2="{geo.pin_cy:.1f}" '
            f'stroke="var(--conn-stroke,#555)" stroke-width="1.4" stroke-linecap="round"/>'
        )

        # Dark wire mouth with the metal clamp visible inside it.
        mouth_w = geo.pin_pitch * 0.55
        mouth_h = geo.pin_pitch * 0.21
        mouth_x = px - mouth_w / 2
        mouth_y = H - mouth_h
        parts.append(
            f'<rect x="{mouth_x:.1f}" y="{mouth_y:.1f}" width="{mouth_w:.1f}" height="{mouth_h:.1f}" '
            f'fill="var(--conn-stroke,#555)" stroke="var(--conn-stroke,#555)" stroke-width="0.7"/>'
        )
        clamp_w = min(geo.pin_pitch * 0.39 * geo.mating_pin_scale, mouth_w * 0.88)
        clamp_h = min(geo.pin_pitch * 0.10 * geo.mating_pin_scale, mouth_h * 0.78)
        parts.append(
            f'<rect x="{px - clamp_w / 2:.1f}" y="{mouth_y + geo.pin_pitch * 0.01:.1f}" '
            f'width="{clamp_w:.1f}" height="{clamp_h:.1f}" {fill}/>'
        )
    return '\n'.join(parts)


def _body_path_barrier(geo: ConnectorGeometry, n_per_row: int) -> str:
    """Rectangular outer frame for a barrier screw terminal strip."""
    W, H = geo.connector_width(n_per_row), geo.height
    return f"M 0,0 L {W:.1f},0 L {W:.1f},{H:.1f} L 0,{H:.1f} Z"


def _barrier_details(geo: ConnectorGeometry, n_per_row: int) -> str:
    """Metal cages, frame rails, and cross-drive screw heads."""
    W, H, p = geo.connector_width(n_per_row), geo.height, geo.pin_pitch
    screw_r = min(geo.cavity_size / 2 if geo.cavity_size > 0 else p * 0.40, p * 0.42)
    frame_fill = 'fill="var(--conn-body,#e8e8e0)"'
    metal_fill = 'fill="var(--conn-cavity,#d0d0c8)"'
    stk = 'stroke="var(--conn-stroke,#555)" stroke-width="0.7"'
    parts: list[str] = []

    rail_h, side_w = p * 0.11, p * 0.08
    parts.append(f'<rect x="0" y="0" width="{W:.1f}" height="{rail_h:.1f}" {frame_fill} {stk}/>')
    parts.append(f'<rect x="0" y="{H - rail_h:.1f}" width="{W:.1f}" height="{rail_h:.1f}" {frame_fill} {stk}/>')
    parts.append(f'<rect x="0" y="0" width="{side_w:.1f}" height="{H:.1f}" {frame_fill} {stk}/>')
    parts.append(f'<rect x="{W - side_w:.1f}" y="0" width="{side_w:.1f}" height="{H:.1f}" {frame_fill} {stk}/>')

    for slot in range(1, n_per_row):
        x = geo.padding_left + (slot - 0.5) * p
        parts.append(
            f'<rect x="{x - side_w / 2:.1f}" y="0" width="{side_w:.1f}" height="{H:.1f}" '
            f'{frame_fill} {stk}/>'
        )

    cage_w, cage_y = p * 0.82, p * 0.23
    cage_h = H - 2 * cage_y
    clamp_w, clamp_h = p * 0.64, p * 0.10
    for px in geo.pin_centers_x(n_per_row):
        parts.append(
            f'<rect x="{px - cage_w / 2:.1f}" y="{cage_y:.1f}" width="{cage_w:.1f}" '
            f'height="{cage_h:.1f}" rx="{p * 0.03:.1f}" {metal_fill} {stk}/>'
        )
        parts.append(
            f'<rect x="{px - clamp_w / 2:.1f}" y="{p * 0.20:.1f}" width="{clamp_w:.1f}" '
            f'height="{clamp_h:.1f}" {frame_fill} {stk}/>'
        )
        parts.append(
            f'<rect x="{px - clamp_w / 2:.1f}" y="{H - p * 0.30:.1f}" width="{clamp_w:.1f}" '
            f'height="{clamp_h:.1f}" {frame_fill} {stk}/>'
        )

        parts.append(f'<circle cx="{px:.1f}" cy="{geo.pin_cy:.1f}" r="{screw_r:.1f}" {frame_fill} {stk}/>')
        parts.append(
            f'<circle cx="{px:.1f}" cy="{geo.pin_cy:.1f}" r="{screw_r * 0.73:.1f}" '
            f'{metal_fill} {stk}/>'
        )
        arm = screw_r * 0.60
        parts.append(
            f'<path d="M {px - arm:.1f},{geo.pin_cy:.1f} L {px + arm:.1f},{geo.pin_cy:.1f} '
            f'M {px:.1f},{geo.pin_cy - arm:.1f} L {px:.1f},{geo.pin_cy + arm:.1f}" '
            f'stroke="var(--conn-stroke,#555)" stroke-width="{p * 0.11:.1f}" stroke-linecap="round"/>'
        )
        parts.append(
            f'<circle cx="{px:.1f}" cy="{geo.pin_cy:.1f}" r="{p * 0.09:.1f}" '
            f'{frame_fill} {stk}/>'
        )
    return '\n'.join(parts)


def _button_cavities(geo: ConnectorGeometry, n_per_row: int) -> str:
    W = geo.connector_width(n_per_row)
    H = geo.height
    cx, cy = W / 2, H / 2
    parts: list[str] = []
    fill = 'fill="var(--conn-cavity,#d0d0c8)"'
    stk = 'stroke="var(--conn-stroke,#555)" stroke-width="0.7"'

    cr = min(W, H) * 0.34
    parts.append(
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{cr:.1f}" {fill} {stk}/>'
    )

    pad_w = max(0.4, W * 0.016)
    pad_h = H * 0.48
    pad_y = cy - pad_h / 2
    pad_offset = W * 0.177
    parts.append(
        f'<rect x="{pad_offset - pad_w / 2:.1f}" y="{pad_y:.1f}" '
        f'width="{pad_w:.1f}" height="{pad_h:.1f}" {fill} {stk}/>'
    )
    parts.append(
        f'<rect x="{W - pad_offset - pad_w / 2:.1f}" y="{pad_y:.1f}" '
        f'width="{pad_w:.1f}" height="{pad_h:.1f}" {fill} {stk}/>'
    )
    return '\n'.join(parts)


def _body_path_xt30(geo: ConnectorGeometry, n_per_row: int) -> str:
    """XT30(2+2): rectangular body with centred guide tabs on left & right."""
    W = geo.connector_width(n_per_row)
    H = geo.height
    sx = W / 15.5
    sy = H / 5.2
    mb_l = round(0.800 * sx, 1)
    mb_r = round(14.700 * sx, 1)
    gt_t = round(H - 2.900 * sy, 1)
    gt_b = round(H - 2.300 * sy, 1)
    return (
        f"M {mb_l:.1f},0 L {mb_r:.1f},0 "
        f"L {mb_r:.1f},{gt_t:.1f} L {W:.1f},{gt_t:.1f} "
        f"L {W:.1f},{gt_b:.1f} L {mb_r:.1f},{gt_b:.1f} "
        f"L {mb_r:.1f},{H:.1f} L {mb_l:.1f},{H:.1f} "
        f"L {mb_l:.1f},{gt_b:.1f} L 0,{gt_b:.1f} "
        f"L 0,{gt_t:.1f} L {mb_l:.1f},{gt_t:.1f} Z"
    )


def _xt30_cavities(geo: ConnectorGeometry, n_per_row: int) -> str:
    """Generate SVG rects/paths for the signal and power cavities."""
    W = geo.connector_width(n_per_row)
    H = geo.height
    sx = W / 15.5
    sy = H / 5.2
    parts: list[str] = []
    fill = 'fill="var(--conn-cavity,#d0d0c8)"'
    stk = 'stroke="var(--conn-stroke,#555)" stroke-width="0.7"'

    s_x1 = 1.900 * sx; s_x2 = 4.300 * sx
    s_y1 = H - 4.600 * sy; s_y2 = H - 0.600 * sy
    parts.append(
        f'<rect x="{s_x1:.1f}" y="{s_y1:.1f}" '
        f'width="{s_x2 - s_x1:.1f}" height="{s_y2 - s_y1:.1f}" '
        f'{fill} {stk}/>'
    )

    def p(x, y):
        return round(x * sx, 1), round(H - y * sy, 1)

    v = [
        p(5.100, 3.600),
        p(6.100, 4.600),
        p(9.700, 4.600),
        p(9.700, 4.250),
        p(10.500, 4.250),
        p(10.500, 4.600),
        p(14.100, 4.600),
        p(14.100, 0.600),
        p(6.100, 0.600),
        p(5.100, 1.600),
    ]
    d = f'M {v[0][0]},{v[0][1]}'
    for vx, vy in v[1:]:
        d += f' L {vx},{vy}'
    d += ' Z'
    parts.append(f'<path d="{d}" {fill} {stk} stroke-linejoin="round"/>')
    return '\n'.join(parts)


# ── Render one connector's pinout SVG ────────────────────────────────

def render_connector_svg(connector: Connector, conn_type: ConnectorType) -> str:
    geo = conn_type.geometry
    pins = connector.pins
    n = len(pins)
    ori = connector.orientation % 360

    # ── Separate pins by row ──
    r1_global = [i for i in range(n) if pins[i].row != 2]
    r2_global = [i for i in range(n) if pins[i].row == 2]

    if geo.rows >= 2 and r2_global and geo.row2_pin_pitch_y > 0:
        n_per_row = max(len(r1_global), 1)
    elif geo.rows >= 2 and r2_global:
        n_per_row = max(len(r1_global), len(r2_global), 1)
    else:
        n_per_row = n

    pin_map: dict[int, tuple[int, int]] = {}
    for row_idx, gi in enumerate(r1_global):
        pin_map[gi] = (row_idx, 1)
    for row_idx, gi in enumerate(r2_global):
        pin_map[gi] = (row_idx, 2)

    # ── Connector dims at 0° ──
    pxs0 = geo.pin_centers_x(n_per_row)
    conn_w = geo.connector_width(n_per_row)
    conn_h = geo.height
    cx0, cy0 = conn_w / 2, conn_h / 2

    if ori in (0, 180):
        rot_w, rot_h = conn_w, conn_h
    else:
        rot_w, rot_h = conn_h, conn_w

    # ── Pin position helper ──
    def _pin_pos(pin_idx: int) -> tuple[float, float]:
        row_slot, row_num = pin_map[pin_idx]
        if row_num == 2 and geo.row2_pin_pitch_y > 0:
            r2_pl = geo.row2_padding_left if geo.row2_padding_left >= 0 else geo.padding_left
            px0 = r2_pl
            n_r2 = len(r2_global)
            py0 = geo.row2_pin_cy + (row_slot - (n_r2 - 1) / 2) * geo.row2_pin_pitch_y
        else:
            px0 = pxs0[row_slot]
            py0 = geo.pin_cy if row_num != 2 else geo.row2_pin_cy
        dx, dy = px0 - cx0, py0 - cy0
        rdx, rdy = _rotate_cw(dx, dy, ori)
        return conn_cx + rdx, conn_cy + rdy

    # ── Effective pinout directions ──
    sides = ["bottom", "left", "top", "right"]
    r1_eff = sides[(sides.index(geo.pinout_side) + ori // 90) % 4]
    r1_line = geo.line_length
    if r2_global and geo.rows >= 2:
        r2_eff = sides[(sides.index(geo.row2_pinout_side) + ori // 90) % 4]
        r2_line = geo.row2_line_length
    else:
        r2_eff, r2_line = r1_eff, r1_line

    # ── SVG layout ──
    margin = 5
    body_stroke_w = 1.3
    max_name = max((len(p.name) for p in pins), default=3)
    char_w = 0.6
    font_sz = 6.0
    text_h = font_sz + 3
    max_text_w = max_name * font_sz * char_w + 4

    side_counts = {s: 0 for s in sides}
    label_steps: dict[int, int] = {}
    label_style = connector.label_style
    for i in range(n):
        row_num = pin_map[i][1]
        eff = r2_eff if row_num == 2 else r1_eff
        if eff not in ("bottom", "top") or label_style == "flat":
            label_steps[i] = 0
        elif label_style == "staggered":
            label_steps[i] = side_counts[eff] % 2
        else:
            label_steps[i] = side_counts[eff]
        side_counts[eff] += 1

    pad = {s: margin for s in sides}
    for i in range(n):
        row_num = pin_map[i][1]
        eff = r2_eff if row_num == 2 else r1_eff
        ll = r2_line if row_num == 2 else r1_line
        label_extent = text_h if eff in ("bottom", "top") else max_text_w
        pad[eff] = max(pad[eff], ll + label_steps[i] * text_h + label_extent)

    svg_w = pad["left"] + rot_w + pad["right"]
    svg_h = pad["top"] + rot_h + pad["bottom"]
    conn_cx = pad["left"] + rot_w / 2
    conn_cy = pad["top"] + rot_h / 2

    body_top = conn_cy - rot_h / 2
    body_bot = conn_cy + rot_h / 2
    body_lft = conn_cx - rot_w / 2
    body_rgt = conn_cx + rot_w / 2

    px_w, px_h = round(svg_w * SCALE), round(svg_h * SCALE)

    parts: list[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {svg_w:.1f} {svg_h:.1f}" '
        f'width="{px_w}" height="{px_h}" '
        f'style="font-family:Roboto,sans-serif">'
    )

    # ── 1. Body group (rotated) ──
    parts.append(
        f'<g transform="translate({conn_cx:.1f},{conn_cy:.1f}) '
        f'rotate({ori}) translate({-cx0:.1f},{-cy0:.1f})">'
    )

    style = conn_type.style
    if style == "latch":
        path_d = _body_path_latch(geo, n_per_row)
    elif style == "grid":
        path_d = _body_path_grid(geo, n_per_row)
    elif style == "xt30":
        path_d = _body_path_xt30(geo, n_per_row)
    elif style == "header-male":
        path_d = _body_path_header_male(geo, n_per_row)
    elif style == "screw-terminal":
        path_d = _body_path_screw_terminal(geo, n_per_row)
    elif style == "barrier":
        path_d = _body_path_barrier(geo, n_per_row)
    elif style == "button":
        path_d = _body_path_button(geo, n_per_row)
    else:
        path_d = _body_path_box(geo, n_per_row)

    parts.append(
        f'<path d="{path_d}" '
        f'fill="var(--conn-body,#e8e8e0)" stroke="var(--conn-stroke,#555)" '
        f'stroke-width="{body_stroke_w}" stroke-linejoin="round"/>'
    )

    # Inner cavities
    w = geo.wall
    if style == "xt30":
        parts.append(_xt30_cavities(geo, n_per_row))
    elif style == "header-male":
        parts.append(_header_male_cavities(geo, n_per_row))
    elif style == "screw-terminal":
        parts.append(_screw_terminal_cavities(geo, n_per_row))
    elif style == "barrier":
        parts.append(_barrier_details(geo, n_per_row))
    elif style == "button":
        parts.append(_button_cavities(geo, n_per_row))
    elif style == "grid" and geo.cavity_size > 0:
        half = geo.cavity_size / 2
        row_cys = [geo.pin_cy]
        if geo.rows >= 2:
            row_cys.append(geo.row2_pin_cy)
        for slot in range(n_per_row):
            px = pxs0[slot]
            for rcy in row_cys:
                parts.append(
                    f'<rect x="{px - half:.1f}" y="{rcy - half:.1f}" '
                    f'width="{geo.cavity_size:.1f}" height="{geo.cavity_size:.1f}" '
                    f'fill="var(--conn-cavity,#d0d0c8)" '
                    f'stroke="var(--conn-stroke,#555)" stroke-width="0.7"/>'
                )
    else:
        iw, ih = conn_w - 2 * w, conn_h - 2 * w
        if iw > 0 and ih > 0:
            parts.append(
                f'<rect x="{w:.1f}" y="{w:.1f}" width="{iw:.1f}" height="{ih:.1f}" '
                f'fill="var(--conn-cavity,#d0d0c8)" '
                f'stroke="var(--conn-stroke,#555)" stroke-width="0.7"/>'
            )

    parts.append('</g>')

    # ── 2. Colored wires (over the connector body) ──
    for i in range(n):
        row_num = pin_map[i][1]
        eff = r2_eff if row_num == 2 else r1_eff
        ll = r2_line if row_num == 2 else r1_line
        stair_offset = label_steps[i] * text_h
        rpx, rpy = _pin_pos(i)
        col = pins[i].color
        if eff == "bottom":   lx2, ly2 = rpx, body_bot + ll + stair_offset
        elif eff == "top":    lx2, ly2 = rpx, body_top - ll - stair_offset
        elif eff == "right":  lx2, ly2 = body_rgt + ll + stair_offset, rpy
        else:                 lx2, ly2 = body_lft - ll - stair_offset, rpy
        parts.append(
            f'<line x1="{rpx:.1f}" y1="{rpy:.1f}" '
            f'x2="{lx2:.1f}" y2="{ly2:.1f}" '
            f'stroke="{col}" stroke-width="1" stroke-opacity="0.65"/>'
        )

    # ── 3. Pin circles + labels (top z) ──
    for i in range(n):
        row_num = pin_map[i][1]
        eff = r2_eff if row_num == 2 else r1_eff
        ll = r2_line if row_num == 2 else r1_line
        stair_offset = label_steps[i] * text_h
        rpx, rpy = _pin_pos(i)
        col = pins[i].color
        name = html.escape(pins[i].name)

        pr = geo.row2_pin_radius if (row_num == 2 and geo.row2_pin_radius >= 0) else geo.pin_radius
        marker_stroke_w = min(0.9, max(0.3, pr * 0.5))
        parts.append(
            f'<circle cx="{rpx:.1f}" cy="{rpy:.1f}" r="{pr:.1f}" '
            f'fill="{col}" stroke="var(--conn-stroke,#555)" stroke-width="{marker_stroke_w:.1f}"/>'
        )

        if eff == "bottom":
            tx, ty, ta, tb = rpx, body_bot + ll + stair_offset + text_h - 2, "middle", "auto"
        elif eff == "top":
            tx, ty, ta, tb = rpx, body_top - ll - stair_offset - 3, "middle", "auto"
        elif eff == "right":
            tx, ty, ta, tb = body_rgt + ll + stair_offset + 3, rpy, "start", "central"
        else:
            tx, ty, ta, tb = body_lft - ll - stair_offset - 3, rpy, "end", "central"

        parts.append(
            f'<text x="{tx:.1f}" y="{ty:.1f}" font-size="{font_sz}" font-weight="500" '
            f'text-anchor="{ta}" dominant-baseline="{tb}" '
            f'fill="var(--label-color,#333)">{name}</text>'
        )

    parts.append('</svg>')
    return '\n'.join(parts)


# ── Full HTML page ───────────────────────────────────────────────────

def generate_html(board: Board, connector_types: dict[str, ConnectorType], *,
                   image_data_uri: str | None = None) -> str:
    connector_data: dict[str, dict] = {}
    for conn in board.connectors:
        ct = connector_types[conn.type]
        svg = render_connector_svg(conn, ct)
        connector_data[conn.id] = {
            "name": conn.name, "svg": svg, "description": conn.description,
            "typeName": ct.name, "pinCount": len(conn.pins),
        }
    hotspot_rects: list[str] = []
    for conn in board.connectors:
        x, y = min(conn.x1, conn.x2), min(conn.y1, conn.y2)
        w, h = abs(conn.x2 - conn.x1), abs(conn.y2 - conn.y1)
        hotspot_rects.append(
            f'    <rect class="hs" data-id="{html.escape(conn.id)}" '
            f'x="{x}" y="{y}" width="{w}" height="{h}" rx="3"/>'
        )
    sidebar_items: list[str] = []
    for conn in board.connectors:
        ct = connector_types[conn.type]
        sidebar_items.append(
            f'    <div class="cl-i" data-id="{html.escape(conn.id)}">'
            f'<span class="cl-n">{html.escape(conn.name)}</span>'
            f'<span class="cl-t">{html.escape(ct.name)} &middot; '
            f'{len(conn.pins)}p</span></div>'
        )
    image_src = image_data_uri if image_data_uri is not None else board.image
    return _HTML_TEMPLATE.format(
        title=html.escape(board.title), image_path=image_src,
        img_w=board.width, img_h=board.height,
        hotspots='\n'.join(hotspot_rects),
        connector_list='\n'.join(sidebar_items),
        data=json.dumps(connector_data, ensure_ascii=False),
    )


_HTML_TEMPLATE = '''\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {{
  --bg:#ffffff; --text:#1a1a1a;
  --tip-bg:#ffffff; --tip-border:#d0d0d0; --tip-shadow:rgba(0,0,0,.12);
  --hs-hover:rgba(59,130,246,.13); --hs-stroke:rgba(59,130,246,.5);
  --hs-active:rgba(59,130,246,.22);
  --hint-bg:rgba(30,30,30,.75); --hint-text:#fff;
  --divider:#e5e5e5;
  --conn-body:#e8e8e0; --conn-cavity:#d0d0c8; --conn-stroke:#555;
  --line-color:#777; --label-color:#333;
  --desc-color:#555; --type-color:#888;
}}
@media(prefers-color-scheme:dark){{:root{{
  --bg:#131313; --text:#e0e0e0;
  --tip-bg:#1e1e1e; --tip-border:#3a3a3a; --tip-shadow:rgba(0,0,0,.4);
  --hs-hover:rgba(96,165,250,.15); --hs-stroke:rgba(96,165,250,.5);
  --hs-active:rgba(96,165,250,.25);
  --hint-bg:rgba(240,240,240,.85); --hint-text:#131313;
  --divider:#333;
  --conn-body:#3a3a35; --conn-cavity:#2e2e28; --conn-stroke:#aaa;
  --line-color:#888; --label-color:#ddd;
  --desc-color:#aaa; --type-color:#888;
}}}}
:root[data-theme="dark"]{{
  --bg:#131313; --text:#e0e0e0;
  --tip-bg:#1e1e1e; --tip-border:#3a3a3a; --tip-shadow:rgba(0,0,0,.4);
  --hs-hover:rgba(96,165,250,.15); --hs-stroke:rgba(96,165,250,.5);
  --hs-active:rgba(96,165,250,.25);
  --hint-bg:rgba(240,240,240,.85); --hint-text:#131313;
  --divider:#333;
  --conn-body:#3a3a35; --conn-cavity:#2e2e28; --conn-stroke:#aaa;
  --line-color:#888; --label-color:#ddd;
  --desc-color:#aaa; --type-color:#888;
}}
:root[data-theme="light"]{{
  --bg:#ffffff; --text:#1a1a1a;
  --tip-bg:#ffffff; --tip-border:#d0d0d0; --tip-shadow:rgba(0,0,0,.12);
  --hs-hover:rgba(59,130,246,.13); --hs-stroke:rgba(59,130,246,.5);
  --hs-active:rgba(59,130,246,.22);
  --hint-bg:rgba(30,30,30,.75); --hint-text:#fff;
  --divider:#e5e5e5;
  --conn-body:#e8e8e0; --conn-cavity:#d0d0c8; --conn-stroke:#555;
  --line-color:#777; --label-color:#333;
  --desc-color:#555; --type-color:#888;
}}
*,*::before,*::after{{margin:0;padding:0;box-sizing:border-box}}
html,body{{height:100%;background:var(--bg);color:var(--text);
  font-family:Roboto,system-ui,sans-serif}}
body{{display:flex;height:100%;overflow:hidden}}
.bd{{flex:1;display:flex;align-items:center;justify-content:center;
  min-width:0;height:100%;overflow:hidden;position:relative}}
.pw{{position:relative;display:inline-block;line-height:0;max-width:100%}}
.pw img{{display:block;width:auto;height:auto;max-width:100%;max-height:100vh;user-select:none;-webkit-user-drag:none}}
.po{{position:absolute;inset:0;width:100%;height:100%}}
.hs{{fill:transparent;stroke:transparent;stroke-width:2;cursor:pointer;transition:fill .18s,stroke .18s}}
.hs.pulse{{fill:var(--hs-hover);stroke:var(--hs-stroke)}}
@media(hover:hover){{.hs:hover{{fill:var(--hs-hover);stroke:var(--hs-stroke)}}}}
.hs.active{{fill:var(--hs-active);stroke:var(--hs-stroke)}}
.tt{{position:absolute;background:var(--tip-bg);border:1px solid var(--tip-border);
  border-radius:10px;padding:14px 16px;box-shadow:0 6px 20px var(--tip-shadow);
  z-index:1000;opacity:0;pointer-events:none;transition:opacity .15s ease;
  max-width:min(420px,calc(100vw - 12px));max-height:calc(100vh - 16px);
  overflow-y:auto;overscroll-behavior:contain;
  line-height:1.4;font-family:Roboto,sans-serif}}
.tt.vis{{opacity:1}}
.tt.pin{{pointer-events:auto}}
.tt-s svg{{max-width:100%;max-height:min(300px,55vh);width:auto;height:auto}}
.tt-h{{display:flex;justify-content:space-between;align-items:baseline;gap:12px;
  margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--divider)}}
.tt-n{{font-weight:600;font-size:14px;color:var(--text)}}
.tt-t{{font-size:11px;color:var(--type-color);white-space:nowrap}}
.tt-s{{display:flex;justify-content:center;padding:4px 0}}
.tt-d{{font-size:12.5px;color:var(--desc-color);margin-top:10px;padding-top:8px;
  border-top:1px solid var(--divider);line-height:1.5}}
.bb{{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);
  background:var(--tip-bg);color:var(--type-color);border:1px solid var(--tip-border);
  padding:7px 18px;border-radius:12px;font-size:12px;font-family:Roboto,sans-serif;
  box-shadow:0 2px 8px var(--tip-shadow);
  display:flex;align-items:center;gap:8px;white-space:nowrap}}
.bb a{{color:var(--text);text-decoration:none;font-weight:500}}
.bb a:hover{{text-decoration:underline}}
.sb-btn{{position:absolute;right:10px;top:10px;z-index:600;width:36px;height:36px;
  background:var(--tip-bg);border:1px solid var(--tip-border);border-radius:8px;
  cursor:pointer;box-shadow:0 2px 8px var(--tip-shadow);font-size:18px;
  color:var(--text);display:flex;align-items:center;justify-content:center;
  line-height:1;transition:background .15s;opacity:.85}}
.sb-btn:hover{{opacity:1;background:var(--hs-hover)}}
.sb{{width:240px;height:calc(100% - 16px);flex-shrink:0;overflow:hidden;
  background:var(--tip-bg);border:1px solid var(--tip-border);border-radius:12px;
  margin:8px 8px 8px 0;box-shadow:0 2px 8px var(--tip-shadow);
  transition:width .2s ease,margin .2s ease,opacity .2s ease,border-width .2s ease}}
.sb.hid{{width:0;margin-right:0;margin-left:0;opacity:0;border-width:0}}
.sb-in{{width:240px;height:100%;overflow-y:auto;padding:12px 0}}
.sb-t{{font-weight:600;font-size:13px;padding:0 14px 8px;
  border-bottom:1px solid var(--divider);margin-bottom:4px;color:var(--text)}}
.cl-i{{display:flex;justify-content:space-between;align-items:center;
  padding:8px 14px;cursor:pointer;transition:background .15s;gap:8px}}
.cl-i:hover,.cl-i.active{{background:var(--hs-hover)}}
.cl-n{{font-weight:500;font-size:13px}}
.cl-t{{font-size:11px;color:var(--type-color);white-space:nowrap}}
</style>
<script>
/* Theme sync: ?theme=dark|light forces a theme; otherwise follow the embedding
   page's toggle (MkDocs Material / Zensical set data-md-color-scheme on body,
   "slate" = dark) via same-origin parent access + MutationObserver, or a
   {{pinconnectTheme:"dark"|"light"}} postMessage for cross-origin embeds.
   With no signal, data-theme stays unset and prefers-color-scheme applies. */
(function(){{
  var root=document.documentElement;
  function apply(t){{
    if(t==='dark'||t==='light')root.setAttribute('data-theme',t);
    else root.removeAttribute('data-theme');
  }}
  window.addEventListener('message',function(e){{
    if(e.data&&typeof e.data==='object'&&'pinconnectTheme' in e.data)apply(e.data.pinconnectTheme);
  }});
  var forced=null;
  try{{forced=new URLSearchParams(location.search).get('theme')}}catch(err){{}}
  if(forced==='dark'||forced==='light'){{apply(forced);return}}
  function fromParent(){{
    try{{
      if(window.parent===window)return null;
      var pd=window.parent.document;
      var md=(pd.body&&pd.body.getAttribute('data-md-color-scheme'))||
             pd.documentElement.getAttribute('data-md-color-scheme');
      if(md)return md==='slate'?'dark':'light';
      var dt=pd.documentElement.getAttribute('data-theme')||
             (pd.body&&pd.body.getAttribute('data-theme'));
      if(dt==='dark'||dt==='light')return dt;
      if(pd.documentElement.classList.contains('dark')||
         (pd.body&&pd.body.classList.contains('dark')))return 'dark';
      return null;
    }}catch(err){{return null}}
  }}
  function sync(){{var t=fromParent();if(t)apply(t)}}
  sync();
  try{{
    if(window.parent!==window){{
      var pd=window.parent.document;
      var mo=new MutationObserver(sync);
      mo.observe(pd.documentElement,{{attributes:true}});
      if(pd.body)mo.observe(pd.body,{{attributes:true}});
    }}
  }}catch(err){{}}
}})();
</script>
</head>
<body>
<div class="bd">
  <div class="pw" id="pw">
    <img src="{image_path}" alt="{title}" width="{img_w}" height="{img_h}">
    <svg class="po" viewBox="0 0 {img_w} {img_h}" preserveAspectRatio="xMidYMid meet">
{hotspots}
    </svg>
    <div class="tt" id="tt"></div>
    <button class="sb-btn" id="sb-btn" title="Toggle connector list">&#9776;</button>
  </div>
  <div class="bb">
    <span>Click or tap a connector to see its pinout</span>
    <span>&middot;</span>
    <span>Created with <a href="https://github.com/xbst/PinConnect" target="_blank" rel="noopener">PinConnect</a></span>
  </div>
</div>
<div class="sb hid" id="sb">
  <div class="sb-in">
    <div class="sb-t">Connectors</div>
{connector_list}
  </div>
</div>
<script>
const C={data};
const pw=document.getElementById('pw'),tt=document.getElementById('tt'),
      sb=document.getElementById('sb'),sbBtn=document.getElementById('sb-btn');
let aId=null,pinned=false,isTouch=false;
document.addEventListener('touchstart',function(){{isTouch=true}},{{once:true,passive:true}});
sbBtn.addEventListener('click',e=>{{e.stopPropagation();sb.classList.toggle('hid');
  if(aId){{const el=hs(aId);if(el)setTimeout(()=>pos(el),0)}}}});
function hs(id){{return document.querySelector(`.hs[data-id="${{id}}"]`)}}
function li(id){{return document.querySelector(`.cl-i[data-id="${{id}}"]`)}}
function mark(id){{const h=hs(id),l=li(id);if(h)h.classList.add('active');if(l)l.classList.add('active')}}
function unmark(){{document.querySelectorAll('.hs.active,.cl-i.active').forEach(e=>e.classList.remove('active'))}}
function show(id,el){{
  const d=C[id]; if(!d) return;
  let dh=d.description?`<div class="tt-d">${{d.description}}</div>`:'';
  tt.innerHTML=`<div class="tt-h"><span class="tt-n">${{d.name}}</span>`+
    `<span class="tt-t">${{d.typeName}} · ${{d.pinCount}}-pin</span></div>`+
    `<div class="tt-s">${{d.svg}}</div>`+dh;
  pos(el); tt.classList.add('vis'); tt.classList.toggle('pin',pinned); aId=id;
}}
function hide(){{tt.classList.remove('vis','pin');unmark();aId=null;pinned=false}}
function pos(el){{
  tt.style.left='0';tt.style.top='0';tt.style.visibility='hidden';tt.classList.add('vis');
  const wr=pw.getBoundingClientRect(),tr=tt.getBoundingClientRect();
  const svg=el.ownerSVGElement,sr=svg.getBoundingClientRect(),vb=svg.viewBox.baseVal;
  const sx=sr.width/vb.width,sy=sr.height/vb.height;
  const hx=+el.getAttribute('x'),hy=+el.getAttribute('y'),
        hw=+el.getAttribute('width'),hh=+el.getAttribute('height');
  const pl=sr.left+hx*sx-wr.left,pt=sr.top+hy*sy-wr.top,
        pcx=pl+hw*sx/2,pb=pt+hh*sy;
  let l=pcx-tr.width/2,t=pb+10;
  if(t+tr.height>wr.height+20) t=pt-tr.height-10;
  if(t<0) t=10;
  l=Math.max(6,Math.min(l,wr.width-tr.width-6));
  tt.style.left=l+'px';tt.style.top=t+'px';tt.style.visibility='';
}}
document.querySelectorAll('.hs').forEach(el=>{{
  const id=el.dataset.id;
  el.addEventListener('mouseenter',()=>{{if(!isTouch&&!pinned){{mark(id);show(id,el)}}}});
  el.addEventListener('mouseleave',()=>{{if(!isTouch&&!pinned){{unmark();hide()}}}});
  el.addEventListener('click',e=>{{e.stopPropagation();if(pinned&&aId===id){{hide();return}}
    hide();pinned=true;mark(id);show(id,el)}});
}});
document.querySelectorAll('.cl-i').forEach(el=>{{
  const id=el.dataset.id;
  el.addEventListener('mouseenter',()=>{{if(!isTouch&&!pinned){{const h=hs(id);if(h){{mark(id);show(id,h)}}}}}});
  el.addEventListener('mouseleave',()=>{{if(!isTouch&&!pinned){{unmark();hide()}}}});
  el.addEventListener('click',e=>{{e.stopPropagation();const h=hs(id);if(!h)return;
    if(pinned&&aId===id){{hide();return}}hide();pinned=true;mark(id);show(id,h)}});
}});
document.addEventListener('click',e=>{{
  if(pinned&&!tt.contains(e.target)&&!e.target.closest('.cl-i')&&!e.target.closest('.hs'))hide();
}});
document.querySelectorAll('.hs').forEach(el=>{{el.classList.add('pulse');setTimeout(()=>el.classList.remove('pulse'),2000)}});
window.addEventListener('resize',()=>{{if(aId){{const el=hs(aId);if(el)pos(el)}}}});
</script>
</body>
</html>
'''
