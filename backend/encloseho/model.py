"""Build the area-maximization MILP for a puzzle.

The model reproduces the game's scoring **exactly** by making the decision set ``E``
equal the horse's flood component (see ``score.py`` for the game's own flood):

    E[c] = 1  iff cell c is in the horse's enclosed, sealed region.

Two structural constraints pin ``E`` to the true flood:
  * **closure** forces the region to swallow every open (unwalled) neighbour, so the
    optimizer can't drop an inconvenient interior tile (e.g. a skull);
  * **single-commodity flow** from the horse forces every region cell to be connected
    back to the horse, so a positive island the horse can't reach can't be counted.

Closure gives ``E ⊇ flood(horse)`` and flow gives ``E ⊆ flood(horse)`` — together
``E = flood(horse)``, so ``maximize Σ value·E`` is the game score and the chosen walls
are provably optimal.

The model is returned as a structured :class:`Model`: the ``pulp.LpProblem``, the
variable dicts, and a list of named constraint *families* (name + referenced cells)
that Phase 2's inspector will render.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pulp

from .parse import Cell, Grid

Edge = tuple[Cell, Cell]


@dataclass
class Family:
    """A named group of constraints and the cells it references (for the inspector)."""

    name: str
    constraints: list = field(default_factory=list)
    cells: set[Cell] = field(default_factory=set)

    def add(self, constraint, *cells: Cell):
        self.constraints.append(constraint)
        self.cells.update(cells)

    @property
    def count(self) -> int:
        return len(self.constraints)


@dataclass
class Model:
    grid: Grid
    problem: pulp.LpProblem
    E: dict[Cell, pulp.LpVariable]
    W: dict[Cell, pulp.LpVariable]
    flow: dict[Edge, pulp.LpVariable]
    families: list[Family]
    wall_penalty: int = 0


def build_model(grid: Grid, *, relax: bool = False, wall_penalty: int = 0) -> Model:
    """Construct the horse-component MILP for ``grid``.

    ``relax=True`` makes E/W continuous in [0,1] (the LP relaxation, for Phase 2).
    ``wall_penalty`` is the per-wall point cost on "costlywalls" days (0 otherwise).
    """
    cat = "Continuous" if relax else "Binary"
    prob = pulp.LpProblem("enclose_horse", pulp.LpMaximize)

    passable = grid.enclosable_cells
    passable_set = set(passable)
    horse = grid.horse
    n_cells = len(passable)  # big-M / flow-supply upper bound

    # E over passable cells; W over plain-grass cells only (the wall tool's domain).
    E = {c: pulp.LpVariable(f"E_{c[0]}_{c[1]}", 0, 1, cat) for c in passable}
    W = {c: pulp.LpVariable(f"W_{c[0]}_{c[1]}", 0, 1, cat) for c in grid.wall_cells}

    def wall_of(c: Cell):
        """W[c] if c can hold a wall, else the constant 0 (specials/horse can't)."""
        return W.get(c, 0)

    # Directed flow edges between adjacent passable cells.
    flow: dict[Edge, pulp.LpVariable] = {}
    for c in passable:
        for nb in grid.neighbors(c):
            if nb in passable_set:
                flow[(c, nb)] = pulp.LpVariable(
                    f"f_{c[0]}_{c[1]}__{nb[0]}_{nb[1]}", lowBound=0
                )

    # Objective: total value of the enclosed region, minus any wall penalty.
    prob += (
        pulp.lpSum(grid.value(c) * E[c] for c in passable)
        - wall_penalty * pulp.lpSum(W.values())
    )

    fam = {
        name: Family(name)
        for name in (
            "budget",
            "fix_horse",
            "block_terrain",
            "no_escape",
            "closure",
            "flow_capacity",
            "flow_conservation",
        )
    }

    # 1. Budget.
    budget_c = pulp.lpSum(W.values()) <= grid.budget
    prob += budget_c
    fam["budget"].add(budget_c, *W.keys())

    # 2. Fix horse: always part of its own region.
    hc = E[horse] == 1
    prob += hc
    fam["fix_horse"].add(hc, horse)

    # 3. Blockers: E for a blocker is simply never created (implicit 0); nothing to do
    #    here beyond recording the family for the inspector.
    for c in grid.cells():
        if grid.is_blocker(c):
            fam["block_terrain"].cells.add(c)

    # 4. No escape: the region must not touch the border, and a region cell is not a
    #    wall.
    for c in passable:
        if grid.is_border(c):
            expr = E[c] == 0
            prob += expr
            fam["no_escape"].add(expr, c)
    for c in grid.wall_cells:
        expr = E[c] + W[c] <= 1
        prob += expr
        fam["no_escape"].add(expr, c)

    # 5. Closure: if c is in the region, every open (unwalled) passable neighbour is
    #    too. Water neighbours seal for free (no edge / no term).
    for c in passable:
        for nb in grid.neighbors(c):
            if nb in passable_set:
                expr = E[c] <= E[nb] + wall_of(nb)
                prob += expr
                fam["closure"].add(expr, c, nb)

    # 6. Connectivity via single-commodity flow. The horse sources one unit of demand
    #    per other region cell; flow only runs between region cells; each region cell
    #    consumes one unit — so every region cell must trace back to the horse.
    for (c, nb), fvar in flow.items():
        cap_c = fvar <= n_cells * E[c]
        cap_n = fvar <= n_cells * E[nb]
        prob += cap_c
        prob += cap_n
        fam["flow_capacity"].add(cap_c, c, nb)
        fam["flow_capacity"].add(cap_n, c, nb)

    for c in passable:
        if c == horse:
            continue
        inflow = pulp.lpSum(flow[(nb, c)] for nb in grid.neighbors(c) if (nb, c) in flow)
        outflow = pulp.lpSum(flow[(c, nb)] for nb in grid.neighbors(c) if (c, nb) in flow)
        expr = inflow - outflow == E[c]
        prob += expr
        fam["flow_conservation"].add(expr, c)

    return Model(
        grid=grid,
        problem=prob,
        E=E,
        W=W,
        flow=flow,
        families=list(fam.values()),
        wall_penalty=wall_penalty,
    )
