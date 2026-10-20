import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest


def _scores(toxic=0.01):
    return [
        {"label": label, "score": toxic}
        for label in ("toxicity", "severe_toxicity", "obscene", "identity_attack", "insult", "threat", "sexual_explicit")
    ] + [{"label": label, "score": 0.99} for label in ("male", "female", "muslim", "black")]


@pytest.fixture
def worker(monkeypatch):
    tokenizer = Mock()
    tokenizer.encode.side_effect = lambda text, **kwargs: text.split()
    tokenizer.decode.side_effect = lambda tokens, **kwargs: " ".join(tokens)
    translator = Mock(return_value=[{"translation_text": "Hello"}])
    translator.tokenizer = tokenizer
    classifier = Mock(return_value=_scores())
    transformers = SimpleNamespace(
        pipeline=Mock(return_value=translator),
        AutoTokenizer=SimpleNamespace(from_pretrained=Mock(return_value=tokenizer)),
    )
    onnx = SimpleNamespace(ORTModelForSequenceClassification=Mock())
    pipelines = SimpleNamespace(pipeline=Mock(return_value=classifier))
    monkeypatch.setitem(sys.modules, "transformers", transformers)
    monkeypatch.setitem(sys.modules, "optimum", SimpleNamespace())
    monkeypatch.setitem(sys.modules, "optimum.onnxruntime", onnx)
    monkeypatch.setitem(sys.modules, "optimum.pipelines", pipelines)
    monkeypatch.setitem(sys.modules, "gradio", SimpleNamespace(Interface=Mock(), Textbox=Mock(), JSON=Mock()))
    path = Path(__file__).parents[1] / "app" / "ai_worker" / "app.py"
    specification = importlib.util.spec_from_file_location("moderation_space_worker", path)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module, transformers, pipelines


def test_worker_translates_before_classification_and_ignores_identity_labels(worker):
    module, transformers, pipelines = worker
    assert module.moderate("Hej") == {"flagged": False, "translated_text": "Hello", "score": 0.01}
    module.translator.assert_called_once_with("Hej", truncation=False, max_new_tokens=512)
    module.classifier.assert_called_once_with("Hello", truncation=False)
    module.moderate("Hej igen")
    transformers.pipeline.assert_called_once()
    transformers.AutoTokenizer.from_pretrained.assert_called_once()
    pipelines.pipeline.assert_called_once()
    assert pipelines.pipeline.call_args.kwargs["function_to_apply"] == "sigmoid"


def test_worker_flags_real_toxicity(worker):
    module, _, _ = worker
    module.classifier.return_value = _scores(0.5)
    assert module.moderate("Text")["flagged"] is True


def test_worker_checks_the_end_of_long_text(worker):
    module, _, _ = worker
    module.translator.side_effect = lambda text, **kwargs: [{"translation_text": text}]
    module.classifier.side_effect = lambda text, **kwargs: _scores(0.9 if "toxic" in text else 0.01)
    result = module.moderate("hej " * 384 + "toxic")
    assert result["flagged"] is True
    assert result["translated_text"].endswith("toxic")
    assert module.translator.call_count == 2
    assert module.classifier.call_count == 2


@pytest.mark.parametrize("scores", [[], [{"label": "male", "score": 0.99}], _scores(float("nan"))])
def test_worker_rejects_missing_or_invalid_toxicity_scores(worker, scores):
    module, _, _ = worker
    module.classifier.return_value = scores
    with pytest.raises(ValueError):
        module.moderate("Hej")


@pytest.mark.parametrize("text", ["", " ", None, "x" * 20001])
def test_worker_rejects_invalid_input(worker, text):
    module, _, _ = worker
    with pytest.raises(ValueError):
        module.moderate(text)
    module.translator.assert_not_called()