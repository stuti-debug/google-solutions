import re
import random
import math
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

# Keywords that indicate a location is a crisis zone (not a proper supply depot)
# Any inventory item whose warehouse name contains these keywords should NOT be used as a primary supply source
CRISIS_ZONE_KEYWORDS = {
    "camp", "shelter", "relief center", "relief camp", "flood zone",
    "evacuation", "refugee", "displaced", "crisis zone", "temporary",
    "bridge", "transit", "staging",
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

def normalize_location(name: str) -> str:
    """Standardize location names to resolve fuzzy matches (e.g., abbreviations, casing)."""
    if not name:
        return "unknown"
    n = str(name).lower().strip()
    # Remove punctuation
    n = re.sub(r'[^\w\s]', '', n)
    # Expand common abbreviations
    n = re.sub(r'\bbr\b', 'bridge', n)
    n = re.sub(r'\bctr\b', 'center', n)
    n = re.sub(r'\bste\b', 'suite', n)
    n = re.sub(r'\bdist\b', 'district', n)
    # Collapse multiple spaces
    n = re.sub(r'\s+', ' ', n)
    return n.strip()

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in kilometers between two points on the earth."""
    R = 6371.0 # Earth radius in kilometers
    
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

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
        norm_village = normalize_location(village)
        village_groups[norm_village].append((village, b))

    priorities = []
    pri_idx = 1

    for norm_village, rows_data in village_groups.items():
        # Use the most common original name for display
        original_names = [rd[0] for rd in rows_data]
        display_village = max(set(original_names), key=original_names.count)
        rows = [rd[1] for rd in rows_data]
        
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

        # Generate a fully data-driven reasoning string unique to this zone
        top_needs = sorted(needs_count.items(), key=lambda x: x[1], reverse=True)
        top_need_name = top_needs[0][0] if top_needs else "General"
        top_need_count = top_needs[0][1] if top_needs else 0
        needs_str = ", ".join([f"{k} ({v} req.)" for k, v in top_needs[:3]])
        
        # Build a specific insight tailored to the zone's situation
        if urgency == "Critical":
            primary = f"CRITICAL: {top_need_count} active {top_need_name} request(s) among {total_affected} civilians."
            if pending_count > 0:
                primary += f" {pending_count} case(s) still pending resolution."
            if has_water_need and has_medical_need:
                primary += " Both water safety and medical support are simultaneously required."
            elif has_water_need:
                primary += " Water access is the primary bottleneck — immediate supply dispatch required."
            elif has_medical_need:
                primary += " Medical supply shortfall is the primary risk — first aid kits and medicines needed urgently."
        elif urgency == "High":
            primary = f"HIGH PRIORITY: {total_affected} residents with unmet {top_need_name} needs ({top_need_count} requests)."
            if pending_count > 0:
                primary += f" {pending_count} pending case(s) at risk of escalation."
        elif urgency == "Medium":
            primary = f"Moderate need: {total_affected} residents, primarily requiring {top_need_name}."
            if pending_count > 0:
                primary += f" Monitor {pending_count} pending case(s) to prevent escalation."
            else:
                primary += " Situation stable but supply refresh recommended within 48 hours."
        else:
            primary = f"Low urgency: {total_affected} residents. Top need: {top_need_name} ({top_need_count} request(s)). No immediate action required."
        
        reasoning = f"{primary} Full breakdown: {needs_str}."

        # Coordinates lookup
        needs_geocoding = False
        
        # Check overrides using normalized name
        norm_overrides = {normalize_location(k): v for k, v in location_overrides.items()}
        if norm_village in norm_overrides:
            lat, lng = norm_overrides[norm_village]
        else:
            # Check CHENNAI_COORDS using normalized name
            norm_chennai = {normalize_location(k): v for k, v in CHENNAI_COORDS.items()}
            lat, lng = norm_chennai.get(norm_village, (13.0827, 80.2707))
            if (lat, lng) == (13.0827, 80.2707):
                needs_geocoding = True

        priorities.append({
            "id": f"pri-{pri_idx}",
            "location": display_village,
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

def calculate_real_matches(beneficiaries: List[Dict[str, Any]], inventory_items: List[Dict[str, Any]], location_overrides: Dict[str, Tuple[float, float]] = None) -> List[Dict[str, Any]]:
    """Greedily allocate inventory quantities to satisfy beneficiary need demands, prioritizing closest warehouses."""
    if location_overrides is None:
        location_overrides = {}
    if not beneficiaries or not inventory_items:
        return []

    # 1. Group demands by village + need category
    demands = defaultdict(int)
    village_display_names = {}
    for b in beneficiaries:
        village = get_val(b, "village") or "Unknown Camp"
        norm_village = normalize_location(village)
        # Store original name for display
        if norm_village not in village_display_names:
            village_display_names[norm_village] = village
            
        need = get_val(b, "need_type") or "General"
        try:
            hh_size = int(get_val(b, "household_size") or 1)
        except:
            hh_size = 1
        
        category = map_need_to_category(need)
        demands[(norm_village, category)] += hh_size

    # 2. Group inventory by item
    inv_pool = []
    for item in inventory_items:
        name = get_val(item, "item_name") or "Supplies"
        category = get_val(item, "category") or "General"
        warehouse = get_val(item, "warehouse") or "Main Depot"
        norm_warehouse = normalize_location(warehouse)
        unit = get_val(item, "unit") or "units"
        try:
            qty = float(get_val(item, "quantity") or 0)
        except:
            qty = 0

        if qty > 0:
            norm_w_lower = norm_warehouse.lower()
            # Detect if this warehouse is actually a crisis zone (not a real depot)
            is_crisis_zone = any(kw in norm_w_lower for kw in CRISIS_ZONE_KEYWORDS)
            inv_pool.append({
                "name": name,
                "category": category,
                "warehouse": warehouse,
                "norm_warehouse": norm_warehouse,
                "unit": unit,
                "qty": qty,
                "is_crisis_zone": is_crisis_zone,
            })

    matches = []
    match_idx = 1

    # Sort demands by largest household size first
    sorted_demands = sorted(demands.items(), key=lambda x: x[1], reverse=True)

    for (norm_village, category), total_needed_people in sorted_demands:
        display_village = village_display_names.get(norm_village, "Unknown Camp")
        
        # Determine village coordinates
        norm_overrides = {normalize_location(k): v for k, v in location_overrides.items()}
        norm_chennai = {normalize_location(k): v for k, v in CHENNAI_COORDS.items()}
        
        if norm_village in norm_overrides:
            v_lat, v_lng = norm_overrides[norm_village]
        else:
            v_lat, v_lng = norm_chennai.get(norm_village, (13.0827, 80.2707))

        # Sort inventory pool by distance to the village
        def get_inv_distance(item):
            norm_w = item["norm_warehouse"]
            if norm_w in norm_overrides:
                w_lat, w_lng = norm_overrides[norm_w]
            else:
                w_lat, w_lng = norm_chennai.get(norm_w, (13.0827, 80.2707))
            return haversine(v_lat, v_lng, w_lat, w_lng)

        sorted_inv_pool = sorted(inv_pool, key=get_inv_distance)

        def try_allocate(pool):
            """Try to allocate from the given pool, return True if successful."""
            nonlocal match_idx
            for item in pool:
                if item["qty"] <= 0:
                    continue
                # Prevent self-routing using normalized names
                if item["norm_warehouse"] == norm_village or get_inv_distance(item) < 0.1:
                    continue
                # Check matching category or name overlap
                is_match = (item["category"].lower() == category.lower()) or (category.lower() in item["name"].lower())
                if is_match:
                    return item
            return None

        # First pass: only use real depots (non-crisis-zone warehouses)
        real_depot_pool = [i for i in sorted_inv_pool if not i.get("is_crisis_zone", False)]
        # Second pass fallback: use crisis-zone warehouses only if no real depot can help
        fallback_pool = [i for i in sorted_inv_pool if i.get("is_crisis_zone", False)]

        # Find inventory items in this category (prefer real depots, fallback to crisis zones)
        for item in real_depot_pool + fallback_pool:
            if item["qty"] <= 0:
                continue
            # Skip crisis-zone warehouses if a real depot match was already found
            if item.get("is_crisis_zone") and try_allocate(real_depot_pool):
                continue

            # Prevent self-routing using normalized names
            if item["norm_warehouse"] == norm_village or get_inv_distance(item) < 0.1:
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
                    dist_km = get_inv_distance(item)
                    resident_word = "resident" if total_needed_people == 1 else "residents"
                    reasoning = f"Dispatched {int(allocated_qty)} {item['unit']} of {item['name']} from {item['warehouse']} ({dist_km:.1f}km away) to cover {category} requirements for {total_needed_people} {resident_word} at {display_village}."

                    norm_w = item["norm_warehouse"]
                    if norm_w in norm_overrides:
                        w_lat, w_lng = norm_overrides[norm_w]
                    else:
                        w_lat, w_lng = norm_chennai.get(norm_w, (13.0827, 80.2707))

                    matches.append({
                        "id": f"match-{match_idx}",
                        "beneficiary": display_village,
                        "need": item["name"],
                        "allocated": int(allocated_qty),
                        "unit": item["unit"],
                        "source": item["warehouse"],
                        "reasoning": reasoning,
                        "urgency": urgency,
                        "source_lat": round(w_lat, 5),
                        "source_lng": round(w_lng, 5),
                        "dest_lat": round(v_lat, 5),
                        "dest_lng": round(v_lng, 5)
                    })
                    match_idx += 1

                    # Decrement remaining needed quantity
                    needed_qty -= allocated_qty
                    if needed_qty <= 0:
                        break

    return matches
