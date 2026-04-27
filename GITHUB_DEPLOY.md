# GitHub + Docker + Deployment Cheat Sheet

Everything you need in one place. Copy-paste, in order.

---

## Part 1 — Push to GitHub

```bash
cd /path/to/vaultdo      # your local clone

# 1. Make sure secrets aren't about to be committed
cat .gitignore | grep -E "\.env"   # should show .env entries

# 2. Initialise git (if you haven't yet)
git init
git branch -M main
git add .
git commit -m "Initial commit: VaultDo encrypted todo app"

# 3. Create a new EMPTY repo on github.com (UI) — do NOT add README/license
#    then link and push:
git remote add origin https://github.com/<your-username>/vaultdo.git
git push -u origin main
```

If you ever accidentally push a real `.env`, rotate the `JWT_SECRET` and `AES_KEY_B64` immediately (see `VSCODE_SETUP.md` §5e).

---

## Part 2 — Dockerize (already done — just run)

Both Dockerfiles exist:
- `backend/Dockerfile` — builds FastAPI image on port 8001
- `frontend/Dockerfile` — builds React → static files → nginx on port 80
- `docker-compose.yml` — spins up Mongo + Redis + backend + frontend together

### Build & run everything locally

```bash
docker compose up --build
# → http://localhost:3000 (frontend)
# → http://localhost:8001 (backend)
```

### Build the images individually

```bash
docker build -t vaultdo-backend:latest ./backend
docker build -t vaultdo-frontend:latest ./frontend

docker run -d --name mongo -p 27017:27017 mongo:7
docker run -d --name backend -p 8001:8001 \
  -e MONGO_URL=mongodb://host.docker.internal:27017 \
  -e DB_NAME=todo_app_db \
  -e JWT_SECRET=$(python3 -c "import secrets;print(secrets.token_hex(32))") \
  -e AES_KEY_B64=$(python3 -c "import secrets,base64;print(base64.b64encode(secrets.token_bytes(32)).decode())") \
  vaultdo-backend:latest
docker run -d --name frontend -p 3000:80 vaultdo-frontend:latest
```

### Push images to Docker Hub (optional, for deploy)

```bash
docker login
docker tag vaultdo-backend:latest <your-dockerhub-user>/vaultdo-backend:latest
docker tag vaultdo-frontend:latest <your-dockerhub-user>/vaultdo-frontend:latest
docker push <your-dockerhub-user>/vaultdo-backend:latest
docker push <your-dockerhub-user>/vaultdo-frontend:latest
```

---

## Part 3 — Deploy options (pick ONE)

### Option A — Render.com (easiest, free tier, auto-deploy from GitHub)

1. Go to https://render.com → **New → Blueprint**
2. Connect your GitHub repo
3. Create **2 Web Services**:
   - **backend**
     - Root directory: `backend`
     - Runtime: Docker
     - Env vars: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `AES_KEY_B64`, `CORS_ORIGINS=https://<your-frontend>.onrender.com`, `DEV_MODE=false`
     - Use **MongoDB Atlas** (free) for `MONGO_URL` — https://cloud.mongodb.com
   - **frontend**
     - Root directory: `frontend`
     - Runtime: Docker
     - Env var: `REACT_APP_BACKEND_URL=https://<your-backend>.onrender.com`
4. Deploy. Render auto-redeploys on every `git push`.

### Option B — Railway.app (also easy, $5 free credit)

```bash
npm i -g @railway/cli
railway login
railway init
railway up         # deploys from Dockerfile automatically
```
Add env vars in the Railway dashboard (same as Render above).

### Option C — Fly.io (scales globally, CLI-driven)

```bash
# Install: curl -L https://fly.io/install.sh | sh
flyctl auth login
cd backend && flyctl launch --no-deploy       # creates fly.toml
flyctl secrets set JWT_SECRET=... AES_KEY_B64=... MONGO_URL=...
flyctl deploy
cd ../frontend && flyctl launch --no-deploy
flyctl secrets set REACT_APP_BACKEND_URL=https://<your-backend>.fly.dev
flyctl deploy
```

### Option D — AWS / GCP / Azure (Kubernetes)

Use `k8s/all-in-one.yaml` on **EKS / GKE / AKS**. Steps in `VSCODE_SETUP.md` §5. Images live in **ECR / GCR / ACR** respectively.

### Option E — Self-host on any VPS (DigitalOcean, Linode, Hetzner…)

```bash
ssh you@your-server
git clone https://github.com/<your-username>/vaultdo.git && cd vaultdo
# copy backend/.env.example → backend/.env, fill in real JWT_SECRET + AES_KEY_B64
# copy frontend/.env.example → frontend/.env, set REACT_APP_BACKEND_URL to your server URL
docker compose up -d --build
# then put Nginx in front with a Let's Encrypt cert:
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Part 4 — MongoDB Atlas (free, required for hosted deploys)

1. Go to https://cloud.mongodb.com → Create Free Cluster (M0, 512MB)
2. Database Access → Add DB User → `vaultdo_app` / strong password
3. Network Access → Allow Access from Anywhere (`0.0.0.0/0`) for simplicity
4. Clusters → Connect → Drivers → copy connection string
5. Use it as your `MONGO_URL`:
   ```
   mongodb+srv://vaultdo_app:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

---

## Part 5 — GitHub Actions (optional auto-deploy to Docker Hub)

Create `.github/workflows/docker.yml`:

```yaml
name: Build & Push Docker images
on:
  push: { branches: [main] }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USER }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with: { context: ./backend,  push: true, tags: ${{ secrets.DOCKERHUB_USER }}/vaultdo-backend:latest }
      - uses: docker/build-push-action@v5
        with: { context: ./frontend, push: true, tags: ${{ secrets.DOCKERHUB_USER }}/vaultdo-frontend:latest }
```
Add `DOCKERHUB_USER` and `DOCKERHUB_TOKEN` as GitHub repo secrets (Settings → Secrets → Actions).

---

## Quick checklist before going live

- [ ] `.env` is in `.gitignore` (already done)
- [ ] Regenerated `JWT_SECRET` and `AES_KEY_B64` (commands above)
- [ ] Set `DEV_MODE=false`
- [ ] Set `CORS_ORIGINS` to your real frontend domain
- [ ] Set `REACT_APP_BACKEND_URL` to your real backend domain (https)
- [ ] Configured real SMTP for email OTP (or document that MFA is dev-only)
- [ ] MongoDB user has a strong password and IP allowlist is appropriate
- [ ] Custom domain with HTTPS (Let's Encrypt or platform-managed)

You're set.
