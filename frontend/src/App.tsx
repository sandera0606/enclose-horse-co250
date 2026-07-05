import { useEffect, useMemo, useState } from "react";
import {
  getPuzzle,
  solve as solveApi,
  getSweep,
  type Puzzle,
  type Solution,
  type Sweep,
} from "./api";
import Grid from "./components/Grid";
import Inspector from "./components/Inspector";
import DualityChart from "./components/DualityChart";
import GapPanel from "./components/GapPanel";

type View = "ip" | "lp";

// The gate days (all hasBonus:false, known optimalScore) plus the live day. The
// backend still accepts any YYYY-MM-DD via the API.
const DATES = [
  { value: "today", label: "Today (live)" },
  { value: "2026-07-03", label: "Jul 3 — open grid (43)" },
  { value: "2026-06-30", label: "Jun 30 — plain (101)" },
  { value: "2026-06-27", label: "Jun 27 — cherries/gems/skulls (76)" },
];

function useTheme() {
  const [dark, setDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

export default function App() {
  const { dark, toggle } = useTheme();
  const [date, setDate] = useState("2026-06-27");
  const [view, setView] = useState<View>("ip");
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    setSolution(null);
    setSweep(null);
    setHighlight(new Set());

    // Grid first (fast) so it paints immediately; then the two solves in parallel.
    getPuzzle(date)
      .then((p) => {
        if (cancelled) return;
        setPuzzle(p);
        return Promise.all([solveApi(date), getSweep(date)]).then(
          ([sol, sw]) => {
            if (cancelled) return;
            setSolution(sol);
            setSweep(sw);
          },
        );
      })
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
      .finally(() => !cancelled && setBusy(false));

    return () => {
      cancelled = true;
    };
  }, [date]);

  const matches =
    solution && puzzle?.optimalScore != null
      ? solution.ip.score === puzzle.optimalScore
      : null;

  const legend = useMemo(
    () => [
      { c: "#3a7d44", label: "grass (wall-placeable)" },
      { c: "#15464e", label: "water (blocker)" },
      { c: "#9a9a95", label: "stone wall" },
      { c: "#caa03f", label: "enclosed region" },
    ],
    [],
  );

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>
            Enclose <span className="tag">Horse</span> — an optimization inspector
          </h1>
          <p>
            The daily puzzle as an area-maximization MILP: solve it, read the
            budget shadow price off the LP dual, and see what integrality costs.
          </p>
        </div>
        <div className="controls">
          <select
            className="control"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="puzzle date"
          >
            {DATES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <div className="segmented" role="group" aria-label="solution view">
            <button
              aria-pressed={view === "ip"}
              onClick={() => setView("ip")}
              title="Integer solution (achievable)"
            >
              IP
            </button>
            <button
              aria-pressed={view === "lp"}
              onClick={() => setView("lp")}
              title="LP relaxation (fractional)"
            >
              LP
            </button>
          </div>
          <button className="control" onClick={toggle} aria-label="toggle theme">
            {dark ? "☀" : "☾"}
          </button>
        </div>
      </header>

      {error && (
        <div className="status error">Couldn't load this puzzle: {error}</div>
      )}

      {puzzle && (
        <>
          <div className="board">
            <div className="card grid-card">
              <h2>
                {view === "ip"
                  ? "Optimal walls & enclosed region"
                  : "LP relaxation (fractional walls & region as opacity)"}
              </h2>
              <p className="hint">
                {date === "today" ? "" : `${date} · `}
                {puzzle.width}×{puzzle.height} grid, budget {puzzle.budget} walls.
              </p>
              <Grid
                puzzle={puzzle}
                solution={solution}
                view={view}
                dark={dark}
                highlight={highlight}
              />
              <div className="legend">
                {legend.map((l) => (
                  <span key={l.label}>
                    <span className="swatch" style={{ background: l.c }} />
                    {l.label}
                  </span>
                ))}
                <span>🐴 horse · 🍒 +3 · 🍏 +10 · 🐝 −5 · 🌀 portal</span>
              </div>

              <div className="meta">
                <span className="chip">
                  day <b>{puzzle.dayNumber ?? "—"}</b>
                </span>
                <span className="chip">
                  budget <b>{puzzle.budget}</b>
                </span>
                <span className="chip">
                  optimalScore <b>{puzzle.optimalScore ?? "—"}</b>
                </span>
                {solution && (
                  <>
                    <span className="chip">
                      IP score <b>{solution.ip.score}</b>
                      {matches === true ? " ✓" : matches === false ? " ✗" : ""}
                    </span>
                    <span className="chip">
                      region <b>{solution.ip.region.length}</b> tiles
                    </span>
                    <span className="chip">
                      solve{" "}
                      <b>{solution.ip.solveSeconds.toFixed(2)}s</b> (
                      {solution.ip.solver})
                    </span>
                  </>
                )}
                {puzzle.hasBonus && (
                  <span className="chip warn">
                    hasBonus={puzzle.bonusType} — v1 ignores the rule
                  </span>
                )}
                {puzzle.unknownChars.length > 0 && (
                  <span className="chip warn">
                    out-of-scope tiles {puzzle.unknownChars.join(" ")} treated as
                    blockers
                  </span>
                )}
              </div>
            </div>

            {solution ? (
              <Inspector
                families={solution.families}
                onHover={(cells) => setHighlight(cells ?? new Set())}
              />
            ) : (
              <div className="card">
                <h2>Constraint inspector</h2>
                <div className="status">
                  {busy && <span className="spinner" />}
                  building &amp; solving the model…
                </div>
              </div>
            )}
          </div>

          <div className="lower">
            {sweep && solution ? (
              <DualityChart
                sweep={sweep}
                currentBudget={solution.budget}
                shadowPrice={solution.lp.shadowPrice}
                dark={dark}
              />
            ) : (
              <div className="card">
                <h2>Shadow price &amp; budget sweep</h2>
                <div className="status">
                  {busy && <span className="spinner" />}
                  sweeping the budget…
                </div>
              </div>
            )}
            {solution ? (
              <GapPanel solution={solution} />
            ) : (
              <div className="card">
                <h2>Integrality gap</h2>
                <div className="status">
                  {busy && <span className="spinner" />}
                  solving LP &amp; IP…
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!puzzle && !error && (
        <div className="status">
          <span className="spinner" />
          loading puzzle…
        </div>
      )}
    </div>
  );
}
