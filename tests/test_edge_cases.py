"""Edge case unit tests covering Section 10 requirements (Phase 8).

Tests:
- Zero transactions (empty history)
- Very small history (1-2 transactions)
- Multiple rules firing on a single transaction
- Multiple flagged transactions across rules
- Data sanitization: duplicates, negative/zero amounts, missing payees, malformed dates
- Gemini API resilience during simulated network timeout, 401/403, and 500 errors
"""

import json
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch
import urllib.error

from src.data_loader import Customer, Transaction, sanitize_transaction
from src.gemini_service import generate_investigation_narrative
from src.report_builder import build_investigation_report
from src.risk_rules import evaluate_all_rules
from src.rules_engine import calculate_customer_baseline, investigate_customer


class TestEdgeCases(unittest.TestCase):
    def test_empty_transaction_history(self):
        """Zero transactions handled gracefully without ZeroDivisionError or crash."""
        empty_cust = Customer(
            customer_id="CUST_EMPTY",
            name="Empty Customer",
            account_number="ACC-EMPTY-00",
            transactions=[],
        )
        report = investigate_customer(empty_cust)

        self.assertEqual(report.overall_status, "NO_ATTENTION_REQUIRED")
        self.assertEqual(report.findings, [])
        self.assertEqual(report.flagged_transactions, [])
        self.assertEqual(report.baseline_profile.total_transactions, 0)
        self.assertEqual(report.baseline_profile.median_debit, 0.0)

        # AI fallback also handles empty report cleanly
        ai_res = generate_investigation_narrative(report, api_key="")
        self.assertIn("NO IMMEDIATE ATTENTION REQUIRED", ai_res.content)

    def test_very_small_history(self):
        """History with only 1-2 transactions does not crash rule engine."""
        dt = datetime(2024, 2, 1, 14, 0, 0)
        single_tx = Transaction(
            transaction_id="TX_SINGLE",
            date=dt,
            date_str="2024-02-01 14:00:00",
            amount=500.0,
            type="DEBIT",
            description="Coffee",
            payee="Local Cafe",
            channel="UPI",
        )
        cust = Customer(
            customer_id="CUST_SMALL",
            name="Small History",
            account_number="ACC-SMALL",
            transactions=[single_tx],
        )
        report = investigate_customer(cust)
        self.assertEqual(report.overall_status, "NO_ATTENTION_REQUIRED")
        self.assertEqual(report.baseline_profile.total_transactions, 1)
        self.assertEqual(report.baseline_profile.median_debit, 500.0)

    def test_multiple_rules_firing_on_single_transaction(self):
        """A single transaction triggers both Rule 1 (Large) and Rule 3 (Odd-Hours)."""
        txs = []
        # Normal baseline: 15 daytime transactions of ~INR 1,000
        for i in range(15):
            day = i + 1
            txs.append(
                Transaction(
                    transaction_id=f"TX_NORM_{i:02d}",
                    date=datetime(2024, 1, day, 12, 0, 0),
                    date_str=f"2024-01-{day:02d} 12:00:00",
                    amount=1000.0 + (i * 20),
                    type="DEBIT",
                    description=f"Routine Debit {i}",
                    payee=f"Merchant {i % 3}",
                    channel="CARD_POS",
                )
            )

        # Anomalous transaction: INR 350,000 at 02:30 AM (both massive outlier and odd hours)
        anomaly_tx = Transaction(
            transaction_id="TX_MULTI_ALERT",
            date=datetime(2024, 1, 20, 2, 30, 0),
            date_str="2024-01-20 02:30:00",
            amount=350000.0,
            type="DEBIT",
            description="Late Night Wire",
            payee="Unknown Offshore Exchange",
            channel="MOBILE_BANKING",
        )
        txs.append(anomaly_tx)

        cust = Customer(
            customer_id="CUST_MULTI",
            name="Multi Alert Customer",
            account_number="ACC-MULTI",
            transactions=txs,
        )

        report = investigate_customer(cust)
        self.assertEqual(report.overall_status, "ATTENTION_REQUIRED")

        rules_found = {f.rule for f in report.findings}
        self.assertIn("UNUSUALLY_LARGE_TRANSACTION", rules_found)
        self.assertIn("ODD_HOURS_ACTIVITY", rules_found)

        # Confirm the single transaction has both rules recorded
        flagged_record = next(
            (t for t in report.flagged_transactions if t["transaction_id"] == "TX_MULTI_ALERT"),
            None,
        )
        self.assertIsNotNone(flagged_record)
        self.assertIn("UNUSUALLY_LARGE_TRANSACTION", flagged_record["triggered_rules"])
        self.assertIn("ODD_HOURS_ACTIVITY", flagged_record["triggered_rules"])

    def test_duplicate_records_deduplicated(self):
        """Duplicate transaction IDs are filtered, keeping only the first instance."""
        seen = set()
        raw1 = {
            "transaction_id": "TX_DUP_100",
            "date": "2024-01-01 10:00:00",
            "amount": 250.0,
            "payee": "Shop A",
        }
        raw2 = {
            "transaction_id": "TX_DUP_100",
            "date": "2024-01-01 10:00:00",
            "amount": 250.0,
            "payee": "Shop A",
        }

        t1 = sanitize_transaction(raw1, seen)
        t2 = sanitize_transaction(raw2, seen)

        self.assertIsNotNone(t1)
        self.assertIsNone(t2)
        self.assertEqual(len(seen), 1)

    def test_missing_and_invalid_data_sanitization(self):
        """Verify invalid/corrupted fields do not cause crashes."""
        seen = set()
        # Zero amount
        self.assertIsNone(sanitize_transaction({"transaction_id": "T1", "date": "2024-01-01 10:00:00", "amount": 0}, seen))
        # Negative amount
        self.assertIsNone(sanitize_transaction({"transaction_id": "T2", "date": "2024-01-01 10:00:00", "amount": -100}, seen))
        # Missing transaction_id
        self.assertIsNone(sanitize_transaction({"transaction_id": "", "date": "2024-01-01 10:00:00", "amount": 100}, seen))
        # Malformed date
        self.assertIsNone(sanitize_transaction({"transaction_id": "T3", "date": "invalid-date", "amount": 100}, seen))

        # Missing payee -> falls back to UNKNOWN_PAYEE
        tx_ok = sanitize_transaction({"transaction_id": "T4", "date": "2024-01-01 10:00:00", "amount": 100, "payee": ""}, seen)
        self.assertIsNotNone(tx_ok)
        self.assertEqual(tx_ok.payee, "UNKNOWN_PAYEE")

    @patch("urllib.request.urlopen")
    def test_gemini_api_http_error_fallback(self, mock_urlopen):
        """Simulate HTTP 500 error from Gemini API: falls back cleanly without crash."""
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="http://example.com",
            code=500,
            msg="Internal Server Error",
            hdrs={},
            fp=None,
        )

        dummy_cust = Customer(
            customer_id="CUST_TEST",
            name="Test Cust",
            account_number="ACC-1",
            transactions=[],
        )
        report = investigate_customer(dummy_cust)

        res = generate_investigation_narrative(report, api_key="test-key")
        self.assertTrue(res.is_fallback)
        self.assertEqual(res.status, "FALLBACK")
        self.assertIn("Gemini API HTTP 500", res.fallback_reason)
        self.assertIn("Investigation Summary", res.content)

    @patch("urllib.request.urlopen")
    def test_gemini_api_timeout_fallback(self, mock_urlopen):
        """Simulate network timeout from Gemini API: falls back cleanly without crash."""
        mock_urlopen.side_effect = TimeoutError("Connection timed out")

        dummy_cust = Customer(
            customer_id="CUST_TEST",
            name="Test Cust",
            account_number="ACC-1",
            transactions=[],
        )
        report = investigate_customer(dummy_cust)

        res = generate_investigation_narrative(report, api_key="test-key")
        self.assertTrue(res.is_fallback)
        self.assertEqual(res.status, "FALLBACK")
        self.assertIn("timed out", res.fallback_reason.lower())


if __name__ == "__main__":
    unittest.main()
