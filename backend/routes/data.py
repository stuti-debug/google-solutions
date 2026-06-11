from flask import Blueprint, request, jsonify, Response
import io
import csv
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional
from core.security import validate_session_id, verify_session_ownership
from core.app_globals import store
from core.firebase import get_db

data_bp = Blueprint('data', __name__)


def _clean_file_type(value: Any) -> str:
    normalized = str(value or "unknown").lower().strip()
    if normalized in {"beneficiaries", "beneficiary"}:
        return "beneficiary"
    if normalized in {"donors", "donor"}:
        return "donor"
    if normalized in {"inventory", "inventories"}:
        return "inventory"
    return normalized or "unknown"


def _first_present(row: Dict[str, Any], keys: List[str]) -> Optional[Any]:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


def _to_number(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        cleaned = str(value).replace(",", "").strip()
        if not cleaned:
            return None
        return float(cleaned)
    except (TypeError, ValueError):
        return None


def _format_number(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _build_insight_context(metadata: Dict[str, Any], rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    type_counts: Counter = Counter()
    district_counts: Counter = Counter()
    needs_by_district: Dict[str, Counter] = defaultdict(Counter)
    low_inventory: List[Dict[str, Any]] = []
    donor_amounts: Counter = Counter()
    missing_counts: Counter = Counter()
    total_cells = 0

    for row in rows:
        file_type = _clean_file_type(row.get("_file_type") or row.get("file_type") or metadata.get("file_type"))
        type_counts[file_type] += 1

        district = _first_present(row, ["district", "District", "location", "Location", "city", "City"])
        district_name = str(district).strip() if district is not None else ""
        if district_name:
            district_counts[district_name] += 1

        for key, value in row.items():
            if key.startswith("_"):
                continue
            total_cells += 1
            if value in (None, "", "null", "NULL", "N/A", "n/a", "-"):
                missing_counts[key] += 1

        if file_type == "beneficiary":
            need = _first_present(row, ["need_type", "need", "Need", "requirement", "Requirement"])
            if district_name and need:
                needs_by_district[district_name][str(need)] += 1

        if file_type == "inventory":
            quantity = _to_number(_first_present(row, ["quantity", "qty", "stock", "Quantity", "Stock"]))
            if quantity is not None and quantity <= 10:
                low_inventory.append({
                    "item": _first_present(row, ["item_name", "item", "Item", "category", "Category"]) or "Unnamed item",
                    "quantity": quantity,
                    "district": district_name or _first_present(row, ["warehouse", "Warehouse"]) or "unknown location",
                })

        if file_type == "donor":
            amount = _to_number(_first_present(row, ["amount", "Amount", "amount_donated", "Amount_USD"]))
            if amount is not None:
                donor_key = district_name or "unspecified district"
                donor_amounts[donor_key] += amount

    low_inventory.sort(key=lambda item: item["quantity"])
    top_missing = [
        {"field": field, "missing": count}
        for field, count in missing_counts.most_common(5)
    ]
    top_needs = [
        {
            "district": district,
            "need": need_counts.most_common(1)[0][0],
            "count": need_counts.most_common(1)[0][1],
        }
        for district, need_counts in needs_by_district.items()
        if need_counts
    ]
    top_needs.sort(key=lambda item: item["count"], reverse=True)

    return {
        "record_count": len(rows),
        "type_counts": dict(type_counts),
        "top_districts": [{"district": name, "records": count} for name, count in district_counts.most_common(5)],
        "top_needs_by_district": top_needs[:5],
        "low_inventory_items": low_inventory[:5],
        "donor_amounts_by_district": [
            {"district": district, "amount": amount}
            for district, amount in donor_amounts.most_common(5)
        ],
        "missing_fields": top_missing,
        "missing_cell_count": int(sum(missing_counts.values())),
        "total_cell_count": int(total_cells),
        "summary": metadata.get("summary", {}),
    }


def _generate_data_backed_insights(context: Dict[str, Any]) -> List[str]:
    insights: List[str] = []
    type_counts = context.get("type_counts", {})
    top_districts = context.get("top_districts", [])
    top_needs = context.get("top_needs_by_district", [])
    low_inventory = context.get("low_inventory_items", [])
    donor_amounts = context.get("donor_amounts_by_district", [])
    missing_fields = context.get("missing_fields", [])
    summary = context.get("summary", {})

    if type_counts:
        readable = ", ".join(f"{count} {file_type}" for file_type, count in sorted(type_counts.items()))
        insights.append(f"Unified session contains {readable} records.")

    if low_inventory:
        item = low_inventory[0]
        insights.append(
            f"{item['item']} is low at {_format_number(item['quantity'])} units in {item['district']}."
        )

    if top_needs:
        need = top_needs[0]
        insights.append(f"{need['district']} has the highest recorded {need['need']} need ({need['count']} rows).")
    elif top_districts:
        district = top_districts[0]
        insights.append(f"{district['district']} has the highest record concentration ({district['records']} rows).")

    if donor_amounts:
        donor = donor_amounts[0]
        insights.append(f"{donor['district']} has the largest recorded donor amount ({_format_number(donor['amount'])}).")

    if missing_fields:
        field = missing_fields[0]
        insights.append(f"{field['field']} has the most missing values ({field['missing']} cells).")

    dropped = int(summary.get("droppedInvalidRows") or 0)
    if dropped > 0:
        insights.append(f"{dropped} invalid rows were dropped and should be reviewed before field action.")

    if not insights:
        record_count = context.get("record_count", 0)
        insights.append(f"{record_count} cleaned records are ready for review.")

    return insights[:3]


def _get_firestore_session_meta(session_id: str):
    """Fallback: fetch session metadata from Firestore when local SQLite is empty."""
    db = get_db()
    if db is None:
        return None
    try:
        doc = db.collection("sessions").document(session_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        return {
            "session_id": session_id,
            "file_type": data.get("file_type", "unknown"),
            "record_count": data.get("record_count", 0),
            "columns": data.get("columns") or data.get("summary", {}).get("columns", []),
            "summary": data.get("summary", {}),
        }
    except Exception:
        return None


def _get_firestore_session_page(session_id: str, file_type: str, page: int, limit: int):
    """Fallback: fetch paginated session rows from Firestore."""
    db = get_db()
    if db is None:
        return {"page": page, "limit": limit, "total_records": 0, "rows": []}

    # Determine the Firestore collection based on file_type
    collection_map = {
        "beneficiary": "beneficiaries",
        "inventory": "inventory",
        "donor": "donors",
    }
    requested_type = (file_type or "").lower().strip()
    if requested_type in {"all", "multiple", ""}:
        collection_names = list(collection_map.values())
    else:
        collection_names = [collection_map.get(requested_type, "beneficiaries")]

    try:
        # Get total count
        all_rows = []
        for collection_name in collection_names:
            all_docs = db.collection(collection_name).where(
                "session_id", "==", session_id
            ).stream()
            for doc in all_docs:
                d = doc.to_dict()
                # Convert timestamps to strings
                for k, v in d.items():
                    if hasattr(v, "isoformat"):
                        d[k] = v.isoformat()
                row_type = d.get("file_type")
                # Remove internal fields from the response
                d.pop("session_id", None)
                d.pop("file_type", None)
                d.pop("synced_at", None)
                d["_file_type"] = row_type
                all_rows.append((d.get("row_index", 0), d))

        # Sort by row_index
        all_rows.sort(key=lambda x: x[0])
        total = len(all_rows)

        # Paginate
        offset = (page - 1) * limit
        page_rows = [row[1] for row in all_rows[offset:offset + limit]]

        # Remove row_index from output
        for row in page_rows:
            row.pop("row_index", None)

        return {
            "page": page,
            "limit": limit,
            "total_records": total,
            "file_type": requested_type or "all",
            "rows": page_rows,
        }
    except Exception:
        return {"page": page, "limit": limit, "total_records": 0, "rows": []}


@data_bp.route('/data/<session_id>', methods=['GET'])
def get_session_data(session_id: str):
    try:
        validate_session_id(session_id)

        user_id = getattr(request, "user", {}).get("uid")
        if user_id and not verify_session_ownership(session_id, user_id):
            return jsonify({"code": "FORBIDDEN", "message": "You do not have access to this session."}), 403

        # Try local SQLite first
        meta = store.get_session_meta(session_id)
        if meta:
            page = int(request.args.get("page", "1"))
            limit = int(request.args.get("limit", "50"))
            file_type = request.args.get("file_type") or request.args.get("type") or "all"
            data = store.get_session_page(session_id, page=page, limit=limit, file_type=file_type)
            return jsonify({
                **data,
                "summary": meta.get("summary", {}),
                "session_file_type": meta.get("file_type", "unknown"),
                "columns": meta.get("columns", []),
            })

        # Fallback to Firestore
        fs_meta = _get_firestore_session_meta(session_id)
        if not fs_meta:
            return jsonify({"code": "SESSION_NOT_FOUND", "message": "Session not found."}), 404

        page = int(request.args.get("page", "1"))
        limit = int(request.args.get("limit", "50"))
        file_type = request.args.get("file_type") or request.args.get("type") or fs_meta.get("file_type", "all")
        data = _get_firestore_session_page(session_id, file_type, page, limit)
        return jsonify({**data, "summary": fs_meta.get("summary", {}), "session_file_type": fs_meta.get("file_type", "unknown")})

    except ValueError as exc:
        return jsonify({"code": "INVALID_SESSION", "message": str(exc)}), 400
    except Exception:
        return jsonify({"code": "INTERNAL_ERROR", "message": "Failed to retrieve data."}), 500

@data_bp.route('/insights/<session_id>', methods=['GET'])
def get_insights(session_id: str):
    try:
        validate_session_id(session_id)

        user_id = getattr(request, "user", {}).get("uid")
        if user_id and not verify_session_ownership(session_id, user_id):
            return jsonify({"code": "FORBIDDEN", "message": "You do not have access to this session."}), 403

        # Try local SQLite first, fallback to Firestore.
        session_meta = store.get_session_meta(session_id) or _get_firestore_session_meta(session_id)
        if not session_meta:
            return jsonify({"insights": ["No data available for insights."]})

        file_type = session_meta.get("file_type", "unknown")

        page_data = store.get_session_page(session_id, page=1, limit=500, file_type="all")
        rows = page_data.get("rows", []) if page_data else []
        if not rows:
            fs_data = _get_firestore_session_page(session_id, file_type, 1, 50)
            rows = fs_data.get("rows", [])

        if not rows:
            return jsonify({"insights": ["No valid data to analyze."], "source": "none"})

        analytics = _build_insight_context(session_meta, rows)
        fallback_insights = _generate_data_backed_insights(analytics)

        try:
            from services.ai_mapper import GeminiAIMapper
            mapper = GeminiAIMapper()
            response = mapper.generate_insights(
                file_type=file_type,
                metadata=session_meta,
                sample_rows=rows[:50],
                analytics=analytics,
            )
            insights = response.get("insights", [])
            insights = [
                str(insight).strip()
                for insight in insights
                if isinstance(insight, str) and insight.strip()
            ]
            if insights:
                store.set_insights(session_id, insights[:3])
                return jsonify({"insights": insights[:3], "source": "gemini", "analytics": analytics})
        except Exception as exc:
            print(f"Gemini insight generation unavailable, using data-backed fallback: {exc}")

        store.set_insights(session_id, fallback_insights)
        return jsonify({
            "insights": fallback_insights,
            "source": "local_analytics",
            "analytics": analytics,
        })
    except Exception as exc:
        print(f"Insight generation failed: {exc}")
        return jsonify({"insights": ["Unable to generate insights for this session."], "source": "error"}), 500

@data_bp.route('/reports/<session_id>', methods=['GET'])
def get_reports(session_id: str):
    try:
        validate_session_id(session_id)
        
        user_id = getattr(request, "user", {}).get("uid")
        if user_id and not verify_session_ownership(session_id, user_id):
            return jsonify({"code": "FORBIDDEN", "message": "You do not have access to this session."}), 403
        
        # Try local first
        session_meta = store.get_session_meta(session_id)
        if not session_meta:
            session_meta = _get_firestore_session_meta(session_id)
            
        if not session_meta:
            return jsonify({"code": "NOT_FOUND", "message": "No data found to generate report."}), 404
            
        file_type = session_meta.get("file_type", "unknown")
        
        # Fetch all records for the session
        # For CSV generation, we'll fetch up to 1000 rows to prevent memory overload
        db = get_db()
        target_collection = "beneficiaries"
        if file_type.lower() == "inventory":
            target_collection = "inventory"
        elif file_type.lower() == "donor":
            target_collection = "donors"
            
        docs = db.collection(target_collection).where("session_id", "==", session_id).limit(1000).stream()
        
        records = []
        for doc in docs:
            d = doc.to_dict()
            # Clean up internal fields
            d.pop("session_id", None)
            d.pop("file_type", None)
            d.pop("synced_at", None)
            d.pop("row_index", None)
            records.append(d)
            
        if not records:
             return jsonify({"code": "NOT_FOUND", "message": "No records found for this session."}), 404

        import csv
        import io
        from flask import Response
        
        # Create CSV in memory
        output = io.StringIO()
        
        # Determine all unique headers across all records
        headers = set()
        for r in records:
            headers.update(r.keys())
        headers = sorted(list(headers))
        
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        for r in records:
            writer.writerow(r)
            
        csv_data = output.getvalue()
        
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-disposition": f"attachment; filename=crisisgrid_report_{session_id[:8]}.csv"}
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"code": "REPORT_ERROR", "message": str(e)}), 500

@data_bp.route('/export/<session_id>', methods=['GET'])
def export_csv(session_id: str):
    try:
        validate_session_id(session_id)

        user_id = getattr(request, "user", {}).get("uid")
        if user_id and not verify_session_ownership(session_id, user_id):
            return jsonify({"code": "FORBIDDEN", "message": "You do not have access to this session."}), 403

        local_meta = store.get_session_meta(session_id)
        requested_type = request.args.get("file_type") or request.args.get("type") or "all"
        if local_meta:
            data = store.get_session_page(session_id, 1, 10000, file_type=requested_type)
            rows = data.get("rows", [])
        else:
            fs_meta = _get_firestore_session_meta(session_id)
            if not fs_meta:
                return jsonify({"error": "Session not found"}), 404

            file_type = request.args.get("file_type") or request.args.get("type") or fs_meta.get("file_type", "all")
            data = _get_firestore_session_page(session_id, file_type, 1, 10000)
            rows = data.get("rows", [])

        if not rows:
            return jsonify({"error": "Session not found"}), 404

        output = io.StringIO()
        fieldnames = sorted({key for row in rows for key in row.keys()})
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
        
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-disposition": f"attachment; filename=crisisgrid_export_{session_id}.csv"}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@data_bp.route('/data/update/<session_id>', methods=['PUT', 'POST'])
def update_row(session_id: str):
    try:
        validate_session_id(session_id)
        
        user_id = getattr(request, "user", {}).get("uid")
        if user_id and not verify_session_ownership(session_id, user_id):
            return jsonify({"code": "FORBIDDEN", "message": "You do not have access to this session."}), 403

        payload = request.json or {}
        row_index = payload.get("row_index")
        updated_row = payload.get("updated_row")
        
        if row_index is None or not isinstance(updated_row, dict):
            return jsonify({"code": "BAD_REQUEST", "message": "Missing 'row_index' or 'updated_row'."}), 400
            
        success = store.update_session_row(session_id, int(row_index), updated_row)
        if not success:
            return jsonify({"code": "NOT_FOUND", "message": "Row or session not found."}), 404
            
        return jsonify({"success": True, "message": "Row updated successfully."})
        
    except ValueError as exc:
        return jsonify({"code": "INVALID_SESSION", "message": str(exc)}), 400
    except Exception as exc:
        print(f"Failed to update row: {exc}")
        return jsonify({"code": "INTERNAL_ERROR", "message": "Failed to update row."}), 500
