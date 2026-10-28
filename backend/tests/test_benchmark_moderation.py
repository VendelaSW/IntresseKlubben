from app.scripts import benchmark_moderation


def test_local_benchmark_prints_confusion_summary(capsys):
    results = benchmark_moderation.run()

    output = capsys.readouterr().out
    assert len(results) == 24
    assert "Tydligt otillåtna" in output
    assert "Maskerade/leetspeak" in output
    assert "Normala klubb-/eventtexter" in output
    assert "Falsklarm-fällor" in output
    assert "Träffsäkerhet         75.0%" in output
    assert "Missade otillåtna     6" in output
    assert "Falsklarm             0" in output


def test_benchmark_only_uses_the_local_word_filter(monkeypatch, capsys):
    calls = []

    def local_filter(text):
        calls.append(text)
        return False

    monkeypatch.setattr(benchmark_moderation, "contains_profanity", local_filter)
    results = benchmark_moderation.run()
    capsys.readouterr()
    assert len(results) == 24
    assert len(calls) == 24
