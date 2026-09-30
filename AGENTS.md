# AI Rules & Development Guidelines (Iteration 1)

> **IMPORTANT FOR AI/AGENT:** Read and strictly follow all rules in this document before running commands, modifying files, or altering code in this project.

---

## 1. Scope & Confirmation (HARD RULE)

Before executing any code modifications, you **MUST** pause and ask for human confirmation if your proposed solution involves any of the following:

1. **Large Changes:** Modifications affecting **more than 3 files**.
2. **Out-of-Scope Changes:** Unrequested refactoring, style tweaks, or edits to unrelated modules.
3. **New Dependencies:** Adding packages to `backend/requirements.txt` or `frontend/package.json`.
4. **Database Schema Modifications:** Any changes affecting database models or Alembic migrations.

**Process for Major Changes:**
* Present a brief bullet-point summary (which files you intend to change and why).
* Ask: *"Would you like me to proceed with these changes?"*
* **Wait for explicit user approval** before editing files.

---

## 2. Repository Structure & Context

This project is a monorepo deployed as two separate Vercel projects:

* `backend/` – **FastAPI** application (Entrypoint: `app/main.py`). Uses **SQLAlchemy / Alembic** for PostgreSQL (Neon) with PostGIS/vector capabilities.
* `frontend/` – **React + Vite** single-page application (SPA).

**Strict Rules for File Placement:**
* Backend code belongs **exclusively** inside `backend/app/` (routes in `api/routes/`, DB models in `models/`, schemas in `schemas/`).
* Frontend code belongs **exclusively** inside `frontend/src/` (components in `components/`, pages in `pages/`, API calls in `services/api.js`).
* Do **not** create top-level files outside `backend/` or `frontend/` unless explicitly instructed.

---

## 3. Database & Secret Safety Rules

* **DO NOT MODIFY `.env` OR SECRETS:** Never overwrite or expose `.env`, `.env.example`, or connection strings.
* **NO AUTOMATIC MIGRATIONS:** Do **not** generate or run Alembic migration commands (`alembic revision`, `alembic upgrade`) automatically without user consent.
* Database connections must preserve `pool_pre_ping=True` in `session.py` to remain serverless-compatible.

---

## 4. Git & Branching Protocol

* **DO NOT TOUCH MAIN:** You are **NEVER** allowed to commit or push directly to `main` or `master`.
* Work must take place on a dedicated feature branch or via a Pull Request (PR).
* Do not run `git push` automatically unless specifically requested.

---

## 5. Verification & Definition of Done (DoN)

Before declaring a task "Done", you must verify:

- [ ] **No Execution Errors:** Python files pass linting/syntax checks (`pytest` or local run passes if applicable).
- [ ] **No Build Errors:** Frontend builds pass without broken imports or Vite errors.
- [ ] **Clean Code:** No leftover `console.log`, `print()` debugging statements, or temporary scratch files.
- [ ] **Scope respected:** No files outside the requested task were modified.
- [ ] **Tests written:** New or changed backend endpoints, CRUD functions and validation rules have tests in `backend/tests/`, and `pytest` (run from `backend/`) passes.

### Testing Rules (HARD RULE)

* **Every backend change comes with tests of the behaviour that matters:** the main flow, and the errors a user can actually run into (e.g. a taken username, invalid input, something that doesn't exist). A bug fix needs a test that fails without the fix. Every test must check a real outcome; do not write tests that only exist to execute lines or raise coverage.
* **Tests must never touch real services.** Use the fixtures in `backend/tests/conftest.py` (in-memory SQLite, never Neon). Fake external services such as the S3 bucket instead of calling them. Never read `.env` in tests.
* **Do not weaken the safety net.** Do not delete, skip or loosen existing tests, or edit `backend/pytest.ini` or `.github/workflows/`, just to make CI pass. If a test fails, fix the code or explain to the user why the test is wrong.
* **CI must be green.** The same checks run automatically on every pull request (`.github/workflows/ci.yml`). A task is not done while they fail.

---

## 6. Agent Reading Verification Test

If the user asks you to *"Confirm that you have read AGENTS.md"*, respond with:
> *"I have read AGENTS.md. I will ask for approval before touching database migrations, adding dependencies, or modifying more than 3 files. I will never commit directly to main."*