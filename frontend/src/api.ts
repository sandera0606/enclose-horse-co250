// Typed fetch wrappers over the FastAPI backend (see backend/app.py).
// Cells are [row, col] on the wire; fractional LP vars are [row, col, value].

export type Cell = [number, number];
export type FracCell = [number, number, number]; // row, col, fractional value

export interface Puzzle {
  date: string;
  dayNumber: number | null;
  width: number;
  height: number;
  budget: number;
  optimalScore: number | null;
  hasBonus: boolean;
  bonusType: string | null;
  kind: string[][]; // legend chars: "." ~ H C G S ?
  horse: Cell;
  unknownChars: string[];
}

export interface Family {
  name: string;
  count: number;
  cells: Cell[];
}

export interface Solution {
  budget: number;
  ip: {
    status: string;
    score: number;
    walls: Cell[];
    region: Cell[];
    solveSeconds: number;
    solver: string;
  };
  lp: {
    status: string;
    ceiling: number;
    fracWalls: FracCell[];
    fracRegion: FracCell[];
    shadowPrice: number;
    solveSeconds: number;
    solver: string;
  };
  gap: number;
  isIntegral: boolean;
  families: Family[];
}

export interface SweepPoint {
  budget: number;
  ipScore: number;
  lpCeiling: number;
  shadowPrice: number;
}

export interface Sweep {
  budget: number;
  points: SweepPoint[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* body was not JSON */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export function getPuzzle(date: string): Promise<Puzzle> {
  return fetch(`/api/puzzle?date=${encodeURIComponent(date)}`).then((r) =>
    json<Puzzle>(r),
  );
}

export function solve(date: string): Promise<Solution> {
  return fetch("/api/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
  }).then((r) => json<Solution>(r));
}

export function getSweep(date: string): Promise<Sweep> {
  return fetch(`/api/sweep?date=${encodeURIComponent(date)}`).then((r) =>
    json<Sweep>(r),
  );
}
