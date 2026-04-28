# VaultDo - Encrypted To-Do App

A modern, secure, privacy-first to-do application with encrypted task data and MFA. This repository is refactored for immediate deployment to Railway.app.

## Railway Deployment (Recommended)

Follow the step-by-step guide in [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md).

**Required environment variables**

Backend:
- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`
- `AES_KEY_B64`
- `CORS_ORIGINS` (set to your Railway frontend URL)

Frontend:
- `REACT_APP_BACKEND_URL` (set to your Railway backend URL)

## Local Development (Optional)

Backend:
```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Frontend:
```bash
cd frontend
yarn install
yarn dev
```

Create `frontend/.env`:
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

## Frontend Production Server

The frontend build is served by a lightweight Express server at [frontend/server.js](frontend/server.js).

```bash
cd frontend
yarn build
yarn start
```

`yarn start` binds to `$PORT` so Railway can map it correctly.

## Docs

- Railway deploy steps: [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md)
