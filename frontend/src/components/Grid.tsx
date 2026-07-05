import { useEffect, useRef } from "react";
import type { Puzzle, Solution } from "../api";
import { canvasTheme, type CanvasTheme } from "../theme";

type View = "ip" | "lp";

interface Props {
  puzzle: Puzzle;
  solution: Solution | null;
  view: View;
  dark: boolean;
  highlight: Set<string>; // "r,c" keys the inspector is hovering
}

const key = (r: number, c: number) => `${r},${c}`;

/** The puzzle grid on a <canvas>, styled to look like the actual Enclose Horse
 *  board: grass on a grid, the enclosed region as a golden wheat field ringed by a
 *  dashed fence, walls as stone blocks, water as teal pools, and hand-drawn tokens
 *  for the horse, portals, apples, cherries and bees. The IP view draws the integral
 *  walls/region; the LP view renders the fractional relaxation as opacity. */
export default function Grid({ puzzle, solution, view, dark, highlight }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const t = canvasTheme(dark);
    const { width: W, height: H, kind } = puzzle;
    const cell = 34; // logical px per cell
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = W * cell * dpr;
    canvas.height = H * cell * dpr;
    canvas.style.aspectRatio = `${W} / ${H}`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W * cell, H * cell);

    const x = (c: number) => c * cell;
    const y = (r: number) => r * cell;

    // Region membership (as a set of "r,c" keys) + fractional value lookup, so we
    // can both fill wheat and trace the fence around the region's outer edge.
    const regionVal = new Map<string, number>();
    if (solution) {
      if (view === "ip")
        for (const [r, c] of solution.ip.region) regionVal.set(key(r, c), 1);
      else
        for (const [r, c, v] of solution.lp.fracRegion) regionVal.set(key(r, c), v);
    }
    const inRegion = (r: number, c: number) => regionVal.has(key(r, c));

    // 1) base terrain: grass (with a faint checker + gridlines) and water pools --
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = kind[r][c];
        if (ch === "~") {
          drawWater(ctx, x(c), y(r), cell, t);
        } else {
          // grass under everything else (specials/horse/portals sit on grass)
          ctx.fillStyle = (r + c) % 2 === 0 ? t.grass : t.grassAlt;
          ctx.fillRect(x(c), y(r), cell, cell);
        }
      }
    }

    // 2) gridlines over the grass (the game shows a subtle grid on the field) -----
    ctx.strokeStyle = t.gridline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= W; c++) {
      ctx.moveTo(x(c) + 0.5, 0);
      ctx.lineTo(x(c) + 0.5, H * cell);
    }
    for (let r = 0; r <= H; r++) {
      ctx.moveTo(0, y(r) + 0.5);
      ctx.lineTo(W * cell, y(r) + 0.5);
    }
    ctx.stroke();

    // 3) enclosed region: the golden wheat field (opacity = fractional value) ------
    for (const [k, v] of regionVal) {
      const [r, c] = k.split(",").map(Number);
      ctx.globalAlpha = view === "lp" ? Math.max(0.12, v) : 1;
      drawWheat(ctx, x(c), y(r), cell, t, r, c);
    }
    ctx.globalAlpha = 1;

    // 4) dashed fence around the region's outer boundary (integral view only) ------
    if (view === "ip" && regionVal.size) {
      ctx.strokeStyle = t.fence;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      for (const k of regionVal.keys()) {
        const [r, c] = k.split(",").map(Number);
        const L = x(c),
          R = x(c) + cell,
          T = y(r),
          B = y(r) + cell;
        if (!inRegion(r - 1, c)) (ctx.moveTo(L, T), ctx.lineTo(R, T)); // top
        if (!inRegion(r + 1, c)) (ctx.moveTo(L, B), ctx.lineTo(R, B)); // bottom
        if (!inRegion(r, c - 1)) (ctx.moveTo(L, T), ctx.lineTo(L, B)); // left
        if (!inRegion(r, c + 1)) (ctx.moveTo(R, T), ctx.lineTo(R, B)); // right
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 5) walls (the decision): 3-D stone blocks, opacity = fractional value --------
    if (solution) {
      if (view === "ip")
        for (const [r, c] of solution.ip.walls) drawStone(ctx, x(c), y(r), cell, t, 1);
      else
        for (const [r, c, v] of solution.lp.fracWalls)
          drawStone(ctx, x(c), y(r), cell, t, v);
    }

    // 6) tokens: horse, portals, apples, cherries, bees ---------------------------
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = kind[r][c];
        const cx = x(c) + cell / 2;
        const cy = y(r) + cell / 2;
        if (ch === "H") drawHorse(ctx, x(c), y(r), cell, t);
        else if (ch === "?") drawPortal(ctx, cx, cy, cell, t);
        else if (ch === "G") drawApple(ctx, cx, cy, cell, t);
        else if (ch === "C") drawCherry(ctx, cx, cy, cell, t);
        else if (ch === "S") drawBee(ctx, cx, cy, cell, t);
      }
    }

    // 7) inspector highlight outline (top layer) ----------------------------------
    if (highlight.size) {
      ctx.strokeStyle = t.highlight;
      ctx.lineWidth = 2.5;
      for (let r = 0; r < H; r++) {
        for (let c = 0; c < W; c++) {
          if (highlight.has(key(r, c))) {
            ctx.strokeRect(x(c) + 1.5, y(r) + 1.5, cell - 3, cell - 3);
          }
        }
      }
    }
  }, [puzzle, solution, view, dark, highlight]);

  return <canvas ref={ref} role="img" aria-label="Enclose Horse puzzle grid" />;
}

