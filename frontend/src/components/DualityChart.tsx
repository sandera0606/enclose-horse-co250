import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { Sweep } from "../api";

interface Props {
  sweep: Sweep;
  currentBudget: number;
  shadowPrice: number;
  dark: boolean;
}

// Series colors, keyed to the game board: forest green = the achievable IP score
// (the enclosed field), golden wheat = the LP ceiling.
const C = (dark: boolean) => ({
  ip: dark ? "#4e9a5a" : "#3a7d44",
  lp: dark ? "#d9ad3f" : "#c99427",
  grid: dark ? "#2c2c2a" : "#e1e0d9",
  axis: "#8a887f",
  ref: dark ? "#ff8a3d" : "#eb6834",
});

function Tip({ active, payload, label, dark }: any) {
  if (!active || !payload?.length) return null;
  const c = C(dark);
  const row = (k: string, v: number, col: string) => (
    <div className="tr" key={k}>
      <span className="k" style={{ color: col }}>
        {k}
      </span>
      <span>{v}</span>
    </div>
  );
  const ip = payload.find((p: any) => p.dataKey === "ipScore")?.value;
  const lp = payload.find((p: any) => p.dataKey === "lpCeiling")?.value;
  const sp = payload[0]?.payload?.shadowPrice;
  return (
    <div className="chart-tip">
      <div className="tb">budget = {label} walls</div>
      {row("IP score", ip, c.ip)}
      {row("LP ceiling", lp, c.lp)}
      {sp != null && row("next wall ≈", sp, c.axis)}
    </div>
  );
}

/** Area-vs-budget: the IP score curve (achievable, concave, flattening) under the
 *  LP ceiling. The local slope IS the budget shadow price the LP dual reports —
 *  the "next wall is worth ≈ X tiles" readout is that dual at the live budget. */
export default function DualityChart({
  sweep,
  currentBudget,
  shadowPrice,
  dark,
}: Props) {
  const c = C(dark);
  return (
    <div className="card">
      <h2>Shadow price &amp; budget sweep</h2>
      <p className="hint">
        Area vs. wall budget. Slope = the LP dual on the budget row — it flattens as
        each extra wall buys less.
      </p>

      <div className="shadow-readout">
        <span className="big">≈ {shadowPrice.toFixed(2)}</span>
        <span className="cap">
          tiles — the marginal value of the next wall at budget {currentBudget}{" "}
          (LP dual)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={sweep.points}
          margin={{ top: 8, right: 12, bottom: 4, left: -8 }}
        >
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis
            dataKey="budget"
            stroke={c.axis}
            tick={{ fill: c.axis, fontSize: 11 }}
            tickLine={false}
            label={{
              value: "wall budget",
              position: "insideBottom",
              offset: -2,
              fill: c.axis,
              fontSize: 11,
            }}
          />
          <YAxis
            stroke={c.axis}
            tick={{ fill: c.axis, fontSize: 11 }}
            tickLine={false}
            width={40}
          />
          <Tooltip content={(p: any) => <Tip {...p} dark={dark} />} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
          <ReferenceLine
            x={currentBudget}
            stroke={c.ref}
            strokeDasharray="4 3"
            label={{
              value: "today",
              position: "top",
              fill: c.ref,
              fontSize: 11,
            }}
          />
          <Line
            type="monotone"
            dataKey="lpCeiling"
            name="LP ceiling"
            stroke={c.lp}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="ipScore"
            name="IP score"
            stroke={c.ip}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
