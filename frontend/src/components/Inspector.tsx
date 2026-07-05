import type { Family } from "../api";

interface Props {
  families: Family[];
  onHover: (cells: Set<string> | null) => void;
}

// One line of plain-language intent per constraint family, so the inspector
// reads as "the formulation made visible" rather than a variable dump.
const BLURB: Record<string, string> = {
  budget: "Σ walls ≤ budget — the one row whose dual is the shadow price",
  fix_horse: "the horse tile is always in its own region",
  block_terrain: "water / out-of-scope tiles: permanent blockers, no vars",
  no_escape: "border cells can't be enclosed; a cell isn't both wall and region",
  closure: "the region swallows every open neighbour (forces interior skulls to count)",
  flow_capacity: "flow may only run between region cells (big-M capacity)",
  flow_conservation: "every region cell must trace a path back to the horse",
};

const key = (r: number, c: number) => `${r},${c}`;

/** Feature B — the constraint inspector: one row per constraint family with its
 *  count; hovering a row lifts the cells it references into highlighted state on
 *  the grid (shared state, handled by the parent via onHover). */
export default function Inspector({ families, onHover }: Props) {
  return (
    <div className="card">
      <h2>Constraint inspector</h2>
      <p className="hint">
        The MILP, grouped by constraint family. Hover a row to light up the cells
        it touches on the grid.
      </p>
      <div className="families" onMouseLeave={() => onHover(null)}>
        {families.map((f) => (
          <div
            key={f.name}
            className="family-row"
            onMouseEnter={() =>
              onHover(new Set(f.cells.map(([r, c]) => key(r, c))))
            }
          >
            <span className="dot" />
            <span className="fname">
              {f.name.replace(/_/g, " ")}
              <small>{BLURB[f.name] ?? ""}</small>
            </span>
            <span className="fcount">{f.count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
