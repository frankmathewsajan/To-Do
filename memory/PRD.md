# VaultDo — Product Requirements Document

## Original Problem Statement
> "Create a modern to-do app with a strong UI, authentication, MFA, encryption, and helpful developer guidance."

## User Choices (confirmed via ask_human)
- Stack: React + FastAPI + MongoDB. Railway deployment (Nixpacks) with separate frontend/backend services.
- Auth: JWT email/password + Google OAuth support (configurable)
- MFA: Email-based OTP (6-digit)
- Encryption: AES-256-GCM at rest for todo content
- Extras: categories/tags, due dates, priorities, dark/light mode
- User also requested: separate pages for Dashboard / Tasks / Calendar / You, plus "something interesting" → command palette (⌘K) + activity heatmap + streak tracker

## Architecture
- **Frontend:** React 19, Tailwind, shadcn/ui, Framer Motion, cmdk, sonner, react-router, axios, date-fns, lucide-react
- **Backend:** FastAPI, Motor (async MongoDB), PyJWT, bcrypt, cryptography (AES-GCM), httpx
- **Database:** MongoDB (collections: `users`, `todos`, `otps`)
- **Deployment configs:** Railway-first setup with `railway.json` + `RAILWAY_DEPLOY.md`

## User Personas
- **Modern professional** needing private, fast task management
- **Privacy-conscious user** wanting verifiable encryption
- **Developer** running the app locally in VS Code

## Core Requirements (static)
- Authentication (signup/login/JWT/OAuth/MFA)
- Encrypted todo CRUD
- Multi-page UI with sidebar navigation
- Light/Dark theme
- Deployable on Railway with frontend/backend services

## Implemented (2026-02)
### Backend (FastAPI)
- JWT auth: `/api/auth/signup`, `/api/auth/login`, `/api/auth/me`
- Google OAuth session exchange: `/api/auth/google/session` (via environment configuration)
- MFA email OTP: `/api/auth/mfa/verify`, `/api/auth/mfa/resend`, `/api/auth/mfa/toggle`
- Dev OTP helper (gated by `DEV_MODE=true`): `/api/auth/dev/last-otp`
- Todo CRUD: GET/POST/PATCH/DELETE `/api/todos`, `/api/todos/stats`
- AES-256-GCM encryption of title + description (96-bit random nonce per record)
- bcrypt password hashing
- Login rate info: 5 OTP-attempt lockout per MFA token
- Demo user seeded on startup: `demo@todoapp.com` / `Demo@1234`
- **10/10 pytest backend tests pass**

### Frontend (React)
- **Landing page** with hero + feature grid (Swiss high-contrast style)
- **Auth flow**: Login · Signup · MFA verify · Google OAuth callback
- **Sidebar layout** wrapping authenticated pages
- **Dashboard** (`/dashboard`): stats cards, 84-day activity heatmap, streak, due-today, upcoming tasks
- **Tasks** (`/tasks`): full CRUD, search, status + priority filters, animated list (framer-motion)
- **Calendar** (`/calendar`): monthly grid with tasks per day, click day to view/add
- **You** (`/you`): profile, MFA toggle, theme toggle, data-security info, logout
- **⌘K Command Palette**: quick new-task, theme toggle, navigation
- **Dark / Light theme** with localStorage persistence
- All interactive elements have `data-testid`
- **10/11 frontend E2E tests pass** (keyboard shortcut flake under Playwright only)

### Dev Ops
- `railway.json` for monorepo services
- `RAILWAY_DEPLOY.md` for deployment steps

## Backlog / Future (P1 / P2)
- **P1**: Use a real SMTP provider by default for email OTP (currently logs in DEV_MODE)
- **P1**: Rate limiting on `/api/auth/login` (via slowapi or Redis)
- **P1**: Key rotation strategy for `AES_KEY_B64`
- **P2**: Replace native date input with shadcn Calendar + Popover in TodoFormDialog
- **P2**: Real-time sync (WebSocket) for multi-device
- **P2**: Collaboration / shared todo lists
- **P2**: Recurring tasks
- **P2**: Push notifications / reminders
- **P2**: Move Redis from manifests into backend (rate-limit, session cache)

## Test Credentials
See `/app/memory/test_credentials.md`.
