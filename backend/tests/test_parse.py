"""Unit tests for the map parser."""

import warnings

import pytest

from encloseho.parse import CellKind, parse_map, parse_puzzle


def _puzzle(map_str, **kw):
    data = {"map": map_str, "budget": kw.get("budget", 5)}
    data.update(kw)
    return data


def test_basic_map_dims_and_kinds():
    m = "\n".join(
        [
            "....",
            ".HC.",
            ".~G.",
            "..S.",
        ]
    )
    kind, horse, unknown = parse_map(m)
    assert horse == (1, 1)
    assert not unknown
    assert kind[1][2] is CellKind.CHERRY
    assert kind[2][1] is CellKind.WATER
    assert kind[2][2] is CellKind.GEM
    assert kind[3][2] is CellKind.SKULL


def test_wall_cells_exclude_specials_horse_water():
    m = "\n".join(["....", ".HC.", ".~G.", "..S."])
    grid = parse_puzzle(_puzzle(m))
    walls = set(grid.wall_cells)
    # specials, horse and water are never wall-placeable
    assert grid.horse not in walls
    assert (1, 2) not in walls  # cherry
    assert (2, 1) not in walls  # water
    assert (2, 2) not in walls  # gem
    assert (3, 2) not in walls  # skull
    # a plain grass cell is
    assert (0, 0) in walls
    # every wall cell is plain grass
    assert all(grid.kind_at(c) is CellKind.GRASS for c in walls)


def test_cell_values():
    m = "\n".join(["....", ".HC.", ".~G.", "..S."])
    grid = parse_puzzle(_puzzle(m))
    assert grid.value((0, 0)) == 1     # grass
    assert grid.value(grid.horse) == 1  # horse counts as area
    assert grid.value((1, 2)) == 4     # cherry
    assert grid.value((2, 2)) == 11    # gem
    assert grid.value((3, 2)) == -4    # skull
    assert grid.value((2, 1)) == 0     # water never scores


def test_unknown_char_warns_but_does_not_crash():
    m = "\n".join(["....", ".H0.", "..P.", "...."])  # digit + portal: out of scope
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        grid = parse_puzzle(_puzzle(m))
    assert any("out-of-scope" in str(w.message) for w in caught)
    assert grid.unknown_chars == frozenset({"0", "P"})
    # unknown tiles behave as blockers: not passable, not wall-placeable
    assert not grid.passable((1, 2))
    assert (1, 2) not in set(grid.wall_cells)


def test_non_rectangular_and_missing_horse_raise():
    with pytest.raises(ValueError):
        parse_map("...\n..")
    with pytest.raises(ValueError):
        parse_map("....\n....")
