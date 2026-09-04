"""Unit tests for src/gemini_service.py (Phase 5)."""

import json
import unittest
from unittest.mock import MagicMock, patch
from src.data_loader import load_dataset
from src.gemini_service import (
    build_user_prompt,
    generate_fallback_report,
    generate_investigation_narrative,
    sanitize_narrative,
)
from src.rules_engine import investigate_customer


class TestGeminiService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = load_dataset()
        cls.clean_report = investigate_customer(cls.dataset["CUST_101"])
        cls.risky_report = investigate_customer(cls.dataset["CUST_102"])

    def test_prompt_builder_attention_case(self):
        """Prompt for attention-required case requests all 7 required sections and includes exact figures."""
        prompt = build_user_prompt(self.risky_report)
        self.assertIn("1. Investigation Summary", prompt)
        self.assertIn("2. Does Anything Require Attention?", prompt)
        self.assertIn("3. Key Findings", prompt)
        self.assertIn("4. Evidence", prompt)
        self.assertIn("5. Why It Was Flagged", prompt)
        self.assertIn("6. What the Investigator Should Check First", prompt)
        self.assertIn("7. Uncertainty / Limitations", prompt)
        self.assertIn("TX102_28", prompt)
        self.assertIn("UNUSUALLY_LARGE_TRANSACTION", prompt)

    def test_prompt_builder_clean_case(self):
        """Prompt for clean case requests 4 required sections and contains clean baseline."""
        prompt = build_user_prompt(self.clean_report)
        self.assertIn("1. Investigation Summary", prompt)
        self.assertIn("2. No Immediate Attention Required", prompt)
        self.assertIn("3. Evidence", prompt)
        self.assertIn("4. Notes / Limitations", prompt)
        self.assertIn("NO_ATTENTION_REQUIRED", prompt)

    def test_fallback_report_clean_case(self):
        """Deterministic fallback produces clean report with NO IMMEDIATE ATTENTION REQUIRED."""
        res = generate_fallback_report(self.clean_report, "Test offline")
        self.assertTrue(res.is_fallback)
        self.assertEqual(res.status, "FALLBACK")
        self.assertIn("NO IMMEDIATE ATTENTION REQUIRED", res.content)
        self.assertIn("No configured risk rules were triggered", res.content)
        self.assertIn("1. Investigation Summary", res.content)
        self.assertIn("4. Notes / Limitations", res.content)

    def test_fallback_report_attention_case(self):
        """Deterministic fallback produces attention report with all 7 sections and exact transaction IDs."""
        res = generate_fallback_report(self.risky_report, "Test offline")
        self.assertTrue(res.is_fallback)
        self.assertIn("ATTENTION REQUIRED", res.content)
        self.assertIn("TX102_28", res.content)
        self.assertIn("475,000", res.content)
        self.assertIn("1. Investigation Summary", res.content)
        self.assertIn("7. Uncertainty / Limitations", res.content)

    def test_sanitize_forbidden_phrases(self):
        """Never say 'fraud detected' - replaced with objective risk terminology."""
        dirty = "A fraud detected by system and this is fraud confirmed. A fraudulent transaction occurred."
        clean = sanitize_narrative(dirty)
        self.assertNotIn("fraud detected", clean.lower())
        self.assertNotIn("this is fraud", clean.lower())
        self.assertNotIn("fraudulent transaction", clean.lower())
        self.assertIn("risk signal identified", clean)
        self.assertIn("flagged transaction", clean)

    def test_generate_narrative_without_key_falls_back(self):
        """When API key is absent, service falls back gracefully without raising exceptions."""
        res = generate_investigation_narrative(self.risky_report, api_key="")
        self.assertTrue(res.is_fallback)
        self.assertIn("GEMINI_API_KEY not configured", res.fallback_reason)
        self.assertIn("TX102_28", res.content)

    @patch("urllib.request.urlopen")
    def test_generate_narrative_mock_gemini_success(self, mock_urlopen):
        """Simulate successful Gemini API call returning generated report."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "candidates": [{
                "content": {
                    "parts": [{"text": "### 1. Investigation Summary\nRisk signal identified. Review recommended."}]
                }
            }]
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        res = generate_investigation_narrative(
            self.risky_report,
            api_key="fake-key-for-test",
            model_name="gemini-3.5-flash-lite",
        )
        self.assertFalse(res.is_fallback)
        self.assertEqual(res.status, "SUCCESS")
        self.assertIn("Risk signal identified", res.content)


if __name__ == "__main__":
    unittest.main()
