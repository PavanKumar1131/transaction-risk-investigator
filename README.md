TRACK_ID=PS06

# Transaction Risk Investigation Assistant

An AI-augmented decision-support platform designed for a bank's fraud desk to review customer transaction histories against deterministic risk rules and produce structured, investigator-focused risk reports.

---

## 1. Problem Statement (PS06)

Fraud desks face the challenge of reviewing multi-month transaction histories spanning routine living expenses, payroll, transfers, and potential security anomalies. An effective investigation system must:

1. **State the first finding clearly**: Does anything require attention at all?
   - If suspicious signals exist: Identify the exact transactions, which rule triggered, how the activity deviates from the customer's established baseline, and what an investigator should check first.
   - If nothing is suspicious: State `STATUS: NO IMMEDIATE ATTENTION REQUIRED` plainly. A system that finds suspicion everywhere is as useless as one that finds none.
2. **Strict Traceability**: Every figure, date, payee, and transaction cited in an investigation report must be 100% traceable to the source input records.
3. **Never Claim Fraud Occurred**: The system flags statistical anomalies and provides decision-support evidence—it never states that fraud has occurred. The human investigator retains final adjudication authority.

---

## 2. Core Architecture

The system enforces a strict architectural boundary:

```
┌────────────────────────────────────────────────────────┐
│               1. Python Rules Engine                  │
│  - Loads & sanitizes transaction histories             │
│  - Calculates customer-specific baseline statistics    │
│  - Evaluates strictly the 4 deterministic risk rules   │
│  - Executes self-verification traceability check       │
└──────────────────────────┬─────────────────────────────┘
                           │ Structured Findings Contract (JSON)
                           ▼
┌────────────────────────────────────────────────────────┐
│            2. Gemini Grounded Reporter                 │
│  - Receives ONLY Python metrics & cited transactions   │
│  - Bound by strict negative constraint prompts         │
│  - Synthesizes investigator prose (7 or 4 sections)    │
│  - Fallback: deterministic offline report generator    │
└──────────────────────────┬─────────────────────────────┘
                           │ Unified Investigation Payload
                           ▼
┌────────────────────────────────────────────────────────┐
│         3. Fraud Desk Investigation Cockpit            │
│  - Responsive dark-mode dashboard (HTML/CSS/Vanilla JS)│
│  - Telemetry, radar scanner, baseline metrics, ledger  │
└────────────────────────────────────────────────────────┘
```

- **Python = Detection & Decision Logic**: Gemini never independently decides whether a transaction is suspicious. All baseline comparisons and thresholds are calculated in Python.
- **Gemini = Explanation & Reporting Only**: Gemini turns pre-computed findings and baselines into investigator-ready narrative prose.
- **Visual & Logical Separation**: Code is modularized into distinct files (`src/risk_rules.py`, `src/rules_engine.py`, `src/gemini_service.py`, `src/report_builder.py`).

---

## 3. The Four Risk Rules

The system evaluates strictly these four rules (no more, no fewer):

| Rule | Identifier | Detection Logic | Baseline Comparison |
|---|---|---|---|
| **Rule 1** | `UNUSUALLY_LARGE_TRANSACTION` | Compares debit transactions against customer's own historical median while filtering out routine recurring bills (e.g. monthly rent or EMIs). Flags unprecedented outlier debits exceeding customer baseline. | Customer's historical median debit across past debits (no hardcoded universal threshold). |
| **Rule 2** | `BURST_TO_NEW_PAYEE` | Identifies high-velocity, high-value transfers clustered within a 48-hour window directed to a newly seen or rarely seen payee. | Payee had 0 or &le;1 prior transfers in customer's earlier transaction history. |
| **Rule 3** | `ODD_HOURS_ACTIVITY` | Flags high-value transactions initiated during off-hours (00:00–05:00) contrasting against typical operating schedules. | Customer's historical diurnal schedule (e.g. 96% of activity occurring between 07:00 and 22:00). |
| **Rule 4** | `PATTERN_BREAK` | Detects acute behavioral disruptions: abrupt channel pivots (e.g., 98% in-person card usage switching to netbanking wires) combined with ticket-size multipliers. | Dominant channel usage percentage and historical median transaction amount. |

---

## 4. Grounded Gemini Reporting & Guardrails

Gemini synthesizes the structured Python findings into a structured investigator report.

### System Prompt Guardrails
- **Grounding**: Gemini receives only Python-computed metrics, rule findings, and cited transaction rows. It is forbidden from inventing transactions, figures, or rules.
- **Negative Constraint**: The model is strictly instructed never to output "fraud detected" or "this is fraud". An automated regex sanitizer scrubs any unauthorized phrasing into objective risk terminology.
- **Deterministic Fallback**: If `GEMINI_API_KEY` is not provided, is invalid, or times out, the system automatically produces a structured deterministic report matching the exact section architecture. The application never crashes due to external API failures.

### Report Sections
- **Attention-Required Case (7 Sections)**:
  1. Investigation Summary
  2. Does Anything Require Attention?
  3. Key Findings
  4. Evidence
  5. Why It Was Flagged
  6. What the Investigator Should Check First
  7. Uncertainty / Limitations
- **Clean Case (4 Sections)**:
  1. Investigation Summary
  2. No Immediate Attention Required
  3. Evidence
  4. Notes / Limitations

---

## 5. Synthetic Dataset & Personas (`data/transactions.json`)

The synthetic dataset contains 6 customer profiles (20–30 transactions each spanning multiple months) across realistic banking categories:

