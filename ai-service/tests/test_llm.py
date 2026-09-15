import json

import pytest
from pydantic import ValidationError

from app import llm
from app.schemas import EvaluationRequest

VALID_RESPONSE = json.dumps(
    {
        "criteria": [
            {
                "criterion_id": "c1",
                "status": "covered",
                "evidence": "reduces redundancy",
                "confidence": 0.9,
                "reasoning": "Student mentioned it directly.",
                "embedding_similarity": 0.8,
            }
        ],
        "overall_confidence": 0.9,
        "needs_faculty_review": False,
    }
)


def make_request() -> EvaluationRequest:
    return EvaluationRequest(
        question_prompt="What is normalization?",
        expected_answer="Reduces redundancy and prevents anomalies",
        student_answer="It reduces redundancy",
        criteria=[{"id": "c1", "name": "reduces redundancy", "weight": 100}],
    )


def test_evaluate_with_llm_accepts_valid_first_response(monkeypatch):
    monkeypatch.setattr(llm, "_call_groq", lambda prompt, retry_note=None: VALID_RESPONSE)

    result = llm.evaluate_with_llm(make_request(), {"c1": 0.8})

    assert result.criteria[0].status == "covered"


def test_evaluate_with_llm_retries_once_on_malformed_json(monkeypatch):
    calls = {"count": 0}

    def fake_call(prompt, retry_note=None):
        calls["count"] += 1
        if calls["count"] == 1:
            return "not json at all"
        return VALID_RESPONSE

    monkeypatch.setattr(llm, "_call_groq", fake_call)

    result = llm.evaluate_with_llm(make_request(), {"c1": 0.8})

    assert calls["count"] == 2
    assert result.criteria[0].status == "covered"


def test_evaluate_with_llm_raises_when_both_attempts_are_malformed(monkeypatch):
    monkeypatch.setattr(llm, "_call_groq", lambda prompt, retry_note=None: "still not json")

    with pytest.raises((ValidationError, json.JSONDecodeError)):
        llm.evaluate_with_llm(make_request(), {"c1": 0.8})


def test_evaluate_with_llm_raises_when_schema_is_wrong_even_if_json_is_valid(monkeypatch):
    malformed_schema = json.dumps({"criteria": "not-a-list", "overall_confidence": 0.5})
    monkeypatch.setattr(llm, "_call_groq", lambda prompt, retry_note=None: malformed_schema)

    with pytest.raises(ValidationError):
        llm.evaluate_with_llm(make_request(), {"c1": 0.8})
