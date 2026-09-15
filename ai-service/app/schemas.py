from typing import Literal

from pydantic import BaseModel, Field

CriterionStatus = Literal["covered", "partial", "missing"]


class CriterionInput(BaseModel):
    id: str
    name: str
    weight: int = Field(ge=1, le=100)


class EvaluationRequest(BaseModel):
    question_prompt: str
    expected_answer: str
    student_answer: str
    criteria: list[CriterionInput] = Field(min_length=1)


class CriterionEvaluation(BaseModel):
    criterion_id: str
    status: CriterionStatus
    evidence: str | None = Field(
        default=None, description="Short quote from the student answer supporting the status."
    )
    confidence: float = Field(ge=0, le=1)
    reasoning: str = Field(
        max_length=500, description="Concise decision explanation, not raw chain-of-thought."
    )
    embedding_similarity: float = Field(ge=0, le=1)


class EvaluationResult(BaseModel):
    criteria: list[CriterionEvaluation]
    overall_confidence: float = Field(ge=0, le=1)
    needs_faculty_review: bool
