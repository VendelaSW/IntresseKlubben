from app.scripts import benchmark_moderation
from app.services.ai_clients import ToxicityResult


class FakeClassifier:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []

    def classify(self, text, deadline):
        self.calls.append(text)
        if self.fail:
            raise RuntimeError("Space unavailable")
        expected = next(example.prohibited for example in benchmark_moderation.EXAMPLES if example.text == text)
        return ToxicityResult(
            flagged=expected,
            translated_text=text,
            score=0.9 if expected else 0.01,
        )


def test_benchmark_prints_all_examples_and_confusion_summaries(monkeypatch, capsys):
    classifier = FakeClassifier()
    monkeypatch.setattr(benchmark_moderation, "get_toxicity_classifier", lambda: classifier)

    assert benchmark_moderation.run() == 0

    output = capsys.readouterr().out
    assert len(classifier.calls) == 24
    assert "Tydligt otillåtna" in output
    assert "Maskerade/leetspeak" in output
    assert "Normala klubb-/eventtexter" in output
    assert "Falsklarm-fällor" in output
    assert "HF-moderering (24/24 bedömda)" in output
    assert output.count("| OTILLÅTEN |") == 12
    assert "Träffsäkerhet 100.0%" in output


def test_benchmark_marks_ai_unavailable_as_incomplete(monkeypatch, capsys):
    classifier = FakeClassifier(fail=True)
    monkeypatch.setattr(benchmark_moderation, "get_toxicity_classifier", lambda: classifier)

    assert benchmark_moderation.run() == 1

    output = capsys.readouterr().out
    assert len(classifier.calls) == 24
    assert "HF-moderering (0/24 bedömda)" in output
    assert "AI-fel: 24/24" in output
    assert "Mätningen är ofullständig" in output
