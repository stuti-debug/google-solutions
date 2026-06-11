import re
import random
from collections import defaultdict
from typing import Any, Dict, List, Tuple

# Coordinates for known/fallback locations in Chennai
CHENNAI_COORDS = {
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

def get_val(row: Dict[str, Any], *keys: str) -> Any:
    """Case-insensitive key getter for database rows."""
    for key in keys:
        if key in row:
            return row[key]
        for rk in row.keys():
            if rk.lower() == key.lower():
                return row[rk]
    return None

def map_need_to_category(need: str) -> str:
    """Normalize beneficiary need string into a standard inventory category."""
    n = str(need or "").lower().strip()
    if "water" in n:
        return "Water"
    if "med" in n or "health" in n or "doc" in n or "first aid" in n or "tablet" in n:
        return "Medical"
    if "food" in n or "ration" in n or "rice" in n or "milk" in n or "biscuit" in n or "grain" in n:
        return "Food"
    if "shelter" in n or "tent" in n or "blanket" in n or "tarp" in n:
        return "Shelter"
    if "hygiene" in n or "pad" in n or "soap" in n:
        return "Hygiene"
    return "General"

def calculate_real_priorities(beneficiaries: List[Dict[str, Any]], location_overrides: Dict[str, Tuple[float, float]] = None) -> List[Dict[str, Any]]:
    """Calculate dynamic priority scores based on beneficiary need types and counts."""
    if location_overrides is None:
        location_overrides = {}
    if not beneficiaries:
        return []

    # Group by village
    village_groups = defaultdict(list)
    for b in beneficiaries:
        village = get_val(b, "village") or "Unknown Camp"
        village_groups[village].append(b)

    priorities = []
    pri_idx = 1

    for village, rows in village_groups.items():
        total_affected = 0
        needs_count = defaultdict(int)
        pending_count = 0
        
        for r in rows:
            try:
                hh_size = int(get_val(r, "household_size") or 1)
            except:
                hh_size = 1
            total_affected += hh_size
            
            need = get_val(r, "need_type") or "General"
            needs_count[need] += 1
            
            status = str(get_val(r, "status") or "").lower()
            if "pending" in status:
                pending_count += 1

        # Calculate a dynamic priority score
        # Base score based on affected population size
        base_score = 40 + min(40, total_affected * 1.5)
        
        # Add weights for critical needs
        has_water_need = any("water" in str(k).lower() for k in needs_count.keys())
        has_medical_need = any("med" in str(k).lower() for k in needs_count.keys())
        
        if has_water_need:
            base_score += 10
        if has_medical_need:
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

        # Generate a dynamic reason string
        top_needs = sorted(needs_count.items(), key=lambda x: x[1], reverse=True)
        needs_str = ", ".join([f"{k} ({v} requests)" for k, v in top_needs[:2]])
        
        reasoning = f"Priority calculated from {len(rows)} records. Top needs: {needs_str}. Total affected: {total_affected} civilians."
        if has_water_need and urgency in ("Critical", "High"):
            reasoning = f"Critical water safety & access alerts reported. {total_affected} residents affected. Requires immediate delivery."
        elif has_medical_need and pending_count > 0:
            reasoning = f"Unresolved medical assistance requests for vulnerable elderly and families. Coordination needed."

        # Coordinates lookup
        norm_village = village.lower().strip()
        needs_geocoding = False
        
        if village in location_overrides:
            lat, lng = location_overrides[village]
        else:
            lat, lng = CHENNAI_COORDS.get(norm_village, (13.0827, 80.2707))
            if (lat, lng) == (13.0827, 80.2707):
                needs_geocoding = True

        priorities.append({
            "id": f"pri-{pri_idx}",
            "location": village,
            "score": score,
            "urgency_level": urgency,
            "affected": total_affected,
            "reasoning": reasoning,
            "lat": round(lat, 5),
            "lng": round(lng, 5),
            "needs_geocoding": needs_geocoding
        })
        pri_idx += 1

    # Sort priorities by score descending
    return sorted(priorities, key=lambda x: x["score"], reverse=True)

def calculate_real_matches(beneficiaries: List[Dict[str, Any]], inventory_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Greedily allocate inventory quantities to satisfy beneficiary need demands."""
    if not beneficiaries or not inventory_items:
        return []

    # 1. Group demands by village + need category
    demands = defaultdict(int)
    for b in beneficiaries:
        village = get_val(b, "village") or "Unknown Camp"
        need = get_val(b, "need_type") or "General"
        try:
            hh_size = int(get_val(b, "household_size") or 1)
        except:
            hh_size = 1
        
        category = map_need_to_category(need)
        demands[(village, category)] += hh_size

    # 2. Group inventory by item
    inv_pool = []
    for item in inventory_items:
        name = get_val(item, "item_name") or "Supplies"
        category = get_val(item, "category") or "General"
        warehouse = get_val(item, "warehouse") or "Main Depot"
        unit = get_val(item, "unit") or "units"
        try:
            qty = float(get_val(item, "quantity") or 0)
        except:
            qty = 0

        if qty > 0:
            inv_pool.append({
                "name": name,
                "category": category,
                "warehouse": warehouse,
                "unit": unit,
                "qty": qty
            })

    matches = []
    match_idx = 1

    # Sort demands by largest household size first
    sorted_demands = sorted(demands.items(), key=lambda x: x[1], reverse=True)

    for (village, category), total_needed_people in sorted_demands:
        # Find inventory items in this category
        for item in inv_pool:
            if item["qty"] <= 0:
                continue

            # Check matching category or name overlap
            is_match = (item["category"].lower() == category.lower()) or (category.lower() in item["name"].lower())
            if is_match:
                # Determine allocation size based on units
                multiplier = 1
                unit_l = item["unit"].lower()
                if "tablet" in unit_l or "sachet" in unit_l:
                    multiplier = 10  # e.g., 10 tablets/sachets per person
                elif "piece" in unit_l or "pack" in unit_l or "kit" in unit_l:
                    multiplier = 1   # e.g., 1 blanket/pack/kit per person
                
                needed_qty = total_needed_people * multiplier
                allocated_qty = min(item["qty"], needed_qty)

                if allocated_qty > 0:
                    item["qty"] -= allocated_qty

                    # Urgency rating
                    urgency = "Low"
                    if total_needed_people > 15:
                        urgency = "High"
                    elif total_needed_people > 5:
                        urgency = "Medium"

                    # Custom reasoning
                    reasoning = f"Dispatched {int(allocated_qty)} {item['unit']} of {item['name']} from {item['warehouse']} to cover {category} requirements for {total_needed_people} residents at {village}."

                    matches.append({
                        "id": f"match-{match_idx}",
                        "beneficiary": village,
                        "need": item["name"],
                        "allocated": int(allocated_qty),
                        "unit": item["unit"],
                        "source": item["warehouse"],
                        "reasoning": reasoning,
                        "urgency": urgency
                    })
                    match_idx += 1

                    # Decrement remaining needed quantity
                    needed_qty -= allocated_qty
                    if needed_qty <= 0:
                        break

    return matches
