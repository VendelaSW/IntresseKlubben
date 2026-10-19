"""Klienterna mot OpenAI (app/services/ai_clients.py). Inga riktiga anrop: urllib.request.urlopen ersätts av
en falsk, så att vi ser exakt vad som skulle skickas."""

import json
import urllib.error
from pathlib import Path

import pytest

from app.core.config import Settings, settings
from app.services import ai_clients
from app.services.ai_clients import (
    MODERATION_BATCH,
    PER_CALL_TIMEOUT_SECONDS,
    WORK_BUDGET_SECONDS,
    AIFailed,
    AINotConfigured,
    Deadline,
    OpenAILLM,
    OpenAIModerator,
    ai_configured,
    get_llm,
    get_moderator,
    set_clients,
)
from tests.fakes import FakeLLM, FakeModerator

SCHEMA = {"type": "object", "properties": {"x": {"type": "string"}}, "required": ["x"], "additionalProperties": False}


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "test-nyckel")
    monkeypatch.setattr(settings, "openai_model", "test-modell")
    monkeypatch.setattr(settings, "openai_temperature", None)  # en riktig .env ska inte påverka testerna


@pytest.fixture
def not_configured(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "openai_model", "")


class FakeResponse:
    def __init__(self, body):
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self, *args):
        return self._body


def urlopen_returns(monkeypatch, *bodies):
    """urlopen svarar med `bodies` i tur och ordning och sparar vad som skickades."""
    seen = []
    queue = list(bodies)

    def fake(request, timeout):
        seen.append({"url": request.full_url, "auth": request.get_header("Authorization"), "body": json.loads(request.data), "timeout": timeout})
        return FakeResponse(json.dumps(queue.pop(0)).encode())

    monkeypatch.setattr(ai_clients.urllib.request, "urlopen", fake)
    return seen


def reply(content):
    return {"choices": [{"message": {"content": content}}]}


# ---------- Språkmodellen ----------


def test_the_llm_call_goes_to_openai_with_the_key_as_a_bearer_token(configured, monkeypatch):
    seen = urlopen_returns(monkeypatch, reply(json.dumps({"x": "hej"})))
    answer = OpenAILLM().complete_json(system="regler", user="text", name="svar", schema=SCHEMA)
    assert answer == {"x": "hej"}
    (call,) = seen
    assert call["url"] == "https://api.openai.com/v1/chat/completions"
    assert call["auth"] == "Bearer test-nyckel"
    assert call["body"] == {
        "model": "test-modell",
        "messages": [{"role": "system", "content": "regler"}, {"role": "user", "content": "text"}],
        "response_format": {"type": "json_schema", "json_schema": {"name": "svar", "strict": True, "schema": SCHEMA}},
    }


def test_without_a_temperature_the_parameter_is_left_out_so_every_model_works(configured, monkeypatch):
    seen = urlopen_returns(monkeypatch, reply(json.dumps({"x": "hej"})))
    OpenAILLM().complete_json(system="s", user="u", name="n", schema=SCHEMA)
    assert "temperature" not in seen[0]["body"]


@pytest.mark.parametrize("temperature", [0, 0.2])
def test_a_set_temperature_goes_with_the_llm_call(configured, monkeypatch, temperature):
    monkeypatch.setattr(settings, "openai_temperature", temperature)
    seen = urlopen_returns(monkeypatch, reply(json.dumps({"x": "hej"})))
    OpenAILLM().complete_json(system="s", user="u", name="n", schema=SCHEMA)
    assert seen[0]["body"]["temperature"] == temperature


def test_the_temperature_is_never_sent_to_the_moderation(configured, monkeypatch):
    monkeypatch.setattr(settings, "openai_temperature", 0)
    seen = urlopen_returns(monkeypatch, {"results": [{"flagged": False}]})
    OpenAIModerator().flagged(["a"])
    assert "temperature" not in seen[0]["body"]


