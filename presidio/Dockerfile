FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=5001

WORKDIR /srv

COPY requirements.txt .
RUN pip install -r requirements.txt \
 && python -m spacy download en_core_web_sm \
 && python -m spacy download uk_core_news_sm

COPY app ./app

RUN useradd --create-home appuser
USER appuser

EXPOSE 5001
# Render/Railway inject PORT. One worker: the spaCy models are loaded per process.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --no-access-log"]
