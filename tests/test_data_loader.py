"""Unit tests for src/data_loader.py (Phase 2)."""

import unittest
from datetime import datetime
from pathlib import Path
import tempfile
import json

from src.data_loader import (
    Customer,
    Transaction,
    load_dataset,
    get_customer,
    list_customers,
    sanitize_transaction,
    parse_datetime,
    verify_transaction_traceability,
)


class TestDataLoader(unittest.TestCase):
    def test_load_default_dataset(self):
        """Verify the synthetic transactions.json loads cleanly with all 6 customers."""
        customers = load_dataset()
        self.assertEqual(len(customers), 6)
        self.assertIn("CUST_101", customers)
        self.assertIn("CUST_102", customers)
        self.assertIn("CUST_103", customers)
        self.assertIn("CUST_104", customers)
        self.assertIn("CUST_105", customers)
        self.assertIn("CUST_106", customers)

        # Check CUST_101 (Clean case)
        cust101 = customers["CUST_101"]
        self.assertEqual(cust101.name, "Priya Sharma")
        self.assertGreater(len(cust101.transactions), 20)
        self.assertTrue(all(isinstance(tx, Transaction) for tx in cust101.transactions))

    def test_list_customers_summary(self):
        """Verify customer list summary format."""
        summary = list_customers()
        self.assertEqual(len(summary), 6)
        first = summary[0]
        self.assertIn("customer_id", first)
        self.assertIn("name", first)
        self.assertIn("transaction_count", first)
        self.assertGreater(first["transaction_count"], 0)

    def test_chronological_ordering(self):
        """Verify that transactions for each customer are chronologically sorted."""
        customers = load_dataset()
        for cust_id, cust in customers.items():
            for i in range(len(cust.transactions) - 1):
                self.assertLessEqual(
                    cust.transactions[i].date,
                    cust.transactions[i + 1].date,
                    f"Customer {cust_id} transactions not sorted chronologically"
                )

    def test_sanitize_valid_transaction(self):
        """Valid transaction parses correctly."""
        raw = {
            "transaction_id": "TX_TEST_01",
            "date": "2024-03-15 14:30:00",
            "amount": 1500.50,
            "type": "DEBIT",
            "description": "Lunch Payment",
            "payee": "Bistro",
            "channel": "UPI"
        }
        seen = set()
        tx = sanitize_transaction(raw, seen)
        self.assertIsNotNone(tx)
        self.assertEqual(tx.transaction_id, "TX_TEST_01")
        self.assertEqual(tx.amount, 1500.50)
        self.assertEqual(tx.hour, 14)
        self.assertIn("TX_TEST_01", seen)

    def test_edge_case_duplicate_ids(self):
        """Duplicate transaction IDs are deduplicated."""
        raw = {
            "transaction_id": "TX_DUP",
            "date": "2024-03-15 14:30:00",
            "amount": 100.0,
            "payee": "Store"
        }
        seen = set()
        tx1 = sanitize_transaction(raw, seen)
        self.assertIsNotNone(tx1)
        tx2 = sanitize_transaction(raw, seen)
        self.assertIsNone(tx2)

    def test_edge_case_zero_or_negative_amount(self):
        """Transactions with <= 0 amounts are discarded."""
        seen = set()
        zero_tx = {
            "transaction_id": "TX_ZERO",
            "date": "2024-03-15 14:30:00",
            "amount": 0.0,
            "payee": "Store"
        }
        neg_tx = {
            "transaction_id": "TX_NEG",
            "date": "2024-03-15 14:30:00",
            "amount": -50.0,
            "payee": "Store"
        }
        self.assertIsNone(sanitize_transaction(zero_tx, seen))
        self.assertIsNone(sanitize_transaction(neg_tx, seen))

    def test_edge_case_missing_payee(self):
        """Missing payee defaults to UNKNOWN_PAYEE."""
        seen = set()
        raw = {
            "transaction_id": "TX_NO_PAYEE",
            "date": "2024-03-15 14:30:00",
            "amount": 250.0,
            "payee": ""
        }
        tx = sanitize_transaction(raw, seen)
        self.assertIsNotNone(tx)
        self.assertEqual(tx.payee, "UNKNOWN_PAYEE")

    def test_edge_case_malformed_date(self):
        """Malformed date is rejected."""
        seen = set()
        raw = {
            "transaction_id": "TX_BAD_DATE",
            "date": "not-a-valid-date-string",
            "amount": 250.0,
            "payee": "Shop"
        }
        self.assertIsNone(sanitize_transaction(raw, seen))

    def test_traceability_verification(self):
        """Traceability checker validates existing IDs and flags missing ones."""
        customers = load_dataset()
        cust101 = customers["CUST_101"]
        existing_id = cust101.transactions[0].transaction_id

        # Valid citation
        valid, missing = verify_transaction_traceability(cust101, [existing_id])
        self.assertTrue(valid)
        self.assertEqual(missing, [])

        # Hallucinated citation
        valid, missing = verify_transaction_traceability(cust101, [existing_id, "TX_HALLUCINATED_999"])
        self.assertFalse(valid)
        self.assertEqual(missing, ["TX_HALLUCINATED_999"])


if __name__ == "__main__":
    unittest.main()
