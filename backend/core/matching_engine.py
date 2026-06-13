"""
CrisisGrid Matching Engine
==========================
Uses Google OR-Tools GLOP Linear Programming Solver to solve a
min-cost transportation network flow problem:

  Decision variable : x[i][j] = units shipped from warehouse i to camp j
  Objective         : minimize  Σ cost[i][j] * x[i][j]   (cost = haversine distance)
  Constraints       :
    - Supply  : Σ_j  x[i][j]  ≤  supply[i]     for every warehouse i
    - Demand  : Σ_i  x[i][j]  ≥  demand[j]     for every camp j
    - Non-neg : x[i][j]       ≥  0

Priority scoring runs independently (no LP needed there).

Falls back to a greedy distance heuristic if OR-Tools is unavailable.
"""

import math
import re
import random
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Optional OR-Tools import – fall back gracefully if package absent
# ---------------------------------------------------------------------------
try:
    from ortools.linear_solver import pywraplp  # noqa: F401
    _ORTOOLS_AVAILABLE = True
except ImportError:  # pragma: no cover
    _ORTOOLS_AVAILABLE = False

# ---------------------------------------------------------------------------
# Static coordinate table for Chennai (fallback when Geocoding API absent)
# ---------------------------------------------------------------------------
CHENNAI_COORDS: Dict[str, Tuple[float, float]] = {
    "chetpet camp": (13.0714, 80.2376),
    "chetpet": (13.0714, 80.2376),
    "saidapet bridge": (13.0154, 80.2220),
    "saidapet": (13.0154, 80.2220),
    "velachery relief center": (12.9815, 80.2180),
    "velachery": (12.9815, 80.2180),
    "guindy industrial estate": (13.0067, 80.2206),
    "guindy relief center": (13.0067, 80.2206),
    "guindy": (13.0067, 80.2206),
    "tambaram shelter": (12.9249, 80.1000),
    "tambaram": (12.9249, 80.1000),
}

# Keywords that indicate a location is a crisis zone, NOT a proper supply depot
CRISIS_ZONE_KEYWORDS = {
    "camp", "shelter", "relief center", "relief camp", "flood zone",
    "evacuation", "refugee", "displaced", "crisis zone", "temporary",
    "bridge", "transit", "staging",
}

# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def get_val(row: Dict[str, Any], *keys: str) -> Any:
    """Case-insensitive multi-key getter for database row dicts."""
    for key in keys:
        if key in row:
            return row[key]
        for rk in row.keys():
            if rk.lower() == key.lower():
                return row[rk]
    return None


def map_need_to_category(need: str) -> str:
    """Normalize a free-text beneficiary need into a standard category string."""
    n = str(need or "").lower().strip()
    if "water" in n:
        return "Water"
    if any(kw in n for kw in ("med", "health", "doc", "first aid", "tablet")):
        return "Medical"
    if any(kw in n for kw in ("food", "ration", "rice", "milk", "biscuit", "grain")):
        return "Food"
    if any(kw in n for kw in ("shelter", "tent", "blanket", "tarp")):
        return "Shelter"
    if any(kw in n for kw in ("hygiene", "pad", "soap")):
        return "Hygiene"
    return "General"


