from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.schemas import CriterionInput

# TF-IDF cosine similarity stands in for a hosted embedding model here: it's
# free, needs no API key or model download, and is fast enough for this
# project's scale. It is retrieval/evidence only (per CLAUDE.md's mandated
# pipeline) — the LLM call that follows makes the actual correctness
# judgment, so lexical-only similarity is an acceptable trade-off. Revisit
# with a real embedding provider if recall on paraphrased answers proves
# insufficient in practice.


def criterion_similarities(student_answer: str, criteria: list[CriterionInput]) -> dict[str, float]:
    documents = [student_answer, *[c.name for c in criteria]]
    vectorizer = TfidfVectorizer(stop_words="english")
    try:
        matrix = vectorizer.fit_transform(documents)
    except ValueError:
        # Empty vocabulary (e.g. answer is all stopwords/punctuation) — no signal.
        return dict.fromkeys((c.id for c in criteria), 0.0)

    answer_vector = matrix[0:1]
    criteria_vectors = matrix[1:]
    scores = cosine_similarity(answer_vector, criteria_vectors)[0]
    return {c.id: float(score) for c, score in zip(criteria, scores, strict=True)}
