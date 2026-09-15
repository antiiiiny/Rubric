import operator
from typing import Annotated, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from app import agents
from app.schemas import (
    AccuracyCriticOutput,
    CompletenessEvaluatorOutput,
    ConceptEvaluatorOutput,
    CriterionEvaluation,
    EvaluationRequest,
    EvaluationResult,
    FeedbackOutput,
    JudgeOutput,
)
from app.similarity import criterion_similarities

# Confidence below this, or an agent disagreement, routes through one extra
# critic pass + a second judge reconciliation before handing off to feedback.
CONFLICT_CONFIDENCE_THRESHOLD = 0.6


class EvalState(TypedDict, total=False):
    request: EvaluationRequest
    similarities: dict[str, float]
    concept_result: ConceptEvaluatorOutput | None
    critic_result: AccuracyCriticOutput | None
    completeness_result: CompletenessEvaluatorOutput | None
    additional_critic_result: AccuracyCriticOutput | None
    judge_result: JudgeOutput
    feedback_result: FeedbackOutput | None
    conflict_occurred: bool
    critic_pass: bool
    agent_trace: Annotated[list[dict], operator.add]


def _fallback_judge_output(request: EvaluationRequest) -> JudgeOutput:
    return JudgeOutput(
        criteria=[
            CriterionEvaluation(
                criterion_id=c.id,
                status="missing",
                evidence=None,
                confidence=0.0,
                reasoning="Automated evaluation was unavailable for this criterion.",
                embedding_similarity=0.0,
            )
            for c in request.criteria
        ],
        overall_confidence=0.0,
        conflict_detected=False,
        needs_faculty_review=True,
    )


def prepare_node(state: EvalState) -> dict:
    similarities = criterion_similarities(state["request"].student_answer, state["request"].criteria)
    return {"similarities": similarities, "agent_trace": []}


def concept_node(state: EvalState) -> dict:
    result, trace = agents.concept_evaluator(state["request"], state["similarities"])
    return {"concept_result": result, "agent_trace": [trace.model_dump()]}


def critic_node(state: EvalState) -> dict:
    result, trace = agents.accuracy_critic(state["request"])
    return {"critic_result": result, "agent_trace": [trace.model_dump()]}


def completeness_node(state: EvalState) -> dict:
    result, trace = agents.completeness_evaluator(state["request"])
    return {"completeness_result": result, "agent_trace": [trace.model_dump()]}


def aggregate_node(state: EvalState) -> dict:
    # Parallel evaluator outputs are already merged into shared state by
    # LangGraph's fan-in; the Judge performs the actual reconciliation. This
    # node exists as an explicit step to match the mandated pipeline shape.
    return {}


def judge_node(state: EvalState) -> dict:
    result, trace = agents.judge(
        state["request"],
        state.get("concept_result"),
        state.get("critic_result"),
        state.get("completeness_result"),
        additional_critic=state.get("additional_critic_result"),
    )
    if result is None:
        result = _fallback_judge_output(state["request"])
    return {"judge_result": result, "agent_trace": [trace.model_dump()]}


def additional_critic_node(state: EvalState) -> dict:
    result, trace = agents.accuracy_critic(state["request"])
    conflict_occurred = state.get("conflict_occurred", False) or True
    return {
        "additional_critic_result": result,
        "critic_pass": True,
        "conflict_occurred": conflict_occurred,
        "agent_trace": [trace.model_dump()],
    }


def feedback_node(state: EvalState) -> dict:
    result, trace = agents.feedback_agent(state["request"], state["judge_result"])
    return {"feedback_result": result, "agent_trace": [trace.model_dump()]}


def route_after_judge(state: EvalState) -> Literal["additional_critic", "feedback_agent"]:
    if state.get("critic_pass"):
        # Already ran the conflict-resolution cycle once — always move on to
        # avoid an infinite loop, even if disagreement persists (the judge's
        # needs_faculty_review flag carries that signal forward instead).
        return "feedback_agent"

    judge_result = state["judge_result"]
    if judge_result.conflict_detected or judge_result.overall_confidence < CONFLICT_CONFIDENCE_THRESHOLD:
        return "additional_critic"
    return "feedback_agent"


def build_graph():
    builder = StateGraph(EvalState)
    builder.add_node("prepare", prepare_node)
    builder.add_node("concept_evaluator", concept_node)
    builder.add_node("accuracy_critic", critic_node)
    builder.add_node("completeness_evaluator", completeness_node)
    builder.add_node("aggregate", aggregate_node)
    builder.add_node("judge", judge_node)
    builder.add_node("additional_critic", additional_critic_node)
    builder.add_node("feedback_agent", feedback_node)

    builder.add_edge(START, "prepare")
    builder.add_edge("prepare", "concept_evaluator")
    builder.add_edge("prepare", "accuracy_critic")
    builder.add_edge("prepare", "completeness_evaluator")
    builder.add_edge("concept_evaluator", "aggregate")
    builder.add_edge("accuracy_critic", "aggregate")
    builder.add_edge("completeness_evaluator", "aggregate")
    builder.add_edge("aggregate", "judge")
    builder.add_conditional_edges(
        "judge",
        route_after_judge,
        {"additional_critic": "additional_critic", "feedback_agent": "feedback_agent"},
    )
    builder.add_edge("additional_critic", "judge")
    builder.add_edge("feedback_agent", END)

    return builder.compile()


_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


def run_multi_agent_evaluation(request: EvaluationRequest) -> EvaluationResult:
    graph = get_graph()
    final_state: EvalState = graph.invoke({"request": request})

    judge_result = final_state["judge_result"]
    conflict_occurred = final_state.get("conflict_occurred", False)
    feedback_result = final_state.get("feedback_result")

    return EvaluationResult(
        criteria=judge_result.criteria,
        overall_confidence=judge_result.overall_confidence,
        needs_faculty_review=judge_result.needs_faculty_review or judge_result.conflict_detected,
        conflict_occurred=conflict_occurred,
        agent_trace=final_state.get("agent_trace", []),
        feedback=feedback_result,
    )
