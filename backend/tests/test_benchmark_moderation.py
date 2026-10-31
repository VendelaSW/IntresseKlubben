import importlib.util
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "benchmark_moderation.py"
specification = importlib.util.spec_from_file_location("benchmark_moderation", SCRIPT_PATH)
benchmark_moderation = importlib.util.module_from_spec(specification)
sys.modules[specification.name] = benchmark_moderation
specification.loader.exec_module(benchmark_moderation)


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


def test_benchmark_runs_directly_from_repository_root():
    completed = subprocess.run(
        [sys.executable, str(SCRIPT_PATH)], cwd=REPO_ROOT, capture_output=True, timeout=10,
    )
    assert completed.returncode == 0, completed.stderr.decode(errors="replace")
    assert b"SCRUM-266" in completed.stdout
    assert not (REPO_ROOT / "backend" / "app" / "scripts" / "benchmark_moderation.py").exists()
