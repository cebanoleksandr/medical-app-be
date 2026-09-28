import os

os.environ["PRESIDIO_API_KEY"] = "test-key"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)
HEADERS = {"x-api-key": "test-key"}


def analyze(text: str, language: str, **extra) -> dict[str, str]:
    res = client.post(
        "/analyze",
        headers=HEADERS,
        json={"text": text, "language": language, "score_threshold": 0.3, **extra},
    )
    assert res.status_code == 200, res.text
    # Highest-scoring type per span (results come sorted by start, then score desc).
    found: dict[str, str] = {}
    for e in res.json()["entities"]:
        found.setdefault(text[e["start"] : e["end"]], e["type"])
    return found


def test_requires_api_key():
    res = client.post("/analyze", json={"text": "hello", "language": "en"})
    assert res.status_code == 401


def test_english_identifiers():
    found = analyze(
        "Patient: Sarah Johnson\n"
        "Medical Record Number: MRN78945612\n"
        "Physical Address: 123 Medical Center Drive\n"
        "SSN 429-18-7734, call 555-123-4567 or sarah.johnson@email.com\n"
        "IP 192.168.1.45",
        "en",
    )
    assert found["Sarah Johnson"] == "PERSON"
    assert found["MRN78945612"] == "MEDICAL_RECORD_NUMBER"
    assert found["123 Medical Center Drive"] == "LOCATION"
    assert "429-18-7734" in found
    assert "555-123-4567" in found
    assert found["sarah.johnson@email.com"] == "EMAIL_ADDRESS"
    assert found["192.168.1.45"] == "IP_ADDRESS"
    assert "Physical Address" not in found


def test_ukrainian_identifiers():
    found = analyze(
        "Пацієнтка: Олена Петренко\n"
        "Дата візиту: 15 березня 2026 р.\n"
        "Телефон: +380 67 123 4567\n"
        "Адреса: м. Київ\n"
        "РНОКПП 3012456789\n"
        "Паспорт МЕ 123456",
        "uk",
    )
    assert found["Олена Петренко"] == "PERSON"
    assert found["15 березня 2026 р."] == "DATE_TIME"
    assert found["+380 67 123 4567"] == "PHONE_NUMBER"
    assert found["Київ"] == "LOCATION"
    assert found["МЕ 123456"] == "UA_PASSPORT"
    assert "3012456789" in found
    assert "Адреса" not in found


def test_durations_and_ages_are_not_dates():
    found = analyze(
        # "Number" on the previous line is ID context; the age must still not match.
        "Medical Record Number: MRN78945612\n"
        "A 45-year-old patient reports headaches started approximately 2 weeks ago. "
        "Seen on March 15, 2026.",
        "en",
    )
    assert "March 15, 2026" in found
    assert not any("ago" in span or "year-old" in span for span in found)


def test_medical_terms_are_not_names_or_places():
    en = analyze(
        "Seen by Dr. Michael Chen in Pulmonology.\n"
        "Continue Bisoprolol 2.5 mg once daily, Sertraline 50 mg.\n"
        "Glucose 7.6 mmol/L. Hemoglobin A1c 8.1 %.\n\n"
        "Discharge Summary\n\nProgress Note",
        "en",
    )
    assert en["Michael Chen"] == "PERSON"
    assert not any(
        term in span
        for span in en
        for term in ("Bisoprolol", "Sertraline", "Glucose", "Hemoglobin", "Pulmonology", "Summary", "Progress")
    )

    uk = analyze(
        "Пацієнтку Олену Петренко оглянув кардіолог.\n"
        "Рекомендовано: Метформін 1000 мг, контроль рівня гемоглобіну та Сальбутамолу.",
        "uk",
    )
    assert any("Петренко" in span for span in uk)
    assert not any(term in span for span in uk for term in ("Метформін", "Сальбутамол", "гемоглобін"))


def test_ukrainian_common_words_are_not_names():
    found = analyze(
        "Діагноз: Серцева недостатність, неуточнена.\n"
        "Астма, неуточнена.\n"
        "Консультант: Мірошниченко Олена Іванівна.\n"
        "Холестерин ЛПНЩ 4.1 ммоль/л.\n"
        "Пацієнта Петренка оглянув Бондар.",
        "uk",
    )
    spans = " | ".join(found)
    for common in ("Серцева", "Астма", "Холестерин"):
        assert common not in spans
    for name in ("Мірошниченко", "Петренка", "Бондар"):
        assert name in spans


def test_swiss_ahv_requires_valid_check_digit():
    found = analyze("AHV-Nr. 756.1234.5678.97, old card 756.1234.5678.90", "en")
    assert found["756.1234.5678.97"] == "CH_AHV"
    assert found.get("756.1234.5678.90") != "CH_AHV"


def test_entities_unsupported_for_language_are_skipped():
    res = client.post(
        "/analyze",
        headers=HEADERS,
        json={"text": "SSN 429-18-7734", "language": "uk", "entities": ["US_SSN"]},
    )
    assert res.status_code == 200
    assert res.json() == {"entities": []}
