"""Rules Engine orchestrating baseline calculation, rule evaluation, and traceability (Phase 4).

Coordinates:
- Customer transaction history loading
- Deterministic customer baseline statistical calculation
- Execution of the four core risk rules
- Self-verification traceability audit
- Assembly of standardized investigation reports
"""

from __future__ import annotations

import logging
import statistics
from typing import Dict, List, Optional

from src.data_loader import Customer, verify_transaction_traceability
from src.report_builder import BaselineProfile, InvestigationReport, build_investigation_report
from src.risk_rules import Finding, evaluate_all_rules

logger = logging.getLogger(__name__)


def calculate_customer_baseline(customer: Customer) -> BaselineProfile:
    """Compute deterministic baseline statistics for a customer's history."""
    all_txs = customer.transactions
    debits = [tx for tx in all_txs if tx.type == "DEBIT"]
    credits = [tx for tx in all_txs if tx.type == "CREDIT"]

    total_debit_amount = sum(tx.amount for tx in debits)
    total_credit_amount = sum(tx.amount for tx in credits)

    if debits:
        debit_amounts = [tx.amount for tx in debits]
        median_debit = round(statistics.median(debit_amounts), 2)
        mean_debit = round(statistics.mean(debit_amounts), 2)
        max_debit = round(max(debit_amounts), 2)

        # Dominant channel calculation
        channel_counts: Dict[str, int] = {}
        for tx in debits:
            channel_counts[tx.channel] = channel_counts.get(tx.channel, 0) + 1

        dominant_channel = max(channel_counts, key=channel_counts.get)
        dominant_channel_pct = round((channel_counts[dominant_channel] / len(debits)) * 100, 1)

        # Active hours summary
        hours = [tx.hour for tx in debits]
        daytime_txs = sum(1 for h in hours if 7 <= h <= 22)
        daytime_pct = round((daytime_txs / len(debits)) * 100, 1)
        active_hours_summary = f"{daytime_pct}% daytime/evening (07:00–22:00)"

        unique_payees = len({tx.payee for tx in debits})
    else:
        median_debit = 0.0
        mean_debit = 0.0
        max_debit = 0.0
        dominant_channel = "NONE"
        dominant_channel_pct = 0.0
        active_hours_summary = "No debit history"
        unique_payees = 0

    date_range_start = all_txs[0].date_str if all_txs else "N/A"
    date_range_end = all_txs[-1].date_str if all_txs else "N/A"

    return BaselineProfile(
        total_transactions=len(all_txs),
        total_debits=len(debits),
        total_credits=len(credits),
        total_debit_amount=round(total_debit_amount, 2),
        total_credit_amount=round(total_credit_amount, 2),
        median_debit=median_debit,
        mean_debit=mean_debit,
        max_debit=max_debit,
        dominant_channel=dominant_channel,
        dominant_channel_pct=dominant_channel_pct,
        active_hours_summary=active_hours_summary,
        unique_payees_count=unique_payees,
        date_range_start=date_range_start,
        date_range_end=date_range_end,
    )


def investigate_customer(customer: Customer) -> InvestigationReport:
    """Run full deterministic risk investigation for a customer."""
    # 1. Compute baseline statistics
    baseline = calculate_customer_baseline(customer)

    # 2. Evaluate all 4 deterministic risk rules
    findings: List[Finding] = evaluate_all_rules(customer)

    # 3. Perform self-verification traceability check
    all_cited_ids = [tid for f in findings for tid in f.transaction_ids]
    traceability_ok, missing_ids = verify_transaction_traceability(customer, all_cited_ids)

    if not traceability_ok:
        logger.error(
            "TRACEABILITY VIOLATION: Customer %s findings referenced non-existent transactions: %s",
            customer.customer_id,
            missing_ids,
        )
        raise ValueError(
            f"Traceability check failed for customer {customer.customer_id}. "
            f"Cited non-existent transactions: {missing_ids}"
        )

    # 4. Construct standardized structured report
    report = build_investigation_report(
        customer=customer,
        findings=findings,
        baseline=baseline,
        traceability_ok=traceability_ok,
    )

    return report
