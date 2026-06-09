from typing import Optional

def collection_for_file_type(file_type: str) -> Optional[str]:
    mapping = {
        "beneficiary": "beneficiaries",
        "inventory": "inventory",
        "donor": "donors",
    }
    return mapping.get((file_type or "").lower().strip())
