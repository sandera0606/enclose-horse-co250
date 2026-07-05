"""Parse an Enclose Horse ASCII map into a structured ``Grid``.

Legend (decoded from the game's ``play.js`` parser):
    ``.`` grass (wall-placeable)   ``~`` water (free, permanent blocker)
    ``H`` horse                    ``C`` cherry (+3)
    ``G`` gem / golden apple (+10) ``S`` skull / bee-swarm (-5)

Anything else (portals ``P``, unicorn ``U``, stray digits seen on some bonus days)
is v1-out-of-scope: we keep it as a permanent ``UNKNOWN`` blocker and warn once, so
full maps don't crash.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from enum import Enum

Cell = tuple[int, int]  # (row, col)


class CellKind(Enum):
    GRASS = "."
    WATER = "~"
    HORSE = "H"
    CHERRY = "C"
    GEM = "G"
    SKULL = "S"
    UNKNOWN = "?"  # out-of-scope tiles (portals, creatures, digits): blocker


_CHAR_TO_KIND = {k.value: k for k in CellKind if k is not CellKind.UNKNOWN}

# Per-cell contribution to the score when the cell is enclosed (base area 1 plus the
# tile bonus). Water/unknown are permanent blockers and never enclosable.
_KIND_VALUE = {
    CellKind.GRASS: 1,
    CellKind.HORSE: 1,   # the horse tile itself counts as enclosed area
    CellKind.CHERRY: 4,  # 1 + 3
    CellKind.GEM: 11,    # 1 + 10
    CellKind.SKULL: -4,  # 1 - 5
}

# Kinds that behave as permanent blockers: can never hold a wall and never escape,
# and never count toward area.
_BLOCKER_KINDS = frozenset({CellKind.WATER, CellKind.UNKNOWN})


@dataclass
class Grid:
    width: int
    height: int
    kind: list[list[CellKind]]
    horse: Cell
    budget: int
    optimal_score: int | None
    has_bonus: bool = False
    bonus_type: str | None = None
    date: str | None = None
    unknown_chars: frozenset[str] = field(default_factory=frozenset)

    # --- cell classification helpers -------------------------------------------
    def cells(self):
        for r in range(self.height):
            for c in range(self.width):
                yield (r, c)

    def kind_at(self, cell: Cell) -> CellKind:
        r, c = cell
        return self.kind[r][c]

    def is_blocker(self, cell: Cell) -> bool:
        return self.kind_at(cell) in _BLOCKER_KINDS

    def is_border(self, cell: Cell) -> bool:
        r, c = cell
        return r == 0 or c == 0 or r == self.height - 1 or c == self.width - 1

    def value(self, cell: Cell) -> int:
        """Score contribution if this cell is enclosed (0 for blockers)."""
        return _KIND_VALUE.get(self.kind_at(cell), 0)

    def passable(self, cell: Cell) -> bool:
        """Floodable tile: grass, horse, or a special. Water/unknown are not."""
        return not self.is_blocker(cell)

    @property
    def wall_cells(self) -> list[Cell]:
        """Cells a wall may be placed on. The game's wall tool allows *plain grass*
        only — never a special (cherry/gem/skull), the horse, or water."""
        return [c for c in self.cells() if self.kind_at(c) is CellKind.GRASS]

    @property
    def enclosable_cells(self) -> list[Cell]:
        """Cells that can be in the region and count toward the score (all passable
        tiles: grass, horse, and specials)."""
        return [cell for cell in self.cells() if self.passable(cell)]

    def neighbors(self, cell: Cell):
        r, c = cell
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.height and 0 <= nc < self.width:
                yield (nr, nc)


def parse_map(map_str: str) -> tuple[list[list[CellKind]], Cell, set[str]]:
    rows = map_str.split("\n")
    width = len(rows[0])
    if any(len(row) != width for row in rows):
        raise ValueError("map is not rectangular")

    kind: list[list[CellKind]] = []
    horse: Cell | None = None
    unknown: set[str] = set()

    for r, row in enumerate(rows):
        krow: list[CellKind] = []
        for c, ch in enumerate(row):
            k = _CHAR_TO_KIND.get(ch)
            if k is None:
                unknown.add(ch)
                k = CellKind.UNKNOWN
            if k is CellKind.HORSE:
                if horse is not None:
                    raise ValueError("map has more than one horse")
                horse = (r, c)
            krow.append(k)
        kind.append(krow)

    if horse is None:
        raise ValueError("map has no horse 'H'")
    return kind, horse, unknown


def parse_puzzle(data: dict) -> Grid:
    """Build a :class:`Grid` from the raw API JSON."""
    kind, horse, unknown = parse_map(data["map"])
    if unknown:
        warnings.warn(
            f"map contains out-of-scope tile(s) {sorted(unknown)}; "
            "treating as permanent blockers (v1 ignores their mechanic)",
            stacklevel=2,
        )
    height = len(kind)
    width = len(kind[0])
    return Grid(
        width=width,
        height=height,
        kind=kind,
        horse=horse,
        budget=data["budget"],
        optimal_score=data.get("optimalScore"),
        has_bonus=bool(data.get("hasBonus", False)),
        bonus_type=data.get("bonusType"),
        date=data.get("dailyDate"),
        unknown_chars=frozenset(unknown),
    )
