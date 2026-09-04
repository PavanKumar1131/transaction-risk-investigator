"""Transaction Risk Investigation Assistant — Flask Web Server (PS06).

Serves frontend interface and exposes investigation REST API endpoints:
- GET  /                                  : Frontend web application
- GET  /api/health                        : Server connectivity and health
- GET  /api/customers                     : List all customer summaries
- GET  /api/customers/<customer_id>       : Specific customer details & transactions
- POST /api/investigate/<customer_id>     : Full investigation (Rules + Baseline + Gemini report)
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from dotenv import load_dotenv

from src.data_loader import get_customer, list_customers, load_dataset
from src.gemini_service import generate_investigation_narrative
from src.rules_engine import investigate_customer

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Load environment variables from .env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

# Configure Flask app to serve frontend static assets
FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"
app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")


@app.route("/")
def serve_index():
    """Serve the primary investigation interface."""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    """Serve static assets (style.css, app.js, etc.)."""
    return send_from_directory(app.static_folder, filename)


@app.route("/api/health", methods=["GET"])
def health_check():
    """Verify backend connectivity, track ID, and configuration."""
    has_key = bool(os.getenv("GEMINI_API_KEY", "").strip())
    return jsonify({
        "status": "healthy",
        "track_id": "PS06",
        "gemini_model": os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        "host": "0.0.0.0:8000",
        "has_gemini_key": has_key,
        "mode": "Live AI" if has_key else "Deterministic Fallback",
    })


@app.route("/api/customers", methods=["GET"])
def get_customers_list():
    """Return lightweight summary of all available customer profiles."""
    try:
        customers = list_customers()
        return jsonify({"customers": customers, "count": len(customers)}), 200
    except Exception as e:
        logger.error("Error retrieving customer list: %s", str(e))
        return jsonify({"error": "Failed to load customer profiles"}), 500


@app.route("/api/customers/<customer_id>", methods=["GET"])
def get_customer_details(customer_id: str):
    """Return customer profile and full sanitized transaction history."""
    try:
        customer = get_customer(customer_id)
        if not customer:
            return jsonify({"error": f"Customer '{customer_id}' not found"}), 404

        return jsonify({
            "customer_id": customer.customer_id,
            "name": customer.name,
            "account_number": customer.account_number,
            "account_created": customer.account_created,
            "risk_profile": customer.risk_profile,
            "expected_outcome": customer.expected_outcome,
            "notes": customer.notes,
            "transaction_count": len(customer.transactions),
            "transactions": [tx.to_dict() for tx in customer.transactions],
        }), 200
    except Exception as e:
        logger.error("Error retrieving customer '%s': %s", customer_id, str(e))
        return jsonify({"error": "Failed to load customer data"}), 500


@app.route("/api/investigate/<customer_id>", methods=["POST"])
def run_investigation(customer_id: str):
    """Run full investigation workflow: validation -> baseline -> rules -> Gemini report."""
    try:
        customer = get_customer(customer_id)
        if not customer:
            return jsonify({"error": f"Customer '{customer_id}' not found"}), 404

        # 1. Deterministic Rule Evaluation & Baseline Calculation
        report = investigate_customer(customer)

        # 2. Grounded Gemini Narrative Report Generation (with automatic fallback)
        ai_narrative = generate_investigation_narrative(report)

        # 3. Assemble unified investigation payload
        payload = report.to_dict()
        payload["ai_narrative"] = ai_narrative.to_dict()

        return jsonify(payload), 200

    except ValueError as e:
        logger.warning("Traceability or validation error for '%s': %s", customer_id, str(e))
        return jsonify({"error": "Validation failed", "detail": str(e)}), 400
    except Exception as e:
        logger.error("Investigation error for '%s': %s", customer_id, str(e))
        return jsonify({"error": "Investigation processing error"}), 500


if __name__ == "__main__":
    # Start live server listening on port 8000
    app.run(host="0.0.0.0", port=8000, debug=True)
