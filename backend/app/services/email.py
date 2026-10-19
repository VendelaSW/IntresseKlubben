"""
Mejl från appen, t.ex. länken för att bekräfta e-postadressen.

Resten av backenden pratar bara med gränssnittet EmailSender (get_email_sender), aldrig med Resend direkt, så att
testerna kan byta ut den mot en fejkad version (set_email_sender). Anropen görs med urllib, så att backend inte får ett
nytt beroende.

Är RESEND_API_KEY inte satt skickas inget: mejlet skrivs i loggen i stället (LogSender), så att man kan klicka på
länken när man kör lokalt. Utan egen domän i Resend går mejl från onboarding@resend.dev bara till Resend-kontots egen
adress.
"""

import http.client
import json
import logging
import urllib.request
from typing import Protocol

from app.core.config import settings

RESEND_URL = "https://api.resend.com/emails"
USER_AGENT = "IntresseKlubben/1.0"
TIMEOUT_SECONDS = 8

logger = logging.getLogger(__name__)


class EmailFailed(Exception):
    """Mejlet gick inte att skicka."""


class EmailSender(Protocol):
    def send(self, to: str, subject: str, text: str, html: str) -> None: ...


class ResendSender:
    def __init__(self, api_key: str, sender: str):
        self._api_key = api_key
        self._sender = sender

    def send(self, to: str, subject: str, text: str, html: str) -> None:
        body = json.dumps({"from": self._sender, "to": [to], "subject": subject, "text": text, "html": html})
        request = urllib.request.Request(
            RESEND_URL,
            data=body.encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS):
                return
        # OSError täcker felsvar från Resend (HTTPError), tidsgränsen och brutna anslutningar.
        except (OSError, http.client.HTTPException) as err:
            raise EmailFailed(type(err).__name__) from None


class LogSender:
    """Skickar inget, skriver mejlet i loggen (när RESEND_API_KEY saknas, t.ex. lokalt)."""

    def send(self, to: str, subject: str, text: str, html: str) -> None:
        logger.warning("Mejl skickades inte (RESEND_API_KEY saknas). Till: %s. Ämne: %s.\n%s", to, subject, text)


# En fejkad version som testerna sätter in (set_email_sender). Är den satt används den i stället.
_override: EmailSender | None = None


def set_email_sender(sender: EmailSender | None = None) -> None:
    """Byter ut mejlutskicket (bara för tester). Utan argument återställs det."""
    global _override
    _override = sender


def get_email_sender() -> EmailSender:
    if _override is not None:
        return _override
    if settings.resend_api_key:
        return ResendSender(settings.resend_api_key, settings.email_from)
    return LogSender()
