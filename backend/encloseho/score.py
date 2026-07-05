"""Exact port of the game's scorer (``He()`` in the site's ``play.js``).

The game floods from the horse through cells that are neither walls nor water; if the
flood reaches the grid border the attempt *escaped* and scores 0; otherwise the score
is the region size plus tile bonuses summed over the region, minus a per-wall penalty
(non-zero only on "costlywalls" bonus days).

This is the authoritative correctness oracle for the solver — the MILP is only trusted
insofar as its chosen walls reproduce ``game_score``'s number.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from .parse import Cell, CellKind, Grid

# Score contribution per kind when a cell is in the flooded region.
_VALUE = {
    CellKind.GRASS: 1,
    CellKind.HORSE: 1,
    CellKind.CHERRY: 4,   # 1 + 3
    CellKind.GEM: 11,     # 1 + 10
    CellKind.SKULL: -4,   # 1 - 5
}


@dataclass
class GameScore:
    score: int
    region: set[Cell]
    escaped: bool


def game_score(grid: Grid, walls: set[Cell], wall_penalty: int = 0) -> GameScore:
    """Score a wall placement exactly as the game does.

    ``wall_penalty`` is the per-wall point cost (``m`` on "costlywalls" days; 0
    otherwise). ``walls`` are the cells the player placed walls on.
    """
    start = grid.horse
    seen: set[Cell] = {start}
    queue: deque[Cell] = deque([start])
    escaped = False

    while queue:
        cell = queue.popleft()
        if grid.is_border(cell):
            escaped = True
        for n in grid.neighbors(cell):
            if n in seen or n in walls or not grid.passable(n):
                continue
            seen.add(n)
            queue.append(n)

    if escaped:
        return GameScore(score=0, region=seen, escaped=True)

    area_bonus = sum(_VALUE.get(grid.kind_at(c), 0) for c in seen)
    score = area_bonus - wall_penalty * len(walls)
    return GameScore(score=score, region=seen, escaped=False)
