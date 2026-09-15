from app import agents, graph
from app.schemas import (
    AccuracyCriticOutput,
    AgentTraceEntry,
    CompletenessEvaluatorOutput,
    ConceptEvaluatorOutput,
    CriterionEvaluation,
    EvaluationRequest,
    FeedbackOutput,
    JudgeOutput,
)


def make_request() -> EvaluationRequest:
    return EvaluationRequest(
        question_prompt="What is normalization?",
        expected_answer="Reduces redundancy and prevents anomalies",
        student_answer="It reduces redundancy",
        criteria=[{"id": "c1", "name": "reduces redundancy", "weight": 100}],
    )


def _ok_concept(request, similarities):
    return (
        ConceptEvaluatorOutput(
            criteria=[{"criterion_id": "c1", "status": "covered", "confidence": 0.9, "reasoning": "ok"}]
        ),
        AgentTraceEntry(agent_name="concept_evaluator", status="ok", confidence=0.9, summary="ok"),
    )


def _ok_critic(request):
    return (
        AccuracyCriticOutput(
            criteria=[{"criterion_id": "c1", "status": "covered", "confidence": 0.9, "reasoning": "ok"}]
        ),
        AgentTraceEntry(agent_name="accuracy_critic", status="ok", confidence=0.9, summary="ok"),
    )


def _ok_completeness(request):
    return (
        CompletenessEvaluatorOutput(
            criteria=[{"criterion_id": "c1", "addressed": True, "confidence": 0.9, "reasoning": "ok"}]
        ),
        AgentTraceEntry(agent_name="completeness_evaluator", status="ok", confidence=0.9, summary="ok"),
    )


def _ok_feedback(request, judge_result):
    return (
        FeedbackOutput(summary="Nice work."),
        AgentTraceEntry(agent_name="feedback_agent", status="ok", summary="ok"),
    )


def test_graph_takes_direct_path_when_judge_is_confident_and_agrees(monkeypatch):
    monkeypatch.setattr(agents, "concept_evaluator", _ok_concept)
    monkeypatch.setattr(agents, "accuracy_critic", _ok_critic)
    monkeypatch.setattr(agents, "completeness_evaluator", _ok_completeness)
    monkeypatch.setattr(agents, "feedback_agent", _ok_feedback)

    def confident_judge(request, concept, critic, completeness, additional_critic=None):
        assert additional_critic is None
        return (
            JudgeOutput(
                criteria=[CriterionEvaluation(criterion_id="c1", status="covered", confidence=0.95, reasoning="ok", embedding_similarity=0.5)],
                overall_confidence=0.95,
                conflict_detected=False,
                needs_faculty_review=False,
            ),
            AgentTraceEntry(agent_name="judge", status="ok", confidence=0.95, summary="ok"),
        )

    monkeypatch.setattr(agents, "judge", confident_judge)
    graph._graph = None  # rebuild against patched agents module

    result = graph.run_multi_agent_evaluation(make_request())

    agent_names = [t.agent_name for t in result.agent_trace]
    assert "additional_critic" not in agent_names
    assert agent_names.count("judge") == 1
    assert result.conflict_occurred is False
    assert result.needs_faculty_review is False


def test_graph_runs_conflict_resolution_cycle_when_judge_flags_conflict(monkeypatch):
    monkeypatch.setattr(agents, "concept_evaluator", _ok_concept)
    monkeypatch.setattr(agents, "accuracy_critic", _ok_critic)
    monkeypatch.setattr(agents, "completeness_evaluator", _ok_completeness)
    monkeypatch.setattr(agents, "feedback_agent", _ok_feedback)

    call_count = {"judge": 0}

    def conflicted_then_resolved_judge(request, concept, critic, completeness, additional_critic=None):
        call_count["judge"] += 1
        if call_count["judge"] == 1:
            assert additional_critic is None
            return (
                JudgeOutput(
                    criteria=[CriterionEvaluation(criterion_id="c1", status="partial", confidence=0.4, reasoning="disagreement", embedding_similarity=0.5)],
                    overall_confidence=0.4,
                    conflict_detected=True,
                    needs_faculty_review=False,
                ),
                AgentTraceEntry(agent_name="judge", status="ok", confidence=0.4, summary="first pass"),
            )
        # Second pass, informed by the additional critic re-review.
        assert additional_critic is not None
        return (
            JudgeOutput(
                criteria=[CriterionEvaluation(criterion_id="c1", status="covered", confidence=0.85, reasoning="resolved", embedding_similarity=0.5)],
                overall_confidence=0.85,
                conflict_detected=False,
                needs_faculty_review=False,
            ),
            AgentTraceEntry(agent_name="judge", status="ok", confidence=0.85, summary="second pass"),
        )

    monkeypatch.setattr(agents, "judge", conflicted_then_resolved_judge)
    graph._graph = None

    result = graph.run_multi_agent_evaluation(make_request())

    agent_names = [t.agent_name for t in result.agent_trace]
    assert agent_names.count("judge") == 2
    # The additional-critic node re-runs the accuracy_critic agent for its
    # re-review pass, so it shows up as a second "accuracy_critic" entry
    # rather than a distinctly-named agent.
    assert agent_names.count("accuracy_critic") == 2
    assert call_count["judge"] == 2
    assert result.conflict_occurred is True
    assert result.criteria[0].status == "covered"


def test_graph_flags_faculty_review_when_judge_agent_itself_fails(monkeypatch):
    monkeypatch.setattr(agents, "concept_evaluator", _ok_concept)
    monkeypatch.setattr(agents, "accuracy_critic", _ok_critic)
    monkeypatch.setattr(agents, "completeness_evaluator", _ok_completeness)
    monkeypatch.setattr(agents, "feedback_agent", _ok_feedback)

    def failing_judge(request, concept, critic, completeness, additional_critic=None):
        return None, AgentTraceEntry(agent_name="judge", status="error", summary="Groq unreachable")

    monkeypatch.setattr(agents, "judge", failing_judge)
    graph._graph = None

    result = graph.run_multi_agent_evaluation(make_request())

    assert result.needs_faculty_review is True
    assert result.overall_confidence == 0.0
    assert result.criteria[0].status == "missing"
