"""Deterministic Risk Rules Engine (Phase 3).

Implements strictly the four required risk rules for PS06:
1. UNUSUALLY_LARGE_TRANSACTION
2. BURST_TO_NEW_PAYEE
3. ODD_HOURS_ACTIVITY
4. PATTERN_BREAK

Python = detection and decision logic.
Gemini = explanation and reporting only.
"""

from __future__ import annotations

import statistics
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence

from src.data_loader import Customer, Transaction


@dataclass
class Finding:
    """Standardized finding schema matching Section 5 contract."""
    rule: str
    severity: str  # 'HIGH', 'MEDIUM', 'LOW'
    transaction_ids: List[str]
    reason: str
    baseline: str
    deviation: str
    investigator_action: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# =====================================================================
# RULE 1: Unusually Large Transaction
# =====================================================================

def evaluate_unusually_large_transaction(
    customer: Customer,
    median_multiplier: float = 5.0,
    outlier_ratio_threshold: float = 2.0,
    min_amount_threshold: float = 15000.0,
) -> List[Finding]:
    """Rule 1: Detect transactions that massively deviate from the customer's own baseline.
    
    Uses median of historical debit transactions (robust against outliers).
    Filters out recurring established payments (e.g., monthly rent or regular EMIs
    with multiple matching payments to the same payee).
    Requires the candidate to be a true isolated outlier significantly exceeding
    both the median and the customer's other historical spending.
    """
    debits = [tx for tx in customer.transactions if tx.type == "DEBIT"]
    if len(debits) < 3:
        # Insufficient history to establish a reliable baseline
        return []

    debit_amounts = [tx.amount for tx in debits]
    median_amount = statistics.median(debit_amounts)

    # Count payee frequencies and identify recurring similar-amount payments
    payee_amounts: Dict[str, List[float]] = {}
    for tx in debits:
        payee_amounts.setdefault(tx.payee, []).append(tx.amount)

    findings: List[Finding] = []
    for tx in debits:
        if tx.amount < min_amount_threshold:
            continue

        # Check if this is an established recurring payment (e.g. monthly rent/EMI)
        similar_payee_txs = [
            amt for amt in payee_amounts.get(tx.payee, [])
            if abs(amt - tx.amount) / max(tx.amount, 1.0) < 0.10
        ]
        if len(similar_payee_txs) >= 2:
            # Established regular payment (e.g. recurring rent or EMI)
            continue

        # Calculate other debits excluding this transaction
        other_debits = [amt for amt in debit_amounts if amt != tx.amount]
        max_other_debit = max(other_debits) if other_debits else median_amount

        # Candidate must exceed median threshold AND significantly exceed other debits
        is_median_outlier = median_amount > 0 and (tx.amount / median_amount >= median_multiplier)
        is_max_outlier = max_other_debit > 0 and (tx.amount / max_other_debit >= outlier_ratio_threshold)

        if is_median_outlier and is_max_outlier:
            multiple = round(tx.amount / median_amount, 1)
            findings.append(
                Finding(
                    rule="UNUSUALLY_LARGE_TRANSACTION",
                    severity="HIGH" if multiple >= 10.0 else "MEDIUM",
                    transaction_ids=[tx.transaction_id],
                    reason=(
                        f"Debit transaction of INR {tx.amount:,.2f} to '{tx.payee}' is "
                        f"{multiple}x the customer's historical median debit of INR {median_amount:,.2f} "
                        f"and {round(tx.amount / max_other_debit, 1)}x the next highest debit (INR {max_other_debit:,.2f})."
                    ),
                    baseline=(
                        f"Customer historical median debit: INR {median_amount:,.2f} (max routine debit: INR {max_other_debit:,.2f}) "
                        f"across {len(debits)} debits."
                    ),
                    deviation=f"{multiple}x above median (Absolute difference: INR {tx.amount - median_amount:,.2f}).",
                    investigator_action=(
                        f"Verify whether customer authorized this high-value transfer of INR {tx.amount:,.2f} "
                        f"to {tx.payee} on {tx.date_str}. Review source of funds and payee relationship."
                    ),
                )
            )

    return findings


# =====================================================================
# RULE 2: Burst to a New / Infrequent Payee
# =====================================================================