def normalize_location(name: str) -> str:
    """Standardise location names to resolve fuzzy matches."""
    if not name:
        return "unknown"
    n = str(name).lower().strip()
    n = re.sub(r"[^\w\s]", "", n)
    n = re.sub(r"\bbr\b", "bridge", n)
    n = re.sub(r"\bctr\b", "center", n)
    n = re.sub(r"\bste\b", "suite", n)
    n = re.sub(r"\bdist\b", "district", n)
    n = re.sub(r"\s+", " ", n)
    return n.strip()


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two WGS-84 coordinates."""
    R = 6_371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _resolve_coords(
    norm_name: str,
    location_overrides: Dict[str, Tuple[float, float]],
) -> Tuple[float, float]:
    """Return (lat, lng) for a normalised location name."""
    norm_overrides = {normalize_location(k): v for k, v in location_overrides.items()}
    if norm_name in norm_overrides:
        return norm_overrides[norm_name]
    norm_chennai = {normalize_location(k): v for k, v in CHENNAI_COORDS.items()}
    return norm_chennai.get(norm_name, (13.0827, 80.2707))  # fallback = Chennai centre

# ---------------------------------------------------------------------------
# Priority scoring (unchanged from original – no LP required here)
# ---------------------------------------------------------------------------

def calculate_real_priorities(
    beneficiaries: List[Dict[str, Any]],
    location_overrides: Optional[Dict[str, Tuple[float, float]]] = None,
) -> List[Dict[str, Any]]:
    """Calculate dynamic priority scores for each crisis zone."""
    if location_overrides is None:
        location_overrides = {}
    if not beneficiaries:
        return []

    village_groups: Dict[str, List] = defaultdict(list)
    for b in beneficiaries:
        village = get_val(b, "village") or "Unknown Camp"
        norm_village = normalize_location(village)
        village_groups[norm_village].append((village, b))

    priorities = []
    pri_idx = 1

    for norm_village, rows_data in village_groups.items():
        original_names = [rd[0] for rd in rows_data]
        display_village = max(set(original_names), key=original_names.count)
        rows = [rd[1] for rd in rows_data]

        total_affected = 0
        needs_count: Dict[str, int] = defaultdict(int)
        pending_count = 0

        for r in rows:
            try:
                hh_size = int(get_val(r, "household_size") or 1)
            except Exception:
                hh_size = 1
            total_affected += hh_size

            need = get_val(r, "need_type") or "General"
            needs_count[need] += 1

            status = str(get_val(r, "status") or "").lower()
            if "pending" in status:
                pending_count += 1

        # Dynamic priority score
        base_score = 40 + min(40, total_affected * 1.5)
        has_water = any("water" in str(k).lower() for k in needs_count)
        has_medical = any("med" in str(k).lower() for k in needs_count)
        if has_water:
            base_score += 10
        if has_medical:
            base_score += 10
        if pending_count > 0:
            base_score += 5
        score = int(min(99, base_score))

        if score >= 85:
            urgency = "Critical"
        elif score >= 70:
            urgency = "High"
        elif score >= 50:
            urgency = "Medium"
        else:
            urgency = "Low"

        top_needs = sorted(needs_count.items(), key=lambda x: x[1], reverse=True)
        top_need_name = top_needs[0][0] if top_needs else "General"
        top_need_count = top_needs[0][1] if top_needs else 0
        needs_str = ", ".join(f"{k} ({v} req.)" for k, v in top_needs[:3])

        if urgency == "Critical":
            primary = f"CRITICAL: {top_need_count} active {top_need_name} request(s) among {total_affected} civilians."
            if pending_count:
                primary += f" {pending_count} case(s) still pending resolution."
            if has_water and has_medical:
                primary += " Both water safety and medical support are simultaneously required."
            elif has_water:
                primary += " Water access is the primary bottleneck — immediate supply dispatch required."
            elif has_medical:
                primary += " Medical supply shortfall is the primary risk — first aid kits and medicines needed urgently."
        elif urgency == "High":
            primary = f"HIGH PRIORITY: {total_affected} residents with unmet {top_need_name} needs ({top_need_count} requests)."
            if pending_count:
                primary += f" {pending_count} pending case(s) at risk of escalation."
        elif urgency == "Medium":
            primary = f"Moderate need: {total_affected} residents, primarily requiring {top_need_name}."
            primary += (
                f" Monitor {pending_count} pending case(s) to prevent escalation."
                if pending_count
                else " Situation stable but supply refresh recommended within 48 hours."
            )
        else:
            primary = f"Low urgency: {total_affected} residents. Top need: {top_need_name} ({top_need_count} request(s)). No immediate action required."

        reasoning = f"{primary} Full breakdown: {needs_str}."

        lat, lng = _resolve_coords(norm_village, location_overrides)
        needs_geocoding = (lat, lng) == (13.0827, 80.2707)

        priorities.append({
            "id": f"pri-{pri_idx}",
            "location": display_village,
            "score": score,
            "urgency_level": urgency,
            "affected": total_affected,
            "reasoning": reasoning,
            "lat": round(lat, 5),
            "lng": round(lng, 5),
            "needs_geocoding": needs_geocoding,
        })
        pri_idx += 1

    return sorted(priorities, key=lambda x: x["score"], reverse=True)


# ---------------------------------------------------------------------------
# OR-Tools LP Solver  (min-cost transportation flow)
# ---------------------------------------------------------------------------

def _solve_with_ortools(
    demands: Dict[Tuple[str, str], int],
    inv_pool: List[Dict[str, Any]],
    village_display_names: Dict[str, str],
    location_overrides: Dict[str, Tuple[float, float]],
) -> List[Dict[str, Any]]:
    """
    Solve supply allocation with Google OR-Tools GLOP LP solver.

    Variables : x[i][j][cat]  – units shipped from warehouse i to camp j for category cat
    Objective : minimise  Σ  dist(i,j) * x[i][j][cat]   (minimise total travel cost)
    Subject to:
        Σ_j x[i][j][cat]  ≤  supply[i][cat]      (warehouse cannot ship more than it has)
        Σ_i x[i][j][cat]  ≥  demand[j][cat]       (each camp's demand must be met)
        x[i][j][cat]      ≥  0
    """
    from ortools.linear_solver import pywraplp  # local import so greedy path has no dep

    solver = pywraplp.Solver.CreateSolver("GLOP")
    if not solver:
        raise RuntimeError("OR-Tools GLOP solver could not be created.")

    # Index warehouses per category
    # inv_pool items: {name, category, warehouse, norm_warehouse, unit, qty, is_crisis_zone}
    wh_supply: Dict[Tuple[str, str], float] = defaultdict(float)  # (norm_wh, cat) -> qty
    wh_meta: Dict[Tuple[str, str], Dict] = {}  # (norm_wh, cat) -> item meta

    for item in inv_pool:
        key = (item["norm_warehouse"], item["category"])
        wh_supply[key] += item["qty"]
        if key not in wh_meta:
            wh_meta[key] = item

    # Build unique lists for indexing
    wh_keys = list(wh_supply.keys())          # list of (norm_wh, cat)
    camp_keys = list(demands.keys())           # list of (norm_village, cat)

    # Only keep (wh, camp) pairs that share the same category
    # Decision variables: x[(wh_key, camp_key)] = units shipped
    x: Dict[Tuple, pywraplp.Variable] = {}

    for wh_key in wh_keys:
        _, wh_cat = wh_key
        for camp_key in camp_keys:
            norm_village, camp_cat = camp_key
            if wh_cat.lower() != camp_cat.lower():
                continue  # categories must match

            # Cost = haversine distance (km) between warehouse and camp
            norm_wh, _ = wh_key
            wh_lat, wh_lng = _resolve_coords(norm_wh, location_overrides)
            v_lat, v_lng = _resolve_coords(norm_village, location_overrides)

            # Skip self-routing
            dist_km = haversine(wh_lat, wh_lng, v_lat, v_lng)
            if dist_km < 0.1:
                continue

            var_name = f"x_{wh_key[0]}_{camp_key[0]}_{wh_cat}"
            var = solver.NumVar(0.0, solver.infinity(), var_name)
            x[(wh_key, camp_key)] = var

    # -----------------------------------------------------------------------
    # Supply constraints: Σ_j x[(wh, j)] ≤ supply[wh]
    # -----------------------------------------------------------------------
    for wh_key in wh_keys:
        supply_qty = wh_supply[wh_key]
        ct = solver.Constraint(0.0, supply_qty, f"supply_{wh_key}")
        for (wk, ck), var in x.items():
            if wk == wh_key:
                ct.SetCoefficient(var, 1.0)

    # -----------------------------------------------------------------------
    # Demand constraints: Σ_i x[(i, camp)] ≥ demand[camp]
    # -----------------------------------------------------------------------
    for camp_key in camp_keys:
        demand_qty = float(demands[camp_key])
        # Use range [demand, ∞) → lower-bounded constraint
        ct = solver.Constraint(demand_qty, solver.infinity(), f"demand_{camp_key}")
        for (wk, ck), var in x.items():
            if ck == camp_key:
                ct.SetCoefficient(var, 1.0)

    # -----------------------------------------------------------------------
    # Objective: minimise total distance cost
    # -----------------------------------------------------------------------
    objective = solver.Objective()
    for (wh_key, camp_key), var in x.items():
        norm_wh, _ = wh_key
        norm_village, _ = camp_key
        wh_lat, wh_lng = _resolve_coords(norm_wh, location_overrides)
        v_lat, v_lng = _resolve_coords(norm_village, location_overrides)
        dist_km = haversine(wh_lat, wh_lng, v_lat, v_lng)
        objective.SetCoefficient(var, dist_km)
    objective.SetMinimization()

    # -----------------------------------------------------------------------
    # Solve
    # -----------------------------------------------------------------------
    status = solver.Solve()
    if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return []  # No feasible solution – caller falls back to greedy

    # -----------------------------------------------------------------------
    # Extract results into match records
    # -----------------------------------------------------------------------
    matches = []
    match_idx = 1

    for (wh_key, camp_key), var in x.items():
        allocated = var.solution_value()
        if allocated < 0.5:  # ignore near-zero allocations
            continue

        norm_wh, cat = wh_key
        norm_village, _ = camp_key

        meta = wh_meta.get(wh_key, {})
        display_village = village_display_names.get(norm_village, norm_village.title())

        wh_lat, wh_lng = _resolve_coords(norm_wh, location_overrides)
        v_lat, v_lng = _resolve_coords(norm_village, location_overrides)
        dist_km = haversine(wh_lat, wh_lng, v_lat, v_lng)

        demand_qty = demands.get(camp_key, 0)
        urgency = "High" if demand_qty > 15 else ("Medium" if demand_qty > 5 else "Low")

        unit = meta.get("unit", "units")
        item_name = meta.get("name", cat)
        warehouse = meta.get("warehouse", norm_wh.title())

        reasoning = (
            f"[OR-Tools GLOP LP] Dispatched {int(allocated)} {unit} of {item_name} "
            f"from {warehouse} ({dist_km:.1f} km away) to meet {cat} demand for "
            f"{demand_qty} residents at {display_village}. "
            f"Optimal allocation minimises total network transit distance."
        )

        matches.append({
            "id": f"match-{match_idx}",
            "beneficiary": display_village,
            "need": item_name,
            "allocated": int(allocated),
            "unit": unit,
            "source": warehouse,
            "reasoning": reasoning,
            "urgency": urgency,
            "source_lat": round(wh_lat, 5),
            "source_lng": round(wh_lng, 5),
            "dest_lat": round(v_lat, 5),
            "dest_lng": round(v_lng, 5),
            "solver": "OR-Tools GLOP LP",
            "dist_km": round(dist_km, 2),
        })
        match_idx += 1

    return matches


# ---------------------------------------------------------------------------
# Greedy fallback  (used only if OR-Tools package is absent)
# ---------------------------------------------------------------------------

def _solve_greedy(
    demands: Dict[Tuple[str, str], int],
    inv_pool: List[Dict[str, Any]],
    village_display_names: Dict[str, str],
    location_overrides: Dict[str, Tuple[float, float]],
) -> List[Dict[str, Any]]:
    """Distance-sorted greedy allocation – fallback when OR-Tools is unavailable."""
    matches = []
    match_idx = 1

    sorted_demands = sorted(demands.items(), key=lambda x: x[1], reverse=True)

    for (norm_village, category), total_needed_people in sorted_demands:
        display_village = village_display_names.get(norm_village, "Unknown Camp")
        v_lat, v_lng = _resolve_coords(norm_village, location_overrides)

        def get_inv_distance(item: Dict) -> float:
            return haversine(v_lat, v_lng, *_resolve_coords(item["norm_warehouse"], location_overrides))

        sorted_pool = sorted(inv_pool, key=get_inv_distance)
        real_depots = [i for i in sorted_pool if not i.get("is_crisis_zone")]
        fallback_pool = [i for i in sorted_pool if i.get("is_crisis_zone")]

        needed_qty = float(total_needed_people)

        for item in real_depots + fallback_pool:
            if item["qty"] <= 0 or needed_qty <= 0:
                continue
            if item["norm_warehouse"] == norm_village or get_inv_distance(item) < 0.1:
                continue
            is_match = (
                item["category"].lower() == category.lower()
                or category.lower() in item["name"].lower()
            )
            if not is_match:
                continue

            multiplier = 10 if any(u in item["unit"].lower() for u in ("tablet", "sachet")) else 1
            allocated = min(item["qty"], needed_qty * multiplier)
            item["qty"] -= allocated

            dist_km = get_inv_distance(item)
            urgency = "High" if total_needed_people > 15 else ("Medium" if total_needed_people > 5 else "Low")

            matches.append({
                "id": f"match-{match_idx}",
                "beneficiary": display_village,
                "need": item["name"],
                "allocated": int(allocated),
                "unit": item["unit"],
                "source": item["warehouse"],
                "reasoning": (
                    f"[Greedy fallback] Dispatched {int(allocated)} {item['unit']} of {item['name']} "
                    f"from {item['warehouse']} ({dist_km:.1f} km away) to cover {category} "
                    f"requirements for {total_needed_people} residents at {display_village}."
                ),
                "urgency": urgency,
                "source_lat": round(_resolve_coords(item["norm_warehouse"], location_overrides)[0], 5),
                "source_lng": round(_resolve_coords(item["norm_warehouse"], location_overrides)[1], 5),
                "dest_lat": round(v_lat, 5),
                "dest_lng": round(v_lng, 5),
                "solver": "greedy",
                "dist_km": round(dist_km, 2),
            })
            match_idx += 1
            needed_qty -= allocated / multiplier
            if needed_qty <= 0:
                break

    return matches


# ---------------------------------------------------------------------------
# Public API: calculate_real_matches
# ---------------------------------------------------------------------------

def calculate_real_matches(
    beneficiaries: List[Dict[str, Any]],
    inventory_items: List[Dict[str, Any]],
    location_overrides: Optional[Dict[str, Tuple[float, float]]] = None,
) -> List[Dict[str, Any]]:
    """
    Allocate inventory to beneficiary camps using Google OR-Tools GLOP LP solver.

    Falls back to a greedy distance-heuristic if OR-Tools is not installed.

    Parameters
    ----------
    beneficiaries   : rows from the beneficiary dataset
    inventory_items : rows from the inventory dataset
    location_overrides : {location_name: (lat, lng)} manual pin-drop overrides

    Returns
    -------
    List of match records, each with source/destination coordinates suitable
    for rendering as Polylines on the Google Maps view.
    """
    if location_overrides is None:
        location_overrides = {}
    if not beneficiaries or not inventory_items:
        return []

    # ------------------------------------------------------------------
    # 1. Aggregate demand per (norm_village, category)
    # ------------------------------------------------------------------
    demands: Dict[Tuple[str, str], int] = defaultdict(int)
    village_display_names: Dict[str, str] = {}

    for b in beneficiaries:
        village = get_val(b, "village") or "Unknown Camp"
        norm_village = normalize_location(village)
        if norm_village not in village_display_names:
            village_display_names[norm_village] = village

        need = get_val(b, "need_type") or "General"
        try:
            hh_size = int(get_val(b, "household_size") or 1)
        except Exception:
            hh_size = 1

        category = map_need_to_category(need)
        demands[(norm_village, category)] += hh_size

    # ------------------------------------------------------------------
    # 2. Build inventory pool
    # ------------------------------------------------------------------
    inv_pool: List[Dict[str, Any]] = []
    for item in inventory_items:
        name = get_val(item, "item_name") or "Supplies"
        category = get_val(item, "category") or "General"
        warehouse = get_val(item, "warehouse") or "Main Depot"
        norm_warehouse = normalize_location(warehouse)
        unit = get_val(item, "unit") or "units"
        try:
            qty = float(get_val(item, "quantity") or 0)
        except Exception:
            qty = 0.0

        if qty > 0:
            is_crisis_zone = any(kw in norm_warehouse.lower() for kw in CRISIS_ZONE_KEYWORDS)
            inv_pool.append({
                "name": name,
                "category": category,
                "warehouse": warehouse,
                "norm_warehouse": norm_warehouse,
                "unit": unit,
                "qty": qty,
                "is_crisis_zone": is_crisis_zone,
            })

    if not inv_pool:
        return []

    # ------------------------------------------------------------------
    # 3. Solve: OR-Tools LP → greedy fallback
    # ------------------------------------------------------------------
    if _ORTOOLS_AVAILABLE:
        try:
            matches = _solve_with_ortools(
                dict(demands), inv_pool, village_display_names, location_overrides
            )
            if matches:
                return matches
        except Exception as exc:
            print(f"[CrisisGrid] OR-Tools solver error, switching to greedy: {exc}")

    return _solve_greedy(
        dict(demands), inv_pool, village_display_names, location_overrides
    )
