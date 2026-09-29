# AI Rules & Development Guidelines (Iteration 1)

> **IMPORTANT FOR AI/AGENT:** Read and strictly follow all rules in this document before running commands, modifying files, or altering code in this project.

---

## 1. Change Discipline & Execution Rules (HARD RULES)

* **Read Before Modifying:** Always read and understand relevant existing code before modifying or refactoring it.
* **Minimal Scope:** Make the smallest change necessary to complete the requested task. Do not rewrite surrounding code or apply unsolicited formatting/styling changes.
* **Protect Uncommitted Changes:** NEVER overwrite, discard, or modify existing uncommitted user changes in the working tree.
* **Full Stack Alignment:** When changing backend API endpoints or database schemas, verify that corresponding frontend API calls (`frontend/src/services/api.js`) remain compatible.
* **No Unapproved Dependencies:** Do not update or add existing dependencies (`package.json`, `requirements.txt`) without explicit human approval.
* **Clarify Ambiguity:** If prompt requirements are ambiguous or incomplete, ask for clarification rather than making assumptions.

---

## 2. Scope & Confirmation Thresholds

You **MUST** pause and request explicit user confirmation before executing changes if your plan involves:

1. **Large Changes:** Modifications affecting **more than 3 files**.
2. **Database Schema Modifications:** Any changes affecting database models or Alembic migrations.
3. **Destructive Operations:** Deleting files, modifying `.env` configs, or running database resets.

---

## 3. Repository Structure & Context

This project is a monorepo deployed as two separate Vercel projects:

* `backend/` – **FastAPI** application (Entrypoint: `app/main.py`). Uses **SQLAlchemy / Alembic** for PostgreSQL (Neon) with PostGIS/vector capabilities.
* `frontend/` – **React + Vite** single-page application (SPA).

**Strict Rules for File Placement:**
* Backend code belongs **exclusively** inside `backend/app/` (routes in `api/routes/`, DB models in `models/`, schemas in `schemas/`).
* Frontend code belongs **exclusively** inside `frontend/src/` (components in `components/`, pages in `pages/`, API calls in `services/api.js`).

---

## 4. Git & Branching Protocol

* **DO NOT TOUCH MAIN:** You are **NEVER** allowed to commit or push directly to `main` or `master`.
* Work must take place on a dedicated feature branch or via a Pull Request (PR).
* Do not run `git push` automatically unless specifically requested.

---

## 5. Verification & Definition of Done (DoN)

Before declaring a task "Done", you must verify:

- [ ] **No Execution Errors:** Python backend runs cleanly without syntax/lint errors.
- [ ] **No Build Errors:** Frontend builds pass cleanly (`frontend/` Vite check).
- [ ] **Clean Code:** No leftover `console.log`, `print()` debugging statements, or temporary scratch files.
- [ ] **Full Stack Verified:** Backend endpoint changes match frontend API client expectations.

---

## 6. Agent Reading Verification Test

If the user asks you to *"Confirm that you have read AGENTS.md"*, respond with:
> *"I have read AGENTS.md. I will follow Change Discipline, protect uncommitted changes, preserve backend/frontend endpoint compatibility, and ask for approval before touching database migrations or modifying more than 3 files."*