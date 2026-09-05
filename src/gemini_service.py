"""Gemini Grounded Reporting Service (Phase 5).

Strictly constrained narrative generation for fraud desk investigators:
- Python = detection/decision logic. Gemini = explanation/report generation only.
- System prompt forbids inventing figures or claiming fraud occurred.
- Generates required 7 sections (attention required) or 4 sections (clean).
- Graceful offline fallback if Gemini API key is absent, invalid, or times out.
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Optional

from src.config import get_gemini_api_key, get_gemini_model, has_gemini_api_key
from src.report_builder import InvestigationReport

logger = logging.getLogger(__name__)

FORBIDDEN_PHRASES = [
    (re.compile(r"\bfraud detected\b", re.IGNORECASE), "risk signal identified"),
    (re.compile(r"\bthis is fraud\b", re.IGNORECASE), "this activity requires review"),
    (re.compile(r"\bconfirms fraud\b", re.IGNORECASE), "triggers configured risk rules"),
    (re.compile(r"\bfraudulent transaction\b", re.IGNORECASE), "flagged transaction"),
]

SYSTEM_PROMPT = """You are an objective Decision-Support Investigation Assistant for a bank's fraud desk.
Your sole role is to translate pre-computed, deterministic Python risk findings into a concise, professional investigator report.

CRITICAL INSTRUCTIONS & GUARDRAILS:
1. Grounding: You receive only pre-computed findings, baseline metrics, and cited transactions from Python.
   NEVER invent transactions, amounts, dates, payees, or baselines. Use ONLY the supplied evidence.
2. No Fraud Accusations: NEVER state that 'fraud has occurred' or 'fraud detected'. You are highlighting risk signals
   and unusual deviations. The human investigator makes the final determination.
3. Separation of Fact from Interpretation: Clearly distinguish factual transaction details from potential risk interpretations.
4. Completeness: Follow the exact report section structure requested. If evidence is insufficient, note the limitations
   and recommend specific verification steps.
"""


@dataclass
class GeminiReportResult:
    """Result from the Gemini explanation service."""
    content: str
    model: str
    is_fallback: bool
    status: str  # 'SUCCESS' or 'FALLBACK'
    fallback_reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "content": self.content,
            "model": self.model,
            "is_fallback": self.is_fallback,
            "status": self.status,
            "fallback_reason": self.fallback_reason,
        }


def sanitize_narrative(text: str) -> str:
    """Enforce guardrails by scrubbing any accidental definitive fraud declarations."""
    sanitized = text
    for pattern, replacement in FORBIDDEN_PHRASES:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def build_user_prompt(report: InvestigationReport) -> str:
    """Build grounded user prompt containing ONLY Python-computed statistics and findings."""
    is_attention = report.overall_status == "ATTENTION_REQUIRED"
    report_dict = report.to_dict()

    if is_attention:
        section_instructions = """Please generate the report with EXACTLY these 7 sections:
1. Investigation Summary
2. Does Anything Require Attention?
3. Key Findings
4. Evidence
5. Why It Was Flagged
6. What the Investigator Should Check First
7. Uncertainty / Limitations"""
    else:
        section_instructions = """Please generate the report with EXACTLY these 4 sections:
1. Investigation Summary
2. No Immediate Attention Required
3. Evidence
4. Notes / Limitations"""

    prompt = f"""EVALUATION DATA (All figures computed deterministically by Python):

CUSTOMER PROFILE:
- Customer ID: {report.customer_id}
- Name: {report.customer_name}
- Account Number: {report.account_number}
- Overall Status: {report.overall_status}

BASELINE METRICS:
{json.dumps(report_dict.get('baseline_profile', {}), indent=2)}

RULE FINDINGS:
{json.dumps(report_dict.get('findings', []), indent=2)}

CITED TRANSACTIONS (EVIDENCE):
{json.dumps(report_dict.get('flagged_transactions', []), indent=2)}

TASK:
Write a professional, concise investigation report based solely on the data above.
{section_instructions}

