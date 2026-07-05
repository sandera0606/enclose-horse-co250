"""FastAPI layer over the Enclose Horse solver (Phase 3).

Wraps the Phase 1 IP solve and the Phase 2 duality features behind three JSON
endpoints the React front end consumes:

- ``GET  /api/puzzle`` — the parsed grid + metadata for a date.
- ``POST /api/solve``  — IP solution, LP relaxation, integrality gap, and the
  constraint-family breakdown (inspector) for a date.
- ``GET  /api/sweep``  — the area-vs-budget curve (IP score, LP ceiling, shadow
  price at each wall budget), the raw material for the duality chart.

Cells are tuples ``(row, col)`` internally; on the wire they are ``[row, col]``
pairs. Fractional LP vars are emitted as ``[row, col, value]`` triples (nonzero
only) so the grid can shade them as opacity.

Run:  uvicorn app:app --reload   (from the backend/ directory)
"""

from __future__ import annotations

import warnings
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from encloseho.fetch import fetch_daily
from encloseho.model import build_model, inspector_families
from encloseho.parse import Grid, parse_puzzle
from encloseho.solve import (
    budget_sweep,
    solve_ip,
    solve_lp,
)

app = FastAPI(title="Enclose Horse Solver", version="1.0")

# The Vite dev server proxies /api, so CORS is not strictly needed there, but
# allowing localhost lets the front end also hit :8000 directly during dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

_MIN_CELL_FRACTION = 1e-6  # below this an LP var is treated as exactly 0


def _load_grid(date: str) -> tuple[Grid, dict]:
    """Fetch (cache-first) and parse the puzzle for ``date``; return (grid, raw).

    Parser warnings about out-of-scope tiles are captured and attached to the
    grid's ``unknown_chars`` rather than raised, so a full bonus map still loads.
    """
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            data = fetch_daily(date)
            return parse_puzzle(data), data
    except ValueError as exc:  # bad date string / malformed map
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # network / upstream failure
        raise HTTPException(
            status_code=502, detail=f"could not load puzzle for {date!r}: {exc}"
        ) from exc


def _cells(cells) -> list[list[int]]:
    """Serialize a set/iterable of ``(r, c)`` cells as sorted ``[r, c]`` pairs."""
    return [[r, c] for r, c in sorted(cells)]


def _fractions(frac: dict) -> list[list[float]]:
    """Serialize a ``{cell: value}`` dict as ``[r, c, value]`` triples, dropping
    near-zero values so the grid overlay only draws cells that actually carry
    fractional weight."""
    out = []
    for (r, c), v in sorted(frac.items()):
        if v and v > _MIN_CELL_FRACTION:
            out.append([r, c, round(float(v), 4)])
    return out


def _grid_payload(grid: Grid, data: dict) -> dict:
    """The parsed grid + metadata, JSON-ready for the front end."""
    return {
        "date": grid.date,
        "dayNumber": data.get("dayNumber"),
        "width": grid.width,
        "height": grid.height,
        "budget": grid.budget,
        "optimalScore": grid.optimal_score,
        "hasBonus": grid.has_bonus,
        "bonusType": grid.bonus_type,
        # Row-major grid of legend chars: "." ~ H C G S ?  (the CellKind values).
        "kind": [[k.value for k in row] for row in grid.kind],
        "horse": [grid.horse[0], grid.horse[1]],
        "unknownChars": sorted(grid.unknown_chars),
    }


# --- endpoints ---------------------------------------------------------------


@app.get("/api/puzzle")
def get_puzzle(date: str = Query("today", description="'today' or YYYY-MM-DD")):
    """Return the parsed grid + metadata for ``date`` (no solve)."""
    grid, data = _load_grid(date)
    return _grid_payload(grid, data)


class SolveRequest(BaseModel):
    date: str = "today"
    budget: int | None = None  # override the puzzle's wall budget (optional)


@app.post("/api/solve")
def post_solve(req: SolveRequest):
    """Solve the IP and LP relaxation for a date and report both, the integrality
    gap between them, and the constraint-family breakdown for the inspector."""
    grid, _ = _load_grid(req.date)

    ip_model = build_model(grid, budget=req.budget)
    ip = solve_ip(ip_model)
    lp = solve_lp(build_model(grid, relax=True, budget=req.budget))
    gap = lp.ceiling - ip.score

    return {
        "budget": ip_model.budget,
        "ip": {
            "status": ip.status,
            "score": ip.score,
            "walls": _cells(ip.walls),
            "region": _cells(ip.region),
            "solveSeconds": round(ip.solve_seconds, 4),
            "solver": ip.solver,
        },
        "lp": {
            "status": lp.status,
            "ceiling": round(lp.ceiling, 4),
            "fracWalls": _fractions(lp.frac_walls),
            "fracRegion": _fractions(lp.frac_region),
            "shadowPrice": round(lp.shadow_price, 4),
            "solveSeconds": round(lp.solve_seconds, 4),
            "solver": lp.solver,
        },
        "gap": round(gap, 4),
        "isIntegral": abs(gap) < 1e-6,
        "families": inspector_families(ip_model),
    }


@app.get("/api/sweep")
def get_sweep(
    date: str = Query("today"),
    bmin: int = Query(0, ge=0),
    bmax: int | None = Query(None, description="defaults to the puzzle budget"),
):
    """Return the area-vs-budget curve: at each wall budget, the IP score, the LP
    ceiling, and the LP budget dual (shadow price of the next wall)."""
    grid, _ = _load_grid(date)
    upper = grid.budget if bmax is None else bmax
    if upper < bmin:
        raise HTTPException(status_code=400, detail="bmax must be >= bmin")

    points = budget_sweep(grid, bmin=bmin, bmax=upper)
    return {
        "budget": grid.budget,
        "points": [
            {
                "budget": p.budget,
                "ipScore": p.ip_score,
                "lpCeiling": round(p.lp_ceiling, 4),
                "shadowPrice": round(p.shadow_price, 4),
            }
            for p in points
        ],
    }


# --- static front end (single-process demo) ----------------------------------
#
# If the front end has been built (``pnpm build`` -> frontend/dist), serve it so
# the whole app runs from one uvicorn process. In dev you instead run `pnpm dev`
# and let Vite proxy /api here.
_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="frontend")
