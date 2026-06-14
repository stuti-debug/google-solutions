from flask import Blueprint, jsonify, request
from core.security import validate_session_id, verify_session_ownership
from core.app_globals import store
from core.matching_engine import calculate_real_matches

match_bp = Blueprint('match', __name__)

@match_bp.route('/match/<session_id>', methods=['GET'])
def get_supply_match(session_id):
    try:
        validate_session_id(session_id)

        user_id = getattr(request, "user", {}).get("uid")
        if user_id and not verify_session_ownership(session_id, user_id):
            return jsonify({"code": "FORBIDDEN", "message": "You do not have access to this session."}), 403
        
        # Fetch rows from SQLite/Firestore
        beneficiaries = store.get_session_rows(session_id, file_type="beneficiary")
        inventory = store.get_session_rows(session_id, file_type="inventory")
        
        overrides = store.get_location_overrides(session_id)
        matches = calculate_real_matches(beneficiaries, inventory, location_overrides=overrides)
        
        # Fallback to demo matches if no data is uploaded in this session yet
        if not matches:
            matches = [
                {
                    "id": "match-1",
                    "beneficiary": "Chetpet Camp",
                    "need": "Water (Critical)",
                    "allocated": 500,
                    "unit": "Kits",
                    "source": "Main Warehouse A",
                    "reasoning": "Prioritized due to 95% capacity alert and contaminated local supply.",
                    "urgency": "High",
                    "source_lat": 13.0827, "source_lng": 80.2707,
                    "dest_lat": 13.0714, "dest_lng": 80.2376
                },
                {
                    "id": "match-2",
                    "beneficiary": "Velachery Sector 4",
                    "need": "Medical Supplies",
                    "allocated": 150,
                    "unit": "Boxes",
                    "source": "Red Cross Depot",
                    "reasoning": "Highest concentration of vulnerable elderly beneficiaries.",
                    "urgency": "High",
                    "source_lat": 13.0400, "source_lng": 80.2300,
                    "dest_lat": 12.9815, "dest_lng": 80.2180
                },
                {
                    "id": "match-3",
                    "beneficiary": "Tambaram Shelter",
                    "need": "Blankets",
                    "allocated": 300,
                    "unit": "Items",
                    "source": "Main Warehouse B",
                    "reasoning": "Inventory expiry approaching; optimal allocation to nearest shelter.",
                    "urgency": "Medium",
                    "source_lat": 12.9500, "source_lng": 80.1400,
                    "dest_lat": 12.9249, "dest_lng": 80.1000
                }
            ]
        
        return jsonify({
            "matches": matches,
            "status": "success"
        })

    except Exception as e:
        return jsonify({"code": "MATCH_ERROR", "message": str(e)}), 500