| Customer ID | Name | Profile Type | Targeted Evaluation |
|---|---|---|---|
| `CUST_101` | Priya Sharma | Clean Baseline | Routine salaried employee with consistent rent, groceries, and daytime expenses. Triggers **0 rules** (`NO IMMEDIATE ATTENTION REQUIRED`). |
| `CUST_102` | Rahul Verma | Outlier Transfer | Software consultant with routine debits, suddenly sending an isolated ₹4,75,000 RTGS wire to a crypto exchange. Triggers **Rule 1**. |
| `CUST_103` | Anita Desai | Payee Burst | Pensioner with steady local expenses, suddenly sending 4 rapid transfers within hours totaling ₹1,80,000 to an unknown advisory entity. Triggers **Rule 2**. |
| `CUST_104` | Vikram Malhotra | Odd Hours | Corporate employee with strictly daytime transactions, initiating transfers at 02:42 AM and 03:18 AM to an offshore remittance service. Triggers **Rule 3**. |
| `CUST_105` | Sneha Reddy | Pattern Break | Customer with 98% in-person card history in Hyderabad, suddenly executing rapid high-value netbanking wires. Triggers **Rule 4**. |
| `CUST_106` | Arjun Nair | Clean Varied | Freelance designer with varied micro-transactions, small UPI splits, and co-working rent. Triggers **0 rules** (`NO IMMEDIATE ATTENTION REQUIRED`). |

---

## 6. Quickstart & Installation

### Prerequisites
- Clean Python 3.11 environment.

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Environment Configuration
The repository includes a template `.env` and `.env.example`:
```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```
*(Note: If `GEMINI_API_KEY` is left blank, the app runs in high-fidelity Deterministic Fallback Mode).*

### 3. Start the Application
```bash
python app.py
```
Open [http://localhost:8000](http://localhost:8000) in your web browser.

---

## 7. Automated Test Suite

Run the full suite of **42 unit and integration tests**:

```bash
python -m unittest discover tests
```

### Test Coverage:
- `test_data_loader.py`: Dataset loading, chronological ordering, deduplication of IDs, negative/zero amount filtering, malformed dates, missing payees, traceability verification.
- `test_risk_rules.py`: Independent verification of Rules 1, 2, 3, and 4; clean baseline verification; schema contract adherence.
- `test_rules_engine.py`: Baseline calculation, investigation orchestration, traceability enforcement.
- `test_gemini_service.py`: Prompt construction, 7-section and 4-section fallback generators, phrase sanitization, mock API integration.
- `test_api.py`: Flask REST API endpoints (`GET /`, `GET /api/health`, `GET /api/customers`, `POST /api/investigate/<id>`).
- `test_edge_cases.py`: Empty transaction histories, 1-tx history, multi-rule simultaneous alerts, simulated API timeouts, and 500 errors.

---

## 8. Demo Video

Watch the complete project demonstration on YouTube:
**[Transaction Risk Investigation Assistant — Demo Video](https://youtu.be/2-HVp9KYbKc?si=_eQO4nVR9Qid2iiE)**

The walkthrough covers:
- **Flagged Customer Investigation** (`CUST_102` — Rahul Verma): Large wire outlier triggering Rule 1 (`UNUSUALLY_LARGE_TRANSACTION`), grounded Gemini 7-section narrative, and evidence ledger trace.
- **Clean Baseline Customer Investigation** (`CUST_101` — Priya Sharma): Consistent daytime transaction patterns triggering 0 rules (`NO IMMEDIATE ATTENTION REQUIRED`) and clean 4-section report.
- **Deterministic Risk Rules Engine & Traceability**: How deterministic Python rules guarantee 100% factual grounding with zero hallucinations.

---

## 9. Limitations

- This system flags statistical anomalies for human review; it does not — and cannot —
  determine that fraud has actually occurred.
- Detection is limited to the four configured deterministic rules; it does not use
  machine learning or behavioral modeling beyond simple baseline comparisons.
- The dataset is synthetic and illustrative; it is not connected to a real banking core
  system, KYC records, or external watchlists.
- Odd-hours and channel-pattern thresholds are configured defaults and may need tuning
  for different customer populations in a production setting.
- Final investigative judgement always rests with a human fraud analyst.

---

## 10. Repository Structure

```
/
├── app.py                      # Live Flask server on port 8000
├── requirements.txt            # Python dependencies
├── README.md                   # Documentation (starts with TRACK_ID=PS06)
├── .env.example                # Template configuration
├── .env                        # Environment file (blank key placeholder)
├── .gitignore                  # Git ignore rules
├── data/
│   └── transactions.json       # Synthetic customer histories (6 personas)
├── src/
│   ├── __init__.py
│   ├── data_loader.py          # Data parsing, sanitization, and traceability check
│   ├── risk_rules.py           # Strictly the 4 deterministic risk rules
│   ├── rules_engine.py         # Baseline calculation and rule evaluation orchestration
│   ├── report_builder.py       # Standardized investigation report schema builder
│   └── gemini_service.py       # Grounded Gemini reporting & deterministic fallback
├── frontend/
│   ├── index.html              # Modern fraud desk decision-support interface
│   ├── style.css               # Obsidian theme, glassmorphism, and radar loader
│   └── app.js                  # Frontend controller, demo shortcuts, and filters
└── tests/
    ├── __init__.py
    ├── test_data_loader.py     # Data loading and sanitization tests
    ├── test_risk_rules.py      # Core 4 rules and clean customer tests
    ├── test_rules_engine.py    # Baseline and investigation orchestration tests
    ├── test_gemini_service.py  # Prompt guardrails and fallback tests
    ├── test_api.py             # REST API endpoint tests
    └── test_edge_cases.py      # Zero transactions, multi-rule alerts, fault tests
```
