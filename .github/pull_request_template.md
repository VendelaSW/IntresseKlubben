## Vad gör den här PR:en?

<!-- Kort beskrivning och vilken ticket det gäller. -->

## Testat i testläget (`npm run dev:test`)

- [ ] På en riktig telefon (`npm run dev:telefon`) och på dator
- [ ] Långa texter (kontot Maximiliana) och tomma listor (kontot Nils)
- [ ] Testdata, scenarier eller fejkade AI-svar som featuren behöver finns i `backend/app/devtools/` (se CONTRIBUTING, "Testa i testläget")

## Checklista

- [ ] Nya eller ändrade endpoints, CRUD-funktioner och valideringar har tester i `backend/tests/`
- [ ] `pytest` går igenom lokalt (kör från `backend/`)
- [ ] Nya routrar är inkopplade i `backend/app/main.py`
- [ ] Nya migrationer bygger på den senaste befintliga (`down_revision`), och `alembic upgrade head` behöver köras på Neon när den har kommit in i `dev`
- [ ] Nya miljövariabler finns i `.env.example` och är inlagda i Vercel (Preview och/eller Production)
- [ ] Inga hemligheter, `console.log` eller `print()`-debug följer med
