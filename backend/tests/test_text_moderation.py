import ast
from pathlib import Path
from unittest.mock import Mock

import pytest

from app.services import text_moderation
from app.services.ai_clients import AIFailed, ToxicityResult, set_clients


@pytest.fixture
def classifier(monkeypatch):
    fake = Mock()
    fake.classify.return_value = ToxicityResult(flagged=False, translated_text="Hello", score=0.01)
    monkeypatch.setattr(text_moderation, "get_toxicity_classifier", lambda: fake)
    return fake


def test_local_only_fields_never_use_ai(classifier):
    text_moderation.check_fields(name="Vendela", district="Majorna")
    classifier.classify.assert_not_called()


def test_local_baseline_runs_before_ai(classifier):
    with pytest.raises(text_moderation.WordFilterError) as error:
        text_moderation.check_fields(ai=True, description="FUCK")
    assert error.value.field == "description"
    classifier.classify.assert_not_called()


def test_explicit_ai_checks_share_deadline(classifier):
    text_moderation.check_fields(ai=True, title="Schack", description="Spela tillsammans")
    assert classifier.classify.call_count == 2
    assert classifier.classify.call_args_list[0].args[1] is classifier.classify.call_args_list[1].args[1]


def test_flagged_public_text_is_rejected(classifier):
    classifier.classify.return_value = ToxicityResult(flagged=True, translated_text="Toxic", score=0.9)
    with pytest.raises(text_moderation.ToxicContentError):
        text_moderation.check_fields(ai=True, description="Kontrolltext")


def test_ai_failure_falls_back_to_local_filter_and_logs_warning(classifier, caplog):
    classifier.classify.side_effect = AIFailed()
    assert text_moderation.check_fields(ai=True, description="Kontrolltext") is None
    assert "lokal ordkontroll används" in caplog.text


def test_ai_failure_does_not_bypass_local_word_filter(classifier, caplog):
    classifier.classify.side_effect = AIFailed()
    with pytest.raises(text_moderation.WordFilterError):
        text_moderation.check_fields(ai=True, description="FUCK")
    classifier.classify.assert_not_called()


def test_explicitly_empty_ai_bundle_skips_remote_call(classifier):
    text_moderation.check_fields(ai=True, ai_text="", place_name="Slottsskogen")
    classifier.classify.assert_not_called()


def test_chat_censorship_never_uses_ai(classifier):
    assert text_moderation.censor_message("Hej FUCK!") == "Hej ****!"
    classifier.classify.assert_not_called()


def test_toxicity_client_is_replaceable_through_shared_mock_boundary():
    fake = Mock()
    fake.classify.return_value = ToxicityResult(flagged=False, translated_text="Hello", score=0.01)
    set_clients(toxicity=fake)
    text_moderation.check_fields(ai=True, description="Hej")
    fake.classify.assert_called_once()


@pytest.mark.parametrize("layer", ["crud", "schemas"])
def test_content_checks_are_not_imported_in_storage_or_schemas(layer):
    root = Path(__file__).parents[1] / "app" / layer
    forbidden = {
        "app.services.moderation", "app.services.text_moderation",
        "app.services.ai_clients", "app.services.text_policy",
    }
    for path in root.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                if node.module == "app.core.profanity":
                    assert layer == "crud" and path.name in {
                        "message.py", "group_message.py", "group_post.py",
                    }, f"{path.name} imports the content filter"
                assert node.module not in forbidden, f"{path.name} imports {node.module}"
                if node.module == "app.services":
                    assert not ({alias.name for alias in node.names} & {
                        "moderation", "text_moderation", "ai_clients", "text_policy",
                    }), path.name