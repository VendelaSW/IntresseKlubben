"""Mallen för appens mejl: en hälsning, en förklaring, en knapp med länken och en rad om vad man gör om mejlet inte
var väntat. Samma innehåll som text och som enkel HTML, så att mejlet går att läsa i alla e-postprogram."""

import html


def build_message(name: str, intro: str, button: str, link: str, outro: str) -> tuple[str, str]:
    """(text, html) för ett mejl till `name`. `intro` och `outro` är vanlig text och escapas i HTML-versionen."""
    text = f"Hej {name}!\n\n{intro}\n\n{link}\n\n{outro}\n\nHälsningar,\nIntresseklubben"
    href = html.escape(link)
    body = (
        f"<p>Hej {html.escape(name)}!</p>"
        f"<p>{html.escape(intro)}</p>"
        f'<p><a href="{href}" style="display:inline-block;padding:10px 18px;background:#f4c430;color:#1a1a1a;'
        f'border-radius:999px;text-decoration:none;font-weight:600">{html.escape(button)}</a></p>'
        f'<p>Fungerar inte knappen? Kopiera länken: <br><a href="{href}">{href}</a></p>'
        f"<p>{html.escape(outro)}</p>"
        "<p>Hälsningar,<br>Intresseklubben</p>"
    )
    return text, body
