TRACK_ID=PS06

# Transaction Risk Investigation Assistant (PS06)

An AI-augmented investigation assistant built for a bank's fraud desk to review customer transaction histories against deterministic risk rules and produce structured, investigator-focused risk reports.

## Architecture Philosophy
- **Python = Detection & Decision Logic**: Deterministic rules engine strictly evaluates transactions against four risk rules and calculates customer baselines.
- **Gemini = Explanation & Reporting Only**: LLM is constrained to generating investigator-ready narrative reports from structured Python findings without inventing data or claiming fraud.
- **Explicit Clean Case**: If no risk rules trigger, the system explicitly reports `NO IMMEDIATE ATTENTION REQUIRED`.

## Four Risk Rules
1. **Rule 1 — Unusually Large Transaction**: Evaluated against the customer's own baseline (median-based deviation).
2. **Rule 2 — Burst to a New/Infrequent Payee**: High-velocity transfers to newly seen or rarely seen payees within a tight window.
3. **Rule 3 — Odd-Hours Activity**: Configurable window (e.g., 00:00–05:00) identifying atypical transaction timings.
4. **Rule 4 — Pattern Break**: Deterministic threshold checks for sudden volume/amount shifts or channel deviations.

## Quickstart

### 1. Installation
```bash
pip install -r requirements.txt
```

### 2. Environment Configuration
Set your Gemini API key in `.env` (or set environment variables):
```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

### 3. Run the Application
```bash
python app.py
```
Access the application at [http://localhost:8000](http://localhost:8000).

## Project Structure
```
/
├── app.py                  # Flask server entry point (port 8000)
├── requirements.txt        # Python dependencies
├── README.md               # Documentation (TRACK_ID=PS06)
├── .env.example            # Environment variable template
├── .env                    # Runtime configuration (blank key placeholder)
├── .gitignore              # Git ignore rules
├── data/
│   └── transactions.json   # Synthetic customer transaction histories
├── src/
│   ├── __init__.py
│   ├── data_loader.py      # Transaction loading & validation
│   ├── risk_rules.py       # Deterministic risk detection rules
│   ├── rules_engine.py     # Engine orchestrating rule evaluation
│   ├── gemini_service.py   # Grounded Gemini reporting service
│   └── report_builder.py   # Structured report assembly
└── frontend/
    ├── index.html          # Plain HTML interface
    ├── style.css           # Vanilla CSS styles
    └── app.js              # Vanilla JS frontend client
```
