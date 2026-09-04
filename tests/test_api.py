"""Unit and integration tests for Flask REST API endpoints (Phase 6)."""

import json
import unittest
from app import app


class TestInvestigationAPI(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.client.testing = True

    def test_root_serves_frontend(self):
        """GET / serves index.html."""
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b"Transaction Risk Investigation Assistant", resp.data)

    def test_api_health(self):
        """GET /api/health returns valid system status."""
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["track_id"], "PS06")
        self.assertEqual(data["host"], "0.0.0.0:8000")
        self.assertIn("has_gemini_key", data)

    def test_get_customers_list(self):
        """GET /api/customers returns all customers."""
        resp = self.client.get("/api/customers")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("customers", data)
        self.assertEqual(data["count"], 6)
        ids = [c["customer_id"] for c in data["customers"]]
        self.assertIn("CUST_101", ids)
        self.assertIn("CUST_102", ids)

    def test_get_customer_details_success(self):
        """GET /api/customers/<id> returns transactions and profile."""
        resp = self.client.get("/api/customers/CUST_101")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["customer_id"], "CUST_101")
        self.assertEqual(data["name"], "Priya Sharma")
        self.assertGreater(len(data["transactions"]), 0)

    def test_get_customer_details_not_found(self):
        """GET /api/customers/<id> returns 404 for unknown customer."""
        resp = self.client.get("/api/customers/UNKNOWN_999")
        self.assertEqual(resp.status_code, 404)
        data = resp.get_json()
        self.assertIn("error", data)

    def test_investigate_clean_customer(self):
        """POST /api/investigate/<id> for clean customer returns NO_ATTENTION_REQUIRED."""
        resp = self.client.post("/api/investigate/CUST_101")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["overall_status"], "NO_ATTENTION_REQUIRED")
        self.assertEqual(data["findings"], [])
        self.assertEqual(data["flagged_transactions"], [])
        self.assertTrue(data["traceability_verified"])
        self.assertIn("ai_narrative", data)
        self.assertIn("NO IMMEDIATE ATTENTION REQUIRED", data["ai_narrative"]["content"])

    def test_investigate_risky_customer(self):
        """POST /api/investigate/<id> for risky customer returns ATTENTION_REQUIRED with evidence."""
        resp = self.client.post("/api/investigate/CUST_102")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["overall_status"], "ATTENTION_REQUIRED")
        self.assertGreater(len(data["findings"]), 0)
        self.assertGreater(len(data["flagged_transactions"]), 0)
        self.assertTrue(data["traceability_verified"])
        self.assertIn("ai_narrative", data)

        flagged_ids = [t["transaction_id"] for t in data["flagged_transactions"]]
        self.assertIn("TX102_28", flagged_ids)
        self.assertIn("TX102_28", data["ai_narrative"]["content"])

    def test_investigate_not_found(self):
        """POST /api/investigate/<id> returns 404 for invalid customer."""
        resp = self.client.post("/api/investigate/UNKNOWN_XYZ")
        self.assertEqual(resp.status_code, 404)
        data = resp.get_json()
        self.assertIn("error", data)


if __name__ == "__main__":
    unittest.main()
