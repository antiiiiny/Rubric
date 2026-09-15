from app.schemas import CriterionInput
from app.similarity import criterion_similarities


def test_similar_wording_scores_higher_than_unrelated_criterion():
    criteria = [
        CriterionInput(id="c1", name="reduces redundancy", weight=50),
        CriterionInput(id="c2", name="prevents update anomalies", weight=50),
    ]
    scores = criterion_similarities("Normalization reduces redundancy in the database.", criteria)

    assert scores["c1"] > scores["c2"]


def test_empty_or_stopword_only_answer_returns_zero_scores():
    criteria = [CriterionInput(id="c1", name="reduces redundancy", weight=100)]
    scores = criterion_similarities("the a an", criteria)

    assert scores["c1"] == 0.0
