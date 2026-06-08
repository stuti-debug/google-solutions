from flask import Blueprint, jsonify
from core.security import validate_session_id
from core.app_globals import store
from core.matching_engine import calculate_real_matches

match_bp = Blueprint('match', __name__)

@match_bp.route('/match/<session_id>', methods=['GET'])
def get_supply_match(session_id):
    try:
        validate_session_id(session_id)
        
        # Fetch rows from SQLite/Firestore
        beneficiaries = store.get_session_rows(session_id, file_type="beneficiary")
        inventory = store.get_session_rows(session_id, file_type="inventory")
        
        matches = calculate_real_matches(beneficiaries, inventory)
        
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
                    "urgency": "High"
                },
                {
                    "id": "match-2",
                    "beneficiary": "Velachery Sector 4",
                    "need": "Medical Supplies",
                    "allocated": 150,
                    "unit": "Boxes",
                    "source": "Red Cross Depot",
                    "reasoning": "Highest concentration of vulnerable elderly beneficiaries.",
                    "urgency": "High"
                },
                {
                    "id": "match-3",
                    "beneficiary": "Tambaram Shelter",
                    "need": "Blankets",
                    "allocated": 300,
                    "unit": "Items",
                    "source": "Main Warehouse B",
                    "reasoning": "Inventory expiry approaching; optimal allocation to nearest shelter.",
                    "urgency": "Medium"
                }
            ]
        
        return jsonify({
            "matches": matches,
            "status": "success"
        })

    except Exception as e:
        return jsonify({"code": "MATCH_ERROR", "message": str(e)}), 500
