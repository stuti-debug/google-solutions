import unittest
from core.matching_engine import calculate_real_matches, _ORTOOLS_AVAILABLE

class TestMatchingEngine(unittest.TestCase):
    def setUp(self):
        # Sample beneficiary demands
        self.beneficiaries = [
            {
                "village": "Saidapet Bridge",
                "need_type": "Water",
                "household_size": 5,
                "status": "Pending"
            },
            {
                "village": "Chetpet Camp",
                "need_type": "Food",
                "household_size": 10,
                "status": "Pending"
            }
        ]

        # Sample warehouse inventory
        self.inventory_items = [
            {
                "warehouse": "Tambaram Shelter",
                "item_name": "Bottled Water",
                "category": "Water",
                "quantity": 100,
                "unit": "bottles"
            },
            {
                "warehouse": "Guindy Industrial Estate",
                "item_name": "Ration Kits",
                "category": "Food",
                "quantity": 50,
                "unit": "kits"
            }
        ]

        # Coordinate overrides to bypass external Geocoding API lookup
        self.location_overrides = {
            "Saidapet Bridge": (13.0154, 80.2220),
            "Chetpet Camp": (13.0714, 80.2376),
            "Tambaram Shelter": (12.9249, 80.1000),
            "Guindy Industrial Estate": (13.0067, 80.2206)
        }

    def test_matching_success(self):
        """Test that matches are successfully calculated using OR-Tools or greedy fallback."""
        matches = calculate_real_matches(
            self.beneficiaries,
            self.inventory_items,
            self.location_overrides
        )

        self.assertTrue(len(matches) > 0, "Should generate at least one match")
        
        # Verify structure of match records
        for m in matches:
            self.assertIn("id", m)
            self.assertIn("beneficiary", m)
            self.assertIn("need", m)
            self.assertIn("allocated", m)
            self.assertIn("unit", m)
            self.assertIn("source", m)
            self.assertIn("urgency", m)
            self.assertIn("solver", m)
            self.assertIn("dist_km", m)
            
            # Check coordinates are present and are floats
            self.assertIsInstance(m["source_lat"], float)
            self.assertIsInstance(m["source_lng"], float)
            self.assertIsInstance(m["dest_lat"], float)
            self.assertIsInstance(m["dest_lng"], float)

    def test_solver_mode(self):
        """Verify that the matching engine reports the correct solver used."""
        matches = calculate_real_matches(
            self.beneficiaries,
            self.inventory_items,
            self.location_overrides
        )

        for m in matches:
            if _ORTOOLS_AVAILABLE:
                self.assertEqual(m["solver"], "OR-Tools GLOP LP")
            else:
                self.assertEqual(m["solver"], "greedy")

    def test_no_supplies(self):
        """Test that no matches are generated when inventory is empty."""
        matches = calculate_real_matches(
            self.beneficiaries,
            [],
            self.location_overrides
        )
        self.assertEqual(len(matches), 0)

    def test_no_demands(self):
        """Test that no matches are generated when beneficiaries list is empty."""
        matches = calculate_real_matches(
            [],
            self.inventory_items,
            self.location_overrides
        )
        self.assertEqual(len(matches), 0)

if __name__ == "__main__":
    unittest.main()
