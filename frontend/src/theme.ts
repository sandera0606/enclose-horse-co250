// Canvas palette, tuned to look like the actual Enclose Horse game (enclose.horse):
// a cozy top-down board — forest-green grass on a grid, the enclosed region drawn
// as a golden wheat field ringed by a dashed fence, walls as 3-D gray stone blocks,
// water as dark teal pools, plus a white horse, blue portal swirls, golden apples,
// cherries and bees. The DOM chrome reads CSS custom properties (styles.css); the
// <canvas> Grid can't, so the board colors live here as a resolved object.
//
// The game itself has a single fixed look, so the terrain colors are shared across
// light/dark; only the plane behind the board and the gridline contrast shift.

export interface CanvasTheme {
  page: string; // plane behind the grid

  grass: string; // plain, wall-placeable tile
  grassAlt: string; // faint checker for texture
  gridline: string; // hairline between grass cells

  water: string; // permanent blocker (impassable pool)
  waterDeep: string; // inner pool
  waterRim: string; // cyan highlight on the rim

  wheat: string; // enclosed-region fill (the golden field)
  wheatStraw: string; // darker vertical straw strokes
  wheatHi: string; // lighter straw highlights
  wheatSeed: string; // seed heads

  fence: string; // dashed border around the enclosed region

  stoneTop: string; // wall block — lit top strip
  stoneFace: string; // wall block — main face
  stoneShadow: string; // wall block — shaded bottom strip
  stoneStroke: string; // wall block — outline
  dropShadow: string; // soft shadow cast onto the grass (rgba)

  horse: string; // the creature — white
  horseShade: string; // subtle shading on the body
  horseOutline: string; // soft outline so it reads on grass
  horseMane: string; // mane / tail
  horseEye: string;

  portalRing: string; // portal swirl — outer
  portalArm: string; // portal swirl — inner arm
  portalCore: string; // portal swirl — bright core

  apple: string; // gem / golden apple (+10)
  appleHi: string;
  cherry: string; // cherry (+3)
  cherryHi: string;
  leaf: string; // shared leaf green for apple & cherry
  stem: string; // shared brown stem

  bee: string; // skull / bee-swarm (-5)
  beeStripe: string;
  beeWing: string;

  highlight: string; // inspector hover outline
  ink: string; // glyphs / fine detail
}

// Shared board colors — the game looks the same regardless of site theme.
const BOARD = {
  grass: "#3a7d44",
  grassAlt: "#387a42",
  water: "#15464e",
  waterDeep: "#0e343b",
  waterRim: "#4bb3c4",

  wheat: "#caa03f",
  wheatStraw: "#a9822c",
  wheatHi: "#e2c266",
  wheatSeed: "#8f6c22",

  fence: "#f4d64b",

  stoneTop: "#c2c2bd",
  stoneFace: "#9a9a95",
  stoneShadow: "#6d6d69",
  stoneStroke: "#3a3a38",

  horse: "#f7f7f2",
  horseShade: "#dcdcd3",
  horseOutline: "#9c9c93",
  horseMane: "#c9c9bf",
  horseEye: "#2a2a28",

  portalRing: "#2a4bd0",
  portalArm: "#5fb0ff",
  portalCore: "#dff0ff",

  apple: "#f0c53a",
  appleHi: "#fbe79a",
  cherry: "#d83a3a",
  cherryHi: "#f5a0a0",
  leaf: "#4fa84f",
  stem: "#6b4a24",

  bee: "#f2c53d",
  beeStripe: "#232019",
  beeWing: "rgba(255,255,255,0.82)",

  ink: "#20201d",
};

const LIGHT: CanvasTheme = {
  ...BOARD,
  page: "#2c5e37", // a slightly deeper grass frame around the board
  gridline: "rgba(0,0,0,0.13)",
  dropShadow: "rgba(0,0,0,0.28)",
  highlight: "#ff7a2f",
};

const DARK: CanvasTheme = {
  ...BOARD,
  page: "#1b3a22",
  gridline: "rgba(0,0,0,0.2)",
  dropShadow: "rgba(0,0,0,0.4)",
  highlight: "#ff8a3d",
};

export function canvasTheme(dark: boolean): CanvasTheme {
  return dark ? DARK : LIGHT;
}
