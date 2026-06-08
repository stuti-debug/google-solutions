import json
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify

from core.security import validate_session_id
from core.app_globals import store

reports_bp = Blueprint("reports_gen", __name__)


def _first(row: Dict[str, Any], keys: List[str]):
    for k in keys:
        v = row.get(k)
        if v not in (None, ""):
            return v
    return None


def _num(value) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------
# 1. Inventory Status Snapshot
# ---------------------------------------------------------------------------

def _inventory_status(session_id: str) -> Dict[str, Any]:
    rows = store.get_session_rows(session_id, limit=500, file_type="inventory")

    if not rows:
        # Demo data
        items = [
            {"item": "Water Kits", "location": "Main Warehouse A", "quantity": 8, "status": "critical"},
            {"item": "Food Packets", "location": "Main Warehouse A", "quantity": 45, "status": "low"},
            {"item": "Medical Supplies", "location": "Red Cross Depot", "quantity": 150, "status": "healthy"},
            {"item": "Blankets", "location": "Main Warehouse B", "quantity": 22, "status": "low"},
            {"item": "Tarpaulin Sheets", "location": "Main Warehouse B", "quantity": 300, "status": "healthy"},
        ]
        return {
            "title": "Inventory Status Snapshot",
            "summary": "5 item categories tracked across 2 warehouses. 1 item is critical, 2 are low.",
            "items": items,
            "total_items": 5,
            "critical_count": 1,
            "low_count": 2,
            "healthy_count": 2,
        }

    aggregated: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        item = str(_first(row, ["item_name", "item", "Item", "category", "Category"]) or "Unknown").strip()
        qty = _num(_first(row, ["quantity", "qty", "stock", "Quantity", "Stock"]))
        loc = str(_first(row, ["district", "District", "location", "Location", "warehouse", "Warehouse"]) or "Unknown").strip()

        key = f"{item}|{loc}"
        if key in aggregated:
            aggregated[key]["quantity"] += qty
        else:
            aggregated[key] = {"item": item, "location": loc, "quantity": qty}

    items = []
    for entry in aggregated.values():
        q = entry["quantity"]
        if q <= 10:
            status = "critical"
        elif q <= 50:
            status = "low"
        else:
            status = "healthy"
        items.append({**entry, "quantity": round(q), "status": status})

    items.sort(key=lambda x: x["quantity"])
    critical = sum(1 for i in items if i["status"] == "critical")
    low = sum(1 for i in items if i["status"] == "low")
    healthy = sum(1 for i in items if i["status"] == "healthy")

    return {
        "title": "Inventory Status Snapshot",
        "summary": f"{len(items)} item categories tracked. {critical} critical, {low} low, {healthy} healthy.",
        "items": items,
        "total_items": len(items),
        "critical_count": critical,
        "low_count": low,
        "healthy_count": healthy,
    }


# ---------------------------------------------------------------------------
# 2. Beneficiary Coverage Report
# ---------------------------------------------------------------------------

def _beneficiary_coverage(session_id: str) -> Dict[str, Any]:
    rows = store.get_session_rows(session_id, limit=500, file_type="beneficiary")

    if not rows:
        return {
            "title": "Beneficiary Coverage Report",
            "summary": "No beneficiary data available. Upload beneficiary records to generate this report.",
            "districts": [
                {"name": "Chetpet", "count": 450, "pct": 37.5},
                {"name": "Velachery", "count": 320, "pct": 26.7},
                {"name": "Tambaram", "count": 230, "pct": 19.2},
                {"name": "Guindy", "count": 200, "pct": 16.7},
            ],
            "total_beneficiaries": 1200,
            "total_districts": 4,
            "needs": [
                {"need": "Water", "count": 480},
                {"need": "Medical", "count": 350},
                {"need": "Food", "count": 270},
                {"need": "Shelter", "count": 100},
            ],
        }

    total = len(rows)
    district_counter: Counter = Counter()
    need_counter: Counter = Counter()

    for row in rows:
        district = str(_first(row, ["district", "District", "city", "City", "location", "Location"]) or "Unknown").strip()
        need = str(_first(row, ["need", "Need", "requirement", "Requirement", "category", "aid_type"]) or "General").strip()
        district_counter[district] += 1
        need_counter[need] += 1

    districts = [
        {"name": d, "count": c, "pct": round(c / total * 100, 1)}
        for d, c in district_counter.most_common(10)
    ]
    needs = [{"need": n, "count": c} for n, c in need_counter.most_common(10)]

    return {
        "title": "Beneficiary Coverage Report",
        "summary": f"{total} beneficiaries across {len(district_counter)} districts.",
        "districts": districts,
        "total_beneficiaries": total,
        "total_districts": len(district_counter),
        "needs": needs,
    }


