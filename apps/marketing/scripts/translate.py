"""
Vigmis Marketing Site — Translation Script
===========================================
Reads messages/en.json as source and translates to: es, fr, pt, de, he.

Usage:
    python scripts/translate.py

Rules:
  - If messages/{lang}.json exists: only translate keys that are missing or
    marked as "[NEEDS_TRANSLATION]".
  - If messages/{lang}.json does not exist: translate all keys.
  - Human-edited keys are never overwritten.

Dependencies:
    pip install deep-translator
"""

import json
import time
from pathlib import Path
from deep_translator import GoogleTranslator

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MESSAGES_DIR = Path(__file__).parent.parent / "messages"
SOURCE_FILE = MESSAGES_DIR / "en.json"
NEEDS_TRANSLATION_MARKER = "[NEEDS_TRANSLATION]"
TRANSLATION_NOTE_KEY = "_translation_note"
TRANSLATION_NOTE_VALUE = "Auto-translated. Human review needed."

TARGET_LANGUAGES = {
    "es": "spanish",
    "fr": "french",
    "pt": "portuguese",
    "de": "german",
    "he": "hebrew",
}

# Delay between API calls (seconds) — keeps us under Google's rate limit.
REQUEST_DELAY = 0.3


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Saved → {path}")


def translate_text(text: str, lang_code: str) -> str:
    """Translate a single string from English to the target language."""
    if not text or not text.strip():
        return text
    try:
        result = GoogleTranslator(source="en", target=lang_code).translate(text)
        time.sleep(REQUEST_DELAY)
        return result if result else text
    except Exception as exc:
        print(f"    [WARN] Translation failed for lang={lang_code!r}: {exc}")
        return NEEDS_TRANSLATION_MARKER


def needs_translation(value: str) -> bool:
    """Return True if the value is missing or is the marker string."""
    if not isinstance(value, str):
        return False
    return value == NEEDS_TRANSLATION_MARKER


# ---------------------------------------------------------------------------
# Core recursive logic
# ---------------------------------------------------------------------------

def translate_dict(
    source: dict,
    existing: dict,
    lang_code: str,
    path: str = "",
) -> tuple[dict, int]:
    """
    Recursively produce a translated dict.

    - Keeps existing translated values untouched.
    - Translates values that are missing from existing or marked
      as [NEEDS_TRANSLATION].

    Returns (translated_dict, count_translated).
    """
    result = {}
    count = 0

    for key, src_value in source.items():
        full_path = f"{path}.{key}" if path else key
        existing_value = existing.get(key)

        if isinstance(src_value, dict):
            # Recurse into nested objects
            child_existing = existing_value if isinstance(existing_value, dict) else {}
            child_result, child_count = translate_dict(
                src_value, child_existing, lang_code, full_path
            )
            result[key] = child_result
            count += child_count
        elif isinstance(src_value, str):
            if existing_value is None or needs_translation(existing_value):
                # Translate this key
                print(f"    Translating [{full_path}] ...")
                result[key] = translate_text(src_value, lang_code)
                count += 1
            else:
                # Keep the existing human/auto translation
                result[key] = existing_value
        else:
            # Non-string primitives (numbers, booleans, null) — copy as-is
            result[key] = src_value

    return result, count


# ---------------------------------------------------------------------------
# Per-language entry point
# ---------------------------------------------------------------------------

def process_language(lang_code: str, lang_name: str, source: dict) -> None:
    target_file = MESSAGES_DIR / f"{lang_code}.json"
    existing: dict = {}

    if target_file.exists():
        existing = load_json(target_file)
        print(f"\n[{lang_code.upper()}] {lang_name} — file exists, checking for missing/marked keys ...")
    else:
        print(f"\n[{lang_code.upper()}] {lang_name} — no file found, translating all keys ...")

    # Remove the note key from existing before diffing (we'll re-add it at the top)
    existing.pop(TRANSLATION_NOTE_KEY, None)

    translated, count = translate_dict(source, existing, lang_code)

    # Prepend the note key at the very top of the output
    output = {TRANSLATION_NOTE_KEY: TRANSLATION_NOTE_VALUE, **translated}

    if count == 0:
        print(f"  Nothing to translate — all keys are up to date.")
    else:
        print(f"  Translated {count} key(s).")

    save_json(target_file, output)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not SOURCE_FILE.exists():
        raise FileNotFoundError(f"Source file not found: {SOURCE_FILE}")

    source = load_json(SOURCE_FILE)
    print(f"Loaded source: {SOURCE_FILE}")
    print(f"Target languages: {', '.join(TARGET_LANGUAGES)}")

    for lang_code, lang_name in TARGET_LANGUAGES.items():
        process_language(lang_code, lang_name, source)

    print("\nDone! Remember: have a native speaker review each file before going live.")


if __name__ == "__main__":
    main()
