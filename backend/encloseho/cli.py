"""Command-line entry point: fetch -> parse -> solve -> pretty-print.

    python -m encloseho.cli --date today
    python -m encloseho.cli --date 2026-07-03
"""

from __future__ import annotations

import argparse

from .fetch import fetch_daily
from .model import build_model
from .parse import CellKind, Grid
from .score import game_score
from .solve import Solution, solve_ip, solve_lp

# How each cell kind is drawn in the terminal render.
_GLYPH = {
    CellKind.GRASS: ".",
    CellKind.WATER: "~",
    CellKind.HORSE: "H",
    CellKind.CHERRY: "C",
    CellKind.GEM: "G",
    CellKind.SKULL: "S",
    CellKind.UNKNOWN: "?",
}


def render(grid: Grid, sol: Solution) -> str:
    """ASCII grid: walls as ``#``, enclosed grass as ``o`` (specials/horse keep their
    glyph so you can see what's inside the region)."""
    lines = []
    for r in range(grid.height):
        row = []
        for c in range(grid.width):
            cell = (r, c)
            if cell in sol.walls:
                row.append("#")
            elif cell in sol.region and grid.kind_at(cell) is CellKind.GRASS:
                row.append("o")  # enclosed grass
            else:
                row.append(_GLYPH[grid.kind_at(cell)])
        lines.append(" ".join(row))
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Solve the daily Enclose Horse puzzle.")
    ap.add_argument("--date", default="today", help="'today' or YYYY-MM-DD")
    ap.add_argument("--verbose", action="store_true", help="show solver output")
    ap.add_argument(
        "--lp",
        action="store_true",
        help="also solve the LP relaxation: ceiling, integrality gap, wall shadow price",
    )
    args = ap.parse_args(argv)

    from .parse import parse_puzzle

    data = fetch_daily(args.date)
    grid = parse_puzzle(data)
    model = build_model(grid)
    sol = solve_ip(model, msg=args.verbose)
    oracle = game_score(grid, sol.walls)

    print(render(grid, sol))
    print()
    print(f"date            {grid.date}  (day {data.get('dayNumber')})")
    print(f"grid            {grid.width} x {grid.height}")
    print(f"status          {sol.status}")
    print(f"walls used      {len(sol.walls)} / {grid.budget}")
    print(f"region tiles    {len(sol.region)}")
    print(f"score           {sol.score}")
    print(f"game-scored     {oracle.score}  (oracle on the chosen walls)", end="")
    print("  <- OK" if oracle.score == sol.score else "  <- MODEL/ORACLE MISMATCH")
    print(f"optimalScore    {grid.optimal_score}", end="")
    if grid.optimal_score is not None:
        print("  <- MATCH" if sol.score == grid.optimal_score else "  <- MISMATCH")
    else:
        print()
    if grid.has_bonus:
        print(f"note            hasBonus={grid.bonus_type!r} (v1 ignores the rule)")
    print(f"solve time      {sol.solve_seconds:.3f}s  ({sol.solver})")

    if args.lp:
        lp = solve_lp(build_model(grid, relax=True), msg=args.verbose)
        gap = lp.ceiling - sol.score
        print()
        print(f"LP ceiling      {lp.ceiling:.3f}  (fractional upper bound)")
        print(f"integrality gap {gap:.3f}  (ceiling - IP score)")
        print(f"next wall worth ~{lp.shadow_price:.2f} tiles  (budget shadow price)")
        print(f"LP solve time   {lp.solve_seconds:.3f}s  ({lp.solver})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
