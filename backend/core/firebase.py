import os
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, firestore

_FIRESTORE_DB = None

def init_firebase() -> firestore.Client:
    """
    Initialize Firebase Admin SDK with service account path from env:
    FIREBASE_SERVICE_ACCOUNT_KEY_PATH
    """
    global _FIRESTORE_DB
    if _FIRESTORE_DB is not None:
        return _FIRESTORE_DB

    # 1. Try to load from raw JSON string (Best for Render/Heroku)
    raw_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
    if raw_json:
        import json
        try:
            cred_dict = json.loads(raw_json)
            cred = credentials.Certificate(cred_dict)
        except Exception as e:
            raise RuntimeError(f"Failed to parse FIREBASE_CREDENTIALS_JSON: {e}")
    else:
        # 2. Fallback to file path (Best for Localhost)
        cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY_PATH", "").strip()
        if not cred_path:
            if os.path.exists("./firebase-credentials.json"):
                cred_path = "./firebase-credentials.json"
            else:
                raise RuntimeError("Either FIREBASE_CREDENTIALS_JSON or FIREBASE_SERVICE_ACCOUNT_KEY_PATH is required.")
        
        if not Path(cred_path).is_file():
            raise RuntimeError(f"Firebase service account key file not found: {cred_path}")
        
        cred = credentials.Certificate(cred_path)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)

    _FIRESTORE_DB = firestore.client()
    return _FIRESTORE_DB

def get_db():
    if _FIRESTORE_DB is None:
        return init_firebase()
    return _FIRESTORE_DB