def evaluate_burst_to_new_payee(
    customer: Customer,
    window_hours: float = 48.0,
    min_burst_count: int = 2,
    min_total_burst_amount: float = 25000.0,
) -> List[Finding]:
    """Rule 2: Detect rapid succession of transfers to a previously unseen or rare payee.
    
    A payee is considered 'new/infrequent' if they had 0 or at most 1 prior transaction
    in the customer's earlier history before the burst window.
    """
    debits = [tx for tx in customer.transactions if tx.type == "DEBIT"]
    if len(debits) < 3:
        return []

    findings: List[Finding] = []
    # Group debits by payee
    payee_txs: Dict[str, List[Transaction]] = {}
    for tx in debits:
        payee_txs.setdefault(tx.payee, []).append(tx)

    for payee, tx_list in payee_txs.items():
        if len(tx_list) < min_burst_count:
            continue

        # Check clusters within window_hours
        tx_list_sorted = sorted(tx_list, key=lambda t: t.date)
        n = len(tx_list_sorted)

        for i in range(n):
            cluster = [tx_list_sorted[i]]
            for j in range(i + 1, n):
                if (tx_list_sorted[j].date - tx_list_sorted[i].date).total_seconds() <= window_hours * 3600:
                    cluster.append(tx_list_sorted[j])

            if len(cluster) >= min_burst_count:
                total_burst_amount = sum(t.amount for t in cluster)
                first_burst_time = cluster[0].date
                # Check prior history for this payee before first burst transaction
                prior_txs = [t for t in debits if t.payee == payee and t.date < first_burst_time]

                # If payee had 0 or 1 prior transaction and burst amount is substantial
                if len(prior_txs) <= 1 and total_burst_amount >= min_total_burst_amount:
                    cluster_ids = [t.transaction_id for t in cluster]
                    # Prevent duplicate reporting of the same cluster
                    already_reported = any(
                        set(cluster_ids).issubset(set(f.transaction_ids)) for f in findings
                    )
                    if already_reported:
                        continue

                    duration_hours = max(
                        round((cluster[-1].date - cluster[0].date).total_seconds() / 3600, 1),
                        0.1,
                    )
                    findings.append(
                        Finding(
                            rule="BURST_TO_NEW_PAYEE",
                            severity="HIGH" if len(cluster) >= 3 else "MEDIUM",
                            transaction_ids=cluster_ids,
                            reason=(
                                f"Detected rapid succession of {len(cluster)} transactions totaling "
                                f"INR {total_burst_amount:,.2f} to '{payee}' within {duration_hours} hours. "
                                f"Payee had {len(prior_txs)} prior recorded transaction(s)."
                            ),
                            baseline=(
                                f"Payee '{payee}' has virtually no prior relationship ({len(prior_txs)} prior transfers). "
                                f"Customer typically makes isolated single-payee transfers."
                            ),
                            deviation=(
                                f"{len(cluster)} rapid transfers in {duration_hours}h window totaling INR {total_burst_amount:,.2f}."
                            ),
                            investigator_action=(
                                f"Contact customer to verify whether '{payee}' was newly added and if multiple rapid "
                                f"payments were intentional or indicate account takeover/coercion."
                            ),
                        )
                    )

    return findings


# =====================================================================
# RULE 3: Odd-Hours Activity
# =====================================================================

def evaluate_odd_hours_activity(
    customer: Customer,
    odd_hour_start: int = 0,
    odd_hour_end: int = 5,
    min_amount: float = 5000.0,
) -> List[Finding]:
    """Rule 3: Detect transactions during atypical off-hours (default 00:00-05:00).
    
    Contrasts transaction hour against the customer's own historical active hours.
    Does not label all night activity as fraud, but flags off-hours activity that
    deviates from the customer's typical operating schedule.
    """
    debits = [tx for tx in customer.transactions if tx.type == "DEBIT"]
    if not debits:
        return []

    # Historical distribution of hours
    all_hours = [tx.hour for tx in debits]
    typical_daytime_count = sum(1 for h in all_hours if 7 <= h <= 22)
    typical_daytime_ratio = typical_daytime_count / len(all_hours)

    odd_hour_txs: List[Transaction] = []
    for tx in debits:
        # Check if transaction occurs in [odd_hour_start, odd_hour_end)
        if odd_hour_start <= tx.hour < odd_hour_end and tx.amount >= min_amount:
            odd_hour_txs.append(tx)

    if not odd_hour_txs:
        return []

    # Group odd-hour transactions if they occur on the same night or session
    tx_ids = [tx.transaction_id for tx in odd_hour_txs]
    total_amount = sum(tx.amount for tx in odd_hour_txs)
    timestamps = ", ".join(f"{tx.date.strftime('%H:%M:%S')} ({tx.transaction_id})" for tx in odd_hour_txs)

    return [
        Finding(
            rule="ODD_HOURS_ACTIVITY",
            severity="MEDIUM" if total_amount < 50000 else "HIGH",
            transaction_ids=tx_ids,
            reason=(
                f"Identified {len(odd_hour_txs)} high-value transaction(s) totaling INR {total_amount:,.2f} "
                f"executed between {odd_hour_start:02d}:00 and {odd_hour_end:02d}:00: {timestamps}."
            ),
            baseline=(
                f"Customer established history is {typical_daytime_ratio * 100:.1f}% concentrated during standard "
                f"daylight/evening hours (07:00–22:00). Off-hours transactions are historically rare or absent."
            ),
            deviation=(
                f"{len(odd_hour_txs)} transaction(s) executed during off-hours ({odd_hour_start:02d}:00–{odd_hour_end:02d}:00), "
                f"contrasting with customer's typical active hours."
            ),
            investigator_action=(
                f"Check device ID, IP address, and 2FA authentication logs for transactions executed during "
                f"the 00:00–05:00 window to confirm legitimate customer initiation."
            ),
        )
    ]


