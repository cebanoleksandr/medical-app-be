"""Post-filters for false positives the small spaCy models produce on
clinical text."""

import re

from presidio_analyzer import RecognizerResult

from .medical_terms import is_medical_term
from .uk_names import cannot_be_person

NER_TYPES = {"PERSON", "LOCATION", "ORGANIZATION", "NRP"}

# Durations and ages under 90 are not identifiers under HIPAA Safe Harbor.
_DURATION = re.compile(
    r"\b(ago|old|years?|months?|weeks?|days?|hours?|minutes?|"
    r"років|роки|рік|місяц\w*|тиж\w*|днів|дні|день|годин\w*|хвилин\w*)\b",
    re.IGNORECASE,
)
_HAS_YEAR = re.compile(r"\b(19|20)\d{2}\b")
_WORDS = re.compile(r"[^\W\d_]+")


def is_false_positive(text: str, result: RecognizerResult, language: str) -> bool:
    span = text[result.start : result.end]

    if result.entity_type == "DATE_TIME":
        return bool(_DURATION.search(span)) and not _HAS_YEAR.search(span)

    if result.entity_type in NER_TYPES:
        # Form labels such as "Physical Address:" or "Адреса:".
        if text[result.end : result.end + 2].lstrip(" ").startswith(":"):
            return True
        # NER spans that cross a line break glue a value to the next label.
        if "\n" in span:
            return True
        # Drug, lab and department names read as proper nouns to the NER model.
        # Initials and unit fragments ("L" of mmol/L, "A1c") don't decide it.
        words = [w for w in _WORDS.findall(span) if len(w) > 2]
        if words and all(is_medical_term(w) for w in words):
            return True
        if result.entity_type == "PERSON" and language == "uk" and cannot_be_person(words):
            return True

    return False
