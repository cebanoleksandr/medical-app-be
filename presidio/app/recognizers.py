"""Recognizer registry for English and Ukrainian.

Presidio's predefined recognizers are English-only, so Ukrainian gets its own
instances of the language-agnostic ones (email, phone, IP, URL, cards, IBAN,
numeric dates) plus Ukraine-specific patterns. Context words are lemmas: the
context enhancer compares them against spaCy lemmas around the match.
"""

from presidio_analyzer import Pattern, PatternRecognizer, RecognizerRegistry
from presidio_analyzer.nlp_engine import NlpEngine
from presidio_analyzer.predefined_recognizers import (
    CreditCardRecognizer,
    DateRecognizer,
    EmailRecognizer,
    IbanRecognizer,
    IpRecognizer,
    PhoneRecognizer,
    SpacyRecognizer,
    UrlRecognizer,
)

PHONE_REGIONS = ("US", "UK", "DE", "CA", "UA", "PL")

# Real identifiers carry several digits; this keeps "45-year-old" or "COVID-19" out.
ID_DIGITS = r"(?=(?:[A-Za-z-]*\d){4})"

UK_MONTHS = (
    "січня|лютого|березня|квітня|травня|червня|"
    "липня|серпня|вересня|жовтня|листопада|грудня"
)

CONTEXT = {
    "mrn": {
        "en": ["mrn", "medical", "record", "chart", "patient"],
        "uk": ["мнк", "медичний", "картка", "карта", "історія", "хвороба", "пацієнт"],
    },
    "health_plan": {
        "en": ["beneficiary", "member", "policy", "insurance", "plan", "subscriber"],
        "uk": ["поліс", "страховий", "страхування", "застрахований", "договір"],
    },
    "generic_id": {
        "en": ["id", "identifier", "number", "account", "certificate", "license", "serial", "device"],
        "uk": ["номер", "ідентифікатор", "рахунок", "посвідчення", "сертифікат", "ліцензія", "пристрій"],
    },
    "vehicle": {
        "en": ["vin", "vehicle", "car", "plate"],
        "uk": ["vin", "автомобіль", "транспортний", "номерний"],
    },
    "phone": {
        "en": ["phone", "tel", "telephone", "mobile", "cell", "fax", "call"],
        "uk": ["телефон", "тел", "моб", "мобільний", "факс", "дзвонити"],
    },
    "email": {"en": ["email", "mail"], "uk": ["пошта", "email", "мейл"]},
}


def _ctx(key: str, lang: str) -> list[str]:
    return CONTEXT[key][lang]


class ChAhvRecognizer(PatternRecognizer):
    """Swiss social security number (AHV/AVS): 756.XXXX.XXXX.XC, EAN-13 check digit."""

    def __init__(self, lang: str):
        super().__init__(
            supported_entity="CH_AHV",
            name=f"ChAhvRecognizer_{lang}",
            supported_language=lang,
            patterns=[Pattern("ahv", r"\b756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}\b", 0.5)],
            context=["ahv", "avs", "ssn", "social", "insurance", "sozialversicherung"],
        )

    def validate_result(self, pattern_text: str) -> bool:
        digits = [int(c) for c in pattern_text if c.isdigit()]
        weighted = sum(d * (3 if i % 2 else 1) for i, d in enumerate(digits[:12]))
        return (10 - weighted % 10) % 10 == digits[12]


def _shared_recognizers(lang: str) -> list[PatternRecognizer]:
    return [
        ChAhvRecognizer(lang),
        PatternRecognizer(
            supported_entity="MEDICAL_RECORD_NUMBER",
            name=f"MrnRecognizer_{lang}",
            supported_language=lang,
            patterns=[
                Pattern("mrn_prefixed", r"\bMRN[\s:#-]*[A-Z0-9]{5,12}\b", 0.85),
                Pattern("mrn_alnum", r"\b(?=[A-Z0-9-]*\d)[A-Z]{1,4}-?\d{5,10}\b", 0.3),
            ],
            context=_ctx("mrn", lang),
        ),
        PatternRecognizer(
            supported_entity="HEALTH_PLAN_ID",
            name=f"HealthPlanRecognizer_{lang}",
            supported_language=lang,
            patterns=[Pattern("plan_id", rf"\b{ID_DIGITS}[A-Z0-9][A-Z0-9-]{{6,19}}\b", 0.05)],
            context=_ctx("health_plan", lang),
        ),
        PatternRecognizer(
            supported_entity="GENERIC_ID",
            name=f"GenericIdRecognizer_{lang}",
            supported_language=lang,
            patterns=[Pattern("generic_id", rf"\b{ID_DIGITS}[A-Za-z0-9][A-Za-z0-9-]{{5,24}}\b", 0.05)],
            context=_ctx("generic_id", lang),
        ),
        PatternRecognizer(
            supported_entity="VEHICLE_ID",
            name=f"VinRecognizer_{lang}",
            supported_language=lang,
            patterns=[Pattern("vin", r"\b(?=[A-HJ-NPR-Z0-9]*\d)[A-HJ-NPR-Z0-9]{17}\b", 0.4)],
            context=_ctx("vehicle", lang),
        ),
    ]