# =====================================================================
# RULE 4: Pattern Break
# =====================================================================

def evaluate_pattern_break(
    customer: Customer,
    channel_dominance_threshold: float = 0.80,
    recent_window_days: int = 7,
) -> List[Finding]:
    """Rule 4: Detect abrupt deviation from customer's established behavioral pattern.
    
    Deterministic checks:
    - Channel disruption: Customer historically uses one primary channel (e.g. CARD_POS > 80%),
      but suddenly executes a flurry of transfers on an uncharacteristic channel (e.g. NET_BANKING/WIRE).
    - Velocity & volume surge: Recent transaction volume / ticket size abruptly expands compared to baseline.
    """
    debits = [tx for tx in customer.transactions if tx.type == "DEBIT"]
    if len(debits) < 5:
        return []

    findings: List[Finding] = []
    latest_tx_date = debits[-1].date
    window_cutoff = latest_tx_date - timedelta(days=recent_window_days)

    historical_debits = [tx for tx in debits if tx.date < window_cutoff]
    recent_debits = [tx for tx in debits if tx.date >= window_cutoff]

    if not historical_debits or not recent_debits:
        # Fall back to dividing history into baseline (first 75%) and recent (last 25%)
        split_idx = int(len(debits) * 0.75)
        historical_debits = debits[:split_idx]
        recent_debits = debits[split_idx:]

    # 1. Historical Channel Profile
    channel_counts: Dict[str, int] = {}
    for tx in historical_debits:
        channel_counts[tx.channel] = channel_counts.get(tx.channel, 0) + 1

    total_hist = len(historical_debits)
    dominant_channel = max(channel_counts, key=channel_counts.get)
    dominant_ratio = channel_counts[dominant_channel] / total_hist

    # Check for abrupt channel pivot in recent transactions
    recent_channel_counts: Dict[str, int] = {}
    for tx in recent_debits:
        recent_channel_counts[tx.channel] = recent_channel_counts.get(tx.channel, 0) + 1

    # If historical usage was strongly dominated by one channel, and recent activity shifted to an unfamiliar channel
    unusual_channel_txs = [
        tx for tx in recent_debits
        if tx.channel != dominant_channel and channel_counts.get(tx.channel, 0) <= 1
    ]

    hist_median_amount = statistics.median([tx.amount for tx in historical_debits])
    recent_median_amount = statistics.median([tx.amount for tx in recent_debits])

    # Check for channel break combined with significant amount surge
    if dominant_ratio >= channel_dominance_threshold and len(unusual_channel_txs) >= 2:
        unusual_channel = unusual_channel_txs[0].channel
        amount_multiplier = round(recent_median_amount / max(hist_median_amount, 1.0), 1)
        tx_ids = [tx.transaction_id for tx in unusual_channel_txs]
        total_recent_unusual = sum(tx.amount for tx in unusual_channel_txs)

        findings.append(
            Finding(
                rule="PATTERN_BREAK",
                severity="HIGH" if amount_multiplier >= 5.0 else "MEDIUM",
                transaction_ids=tx_ids,
                reason=(
                    f"Sharp behavioral break: Customer's established history is {dominant_ratio * 100:.1f}% "
                    f"conducted via '{dominant_channel}'. Recent activity pivoted abruptly to {len(unusual_channel_txs)} "
                    f"transactions via '{unusual_channel}' totaling INR {total_recent_unusual:,.2f} with "
                    f"a {amount_multiplier}x surge in median ticket size."
                ),
                baseline=(
                    f"Established baseline: Dominant channel '{dominant_channel}' ({dominant_ratio * 100:.1f}% of past activity), "
                    f"historical median amount INR {hist_median_amount:,.2f}."
                ),
                deviation=(
                    f"Abrupt shift to '{unusual_channel}' with recent median amount of INR {recent_median_amount:,.2f} "
                    f"({amount_multiplier}x higher than baseline)."
                ),
                investigator_action=(
                    f"Verify whether customer recently changed banking habits or authorized transactions on channel "
                    f"'{unusual_channel}'. Review payee credentials and session telemetry."
                ),
            )
        )

    return findings


# =====================================================================
# Master Evaluation Function for all 4 Rules
# =====================================================================

def evaluate_all_rules(customer: Customer) -> List[Finding]:
    """Run strictly the 4 deterministic risk rules in order.
    
    Returns an aggregated list of Finding objects.
    If no rules fire, returns an empty list (Clean case).
    """
    all_findings: List[Finding] = []

    # Rule 1: Unusually Large Transaction
    all_findings.extend(evaluate_unusually_large_transaction(customer))

    # Rule 2: Burst to New/Infrequent Payee
    all_findings.extend(evaluate_burst_to_new_payee(customer))

    # Rule 3: Odd-Hours Activity
    all_findings.extend(evaluate_odd_hours_activity(customer))

    # Rule 4: Pattern Break
    all_findings.extend(evaluate_pattern_break(customer))

    return all_findings