def test_an_empty_temperature_setting_means_the_models_default_and_does_not_crash(monkeypatch):
    monkeypatch.setenv("OPENAI_TEMPERATURE", "")
    assert Settings(_env_file=None).openai_temperature is None


@pytest.mark.parametrize(("value", "expected"), [("0", 0.0), ("0.3", 0.3), ("2", 2.0)])
def test_the_temperature_setting_reads_numbers(monkeypatch, value, expected):
    monkeypatch.setenv("OPENAI_TEMPERATURE", value)
    assert Settings(_env_file=None).openai_temperature == expected


@pytest.mark.parametrize("value", ["-1", "3", "varm"])
def test_a_temperature_that_is_out_of_range_or_not_a_number_stops_the_start(monkeypatch, value):
    monkeypatch.setenv("OPENAI_TEMPERATURE", value)
    with pytest.raises(ValueError):
        Settings(_env_file=None)


@pytest.mark.parametrize(
    "response",
    [reply("inte JSON"), reply(None), {"nope": 1}, {"choices": []}, {"choices": [{"message": {}}]}, {"choices": "x"}],
)
def test_an_answer_that_is_not_json_is_a_failure(configured, monkeypatch, response):
    urlopen_returns(monkeypatch, response)
    with pytest.raises(AIFailed):
        OpenAILLM().complete_json(system="s", user="u", name="n", schema=SCHEMA)


# ---------- Moderering ----------


def test_moderation_sends_the_texts_to_the_moderation_endpoint(configured, monkeypatch):
    seen = urlopen_returns(monkeypatch, {"results": [{"flagged": False}, {"flagged": True}]})
    assert OpenAIModerator().flagged(["a", "b"]) == [False, True]
    (call,) = seen
    assert call["url"] == "https://api.openai.com/v1/moderations"
    assert call["auth"] == "Bearer test-nyckel"
    assert call["body"] == {"model": "omni-moderation-latest", "input": ["a", "b"]}


def test_a_large_list_is_moderated_in_several_calls(configured, monkeypatch):
    texts = [f"text{i}" for i in range(MODERATION_BATCH * 2 + 5)]
    bodies = [
        {"results": [{"flagged": False}] * MODERATION_BATCH},
        {"results": [{"flagged": True}] * MODERATION_BATCH},
        {"results": [{"flagged": False}] * 5},
    ]
    seen = urlopen_returns(monkeypatch, *bodies)
    flags = OpenAIModerator().flagged(texts)
    assert [len(call["body"]["input"]) for call in seen] == [MODERATION_BATCH, MODERATION_BATCH, 5]
    assert len(flags) == len(texts)
    assert flags[:MODERATION_BATCH] == [False] * MODERATION_BATCH and flags[MODERATION_BATCH] is True


def test_moderating_nothing_makes_no_call(configured, monkeypatch):
    seen = urlopen_returns(monkeypatch)
    assert OpenAIModerator().flagged([]) == []
    assert seen == []


@pytest.mark.parametrize(
    "response",
    [{"results": []}, {"nope": 1}, {"results": [{"x": 1}, {"x": 2}]}, {"results": [{"flagged": False}] * 2}, {"results": None}],
)
def test_a_moderation_answer_that_does_not_fit_is_a_failure(configured, monkeypatch, response):
    urlopen_returns(monkeypatch, response)
    with pytest.raises(AIFailed):
        OpenAIModerator().flagged(["a"])


# ---------- Nyckeln hamnar aldrig i fel ----------


