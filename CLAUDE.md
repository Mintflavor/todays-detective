# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

### 모든 코드를 작성할 땐 코드 파일 최상단에 아래 문구를 주석으로 추가해주세요.
작성자 : 박현일
이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.

Author: Hyunil Park
Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

## 도구 호출

한글 등 비ASCII 문자열을 도구 호출 파라미터에 넣을 때는 리터럴 UTF-8로 그대로 쓴다.
`\uXXXX` 유니코드 이스케이프로 바꿔 쓰지 않는다.

## Project Overview

**Today's Detective** is a full-stack interactive detective game where players investigate AI-generated mystery cases. Players interrogate suspects powered by Google Gemini and submit their deduction to receive an AI-evaluated score.

## Commands

### Frontend (Next.js)

```bash
npm run dev          # Development server (port 3000)
npm run build        # Production build
npm run start        # Production server
npm run lint         # ESLint
npm run test         # Run tests once (Vitest)
npm run test:watch   # Tests in watch mode
npm run test:coverage # Coverage report
```

### Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Docker (Backend + MongoDB)

```bash
docker-compose up    # Start FastAPI (port 8000) + MongoDB (port 27017)
docker-compose down  # Stop services
```

## Architecture

### Game Phase State Machine

The game progresses through these phases managed by `useGameEngine` in [app/hooks/useGameEngine.ts](app/hooks/useGameEngine.ts):

`intro` → `load_menu` → `briefing` → `tutorial` → `loading` → `investigation` → `deduction` → `resolution`

- **intro**: Title screen and menu
- **briefing**: Case overview with victim info and suspects
- **investigation**: 10-minute timer phase; player interrogates 3 suspects using action points
- **deduction**: Player selects culprit and submits reasoning
- **resolution**: Gemini evaluates correctness and returns grade/feedback

### Frontend

- **Framework**: Next.js 16 App Router, React 19, TypeScript strict mode
- **Styling**: Tailwind CSS 4 with custom animations (`fade-in`, `stamp`, `loading-bar`)
- **Path alias**: `@/*` maps to the project root

Key entry point: [app/page.tsx](app/page.tsx) — routes rendering to phase-specific screen components.

**Core hooks** (all in [app/hooks/](app/hooks/)):
- `useGameEngine` — master state (phase, caseData, chatLogs, actionPoints)
- `useGeminiClient` — Gemini API calls (generateCase, interrogateSuspect, evaluateDeduction)
- `useGameTimer` — 10-minute investigation countdown
- `useSecretCommand` — detects key combo to enter admin mode

**Types**: All TypeScript interfaces (`CaseData`, `Suspect`, `Evidence`, `Evaluation`, `ChatLogs`, `DeductionInput`) are in [app/types/game.ts](app/types/game.ts).

### Backend

- **Framework**: FastAPI + Uvicorn, MongoDB via Motor (async)
- **Location**: [backend/](backend/)
- `main.py` — app setup, CORS config
- `database.py` — MongoDB connection
- `models.py` — Pydantic models
- `routes/scenarios.py` — scenario CRUD

**Endpoints**: `POST/GET /scenarios/`, `GET /scenarios/{id}`, `DELETE /scenarios/{id}`

### API Routing

Next.js rewrites proxy frontend `/api/*` calls to the FastAPI backend (see [next.config.ts](next.config.ts)):
- `/api/:path*` → `${NEXT_PUBLIC_API_URL}/scenarios/:path*`
- `/server/:path*` → FastAPI catch-all

Gemini API calls go through Next.js API routes under [app/api/game/](app/api/game/).

### Environment Variables

```
GEMINI_API_KEY=         # Google Gemini API key
NEXT_PUBLIC_API_URL=http://localhost:8000   # FastAPI backend URL
ADMIN_PASSWORD=         # Admin screen access password
```

### Data Model

`CaseData` contains: victim info, 3 suspects (one is the culprit), evidence list, crime setting, and timeline. Suspects have `id`, `name`, `role`, `alibi`, `secret`, and `isCulprit` flag — only revealed on resolution.

Saved scenarios stored in MongoDB `scenario_collection` with fields: `title`, `summary`, `crime_type` (살인/방화/납치/강도/절도), `case_data`, `created_at`.
