"""Report Builder for assembling structured investigation findings and evidence (Phase 4).

Adheres strictly to the Section 5 schema contract between Python and Gemini.
Every number, metric, and cited transaction originates deterministically from Python.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

from src.data_loader import Customer, Transaction
from src.risk_rules import Finding


@dataclass
class BaselineProfile:
    """Customer historical baseline metrics calculated deterministically."""
    total_transactions: int
    total_debits: int
    total_credits: int
    total_debit_amount: float
    total_credit_amount: float
    median_debit: float
    mean_debit: float
    max_debit: float
    dominant_channel: str
    dominant_channel_pct: float
    active_hours_summary: str
    unique_payees_count: int
    date_range_start: str
    date_range_end: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class InvestigationReport:
    """The canonical structured investigation artifact."""
    customer_id: str
    customer_name: str
    account_number: str
    overall_status: str  # 'ATTENTION_REQUIRED' or 'NO_ATTENTION_REQUIRED'
    summary: str
    findings: List[Finding] = field(default_factory=list)
    flagged_transactions: List[Dict[str, Any]] = field(default_factory=list)
    baseline_profile: Optional[BaselineProfile] = None
    all_transactions: List[Dict[str, Any]] = field(default_factory=list)
    traceability_verified: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "customer_id": self.customer_id,
            "customer_name": self.customer_name,
            "account_number": self.account_number,
            "overall_status": self.overall_status,
            "summary": self.summary,
            "findings_count": len(self.findings),
            "findings": [f.to_dict() for f in self.findings],
            "flagged_transactions": self.flagged_transactions,
            "baseline_profile": self.baseline_profile.to_dict() if self.baseline_profile else {},
            "all_transactions": self.all_transactions,
            "traceability_verified": self.traceability_verified,
        }


def build_investigation_report(
    customer: Customer,
    findings: List[Finding],
    baseline: BaselineProfile,
    traceability_ok: bool,
) -> InvestigationReport:
    """Build the standardized structured investigation report."""
    is_attention_required = len(findings) > 0
    overall_status = "ATTENTION_REQUIRED" if is_attention_required else "NO_ATTENTION_REQUIRED"

    # Extract unique cited transaction IDs
    cited_ids = set()
    for f in findings:
        for tid in f.transaction_ids:
            cited_ids.add(tid)

    # Collect full records for flagged transactions
    tx_lookup = {tx.transaction_id: tx for tx in customer.transactions}
    flagged_records: List[Dict[str, Any]] = []
    for tid in sorted(cited_ids):
        tx = tx_lookup.get(tid)
        if tx:
            # Attach which rules triggered on this specific transaction
            matched_rules = [f.rule for f in findings if tid in f.transaction_ids]
            record = tx.to_dict()
            record["triggered_rules"] = matched_rules
            flagged_records.append(record)

    # Build plain-English summary
    if is_attention_required:
        rule_names = sorted(list({f.rule for f in findings}))
        summary = (
            f"Investigation triggered {len(findings)} risk signal(s) across {len(flagged_records)} "
            f"transaction(s) under rule(s): {', '.join(rule_names)}. "
            f"Activity exhibits unusual characteristics relative to the customer's established baseline."
        )
    else:
        summary = (
            "No configured risk rules were triggered. All reviewed transaction activity is "
            "broadly consistent with the customer's established baseline and regular spending pattern."
        )

    all_tx_dicts = [tx.to_dict() for tx in customer.transactions]

    return InvestigationReport(
        customer_id=customer.customer_id,
        customer_name=customer.name,
        account_number=customer.account_number,
        overall_status=overall_status,
        summary=summary,
        findings=findings,
        flagged_transactions=flagged_records,
        baseline_profile=baseline,
        all_transactions=all_tx_dicts,
        traceability_verified=traceability_ok,
    )
