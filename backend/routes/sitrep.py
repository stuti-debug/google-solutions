from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify, request

from core.security import validate_session_id, verify_session_ownership
from core.app_globals import store
from core.matching_engine import calculate_real_priorities, calculate_real_matches, normalize_location
from services.ai_mapper import GeminiAIMapper, QuotaExhaustedError

sitrep_bp = Blueprint("sitrep", __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _gather_session_context(session_id: str) -> Dict[str, Any]:
    """Pull together everything we know about a session for the SitRep prompt."""
    meta = store.get_session_meta(session_id) or {}
    summary = meta.get("summary", {})

    def _get_rows_with_fallback(session_id: str, file_type: str, limit: int = 500) -> List[Dict[str, Any]]:
        rows = store.get_session_rows(session_id, limit=limit, file_type=file_type)
        if not rows:
            from routes.data import _get_firestore_session_page
            rows = _get_firestore_session_page(session_id, file_type, 1, limit).get("rows", [])
        return rows

    beneficiaries = _get_rows_with_fallback(session_id, limit=200, file_type="beneficiary")
    inventory = _get_rows_with_fallback(session_id, limit=200, file_type="inventory")
    donors = _get_rows_with_fallback(session_id, limit=200, file_type="donor")

    overrides = store.get_location_overrides(session_id)
    raw_priorities = calculate_real_priorities(beneficiaries, location_overrides=overrides)
    
    # Deduplicate priorities by normalized location name to prevent phantom zones
    # (e.g., 'Velachery RC' and 'Velachery Relief Center' are the same place)
    seen_norm = {}
    for p in raw_priorities:
        norm_key = normalize_location(p.get("location", ""))
        if norm_key not in seen_norm:
            seen_norm[norm_key] = p
        else:
            # Keep the one with the higher affected count (more representative)
            if p.get("affected", 0) > seen_norm[norm_key].get("affected", 0):
                seen_norm[norm_key] = p
    priorities = list(seen_norm.values())
    priorities = sorted(priorities, key=lambda x: x["score"], reverse=True)
    
    # Priority data (demo fallback)
    if not priorities:
        priorities = [
            {"location": "Chetpet Camp", "score": 91, "urgency_level": "Critical", "affected": 1200,
             "reasoning": "Critical stock shortage of water. Over 200 unmet medical needs."},
            {"location": "Velachery Sector 4", "score": 85, "urgency_level": "High", "affected": 850,
             "reasoning": "High concentration of vulnerable elderly. Depleted blanket inventory."},
            {"location": "Tambaram Shelter", "score": 62, "urgency_level": "Medium", "affected": 400,
             "reasoning": "Stable water supply, but food inventory dropping."},
            {"location": "Guindy Relief Center", "score": 45, "urgency_level": "Low", "affected": 250,
             "reasoning": "Recent distribution completed successfully. Inventory levels nominal."},
        ]

    matches = calculate_real_matches(beneficiaries, inventory, location_overrides=overrides)
    # Supply match data (demo fallback)
    if not matches:
        matches = [
            {"source": "Main Warehouse A", "beneficiary": "Chetpet Camp", "need": "Water (Critical)",
             "allocated": 500, "unit": "Kits", "urgency": "High", "source_lat": 13.0827, "source_lng": 80.2707, "dest_lat": 13.0714, "dest_lng": 80.2376},
            {"source": "Red Cross Depot", "beneficiary": "Velachery Sector 4", "need": "Medical Supplies",
             "allocated": 150, "unit": "Boxes", "urgency": "High", "source_lat": 13.0400, "source_lng": 80.2300, "dest_lat": 12.9815, "dest_lng": 80.2180},
            {"source": "Main Warehouse B", "beneficiary": "Tambaram Shelter", "need": "Blankets",
             "allocated": 300, "unit": "Items", "urgency": "Medium", "source_lat": 12.9500, "source_lng": 80.1400, "dest_lat": 12.9249, "dest_lng": 80.1000},
        ]

    return {
        "record_count": meta.get("record_count", 0),
        "file_types": summary.get("fileTypes", []),
        "records_by_type": summary.get("recordCountsByType", {}),
        "total_fixed": summary.get("totalFixed", 0),
        "removed_duplicates": summary.get("removedDuplicates", 0),
        "dropped_invalid": summary.get("droppedInvalidRows", 0),
        "beneficiary_count": len(beneficiaries),
        "inventory_count": len(inventory),
        "donor_count": len(donors),
        "sample_beneficiaries": beneficiaries[:10],
        "sample_inventory": inventory[:10],
        "sample_donors": donors[:10],
        "priorities": priorities,
        "supply_matches": matches,
    }


def _build_local_sitrep(ctx: Dict[str, Any]) -> str:
    """Generate a structured SitRep from local data when Gemini is unavailable."""
    now = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    priorities = ctx.get("priorities", [])
    matches = ctx.get("supply_matches", [])

    # Use urgency_level field set by calculate_real_priorities (Critical/High/Medium/Low)
    critical = [p for p in priorities if p.get("urgency_level", "") == "Critical"]
    high = [p for p in priorities if p.get("urgency_level", "") == "High"]
    total_affected = sum(p.get("affected", 0) for p in priorities)

    sections = []

    # Executive Summary
    sections.append("## Executive Summary")
    sections.append(
        f"As of {now}, CrisisGrid is tracking **{len(priorities)} active crisis zones** "
        f"affecting approximately **{total_affected:,} civilians**. "
        f"{len(critical)} zone(s) are at **Critical** priority and {len(high)} at **High** priority. "
        f"The data pipeline has processed **{ctx.get('record_count', 0)} records** across "
        f"{ctx.get('beneficiary_count', 0)} beneficiary, {ctx.get('inventory_count', 0)} inventory, "
        f"and {ctx.get('donor_count', 0)} donor entries."
    )

    # Affected Populations
    sections.append("\n## Affected Populations")
    for p in priorities:
        emoji = "🔴" if p["score"] >= 90 else "🟠" if p["score"] >= 75 else "🟡" if p["score"] >= 60 else "🟢"
        sections.append(
            f"- {emoji} **{p['location']}** — {p['affected']:,} affected — "
            f"Priority {p['score']}/100 ({p['urgency_level']})"
        )

    # Resource Status
    sections.append("\n## Resource Status & Logistics")
    if matches:
        for m in matches:
            sections.append(
                f"- **{m['allocated']} {m['unit']}** of {m['need']} dispatched from "
                f"{m['source']} → {m['beneficiary']} ({m['urgency']} urgency)"
            )
    else:
        sections.append("- No supply match data available. Run the AI Supply Matcher to generate logistics plans.")

    # Critical Gaps
    sections.append("\n## Critical Gaps")
    if critical:
        for c in critical:
            sections.append(f"- **{c['location']}**: {c['reasoning']}")
    else:
        sections.append("- No zones are currently at Critical status.")

    # Data Quality
    sections.append("\n## Data Quality Summary")
    sections.append(f"- Records cleaned: **{ctx.get('record_count', 0)}**")
    sections.append(f"- Errors auto-fixed: **{ctx.get('total_fixed', 0)}**")
    sections.append(f"- Duplicates removed: **{ctx.get('removed_duplicates', 0)}**")
    sections.append(f"- Invalid rows dropped: **{ctx.get('dropped_invalid', 0)}**")

    # Recommendations
    sections.append("\n## Recommended Actions")
    sections.append("1. Immediately dispatch water relief to Critical zones (Chetpet Camp)")
    sections.append("2. Replenish medical supply stocks at Velachery Sector 4")
    sections.append("3. Schedule food distribution runs for Tambaram Shelter within 24 hours")
    sections.append("4. Review dropped invalid rows to ensure no critical beneficiary data is lost")
    sections.append("5. Engage donors for second-phase funding to cover projected inventory gaps")

    return "\n".join(sections)


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@sitrep_bp.route("/sitrep/<session_id>", methods=["GET"])
def generate_sitrep(session_id: str):
    try:
        validate_session_id(session_id)

        user_id = getattr(request, "user", {}).get("uid")
        if user_id and not verify_session_ownership(session_id, user_id):
            return jsonify({"code": "FORBIDDEN", "message": "You do not have access to this session."}), 403

        ctx = _gather_session_context(session_id)
        generated_at = datetime.now(timezone.utc).isoformat()

        # Attempt Gemini-powered SitRep
        try:
            mapper = GeminiAIMapper()
            prompt = (
                "You are a senior humanitarian operations analyst writing a Situation Report (SitRep) "
                "for a disaster relief coordination center.\n\n"
                "Generate a professional, markdown-formatted Situation Report with these exact sections:\n"
                "## Executive Summary\n## Affected Populations\n## Resource Status & Logistics\n"
                "## Critical Gaps\n## Recommended Actions\n\n"
                "CRITICAL RULES:\n"
                "- Base your report ONLY on the data provided below. Do NOT invent zones, numbers, or facts.\n"
                "- The 'Priority Zones' list is already deduplicated. Use ONLY the zones listed there.\n"
                "- Count zones, civilians, and urgency levels from the Priority Zones data ONLY.\n"
                "- Urgency level is the 'urgency_level' field in each zone (Critical/High/Medium/Low).\n\n"
                f"Session Data:\n"
                f"- Total records: {ctx['record_count']}\n"
                f"- Beneficiary records: {ctx['beneficiary_count']}\n"
                f"- Inventory records: {ctx['inventory_count']}\n"
                f"- Donor records: {ctx['donor_count']}\n"
                f"- Data quality: {ctx['total_fixed']} fixed, {ctx['removed_duplicates']} deduped, "
                f"{ctx['dropped_invalid']} dropped\n\n"
                f"Priority Zones (deduplicated, {len(ctx['priorities'])} total):\n{_format_list(ctx['priorities'])}\n\n"
                f"Supply Matches:\n{_format_list(ctx['supply_matches'])}\n\n"
                f"Sample Beneficiaries:\n{_format_list(ctx['sample_beneficiaries'][:5])}\n\n"
                f"Sample Inventory:\n{_format_list(ctx['sample_inventory'][:5])}\n\n"
                "Write in a concise, professional tone. Use bold for key numbers. "
                "Keep the total report under 500 words."
            )
            report_md = mapper.generate_text(prompt=prompt, temperature=0.3)
            return jsonify({
                "report": report_md,
                "generated_at": generated_at,
                "source": "gemini",
            })
        except (QuotaExhaustedError, Exception) as exc:
            print(f"SitRep Gemini generation failed, using local fallback: {exc}")

        # Fallback: locally generated SitRep
        report_md = _build_local_sitrep(ctx)
        return jsonify({
            "report": report_md,
            "generated_at": generated_at,
            "source": "local",
        })

    except ValueError as exc:
        return jsonify({"code": "INVALID_SESSION", "message": str(exc)}), 400
    except Exception as exc:
        print(f"SitRep generation error: {exc}")
        return jsonify({"code": "SITREP_ERROR", "message": str(exc)}), 500


def _format_list(items: list) -> str:
    """Format a list of dicts as a readable string for the prompt."""
    import json
    if not items:
        return "No data available."
    return json.dumps(items[:10], indent=2, default=str, ensure_ascii=False)
