import math
from typing import Any, Dict, List

from flask import Blueprint, jsonify, request

from core.security import validate_session_id, verify_session_ownership
from core.app_globals import store

forecast_bp = Blueprint("forecast", __name__)


def _first_present(row: Dict[str, Any], keys: List[str]):
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


def _to_number(value) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0


def _build_forecasts_from_inventory(inventory_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Aggregate inventory by item category and project depletion."""
    category_stocks: Dict[str, float] = {}

    for row in inventory_rows:
        item = str(
            _first_present(row, ["item_name", "item", "Item", "category", "Category"]) or "Other"
        ).strip()
        qty = _to_number(_first_present(row, ["quantity", "qty", "stock", "Quantity", "Stock"]))
        category_stocks[item] = category_stocks.get(item, 0) + qty

    forecasts = []
    # Consumption rates as a percentage of total affected population (~2700)
    # These simulate realistic daily draw-downs
    default_rates = {
        "water": 0.12,
        "food": 0.10,
        "medical": 0.06,
        "blanket": 0.04,
    }

    for item, current_stock in category_stocks.items():
        if current_stock <= 0:
            continue

        # Determine daily consumption rate
        item_lower = item.lower()
        rate_pct = 0.08  # default 8% daily
        for keyword, pct in default_rates.items():
            if keyword in item_lower:
                rate_pct = pct
                break

        daily_rate = max(1, current_stock * rate_pct)
        days_remaining = current_stock / daily_rate if daily_rate > 0 else 999

        # Build 7-day timeline
        timeline = []
        projected = current_stock
        for day in range(8):
            timeline.append({
                "day": day,
                "projected_stock": max(0, round(projected, 1)),
            })
            projected -= daily_rate

        forecasts.append({
            "item": item,
            "current_stock": round(current_stock, 1),
            "daily_rate": round(daily_rate, 1),
            "days_remaining": round(days_remaining, 1),
            "is_critical": days_remaining <= 3,
            "timeline": timeline,
        })

    # Sort: most critical first
    forecasts.sort(key=lambda f: f["days_remaining"])
    return forecasts


def _demo_forecasts() -> List[Dict[str, Any]]:
    """Fallback demo forecast data."""
    items = [
        {"item": "Water Kits", "current_stock": 500, "daily_rate": 65, "days_remaining": 7.7},
        {"item": "Food Packets", "current_stock": 300, "daily_rate": 55, "days_remaining": 5.5},
        {"item": "Medical Supplies", "current_stock": 150, "daily_rate": 38, "days_remaining": 3.9},
        {"item": "Blankets", "current_stock": 200, "daily_rate": 80, "days_remaining": 2.5},
    ]

    forecasts = []
    for item_data in items:
        current = item_data["current_stock"]
        rate = item_data["daily_rate"]
        timeline = []
        projected = current
        for day in range(8):
            timeline.append({
                "day": day,
                "projected_stock": max(0, round(projected, 1)),
            })
            projected -= rate

        forecasts.append({
            **item_data,
            "is_critical": item_data["days_remaining"] <= 3,
            "timeline": timeline,
        })

    forecasts.sort(key=lambda f: f["days_remaining"])
    return forecasts


@forecast_bp.route("/forecast/<session_id>", methods=["GET"])
def get_forecast(session_id: str):
    try:
        validate_session_id(session_id)

        user_id = getattr(request, "user", {}).get("uid")
        if user_id and not verify_session_ownership(session_id, user_id):
            return jsonify({"code": "FORBIDDEN", "message": "You do not have access to this session."}), 403

        inventory_rows = store.get_session_rows(session_id, limit=500, file_type="inventory")

        if inventory_rows:
            forecasts = _build_forecasts_from_inventory(inventory_rows)
        else:
            forecasts = []

        # If no real data produced results, use demo
        if not forecasts:
            forecasts = _demo_forecasts()

        return jsonify({
            "forecasts": forecasts,
            "status": "success",
        })

    except ValueError as exc:
        return jsonify({"code": "INVALID_SESSION", "message": str(exc)}), 400
    except Exception as exc:
        print(f"Forecast generation error: {exc}")
        return jsonify({"code": "FORECAST_ERROR", "message": str(exc)}), 500
