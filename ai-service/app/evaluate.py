from app.llm import evaluate_with_llm
from app.schemas import EvaluationRequest, EvaluationResult
from app.similarity import criterion_similarities


def run_evaluation(request: EvaluationRequest) -> EvaluationResult:
    similarities = criterion_similarities(request.student_answer, request.criteria)
    return evaluate_with_llm(request, similarities)
