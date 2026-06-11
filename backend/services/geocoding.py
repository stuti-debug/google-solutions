import os
import sqlite3
import googlemaps
from typing import Tuple, Optional

class GeocodingService:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or os.getenv("CRISISGRID_DB_PATH", "crisisgrid.db")
        self.maps_key = os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("VITE_GOOGLE_MAPS_API_KEY")
        self.client = None
        if self.maps_key:
            try:
                self.client = googlemaps.Client(key=self.maps_key)
            except Exception as e:
                print(f"Failed to initialize googlemaps client: {e}")
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS geocoding_cache (
                    address TEXT PRIMARY KEY,
                    lat REAL NOT NULL,
                    lng REAL NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

    def geocode(self, address: str) -> Optional[Tuple[float, float]]:
        if not address:
            return None
            
        address_clean = address.lower().strip()
        
        # 1. Try local cache
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT lat, lng FROM geocoding_cache WHERE address = ?", 
                (address_clean,)
            )
            row = cursor.fetchone()
            if row:
                return float(row[0]), float(row[1])
                
        # 2. Call Google Geocoding API if key is present
        if self.client:
            try:
                # Add location context to restrict/improve search results
                result = self.client.geocode(address + ", Chennai, India")
                if result:
                    loc = result[0]['geometry']['location']
                    lat, lng = loc['lat'], loc['lng']
                    
                    # Save to cache
                    with sqlite3.connect(self.db_path) as conn:
                        conn.execute(
                            "INSERT OR REPLACE INTO geocoding_cache(address, lat, lng) VALUES (?, ?, ?)",
                            (address_clean, lat, lng)
                        )
                    return lat, lng
            except Exception as e:
                print(f"Geocoding API error for {address}: {e}")
                
        return None
