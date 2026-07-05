"""Phase 2 duality gate: the LP relaxation, integrality gap, and budget sweep must
behave like real LP duality on a live puzzle.

We use 2026-06-27 (budget 8, with cherries/gems/skulls) as the fixture: small enough
to sweep the whole budget range in a couple of seconds, rich enough to exercise a
non-trivial gap. The sweep is computed once and shared across the checks.
"""

import pytest

from encloseho.fetch import fetch_daily
from encloseho.model import build_model, inspector_families
from encloseho.parse import parse_puzzle
from encloseho.solve import budget_sweep, integrality_gap, solve_ip, solve_lp

EPS = 1e-6
DATE = "2026-06-27"


@pytest.fixture(scope="module")
def grid():
    return parse_puzzle(fetch_daily(DATE))


@pytest.fixture(scope="module")
def sweep(grid):
    return budget_sweep(grid)


def test_lp_ceiling_bounds_the_ip(grid):
    """The LP relaxation is an upper bound: ceiling >= IP score, so gap >= 0."""
    g = integrality_gap(grid)
    assert g.ip_score == grid.optimal_score  # sanity: IP still hits the known optimum
    assert g.lp_ceiling >= g.ip_score - EPS
    assert g.gap >= -EPS
    # This day is known to have a strictly fractional relaxation (gap ~ 1.4).
    assert not g.is_integral
    assert g.gap == pytest.approx(g.lp_ceiling - g.ip_score)


def test_solve_lp_requires_relaxed_model(grid):
    """A binary model has no meaningful duals; solve_lp must refuse it."""
    with pytest.raises(ValueError):
        solve_lp(build_model(grid))  # relax defaults to False


def test_sweep_is_monotone(sweep):
    """More budget never lowers the achievable score or the LP ceiling."""
    for prev, cur in zip(sweep, sweep[1:]):
        assert cur.ip_score >= prev.ip_score - EPS
        assert cur.lp_ceiling >= prev.lp_ceiling - EPS


def test_lp_value_is_concave_and_shadow_price_non_increasing(sweep):
    """The LP optimal value is concave in the budget (diminishing returns), so its
    forward differences — and the shadow prices that equal them — are non-increasing.
    Restricted to the feasible tail (ceiling > 0) to skip the unsealed low budgets."""
    feasible = [p for p in sweep if p.lp_ceiling > EPS]
    diffs = [
        b.lp_ceiling - a.lp_ceiling for a, b in zip(feasible, feasible[1:])
    ]
    for earlier, later in zip(diffs, diffs[1:]):
        assert later <= earlier + EPS, "LP value not concave in budget"

    shadows = [p.shadow_price for p in feasible]
    for earlier, later in zip(shadows, shadows[1:]):
        assert later <= earlier + EPS, "shadow price should not increase with budget"


def test_shadow_price_is_a_subgradient_of_the_ceiling(sweep):
    """The budget dual at b must lie between the LP ceiling's forward and backward
    differences there — the defining subgradient bound of a concave value function,
    and the precise sense in which 'the dual is the slope of the area-vs-budget curve'.
    Checked on interior points whose neighbours are all feasible."""
    by_budget = {p.budget: p for p in sweep}
    checked = 0
    for p in sweep:
        lo = by_budget.get(p.budget - 1)
        hi = by_budget.get(p.budget + 1)
        if lo is None or hi is None:
            continue
        if min(lo.lp_ceiling, p.lp_ceiling, hi.lp_ceiling) <= EPS:
            continue  # skip the infeasible boundary where the value is undefined
        backward = p.lp_ceiling - lo.lp_ceiling
        forward = hi.lp_ceiling - p.lp_ceiling
        assert forward - EPS <= p.shadow_price <= backward + EPS, (
            f"budget {p.budget}: dual {p.shadow_price} outside "
            f"[{forward}, {backward}]"
        )
        checked += 1
    assert checked > 0, "no interior feasible points were checked"


def test_inspector_families_serialize(grid):
    """The inspector payload lists every constraint family with a count and cells."""
    fams = inspector_families(build_model(grid))
    names = {f["name"] for f in fams}
    assert {"budget", "closure", "flow_conservation"} <= names
    for f in fams:
        assert isinstance(f["count"], int)
        assert all(len(cell) == 2 for cell in f["cells"])
    # The budget family is the single Σ W <= budget row.
    budget_fam = next(f for f in fams if f["name"] == "budget")
    assert budget_fam["count"] == 1
