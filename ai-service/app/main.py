from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException
from pydantic import ValidationError

from app.evaluate import run_evaluation
from app.schemas import EvaluationRequest, EvaluationResult

app = FastAPI(title="Rubric AI Service")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "ai-service",
        "timestamp": datetime.now(UTC).isoformat(),
    }


@app.post("/evaluate", response_model=EvaluationResult)
def evaluate(request: EvaluationRequest) -> EvaluationResult:
    """Internal endpoint (backend -> ai-service only, never exposed to the frontend)."""
    try:
        return run_evaluation(request)
    except ValidationError as err:
        raise HTTPException(
            status_code=502, detail=f"LLM output failed schema validation: {err}"
        ) from err
    except Exception as err:  # surface any Groq/network failure as a clean 502
        raise HTTPException(status_code=502, detail=f"Evaluation failed: {err}") from err
