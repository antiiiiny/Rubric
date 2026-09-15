import pytest
from pydantic import ValidationError

from app.schemas import CriterionEvaluation, EvaluationRequest, EvaluationResult


def test_evaluation_request_requires_at_least_one_criterion():
    with pytest.raises(ValidationError):
        EvaluationRequest(
            question_prompt="What is normalization?",
            expected_answer="Reduces redundancy",
            student_answer="It organizes data",
            criteria=[],
        )


def test_criterion_evaluation_rejects_invalid_status():
    with pytest.raises(ValidationError):
        CriterionEvaluation(
            criterion_id="c1",
            status="mostly-correct",  # not one of the allowed literals
            confidence=0.8,
            reasoning="looks right",
            embedding_similarity=0.5,
        )


def test_criterion_evaluation_rejects_confidence_out_of_range():
    with pytest.raises(ValidationError):
        CriterionEvaluation(
            criterion_id="c1",
            status="covered",
            confidence=1.5,
            reasoning="too confident",
            embedding_similarity=0.5,
        )


def test_evaluation_result_accepts_well_formed_payload():
    result = EvaluationResult.model_validate(
        {
            "criteria": [
                {
                    "criterion_id": "c1",
                    "status": "covered",
                    "evidence": "reduces redundancy",
                    "confidence": 0.9,
                    "reasoning": "Student explicitly mentioned redundancy reduction.",
                    "embedding_similarity": 0.7,
                }
            ],
            "overall_confidence": 0.9,
            "needs_faculty_review": False,
        }
    )
    assert result.criteria[0].status == "covered"


def test_evaluation_result_rejects_malformed_llm_output():
    with pytest.raises(ValidationError):
        EvaluationResult.model_validate({"criteria": "not a list", "overall_confidence": 0.9})