def _ukrainian_recognizers() -> list:
    lang = "uk"
    return [
        SpacyRecognizer(
            supported_language=lang,
            supported_entities=["PERSON", "LOCATION", "ORGANIZATION"],
        ),
        EmailRecognizer(supported_language=lang, context=_ctx("email", lang)),
        PhoneRecognizer(
            supported_language=lang,
            supported_regions=PHONE_REGIONS,
            context=_ctx("phone", lang),
        ),
        IpRecognizer(supported_language=lang),
        UrlRecognizer(supported_language=lang),
        CreditCardRecognizer(supported_language=lang, context=["картка", "карта", "visa", "mastercard"]),
        IbanRecognizer(supported_language=lang, context=["iban", "рахунок", "банк"]),
        DateRecognizer(supported_language=lang, context=["дата", "народження", "дн", "візит"]),
        PatternRecognizer(
            supported_entity="DATE_TIME",
            name="UkTextDateRecognizer",
            supported_language=lang,
            patterns=[
                Pattern(
                    "uk_text_date",
                    rf"\b\d{{1,2}}\s+(?:{UK_MONTHS})(?:\s+\d{{4}}(?:\s*р(?:оку|\.)?)?)?",
                    0.7,
                )
            ],
        ),
        PatternRecognizer(
            supported_entity="UA_RNOKPP",
            name="UaRnokppRecognizer",
            supported_language=lang,
            patterns=[Pattern("rnokpp", r"\b\d{10}\b", 0.1)],
            context=["рнокпп", "іпн", "ідентифікаційний", "податковий", "код"],
        ),
        PatternRecognizer(
            supported_entity="UA_PASSPORT",
            name="UaPassportRecognizer",
            supported_language=lang,
            patterns=[
                Pattern("passport_book", r"\b[А-ЯІЇЄҐ]{2}\s?\d{6}\b", 0.5),
                Pattern("id_card", r"\b\d{9}\b", 0.1),
            ],
            context=["паспорт", "id-картка", "посвідчення", "документ"],
        ),
        *_shared_recognizers(lang),
    ]


def _english_recognizers() -> list:
    lang = "en"
    return [
        PhoneRecognizer(
            supported_language=lang,
            supported_regions=PHONE_REGIONS,
            context=_ctx("phone", lang),
        ),
        # phonenumbers rejects well-formed but unassigned numbers (e.g. 555-...).
        PatternRecognizer(
            supported_entity="PHONE_NUMBER",
            name="NanpPhonePatternRecognizer",
            supported_language=lang,
            patterns=[Pattern("nanp", r"(?<!\d)\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)", 0.4)],
            context=_ctx("phone", lang),
        ),
        PatternRecognizer(
            supported_entity="LOCATION",
            name="UsStreetAddressRecognizer",
            supported_language=lang,
            patterns=[
                Pattern(
                    "street_address",
                    r"\b\d{1,6}\s+(?:[A-Z][a-z]+\s+){1,4}"
                    r"(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|"
                    r"Lane|Ln|Way|Court|Ct|Place|Pl|Parkway|Pkwy|Highway|Hwy)\b\.?",
                    0.7,
                )
            ],
        ),
        *_shared_recognizers(lang),
    ]


def build_registry(nlp_engine: NlpEngine) -> RecognizerRegistry:
    registry = RecognizerRegistry(supported_languages=["en", "uk"])
    registry.load_predefined_recognizers(languages=["en"], nlp_engine=nlp_engine)

    # Replaced by an instance whose regions include Ukraine.
    registry.remove_recognizer("PhoneRecognizer")
    for recognizer in _english_recognizers() + _ukrainian_recognizers():
        registry.add_recognizer(recognizer)

    return registry