Remember: Never claim fraud occurred. Ground every sentence in the evidence provided above.
"""
    return prompt


def generate_fallback_report(report: InvestigationReport, reason: str) -> GeminiReportResult:
    """Deterministic fallback report ensuring 100% availability without external dependencies."""
    is_attention = report.overall_status == "ATTENTION_REQUIRED"
    b = report.baseline_profile

    if is_attention:
        findings_bullets = "\n".join(
            f"- **{f.rule}** ({f.severity} Severity): {f.reason}\n  - Baseline: {f.baseline}\n  - Deviation: {f.deviation}"
            for f in report.findings
        )
        evidence_rows = "\n".join(
            f"- **{tx['transaction_id']}** | {tx['date']} | INR {tx['amount']:,.2f} | Payee: {tx['payee']} | Channel: {tx['channel']} | Flags: {', '.join(tx.get('triggered_rules', []))}"
            for tx in report.flagged_transactions
        )
        actions = "\n".join(
            f"{i+1}. {f.investigator_action}"
            for i, f in enumerate(report.findings)
        )

        content = f"""### 1. Investigation Summary
The investigation evaluated customer {report.customer_name} ({report.customer_id}) against deterministic risk detection rules. The account exhibits activity that deviates noticeably from established spending patterns.

### 2. Does Anything Require Attention?
**STATUS: ATTENTION REQUIRED**
Review is recommended for {len(report.flagged_transactions)} transaction(s) that triggered configured risk thresholds.

### 3. Key Findings
{findings_bullets}

### 4. Evidence
{evidence_rows}

### 5. Why It Was Flagged
The flagged transactions broke deterministic statistical boundaries established by the customer's prior account history (e.g. median transaction amounts, active operating hours, or channel usage).

### 6. What the Investigator Should Check First
{actions}

### 7. Uncertainty / Limitations
*Note: AI explanation fallback active ({reason}). Findings above are deterministically verified by the Python rule engine. This report highlights risk signals and does not establish that fraud occurred.*"""

    else:
        content = f"""### 1. Investigation Summary
Routine risk investigation conducted for customer {report.customer_name} ({report.customer_id}). The customer's transaction activity was cross-referenced against all four deterministic risk rules.

### 2. No Immediate Attention Required
**STATUS: NO IMMEDIATE ATTENTION REQUIRED**
No configured risk rules were triggered. All reviewed transaction activity is consistent with the customer's established baseline.

### 3. Evidence
- Reviewed {b.total_transactions if b else len(report.all_transactions)} transactions spanning from {b.date_range_start if b else 'N/A'} to {b.date_range_end if b else 'N/A'}.
- Historical median debit: INR {b.median_debit if b else 0:,.2f}.
- Dominant channel: {b.dominant_channel if b else 'N/A'} ({b.dominant_channel_pct if b else 0}%).
- Typical hours: {b.active_hours_summary if b else 'Daytime'}.

### 4. Notes / Limitations
*Note: AI explanation fallback active ({reason}). Findings deterministically verified clean by Python rule engine.*"""

    return GeminiReportResult(
        content=content.strip(),
        model="deterministic-fallback",
        is_fallback=True,
        status="FALLBACK",
        fallback_reason=reason,
    )


def generate_investigation_narrative(
    report: InvestigationReport,
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
    timeout_seconds: int = 25,
) -> GeminiReportResult:
    """Generate grounded report narrative via Gemini API with automatic fallback."""
    key = (api_key if api_key is not None else get_gemini_api_key()).strip()
    model = (model_name if model_name is not None else get_gemini_model()).strip()

    # If key is absent, provide immediate deterministic fallback
    if not key:
        logger.info("GEMINI_API_KEY not configured. Generating deterministic report fallback.")
        return generate_fallback_report(report, "GEMINI_API_KEY not configured")

    user_prompt = build_user_prompt(report)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"{SYSTEM_PROMPT}\n\n{user_prompt}"}],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048,
        },
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            resp_body = resp.read().decode("utf-8")
            data = json.loads(resp_body)
            raw_text = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
            if not raw_text:
                raise ValueError("Empty response text received from Gemini API")

            sanitized_text = sanitize_narrative(raw_text)
            return GeminiReportResult(
                content=sanitized_text.strip(),
                model=model,
                is_fallback=False,
                status="SUCCESS",
            )
    except urllib.error.HTTPError as e:
        logger.warning("Gemini API HTTP Error %d: %s", e.code, e.reason)
        return generate_fallback_report(report, f"AI generation failed: HTTP {e.code} ({e.reason})")
    except urllib.error.URLError as e:
        logger.warning("Gemini API Network/URL Error: %s", e.reason)
        return generate_fallback_report(report, f"AI generation failed: Network error ({e.reason})")
    except Exception as e:
        logger.warning("Gemini generation failed: %s", str(e))
        return generate_fallback_report(report, f"AI generation failed: {str(e)}")