@pytest.mark.parametrize(
    "error",
    [TimeoutError("sekret test-nyckel"), ValueError("sekret test-nyckel"), urllib.error.URLError("sekret test-nyckel")],
)
@pytest.mark.parametrize("call", ["llm", "moderation"])
def test_network_errors_never_leak_the_key(configured, monkeypatch, error, call):
    def fail(request, timeout):
        raise error

    monkeypatch.setattr(ai_clients.urllib.request, "urlopen", fail)
    with pytest.raises(AIFailed) as caught:
        if call == "llm":
            OpenAILLM().complete_json(system="s", user="u", name="n", schema=SCHEMA)
        else:
            OpenAIModerator().flagged(["a"])
    assert "test-nyckel" not in str(caught.value) and "sekret" not in str(caught.value)


# ---------- Tidsgränser ----------


def test_the_limits_fit_inside_the_functions_max_duration():
    vercel = json.loads((Path(__file__).resolve().parent.parent / "vercel.json").read_text())
    max_duration = vercel["functions"]["app/main.py"]["maxDuration"]
    assert PER_CALL_TIMEOUT_SECONDS <= WORK_BUDGET_SECONDS < max_duration


def test_a_single_call_never_waits_longer_than_the_per_call_limit(configured, monkeypatch):
    seen = urlopen_returns(monkeypatch, reply(json.dumps({"x": "a"})))
    OpenAILLM().complete_json(system="s", user="u", name="n", schema=SCHEMA)
    assert seen[0]["timeout"] == PER_CALL_TIMEOUT_SECONDS


def test_calls_share_a_deadline_and_the_last_one_waits_only_what_is_left(configured, monkeypatch):
    seen = urlopen_returns(monkeypatch, reply(json.dumps({"x": "a"})))
    deadline = Deadline(3)
    OpenAILLM().complete_json(system="s", user="u", name="n", schema=SCHEMA, deadline=deadline)
    assert 0 < seen[0]["timeout"] <= 3


def test_nothing_is_called_when_the_deadline_has_run_out(configured, monkeypatch):
    seen = urlopen_returns(monkeypatch)
    with pytest.raises(AIFailed):
        OpenAILLM().complete_json(system="s", user="u", name="n", schema=SCHEMA, deadline=Deadline(0))
    with pytest.raises(AIFailed):
        OpenAIModerator().flagged(["a"], Deadline(0))
    assert seen == []


def test_a_deadline_counts_down():
    deadline = Deadline(100)
    assert 99 < deadline.remaining() <= 100
    assert Deadline(0).remaining() == 0


# ---------- Vilken klient man får ----------


def test_without_key_or_model_the_llm_is_not_configured(not_configured, monkeypatch):
    assert ai_configured() is False
    with pytest.raises(AINotConfigured):
        get_llm()
    with pytest.raises(AINotConfigured):
        get_moderator()
    monkeypatch.setattr(settings, "openai_api_key", "test-nyckel")  # modellen saknas
    assert ai_configured() is False
    with pytest.raises(AINotConfigured):
        get_llm()
    assert isinstance(get_moderator(), OpenAIModerator)  # modereringen behöver bara nyckeln


def test_with_key_and_model_the_real_clients_are_returned(configured):
    assert ai_configured() is True
    assert isinstance(get_llm(), OpenAILLM)
    assert isinstance(get_moderator(), OpenAIModerator)


def test_a_fake_client_replaces_the_real_one_and_can_be_removed(not_configured):
    llm, moderator = FakeLLM(), FakeModerator()
    set_clients(llm=llm, moderator=moderator)
    assert ai_configured() is True
    assert get_llm() is llm and get_moderator() is moderator
    set_clients()
    assert ai_configured() is False


def test_the_fakes_never_reach_openai(not_configured, monkeypatch):
    def forbidden(request, timeout):
        raise AssertionError("Ett test anropade OpenAI")

    monkeypatch.setattr(ai_clients.urllib.request, "urlopen", forbidden)
    set_clients(llm=FakeLLM({"n": {"x": "a"}}), moderator=FakeModerator())
    assert get_llm().complete_json(system="s", user="u", name="n", schema=SCHEMA) == {"x": "a"}
    assert get_moderator().flagged(["a"]) == [False]
