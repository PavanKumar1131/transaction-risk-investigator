"""Unit tests for deterministic risk rules (Phase 3)."""

import unittest
from src.data_loader import load_dataset, verify_transaction_traceability
from src.risk_rules import (
    Finding,
    evaluate_unusually_large_transaction,
    evaluate_burst_to_new_payee,
    evaluate_odd_hours_activity,
    evaluate_pattern_break,
    evaluate_all_rules,
)


class TestRiskRules(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = load_dataset()

    def test_rule_1_unusually_large_transaction(self):
        """Rule 1 triggers on CUST_102's massive crypto wire and stays silent on CUST_101."""
        # Clean customer CUST_101
        findings_clean = evaluate_unusually_large_transaction(self.dataset["CUST_101"])
        self.assertEqual(len(findings_clean), 0)

        # Risky customer CUST_102
        findings_risky = evaluate_unusually_large_transaction(self.dataset["CUST_102"])
        self.assertGreaterEqual(len(findings_risky), 1)
        r1 = findings_risky[0]
        self.assertEqual(r1.rule, "UNUSUALLY_LARGE_TRANSACTION")
        self.assertEqual(r1.severity, "HIGH")
        self.assertIn("TX102_28", r1.transaction_ids)
        self.assertIn("475,000", r1.reason)

    def test_rule_2_burst_to_new_payee(self):
        """Rule 2 triggers on CUST_103's rapid transfers to QuickWealth and stays silent on CUST_101."""
        findings_clean = evaluate_burst_to_new_payee(self.dataset["CUST_101"])
        self.assertEqual(len(findings_clean), 0)

        findings_risky = evaluate_burst_to_new_payee(self.dataset["CUST_103"])
        self.assertGreaterEqual(len(findings_risky), 1)
        r2 = findings_risky[0]
        self.assertEqual(r2.rule, "BURST_TO_NEW_PAYEE")
        self.assertEqual(r2.severity, "HIGH")
        self.assertTrue(any(tid in r2.transaction_ids for tid in ["TX103_22", "TX103_23", "TX103_24", "TX103_25"]))
        self.assertIn("QuickWealth Advisory Pvt", r2.reason)

    def test_rule_3_odd_hours_activity(self):
        """Rule 3 triggers on CUST_104's 02:42 AM / 03:18 AM transfers and stays silent on CUST_101."""
        findings_clean = evaluate_odd_hours_activity(self.dataset["CUST_101"])
        self.assertEqual(len(findings_clean), 0)

        findings_risky = evaluate_odd_hours_activity(self.dataset["CUST_104"])
        self.assertGreaterEqual(len(findings_risky), 1)
        r3 = findings_risky[0]
        self.assertEqual(r3.rule, "ODD_HOURS_ACTIVITY")
        self.assertIn("TX104_19", r3.transaction_ids)
        self.assertIn("TX104_20", r3.transaction_ids)

    def test_rule_4_pattern_break(self):
        """Rule 4 triggers on CUST_105's sudden channel & volume shift and stays silent on CUST_101."""
        findings_clean = evaluate_pattern_break(self.dataset["CUST_101"])
        self.assertEqual(len(findings_clean), 0)

        findings_risky = evaluate_pattern_break(self.dataset["CUST_105"])
        self.assertGreaterEqual(len(findings_risky), 1)
        r4 = findings_risky[0]
        self.assertEqual(r4.rule, "PATTERN_BREAK")
        self.assertTrue(len(r4.transaction_ids) >= 2)
        self.assertIn("NET_BANKING", r4.reason)

    def test_clean_customers_zero_findings(self):
        """Both clean customers CUST_101 and CUST_106 must produce exactly 0 findings."""
        findings_101 = evaluate_all_rules(self.dataset["CUST_101"])
        self.assertEqual(findings_101, [], "CUST_101 should be completely clean")

        findings_106 = evaluate_all_rules(self.dataset["CUST_106"])
        self.assertEqual(findings_106, [], "CUST_106 should be completely clean")

    def test_findings_schema_and_traceability(self):
        """Verify all findings adhere to the strict schema and pass traceability check."""
        for cust_id, cust in self.dataset.items():
            findings = evaluate_all_rules(cust)
            for f in findings:
                # Schema verification
                self.assertIn(f.rule, ["UNUSUALLY_LARGE_TRANSACTION", "BURST_TO_NEW_PAYEE", "ODD_HOURS_ACTIVITY", "PATTERN_BREAK"])
                self.assertIn(f.severity, ["LOW", "MEDIUM", "HIGH"])
                self.assertIsInstance(f.transaction_ids, list)
                self.assertGreater(len(f.transaction_ids), 0)
                self.assertTrue(len(f.reason) > 0)
                self.assertTrue(len(f.baseline) > 0)
                self.assertTrue(len(f.deviation) > 0)
                self.assertTrue(len(f.investigator_action) > 0)

                # Self-verification check: every transaction ID cited must exist in the customer's data
                is_valid, missing = verify_transaction_traceability(cust, f.transaction_ids)
                self.assertTrue(
                    is_valid,
                    f"Customer {cust_id} finding cited non-existent transactions: {missing}"
                )


if __name__ == "__main__":
    unittest.main()