// --- terrain -----------------------------------------------------------------

function drawWater(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  t: CanvasTheme,
) {
  ctx.fillStyle = t.water;
  ctx.fillRect(px, py, cell, cell);
  // inset darker pool with a rounded lip
  const p = cell * 0.14;
  ctx.fillStyle = t.waterDeep;
  ctx.beginPath();
  ctx.roundRect(px + p, py + p, cell - 2 * p, cell - 2 * p, cell * 0.28);
  ctx.fill();
  // cyan highlight on the top-left rim
  ctx.strokeStyle = t.waterRim;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(
    px + cell / 2,
    py + cell / 2,
    cell * 0.3,
    Math.PI * 0.9,
    Math.PI * 1.7,
  );
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawWheat(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  t: CanvasTheme,
  r: number,
  c: number,
) {
  ctx.fillStyle = t.wheat;
  ctx.fillRect(px, py, cell, cell);
  // vertical straw texture — a few strokes, phase varied per cell so it's not a grid
  const cols = 4;
  const step = cell / cols;
  const phase = (r * 7 + c * 3) % 3;
  ctx.lineWidth = 1;
  for (let i = 0; i < cols; i++) {
    const sx = px + step * (i + 0.5);
    ctx.strokeStyle = (i + phase) % 2 === 0 ? t.wheatStraw : t.wheatHi;
    ctx.beginPath();
    ctx.moveTo(sx, py + cell * 0.16);
    ctx.lineTo(sx, py + cell * 0.9);
    ctx.stroke();
    // seed head dot near the top
    ctx.fillStyle = t.wheatSeed;
    ctx.fillRect(sx - 0.5, py + cell * 0.12, 1.5, 2.5);
  }
}

function drawStone(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  t: CanvasTheme,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const pad = cell * 0.1;
  const bx = px + pad;
  const by = py + pad;
  const bw = cell - 2 * pad;
  const bh = cell - 2 * pad;
  const rad = cell * 0.12;

  // soft dropped shadow onto the grass
  ctx.fillStyle = t.dropShadow;
  ctx.beginPath();
  ctx.roundRect(bx + 2, by + 3, bw, bh, rad);
  ctx.fill();

  // main face
  ctx.fillStyle = t.stoneFace;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, rad);
  ctx.fill();

  // lit top strip + shaded bottom strip for a blocky 3-D read
  ctx.fillStyle = t.stoneTop;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh * 0.34, rad);
  ctx.fill();
  ctx.fillStyle = t.stoneShadow;
  ctx.beginPath();
  ctx.roundRect(bx, by + bh * 0.68, bw, bh * 0.32, rad);
  ctx.fill();

  // outline
  ctx.strokeStyle = t.stoneStroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, rad);
  ctx.stroke();
  ctx.restore();
}