# ---------------------------------------------------------------------------
# 3. Donor Contribution Ledger
# ---------------------------------------------------------------------------

def _donor_ledger(session_id: str) -> Dict[str, Any]:
    rows = store.get_session_rows(session_id, limit=500, file_type="donor")

    if not rows:
        return {
            "title": "Donor Contribution Ledger",
            "summary": "No donor data available. Upload donor records to generate this report.",
            "donors": [
                {"name": "UNICEF India", "amount": 250000, "items": "Water, Medical", "date": "2026-05-15"},
                {"name": "Red Cross Society", "amount": 180000, "items": "Blankets, Food", "date": "2026-05-20"},
                {"name": "Tata Trusts", "amount": 120000, "items": "Shelter materials", "date": "2026-05-22"},
                {"name": "Local Community Fund", "amount": 45000, "items": "Food packets", "date": "2026-06-01"},
            ],
            "total_donors": 4,
            "total_amount": 595000,
        }

    donor_agg: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        name = str(_first(row, ["donor_name", "donor", "Donor", "name", "Name", "organization"]) or "Anonymous").strip()
        amount = _num(_first(row, ["amount", "Amount", "donation", "Donation", "contribution", "value"]))
        items = str(_first(row, ["items", "Items", "category", "Category", "item", "description"]) or "General").strip()
        date = str(_first(row, ["date", "Date", "donation_date", "created_at"]) or "N/A").strip()

        if name in donor_agg:
            donor_agg[name]["amount"] += amount
            if items not in donor_agg[name]["items"]:
                donor_agg[name]["items"] += f", {items}"
        else:
            donor_agg[name] = {"name": name, "amount": amount, "items": items, "date": date}

    donors = sorted(donor_agg.values(), key=lambda d: d["amount"], reverse=True)
    for d in donors:
        d["amount"] = round(d["amount"])
    total_amount = sum(d["amount"] for d in donors)

    return {
        "title": "Donor Contribution Ledger",
        "summary": f"{len(donors)} donors contributed a total of ₹{total_amount:,}.",
        "donors": donors,
        "total_donors": len(donors),
        "total_amount": total_amount,
    }


# ---------------------------------------------------------------------------
# 4. Data Quality Audit
# ---------------------------------------------------------------------------

def _data_quality(session_id: str) -> Dict[str, Any]:
    meta = store.get_session_meta(session_id) or {}
    summary = meta.get("summary", {})
    profile = meta.get("profile", {})

    total_records = meta.get("record_count", 0)
    total_fixed = summary.get("totalFixed", 0)
    duplicates = summary.get("removedDuplicates", 0)
    dropped = summary.get("droppedInvalidRows", 0)
    error_logs = summary.get("error_logs", [])
    file_types = summary.get("fileTypes", [])
    records_by_type = summary.get("recordCountsByType", {})
    null_counts = profile.get("nullCounts", {})
    columns = profile.get("columns", [])

    # Top null columns
    top_nulls = sorted(
        [(col, count) for col, count in null_counts.items() if count > 0],
        key=lambda x: x[1], reverse=True
    )[:10]

    clean_rate = round((1 - (total_fixed / max(total_records, 1))) * 100, 1) if total_records > 0 else 100

    return {
        "title": "Data Quality Audit",
        "summary": f"{total_records} records processed. {clean_rate}% initial quality score.",
        "total_records": total_records,
        "total_fixed": total_fixed,
        "duplicates_removed": duplicates,
        "rows_dropped": dropped,
        "clean_rate": clean_rate,
        "file_types": file_types,
        "records_by_type": records_by_type,
        "total_columns": len(columns),
        "top_null_columns": [{"column": col, "nulls": count} for col, count in top_nulls],
        "error_log_count": len(error_logs),
        "error_samples": error_logs[:5],
    }


