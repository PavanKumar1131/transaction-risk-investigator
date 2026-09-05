"""Centralized configuration and environment loader (Single Source of Truth).

Guarantees repository-root .env is loaded before any other module accesses
GEMINI_API_KEY or GEMINI_MODEL.
"""

from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

# Repository root directory where .env is located
ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"

# Explicitly load .env with override=True so live edits are respected
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH, override=True)
else:
    # Fallback to default search in CWD
    load_dotenv(override=True)


def get_gemini_api_key() -> str:
    """Return stripped GEMINI_API_KEY or empty string."""
    return (os.getenv("GEMINI_API_KEY") or "").strip()


def get_gemini_model() -> str:
    """Return stripped GEMINI_MODEL or default to gemini-3.5-flash-lite."""
    return (os.getenv("GEMINI_MODEL") or "gemini-3.5-flash-lite").strip()


def has_gemini_api_key() -> bool:
    """Check whether a non-empty GEMINI_API_KEY is configured."""
    return bool(get_gemini_api_key())
