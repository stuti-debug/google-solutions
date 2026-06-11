from datetime import datetime, timezone
from typing import Any, Dict, List

from flask import Blueprint, jsonify, request

from core.security import validate_session_id, verify_session_ownership
from core.app_globals import store

alerts_bp = Blueprint("alerts", __name__)


def _first_present(row: Dict[str, Any], keys: List[str]):
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


def _to_number(value) -> float:
    if value is None or value == "":
        return float("inf")
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return float("inf")


def _generate_alerts(session_id: str) -> List[Dict[str, Any]]:
    """Generate alerts from priority scores and inventory levels."""
    alerts: List[Dict[str, Any]] = []
    alert_id = 0

    # --- Priority-based alerts (demo data) ---
    priorities = [
        {"location": "Chetpet Camp", "score": 91, "urgency_level": "Critical", "affected": 1200},
        {"location": "Velachery Sector 4", "score": 85, "urgency_level": "High", "affected": 850},
        {"location": "Tambaram Shelter", "score": 62, "urgency_level": "Medium", "affected": 400},
        {"location": "Guindy Relief Center", "score": 45, "urgency_level": "Low", "affected": 250},
    ]

    for p in priorities:
        if p["score"] >= 90:
            alert_id += 1
            alerts.append({
                "id": alert_id,
                "title": f"Critical: {p['location']}",
                "message": f"Priority score {p['score']}/100 — {p['affected']:,} civilians affected. Immediate action required.",
                "time": "Just now",
                "type": "urgent",
            })
        elif p["score"] >= 75:
            alert_id += 1
            alerts.append({
                "id": alert_id,
                "title": f"High Priority: {p['location']}",
                "message": f"Priority score {p['score']}/100 — {p['affected']:,} civilians affected. Review resource allocation.",
                "time": "5 min ago",
                "type": "warning",
            })

    # --- Inventory-based alerts ---
    inventory_rows = store.get_session_rows(session_id, limit=200, file_type="inventory")
    if inventory_rows:
        for row in inventory_rows:
            item = _first_present(row, ["item_name", "item", "Item", "category", "Category"]) or "Unknown item"
            qty = _to_number(_first_present(row, ["quantity", "qty", "stock", "Quantity", "Stock"]))
            location = _first_present(row, [
                "district", "District", "location", "Location",
                "warehouse", "Warehouse", "city", "City"
            ]) or "Unknown location"

            if qty <= 10:
                alert_id += 1
                alerts.append({
                    "id": alert_id,
                    "title": f"Low Stock: {item}",
                    "message": f"Only {int(qty)} units remaining at {location}. Restock urgently.",
                    "time": "10 min ago",
                    "type": "warning",
                })
    else:
        # Demo inventory alerts
        alert_id += 1
        alerts.append({
            "id": alert_id,
            "title": "Low Stock: Water Kits",
            "message": "Only 8 units remaining at Main Warehouse A. Restock urgently.",
            "time": "15 min ago",
            "type": "warning",
        })

    # --- Session data alert ---
    meta = store.get_session_meta(session_id)
    if meta:
        record_count = meta.get("record_count", 0)
        if record_count > 0:
            alert_id += 1
            alerts.append({
                "id": alert_id,
                "title": "Data Processing Complete",
                "message": f"{record_count} records cleaned and loaded into your workspace.",
                "time": "1 hour ago",
                "type": "success",
            })

        dropped = (meta.get("summary") or {}).get("droppedInvalidRows", 0)
        if dropped and int(dropped) > 0:
            alert_id += 1
            alerts.append({
                "id": alert_id,
                "title": "Data Quality Warning",
                "message": f"{dropped} invalid rows were dropped during cleaning. Review in dashboard.",
                "time": "1 hour ago",
                "type": "info",
            })
    else:
        # Fallback when no session meta exists
        alert_id += 1
        alerts.append({
            "id": alert_id,
            "title": "Data Cleaned",
            "message": "Your field data was successfully standardized and loaded.",
            "time": "1 hour ago",
            "type": "success",
        })

    return alerts


@alerts_bp.route("/alerts/<session_id>", methods=["GET"])
def get_alerts(session_id: str):
    try:
        validate_session_id(session_id)

        user_id = getattr(request, "user", {}).get("uid")
        if user_id and not verify_session_ownership(session_id, user_id):
            return jsonify({"code": "FORBIDDEN", "message": "You do not have access to this session."}), 403
        alerts = _generate_alerts(session_id)
        return jsonify({"alerts": alerts, "count": len(alerts)})
    except ValueError as exc:
        return jsonify({"code": "INVALID_SESSION", "message": str(exc)}), 400
    except Exception as exc:
        print(f"Alert generation error: {exc}")
        return jsonify({"code": "ALERT_ERROR", "message": str(exc)}), 500
