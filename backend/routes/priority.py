from flask import Blueprint, jsonify, request
from core.security import validate_session_id, verify_session_ownership
from core.app_globals import store
from core.matching_engine import calculate_real_priorities

priority_bp = Blueprint('priority', __name__)

@priority_bp.route('/priority/<session_id>', methods=['GET'])
def get_priority_scores(session_id):
    try:
        validate_session_id(session_id)

        user_id = getattr(request, "user", {}).get("uid")
        if user_id and not verify_session_ownership(session_id, user_id):
            return jsonify({"code": "FORBIDDEN", "message": "You do not have access to this session."}), 403
        
        # Fetch beneficiaries from SQLite/Firestore
        beneficiaries = store.get_session_rows(session_id, file_type="beneficiary")
        
        priorities = calculate_real_priorities(beneficiaries)
        
        # Fallback to demo priorities if no beneficiary data has been uploaded in this session yet
        if not priorities:
            priorities = [
                {
                    "id": "pri-1",
                    "location": "Chetpet Camp",
                    "score": 91,
                    "urgency_level": "Critical",
                    "affected": 1200,
                    "reasoning": "Critical stock shortage of water. Over 200 unmet medical needs. Last distribution was 5 days ago.",
                    "lat": 13.0714,
                    "lng": 80.2376
                },
                {
                    "id": "pri-2",
                    "location": "Velachery Sector 4",
                    "score": 85,
                    "urgency_level": "High",
                    "affected": 850,
                    "reasoning": "High concentration of vulnerable elderly. Depleted blanket inventory. Medical supplies needed.",
                    "lat": 12.9815,
                    "lng": 80.2180
                },
                {
                    "id": "pri-3",
                    "location": "Tambaram Shelter",
                    "score": 62,
                    "urgency_level": "Medium",
                    "affected": 400,
                    "reasoning": "Stable water supply, but food inventory dropping. Distribution occurred 2 days ago.",
                    "lat": 12.9249,
                    "lng": 80.1000
                },
                {
                    "id": "pri-4",
                    "location": "Guindy Relief Center",
                    "score": 45,
                    "urgency_level": "Low",
                    "affected": 250,
                    "reasoning": "Recent distribution completed successfully. Inventory levels are nominal.",
                    "lat": 13.0067,
                    "lng": 80.2206
                }
            ]
        
        return jsonify({
            "priorities": priorities,
            "status": "success"
        })

    except Exception as e:
        return jsonify({"code": "PRIORITY_ERROR", "message": str(e)}), 500
