from app.graph import run_multi_agent_evaluation
from app.schemas import EvaluationRequest, EvaluationResult


def run_evaluation(request: EvaluationRequest) -> EvaluationResult:
    """Stage 6: LangGraph multi-agent pipeline (parallel evaluators -> judge
    -> conditional conflict resolution -> feedback). Replaces the Stage 5
    single-LLM-pass path for live traffic."""
    return run_multi_agent_evaluation(request)
