import type { Solution } from "../api";

interface Props {
  solution: Solution;
}

/** The integrality gap: the LP relaxation's fractional ceiling versus the IP's
 *  achievable floor, and the space between them — what integrality costs. The bar
 *  shows the IP floor as a solid fill and the gap as a hatched remainder up to the
 *  ceiling. */
export default function GapPanel({ solution }: Props) {
  const ip = solution.ip.score;
  const ceiling = solution.lp.ceiling;
  const gap = solution.gap;
  // Guard against a zero ceiling so the bar math stays finite.
  const denom = ceiling > 0 ? ceiling : 1;
  const ipPct = Math.max(0, Math.min(100, (ip / denom) * 100));

  return (
    <div className="card">
      <h2>Integrality gap</h2>
      <p className="hint">
        The LP relaxation is a fractional ceiling the integer solution can't beat.
      </p>

      <div className="gap-figures">
        <div className="figure ip">
          <div className="val">{ip}</div>
          <div className="lbl">IP score (achievable)</div>
        </div>
        <div className="figure lp">
          <div className="val">{ceiling.toFixed(2)}</div>
          <div className="lbl">LP ceiling (upper bound)</div>
        </div>
      </div>

      <div
        className="gap-bar"
        role="img"
        aria-label={`IP ${ip} of LP ceiling ${ceiling.toFixed(2)}, gap ${gap.toFixed(2)}`}
      >
        <div className="fill-ip" style={{ width: `${ipPct}%` }} />
        <div className="fill-gap" style={{ left: `${ipPct}%`, right: 0 }} />
      </div>

      <p className="gap-note">
        {solution.isIntegral ? (
          <>
            gap <b>0</b> — the LP relaxation already lands on an integer optimum
            here, so integrality costs nothing.
          </>
        ) : (
          <>
            gap <b>{gap.toFixed(2)}</b> tiles — the relaxation over-promises by this
            much; rounding to a real, connected region is what it costs.
          </>
        )}
      </p>
    </div>
  );
}
