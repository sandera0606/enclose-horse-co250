"""The correctness gate: solve real days and assert the score matches the game's
own ``optimalScore``, cross-checked against the exact game-flood oracle.

All three days are ``hasBonus:false`` so ``optimalScore`` reflects only the base
scoring the v1 model implements. Puzzles are read from the on-disk cache (populated
on first run) so the suite doesn't hammer the site.
"""

import pytest

from encloseho.fetch import fetch_daily
from encloseho.model import build_model
from encloseho.parse import parse_puzzle
from encloseho.score import game_score
from encloseho.solve import solve_ip

# (date, optimalScore, specials-present) — see the plan's ground-truth table.
GROUND_TRUTH = [
    ("2026-07-03", 43, False),  # pure enclosure, no scoring tiles
    ("2026-06-30", 101, False),  # second core check
    ("2026-06-27", 76, True),   # cherries, gems, and skulls
]


@pytest.mark.parametrize("date,optimal,_specials", GROUND_TRUTH)
def test_solver_matches_optimal_score(date, optimal, _specials):
    grid = parse_puzzle(fetch_daily(date))
    assert grid.optimal_score == optimal, "API optimalScore drifted from fixture"

    sol = solve_ip(build_model(grid))
    assert sol.status == "Optimal"

    # 1. the model reproduces the game's optimum
    assert sol.score == optimal, f"{date}: model {sol.score} != optimal {optimal}"

    # 2. the model's own walls, scored by the exact game oracle, agree — i.e. the
    #    region really is the horse's sealed flood component (not a phantom)
    oracle = game_score(grid, sol.walls)
    assert not oracle.escaped, f"{date}: chosen walls let the horse escape"
    assert oracle.score == sol.score, (
        f"{date}: oracle {oracle.score} != model {sol.score} "
        "(region isn't the horse's component)"
    )
    assert len(sol.walls) <= grid.budget
