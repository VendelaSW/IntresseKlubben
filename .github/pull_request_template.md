## Vad gör den här PR:en?

<!-- Kort beskrivning och vilken ticket det gäller. -->

## Checklista

- [ ] Nya eller ändrade endpoints, CRUD-funktioner och valideringar har tester i `backend/tests/`
- [ ] `pytest` går igenom lokalt (kör från `backend/`)
- [ ] Nya routrar är inkopplade i `backend/app/main.py`
- [ ] Nya migrationer bygger på den senaste befintliga (`down_revision`), och `alembic upgrade head` behöver köras på Neon efter merge
- [ ] Nya miljövariabler finns i `.env.example` och är inlagda i Vercel (Preview och/eller Production)
- [ ] Inga hemligheter, `console.log` eller `print()`-debug följer med
