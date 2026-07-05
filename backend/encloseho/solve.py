"""Solve the horse-component MILP, preferring the HiGHS backend over CBC.

HiGHS is faster on the flow-heavy open grids and gives cleaner LP duals for Phase 2,
so we use it when ``highspy`` is installed and fall back to PuLP's bundled CBC.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import pulp

from .model import BUDGET_ROW, Model, build_model
from .parse import Cell, Grid


@dataclass
class Solution:
    status: str
    score: int
    walls: set[Cell]
    region: set[Cell]
    solve_seconds: float
    solver: str = ""


@dataclass
class LPSolution:
    """LP-relaxation result: a fractional, upper-bound view of the puzzle.

    ``ceiling`` is the relaxed objective — an over-estimate the IP can't beat.
    ``shadow_price`` is the dual on the budget row: the marginal region value of one
    more wall ("the next wall is worth ~X tiles"), the heart of the duality feature.
    """

    status: str
    ceiling: float
    frac_walls: dict[Cell, float]
    frac_region: dict[Cell, float]
    shadow_price: float
    solve_seconds: float
    solver: str = ""


def make_solver(*, msg: bool = False, need_duals: bool = False) -> pulp.LpSolver:
    """Return the solver to use for one solve.

    Prefers HiGHS (via ``highspy``) for its speed on the hard open grids, falling back
    to PuLP's bundled CBC. **Exception:** when ``need_duals`` is set (the LP relaxation
    for Phase 2), always use CBC — PuLP's HiGHS interface does not populate constraint
    ``.pi``/``.slack``, so it can't give us the budget shadow price.
    """
    if not need_duals:
        try:
            import highspy  # noqa: F401

            return pulp.HiGHS(msg=msg)
        except ImportError:
            pass
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


def solve_lp(model: Model, *, msg: bool = False) -> LPSolution:
    """Solve the LP relaxation and read the ceiling, fractional vars, and budget dual.

    ``model`` must have been built with ``relax=True`` (continuous E/W); solving the
    binary model here would return an integer point with meaningless duals.
    """
    if not model.relaxed:
        raise ValueError("solve_lp needs a relaxed model: build_model(..., relax=True)")

    solver = make_solver(msg=msg, need_duals=True)
    start = time.perf_counter()
    status_code = model.problem.solve(solver)
    elapsed = time.perf_counter() - start
    status = pulp.LpStatus[status_code]

    if status != "Optimal":
        return LPSolution(
            status=status,
            ceiling=0.0,
            frac_walls={},
            frac_region={},
            shadow_price=0.0,
            solve_seconds=elapsed,
            solver=solver.name,
        )

    ceiling = pulp.value(model.problem.objective)
    frac_walls = {c: model.W[c].value() or 0.0 for c in model.W}
    frac_region = {c: model.E[c].value() or 0.0 for c in model.E}

    # Dual on `Σ W ≤ budget`: the objective gain from one more wall of budget. PuLP's
    # `.pi` sign varies by backend; the true shadow price here is non-negative (more
    # budget never hurts a maximization), so normalize to its magnitude.
    row = model.problem.constraints[BUDGET_ROW]
    shadow_price = abs(row.pi) if row.pi is not None else 0.0

    return LPSolution(
        status=status,
        ceiling=ceiling,
        frac_walls=frac_walls,
        frac_region=frac_region,
        shadow_price=shadow_price,
        solve_seconds=elapsed,
        solver=solver.name,
    )


@dataclass
class Gap:
    """Integrality gap: how much the LP over-promises versus the achievable IP."""

    ip_score: int  # integer floor — actually achievable
    lp_ceiling: float  # fractional ceiling — an upper bound the IP can't beat
    gap: float  # ceiling - floor, always >= 0

    @property
    def is_integral(self) -> bool:
        """True when the LP relaxation already lands on an integer optimum (gap ~ 0)."""
        return abs(self.gap) < 1e-6


def integrality_gap(grid: Grid, *, wall_penalty: int = 0) -> Gap:
    """Solve the IP (floor) and LP relaxation (ceiling) and report the gap between."""
    ip = solve_ip(build_model(grid, wall_penalty=wall_penalty))
    lp = solve_lp(build_model(grid, relax=True, wall_penalty=wall_penalty))
    return Gap(ip_score=ip.score, lp_ceiling=lp.ceiling, gap=lp.ceiling - ip.score)


@dataclass
class SweepPoint:
    budget: int
    ip_score: int  # best achievable score at this wall budget
    lp_ceiling: float  # LP upper bound at this budget
    shadow_price: float  # LP dual: marginal score of the next wall of budget


def budget_sweep(
    grid: Grid, bmin: int = 0, bmax: int | None = None, *, wall_penalty: int = 0
) -> list[SweepPoint]:
    """Sweep the wall budget and, at each level, solve the IP and LP relaxation.

    The IP scores trace the area-vs-budget curve; its slope *is* the shadow price the
    LP dual reports at each point (concave, flattening as walls stop paying off). By
    default sweeps ``0..grid.budget``.
    """
    if bmax is None:
        bmax = grid.budget
    points = []
    for b in range(bmin, bmax + 1):
        ip = solve_ip(build_model(grid, budget=b, wall_penalty=wall_penalty))
        lp = solve_lp(build_model(grid, relax=True, budget=b, wall_penalty=wall_penalty))
        points.append(
            SweepPoint(
                budget=b,
                ip_score=ip.score,
                lp_ceiling=lp.ceiling,
                shadow_price=lp.shadow_price,
            )
        )
    return points
