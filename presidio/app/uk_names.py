"""Ukrainian name check for PERSON entities.

The small Ukrainian spaCy model tags most capitalised words as PERSON
("Серцева недостатність", "Астма"). pymorphy3 (installed with the model)
marks first names, surnames and patronymics, so a span whose words are all
known dictionary words and none can be a name is not a person. Unknown words
are kept: rare surnames are exactly what the dictionary lacks.
"""

from functools import lru_cache

import pymorphy3

_NAME_TAGS = {"Name", "Surn", "Patr"}
_morph = pymorphy3.MorphAnalyzer(lang="uk")


@lru_cache(maxsize=20_000)
def _word(word: str) -> str:
    """'name', 'common' or 'unknown'."""
    lowered = word.lower()
    if any(_NAME_TAGS & set(p.tag.grammemes) for p in _morph.parse(lowered)):
        return "name"
    return "common" if _morph.word_is_known(lowered) else "unknown"


def cannot_be_person(words: list[str]) -> bool:
    kinds = []
    for word in words:
        kind = _word(word)
        # Short all-caps unknowns are abbreviations (ЛПНЩ, ШКФ), not surnames.
        if kind == "unknown" and word.isupper() and len(word) <= 5:
            continue
        kinds.append(kind)
    return bool(kinds) and all(k == "common" for k in kinds)