// --- tokens ------------------------------------------------------------------

/** Ground shadow shared by the standing sprites so they sit on the field. */
function groundShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  t: CanvasTheme,
) {
  ctx.fillStyle = t.dropShadow;
  ctx.beginPath();
  ctx.ellipse(cx, cy + cell * 0.34, cell * 0.3, cell * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A little white horse, side-on facing right — the star of the board. Drawn from
 *  unit-box geometry scaled to the cell so it stays crisp at any size. */
function drawHorse(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  t: CanvasTheme,
) {
  const s = cell;
  const X = (u: number) => px + u * s;
  const Y = (v: number) => py + v * s;
  const cx = px + s / 2;
  const cy = py + s / 2;
  groundShadow(ctx, cx, cy, cell, t);

  ctx.save();
  ctx.lineJoin = "round";
  const out = () => {
    ctx.strokeStyle = t.horseOutline;
    ctx.lineWidth = Math.max(1, s * 0.028);
  };

  // legs (drawn first, behind the body)
  ctx.fillStyle = t.horse;
  out();
  const leg = (lx: number) => {
    ctx.beginPath();
    ctx.roundRect(X(lx), Y(0.6), s * 0.07, s * 0.3, s * 0.03);
    ctx.fill();
    ctx.stroke();
  };
  leg(0.24);
  leg(0.35);
  leg(0.52);
  leg(0.63);

  // flowing tail off the hindquarters
  ctx.strokeStyle = t.horseMane;
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(X(0.2), Y(0.4));
  ctx.quadraticCurveTo(X(0.05), Y(0.52), X(0.1), Y(0.84));
  ctx.stroke();
  ctx.lineCap = "butt";

  // body barrel
  ctx.fillStyle = t.horse;
  out();
  ctx.beginPath();
  ctx.ellipse(X(0.44), Y(0.5), s * 0.26, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // neck (tapered, rising to the poll)
  ctx.beginPath();
  ctx.moveTo(X(0.54), Y(0.4));
  ctx.lineTo(X(0.64), Y(0.18));
  ctx.lineTo(X(0.75), Y(0.22));
  ctx.lineTo(X(0.68), Y(0.46));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // head — elongated muzzle, tilted down-right
  ctx.save();
  ctx.translate(X(0.79), Y(0.24));
  ctx.rotate(0.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.15, s * 0.072, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // ears
  ctx.beginPath();
  ctx.moveTo(X(0.65), Y(0.16));
  ctx.lineTo(X(0.67), Y(0.05));
  ctx.lineTo(X(0.73), Y(0.14));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // mane down the neck
  ctx.strokeStyle = t.horseMane;
  ctx.lineWidth = s * 0.055;
  ctx.beginPath();
  ctx.moveTo(X(0.63), Y(0.16));
  ctx.lineTo(X(0.71), Y(0.44));
  ctx.stroke();

  // eye
  ctx.fillStyle = t.horseEye;
  ctx.beginPath();
  ctx.arc(X(0.83), Y(0.2), s * 0.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Blue portal swirl for out-of-scope ("?") tiles — portals, in the real game. */
function drawPortal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  t: CanvasTheme,
) {
  const R = cell * 0.34;
  ctx.save();
  // dark disc
  ctx.fillStyle = t.portalRing;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  // two-armed spiral
  const spiral = (offset: number, color: string, w: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.beginPath();
    const turns = 2.4;
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const th = offset + (i / steps) * turns * Math.PI * 2;
      const rr = R * 0.92 * (1 - i / steps);
      const sx = cx + Math.cos(th) * rr;
      const sy = cy + Math.sin(th) * rr;
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  };
  spiral(0, t.portalArm, cell * 0.07);
  spiral(Math.PI, t.portalArm, cell * 0.05);
  // bright core
  ctx.fillStyle = t.portalCore;
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Golden apple — the +10 gem tile (a golden apple in the real game). */
function drawApple(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  t: CanvasTheme,
) {
  groundShadow(ctx, cx, cy, cell, t);
  const R = cell * 0.26;
  // stem + leaf
  ctx.strokeStyle = t.stem;
  ctx.lineWidth = cell * 0.04;
  ctx.beginPath();
  ctx.moveTo(cx, cy - R * 0.7);
  ctx.lineTo(cx, cy - R * 1.5);
  ctx.stroke();
  ctx.fillStyle = t.leaf;
  ctx.beginPath();
  ctx.ellipse(cx + R * 0.5, cy - R * 1.2, R * 0.5, R * 0.28, -0.6, 0, Math.PI * 2);
  ctx.fill();
  // body (two lobes)
  ctx.fillStyle = t.apple;
  ctx.beginPath();
  ctx.arc(cx - R * 0.42, cy, R * 0.78, 0, Math.PI * 2);
  ctx.arc(cx + R * 0.42, cy, R * 0.78, 0, Math.PI * 2);
  ctx.fill();
  // glint
  ctx.fillStyle = t.appleHi;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(cx - R * 0.35, cy - R * 0.3, R * 0.28, R * 0.16, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A pair of cherries — the +3 tile. */
function drawCherry(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  t: CanvasTheme,
) {
  groundShadow(ctx, cx, cy, cell, t);
  const R = cell * 0.15;
  const top = cy - cell * 0.24;
  // stems
  ctx.strokeStyle = t.stem;
  ctx.lineWidth = cell * 0.035;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.quadraticCurveTo(cx - cell * 0.02, cy - cell * 0.05, cx - cell * 0.16, cy + cell * 0.08);
  ctx.moveTo(cx, top);
  ctx.quadraticCurveTo(cx + cell * 0.06, cy - cell * 0.05, cx + cell * 0.16, cy + cell * 0.08);
  ctx.stroke();
  // leaf
  ctx.fillStyle = t.leaf;
  ctx.beginPath();
  ctx.ellipse(cx + cell * 0.08, top - cell * 0.02, cell * 0.11, cell * 0.05, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // berries
  const berry = (bx: number) => {
    ctx.fillStyle = t.cherry;
    ctx.beginPath();
    ctx.arc(bx, cy + cell * 0.1, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.cherryHi;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(bx - R * 0.3, cy + cell * 0.1 - R * 0.3, R * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  berry(cx - cell * 0.16);
  berry(cx + cell * 0.16);
}

/** A bee — the −5 skull / bee-swarm tile. */
function drawBee(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cell: number,
  t: CanvasTheme,
) {
  groundShadow(ctx, cx, cy, cell, t);
  const rx = cell * 0.2;
  const ry = cell * 0.15;
  // wings
  ctx.fillStyle = t.beeWing;
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.2, cy - ry * 1.1, rx * 0.5, ry * 0.5, -0.5, 0, Math.PI * 2);
  ctx.ellipse(cx + rx * 0.4, cy - ry * 1.1, rx * 0.5, ry * 0.5, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = t.bee;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // stripes
  ctx.fillStyle = t.beeStripe;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  for (const dx of [-rx * 0.3, rx * 0.35]) {
    ctx.fillRect(cx + dx, cy - ry, rx * 0.22, ry * 2);
  }
  // head
  ctx.fillRect(cx + rx * 0.7, cy - ry, rx * 0.5, ry * 2);
  ctx.restore();
}
