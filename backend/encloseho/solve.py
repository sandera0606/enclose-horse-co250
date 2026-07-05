"""Solve the horse-component MILP, preferring the HiGHS backend over CBC.

HiGHS is faster on the flow-heavy open grids and gives cleaner LP duals for Phase 2,
so we use it when ``highspy`` is installed and fall back to PuLP's bundled CBC.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import pulp

from .model import Model
from .parse import Cell


@dataclass
class Solution:
    status: str
    score: int
    walls: set[Cell]
    region: set[Cell]
    solve_seconds: float
    solver: str = ""


def make_solver(*, msg: bool = False) -> pulp.LpSolver:
    """Return HiGHS if its engine (``highspy``) is importable, else CBC.

    Both are driven through the same PuLP model, so callers don't change.
    """
    try:
        import highspy  # noqa: F401

        return pulp.HiGHS(msg=msg)
    except ImportError:
        return pulp.PULP_CBC_CMD(msg=msg)


def _on(var) -> bool:
    """Treat a (possibly tiny-fractional) binary solution value as on/off."""
    v = var.value()
    return v is not None and v > 0.5


def solve_ip(model: Model, *, msg: bool = False) -> Solution:
    """Solve the integer program and read back the region, walls, and score.

    An infeasible model means the horse can't be sealed within budget → score 0.
    """
    solver = make_solver(msg=msg)
    start = time.perf_counter()
    status_code = model.problem.solve(solver)
    elapsed = time.perf_counter() - start
    status = pulp.LpStatus[status_code]
    solver_name = solver.name

    grid = model.grid
    if status != "Optimal":
        return Solution(
            status=status,
            score=0,
            walls=set(),
            region=set(),
            solve_seconds=elapsed,
            solver=solver_name,
        )

    walls = {c for c in model.W if _on(model.W[c])}
    region = {c for c in model.E if _on(model.E[c])}
    score = sum(grid.value(c) for c in region) - model.wall_penalty * len(walls)

    return Solution(
        status=status,
        score=score,
        walls=walls,
        region=region,
        solve_seconds=elapsed,
        solver=solver_name,
    )