# ---------------------------------------------------------------------------
# 5. Gap Analysis Report
# ---------------------------------------------------------------------------

def _gap_analysis(session_id: str) -> Dict[str, Any]:
    beneficiaries = store.get_session_rows(session_id, limit=500, file_type="beneficiary")
    inventory = store.get_session_rows(session_id, limit=500, file_type="inventory")

    # Aggregate demand by district
    demand: Dict[str, int] = Counter()
    for row in beneficiaries:
        district = str(_first(row, ["district", "District", "city", "City", "location", "Location"]) or "Unknown").strip()
        demand[district] += 1

    # Aggregate supply by location
    supply: Dict[str, float] = defaultdict(float)
    for row in inventory:
        loc = str(_first(row, ["district", "District", "location", "Location", "warehouse", "Warehouse"]) or "Unknown").strip()
        qty = _num(_first(row, ["quantity", "qty", "stock", "Quantity", "Stock"]))
        supply[loc] += qty

    if not demand and not supply:
        # Demo
        gaps = [
            {"location": "Chetpet Camp", "demand": 1200, "supply": 508, "gap": 692, "coverage": 42.3, "status": "critical"},
            {"location": "Velachery Sector 4", "demand": 850, "supply": 450, "gap": 400, "coverage": 52.9, "status": "critical"},
            {"location": "Tambaram Shelter", "demand": 400, "supply": 321, "gap": 79, "coverage": 80.3, "status": "moderate"},
            {"location": "Guindy Relief Center", "demand": 250, "supply": 280, "gap": 0, "coverage": 100, "status": "covered"},
        ]
        return {
            "title": "Gap Analysis Report",
            "summary": "2 of 4 locations have critical supply gaps. Overall coverage: 57.7%.",
            "gaps": gaps,
            "total_locations": 4,
            "critical_gaps": 2,
            "overall_coverage": 57.7,
        }

    all_locations = sorted(set(list(demand.keys()) + list(supply.keys())))
    gaps = []
    total_demand = 0
    total_supply = 0

    for loc in all_locations:
        d = demand.get(loc, 0)
        s = supply.get(loc, 0)
        total_demand += d
        total_supply += s
        gap = max(0, d - s)
        coverage = round(min(s / max(d, 1), 1) * 100, 1) if d > 0 else 100
        if coverage < 50:
            status = "critical"
        elif coverage < 80:
            status = "moderate"
        else:
            status = "covered"
        gaps.append({
            "location": loc,
            "demand": d,
            "supply": round(s),
            "gap": round(gap),
            "coverage": coverage,
            "status": status,
        })

    gaps.sort(key=lambda g: g["coverage"])
    critical = sum(1 for g in gaps if g["status"] == "critical")
    overall = round(min(total_supply / max(total_demand, 1), 1) * 100, 1)

    return {
        "title": "Gap Analysis Report",
        "summary": f"{critical} of {len(gaps)} locations have critical gaps. Overall coverage: {overall}%.",
        "gaps": gaps,
        "total_locations": len(gaps),
        "critical_gaps": critical,
        "overall_coverage": overall,
    }


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

REPORT_GENERATORS = {
    "inventory_status": _inventory_status,
    "beneficiary_coverage": _beneficiary_coverage,
    "donor_ledger": _donor_ledger,
    "data_quality": _data_quality,
    "gap_analysis": _gap_analysis,
}


@reports_bp.route("/reports/generate/<session_id>/<report_type>", methods=["GET"])
def generate_report(session_id: str, report_type: str):
    try:
        validate_session_id(session_id)

        if report_type not in REPORT_GENERATORS:
            return jsonify({
                "code": "INVALID_REPORT_TYPE",
                "message": f"Unknown report type: {report_type}. Valid types: {list(REPORT_GENERATORS.keys())}",
            }), 400

        data = REPORT_GENERATORS[report_type](session_id)
        return jsonify({"status": "success", "report": data})

    except ValueError as exc:
        return jsonify({"code": "INVALID_SESSION", "message": str(exc)}), 400
    except Exception as exc:
        print(f"Report generation error ({report_type}): {exc}")
        return jsonify({"code": "REPORT_ERROR", "message": str(exc)}), 500
