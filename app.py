import os
from pathlib import Path
from flask import Flask, jsonify, send_from_directory
from dotenv import load_dotenv

# Load environment variables from .env if present
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

# Configure Flask app to serve static frontend files
FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"
app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")


@app.route("/")
def serve_index():
    """Serve the primary frontend interface."""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    """Serve static frontend assets (css, js)."""
    return send_from_directory(app.static_folder, filename)


@app.route("/api/health", methods=["GET"])
def health_check():
    """Verify backend connectivity and environment configuration."""
    return jsonify({
        "status": "healthy",
        "track_id": "PS06",
        "gemini_model": GEMINI_MODEL,
        "host": "0.0.0.0:8000",
        "phase": "Phase 1: Scaffold Ready",
        "has_gemini_key": bool(os.getenv("GEMINI_API_KEY", "").strip())
    })


if __name__ == "__main__":
    # Must run on 0.0.0.0:8000 per hackathon specification
    app.run(host="0.0.0.0", port=8000, debug=True)
