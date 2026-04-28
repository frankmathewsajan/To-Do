Quick Railway deploy (monorepo)

1) Create a new project on Railway.

2) Add two services (one backend, one frontend):
   - In each service, go to **Settings -> Service -> Root Directory** and set:
     - Backend service: `/backend`
     - Frontend service: `/frontend`
   This is required so Railway uses the correct `railway.toml` in each folder.

3) Configure each service:
   - Service A (Backend):
     - Root Directory: `backend`
     - Build Command: `pip install -r requirements.txt`
     - Start Command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
     - Environment: set production values for `MONGO_URL`, `JWT_SECRET`, `CORS_ORIGINS` (optional), and any other secrets. Leave `PORT` unset (Railway injects it).

   - Service B (Frontend - static):
     - Root Directory: `frontend`
     - Build Command: `yarn install && yarn build`
     - Start Command: `node server.js`
     - Environment: set `REACT_APP_BACKEND_URL` to the backend service's public URL (for example `https://<your-backend>.up.railway.app`).

4) Order of operations recommended:
   - Create the backend service first so it gets a public URL.
   - Copy that backend URL into the frontend service environment variable `REACT_APP_BACKEND_URL` and redeploy the frontend service (CRA needs the value at build time).

5) Notes and tips:
   - Backend uses `uvicorn` and MUST listen on `$PORT` (Railway-injected); the `startCommand` above does this.
   - Frontend is a CRA build served by a small Express server (`frontend/server.js`); `REACT_APP_BACKEND_URL` is baked into the build. After setting the frontend env var, trigger a rebuild/deploy.
   - CORS: set `CORS_ORIGINS` on the backend to the frontend URL (or `*` for quick testing). Example: `https://<your-frontend>.up.railway.app`.
   - If you use Railway-managed Postgres/Mongo, paste the connection string into `MONGO_URL`.

6) Verification:
   - Backend: visit `https://<your-backend>.up.railway.app/health` and expect a healthy JSON response.
   - Frontend: visit the frontend URL; the app should call the backend configured at build time.

If you want, I can also:
- Create a simple Health check in Railway service settings.

