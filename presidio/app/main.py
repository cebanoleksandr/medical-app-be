"""PII/PHI detection service. Stateless: text is analysed in memory and never
logged or persisted. Only the NestJS API should call it (X-API-Key)."""

import hmac
import os
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider
from pydantic import BaseModel, Field

from .filters import is_false_positive
from .recognizers import build_registry

API_KEY = os.environ.get("PRESIDIO_API_KEY", "")
LANGUAGES = ["en", "uk"]

NLP_CONFIG = {
    "nlp_engine_name": "spacy",
    "models": [
        {"lang_code": "en", "model_name": os.environ.get("SPACY_EN_MODEL", "en_core_web_sm")},
        {"lang_code": "uk", "model_name": os.environ.get("SPACY_UK_MODEL", "uk_core_news_sm")},
    ],
    "ner_model_configuration": {
        "model_to_presidio_entity_mapping": {
            "PERSON": "PERSON",
            "PER": "PERSON",
            "GPE": "LOCATION",
            "LOC": "LOCATION",
            "FAC": "LOCATION",
            "ORG": "ORGANIZATION",
            "DATE": "DATE_TIME",
            "NORP": "NRP",
        },
        "labels_to_ignore": ["MISC", "CARDINAL", "ORDINAL", "QUANTITY", "PERCENT", "MONEY", "TIME"],
        "low_score_entity_names": ["ORGANIZATION"],
        "low_confidence_score_multiplier": 0.6,
    },
}

nlp_engine = NlpEngineProvider(nlp_configuration=NLP_CONFIG).create_engine()
analyzer = AnalyzerEngine(
    registry=build_registry(nlp_engine),
    nlp_engine=nlp_engine,
    supported_languages=LANGUAGES,
)
SUPPORTED = {lang: set(analyzer.get_supported_entities(lang)) for lang in LANGUAGES}

app = FastAPI(title="De-ID Presidio", docs_url=None, redoc_url=None)


def require_api_key(x_api_key: str = Header(default="")) -> None:
    if not API_KEY or not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized")


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)
    language: Literal["en", "uk"]
    entities: list[str] | None = None
    score_threshold: float = Field(default=0.0, ge=0.0, le=1.0)


class DetectedEntity(BaseModel):
    type: str
    start: int
    end: int
    score: float


class AnalyzeResponse(BaseModel):
    entities: list[DetectedEntity]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "languages": LANGUAGES}


@app.get("/entities", dependencies=[Depends(require_api_key)])
def entities() -> dict[str, list[str]]:
    return {lang: sorted(types) for lang, types in SUPPORTED.items()}


@app.post("/analyze", response_model=AnalyzeResponse, dependencies=[Depends(require_api_key)])
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    supported = SUPPORTED[req.language]
    # A US-only type (e.g. US_SSN) requested for Ukrainian text is just skipped.
    requested = [e for e in req.entities if e in supported] if req.entities else None
    if requested == []:
        return AnalyzeResponse(entities=[])

    results = analyzer.analyze(
        text=req.text,
        language=req.language,
        entities=requested,
        score_threshold=req.score_threshold,
    )
    return AnalyzeResponse(
        entities=[
            DetectedEntity(type=r.entity_type, start=r.start, end=r.end, score=round(r.score, 4))
            for r in sorted(results, key=lambda r: (r.start, -r.score))
            if not is_false_positive(req.text, r, req.language)
        ]
    )
