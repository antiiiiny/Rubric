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


class AgentTraceEntry(BaseModel):
    agent_name: str
    status: Literal["ok", "error"]
    confidence: float | None = None
    summary: str = Field(max_length=300)


class FeedbackOutput(BaseModel):
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    inaccuracies: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    summary: str = Field(max_length=800, default="")


class EvaluationResult(BaseModel):
    criteria: list[CriterionEvaluation]
    overall_confidence: float = Field(ge=0, le=1)
    needs_faculty_review: bool
    conflict_occurred: bool = False
    agent_trace: list[AgentTraceEntry] = Field(default_factory=list)
    feedback: FeedbackOutput | None = None


class ConceptCriterionAssessment(BaseModel):
    criterion_id: str
    status: CriterionStatus
    evidence: str | None = None
    confidence: float = Field(ge=0, le=1)
    reasoning: str = Field(max_length=300)


class ConceptEvaluatorOutput(BaseModel):
    criteria: list[ConceptCriterionAssessment]


class AccuracyCriterionAssessment(BaseModel):
    criterion_id: str
    status: CriterionStatus
    contradiction: bool = False
    misconception: str | None = None
    confidence: float = Field(ge=0, le=1)
    reasoning: str = Field(max_length=300)


class AccuracyCriticOutput(BaseModel):
    criteria: list[AccuracyCriterionAssessment]


class CompletenessCriterionAssessment(BaseModel):
    criterion_id: str
    addressed: bool
    confidence: float = Field(ge=0, le=1)
    reasoning: str = Field(max_length=300)


class CompletenessEvaluatorOutput(BaseModel):
    criteria: list[CompletenessCriterionAssessment]


class JudgeOutput(BaseModel):
    criteria: list[CriterionEvaluation]
    overall_confidence: float = Field(ge=0, le=1)
    conflict_detected: bool
    needs_faculty_review: bool
