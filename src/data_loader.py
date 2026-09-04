"""Data loading, parsing, and validation for customer transaction histories.

Provides strongly-typed dataclasses, robust date parsing, edge-case sanitization
(duplicates, zero/negative amounts, missing fields), and traceability verification.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

logger = logging.getLogger(__name__)

DEFAULT_DATASET_PATH = Path(__file__).resolve().parent.parent / "data" / "transactions.json"


@dataclass(frozen=True)
class Transaction:
    """Represents a single verified bank transaction."""
    transaction_id: str
    date: datetime
    date_str: str
    amount: float
    type: str  # 'DEBIT' or 'CREDIT'
    description: str
    payee: str
    channel: str

    @property
    def hour(self) -> int:
        """Hour of the day in 24h format (0-23)."""
        return self.date.hour

    def to_dict(self) -> Dict[str, Any]:
        """Convert transaction to serializable dictionary."""
        return {
            "transaction_id": self.transaction_id,
            "date": self.date_str,
            "amount": self.amount,
            "type": self.type,
            "description": self.description,
            "payee": self.payee,
            "channel": self.channel,
            "hour": self.hour,
        }


@dataclass
class Customer:
    """Represents a customer profile and sanitized transaction history."""
    customer_id: str
    name: str
    account_number: str
    account_created: str = ""
    risk_profile: str = "LOW"
    expected_outcome: str = "CLEAN"
    notes: str = ""
    transactions: List[Transaction] = field(default_factory=list)

    @property
    def debit_transactions(self) -> List[Transaction]:
        """All debit transactions ordered chronologically."""
        return [tx for tx in self.transactions if tx.type == "DEBIT"]

    @property
    def credit_transactions(self) -> List[Transaction]:
        """All credit transactions ordered chronologically."""
        return [tx for tx in self.transactions if tx.type == "CREDIT"]

    @property
    def transaction_ids(self) -> set[str]:
        """Set of all valid transaction IDs for quick membership checks."""
        return {tx.transaction_id for tx in self.transactions}

    def to_summary_dict(self) -> Dict[str, Any]:
        """Summary view for customer selector dropdown."""
        return {
            "customer_id": self.customer_id,
            "name": self.name,
            "account_number": self.account_number,
            "transaction_count": len(self.transactions),
            "risk_profile": self.risk_profile,
            "notes": self.notes,
        }


def parse_datetime(val: Any) -> Optional[datetime]:
    """Robust parser for transaction timestamps."""
    if isinstance(val, datetime):
        return val
    if not val or not isinstance(val, str):
        return None

    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
        "%d-%m-%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
    ]
    cleaned = val.strip()
    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    return None


def sanitize_transaction(raw_tx: Dict[str, Any], seen_ids: set[str]) -> Optional[Transaction]:
    """Validate and sanitize a single raw transaction dictionary.
    
    Handles:
    - Missing or empty transaction IDs
    - Duplicate transaction IDs (deduplication)
    - Zero or negative amounts
    - Missing payee (falls back to UNKNOWN_PAYEE)
    - Malformed date/time
    """
    tx_id = str(raw_tx.get("transaction_id", "")).strip()
    if not tx_id:
        logger.warning("Dropped transaction with missing transaction_id: %s", raw_tx)
        return None

    if tx_id in seen_ids:
        logger.warning("Deduplicated duplicate transaction_id: %s", tx_id)
        return None

    # Amount validation: must be positive float
    raw_amount = raw_tx.get("amount")
    try:
        amount = float(raw_amount)
        if amount <= 0:
            logger.warning("Dropped transaction %s with non-positive amount: %s", tx_id, raw_amount)
            return None
    except (TypeError, ValueError):
        logger.warning("Dropped transaction %s with invalid amount: %s", tx_id, raw_amount)
        return None

    # Date parsing
    dt = parse_datetime(raw_tx.get("date"))
    if not dt:
        logger.warning("Dropped transaction %s with unparseable date: %s", tx_id, raw_tx.get("date"))
        return None

    date_str = dt.strftime("%Y-%m-%d %H:%M:%S")

    # Transaction type
    tx_type = str(raw_tx.get("type", "DEBIT")).strip().upper()
    if tx_type not in ("DEBIT", "CREDIT"):
        tx_type = "DEBIT"

    # Payee
    payee = str(raw_tx.get("payee", "")).strip()
    if not payee:
        payee = "UNKNOWN_PAYEE"

    # Description and Channel
    desc = str(raw_tx.get("description", "")).strip() or "Standard Transaction"
    channel = str(raw_tx.get("channel", "ONLINE")).strip().upper() or "ONLINE"

    seen_ids.add(tx_id)
    return Transaction(
        transaction_id=tx_id,
        date=dt,
        date_str=date_str,
        amount=amount,
        type=tx_type,
        description=desc,
        payee=payee,
        channel=channel,
    )


def load_dataset(filepath: Optional[Path | str] = None) -> Dict[str, Customer]:
    """Load, validate, and index all customer transaction histories from JSON."""
    target_path = Path(filepath) if filepath else DEFAULT_DATASET_PATH
    if not target_path.exists():
        raise FileNotFoundError(f"Dataset file not found at: {target_path}")

    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    customers_map: Dict[str, Customer] = {}
    raw_customers = data.get("customers", [])

    for raw_cust in raw_customers:
        cust_id = str(raw_cust.get("customer_id", "")).strip()
        if not cust_id:
            continue

        seen_ids: set[str] = set()
        sanitized_txs: List[Transaction] = []

        for raw_tx in raw_cust.get("transactions", []):
            tx = sanitize_transaction(raw_tx, seen_ids)
            if tx is not None:
                sanitized_txs.append(tx)

        # Ensure chronological ordering
        sanitized_txs.sort(key=lambda t: t.date)

        customer = Customer(
            customer_id=cust_id,
            name=str(raw_cust.get("name", "Unknown Customer")).strip(),
            account_number=str(raw_cust.get("account_number", "N/A")).strip(),
            account_created=str(raw_cust.get("account_created", "")).strip(),
            risk_profile=str(raw_cust.get("risk_profile", "LOW")).strip(),
            expected_outcome=str(raw_cust.get("expected_outcome", "CLEAN")).strip(),
            notes=str(raw_cust.get("notes", "")).strip(),
            transactions=sanitized_txs,
        )
        customers_map[cust_id] = customer

    return customers_map


def get_customer(customer_id: str, dataset: Optional[Dict[str, Customer]] = None) -> Optional[Customer]:
    """Retrieve a specific customer by ID."""
    if dataset is None:
        dataset = load_dataset()
    return dataset.get(customer_id)


def list_customers(dataset: Optional[Dict[str, Customer]] = None) -> List[Dict[str, Any]]:
    """Return lightweight summary list of all customers."""
    if dataset is None:
        dataset = load_dataset()
    return [cust.to_summary_dict() for cust in dataset.values()]


def verify_transaction_traceability(
    customer: Customer,
    cited_ids: Sequence[str]
) -> Tuple[bool, List[str]]:
    """Verify that every cited transaction ID strictly exists in the source history.
    
    Returns (is_valid, list_of_missing_ids).
    """
    valid_ids = customer.transaction_ids
    missing = [tid for tid in cited_ids if tid not in valid_ids]
    return (len(missing) == 0, missing)
