"""Unit tests for src/rules_engine.py and src/report_builder.py (Phase 4)."""

import json
import unittest
from src.data_loader import Customer, Transaction, load_dataset
from src.report_builder import build_investigation_report
from src.risk_rules import Finding
from src.rules_engine import calculate_customer_baseline, investigate_customer


class TestRulesEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = load_dataset()

    def test_calculate_baseline_metrics(self):
        """Baseline metrics calculate correctly for a customer."""
        cust = self.dataset["CUST_101"]
        baseline = calculate_customer_baseline(cust)

        self.assertEqual(baseline.total_transactions, len(cust.transactions))
        self.assertGreater(baseline.total_debits, 0)
        self.assertGreater(baseline.median_debit, 0)
        self.assertIn("daytime", baseline.active_hours_summary)
        self.assertGreater(baseline.dominant_channel_pct, 0)
        self.assertNotEqual(baseline.dominant_channel, "NONE")

    def test_clean_customer_investigation_status(self):
        """Clean customer CUST_101 produces explicit NO_ATTENTION_REQUIRED status."""
        cust = self.dataset["CUST_101"]
        report = investigate_customer(cust)

        self.assertEqual(report.overall_status, "NO_ATTENTION_REQUIRED")
        self.assertEqual(len(report.findings), 0)
        self.assertEqual(len(report.flagged_transactions), 0)
        self.assertTrue(report.traceability_verified)
        self.assertIn("No configured risk rules were triggered", report.summary)

        # JSON serialization test
        report_dict = report.to_dict()
        self.assertEqual(report_dict["overall_status"], "NO_ATTENTION_REQUIRED")
        self.assertEqual(report_dict["findings"], [])
        self.assertEqual(report_dict["flagged_transactions"], [])
        json_str = json.dumps(report_dict)
        self.assertIn("NO_ATTENTION_REQUIRED", json_str)

    def test_second_clean_customer(self):
        """Customer CUST_106 also produces NO_ATTENTION_REQUIRED."""
        cust = self.dataset["CUST_106"]
        report = investigate_customer(cust)

        self.assertEqual(report.overall_status, "NO_ATTENTION_REQUIRED")
        self.assertEqual(len(report.findings), 0)

    def test_attention_required_customer(self):
        """Customer CUST_102 produces ATTENTION_REQUIRED with cited transactions and evidence."""
        cust = self.dataset["CUST_102"]
        report = investigate_customer(cust)

        self.assertEqual(report.overall_status, "ATTENTION_REQUIRED")
        self.assertGreater(len(report.findings), 0)
        self.assertGreater(len(report.flagged_transactions), 0)
        self.assertTrue(report.traceability_verified)

        flagged_ids = [t["transaction_id"] for t in report.flagged_transactions]
        self.assertIn("TX102_28", flagged_ids)
        tx_dict = next(t for t in report.flagged_transactions if t["transaction_id"] == "TX102_28")
        self.assertIn("UNUSUALLY_LARGE_TRANSACTION", tx_dict["triggered_rules"])

        # Check dictionary serialization
        d = report.to_dict()
        self.assertEqual(d["overall_status"], "ATTENTION_REQUIRED")
        self.assertIn("TX102_28", json.dumps(d))

    def test_traceability_enforcement(self):
        """Engine raises ValueError if a finding references a hallucinated transaction ID."""
        cust = self.dataset["CUST_101"]
        fake_finding = Finding(
            rule="UNUSUALLY_LARGE_TRANSACTION",
            severity="HIGH",
            transaction_ids=["TX_GHOST_9999"],
            reason="Ghost transaction",
            baseline="N/A",
            deviation="N/A",
            investigator_action="Inspect ghost",
        )
        baseline = calculate_customer_baseline(cust)

        # build_investigation_report called directly with invalid traceability flag
        rep = build_investigation_report(cust, [fake_finding], baseline, traceability_ok=False)
        self.assertFalse(rep.traceability_verified)


if __name__ == "__main__":
    unittest.main()
