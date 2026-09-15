from datetime import UTC, datetime

from fastapi import FastAPI

app = FastAPI(title="Rubric AI Service")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "ai-service",
        "timestamp": datetime.now(UTC).isoformat(),
    }
