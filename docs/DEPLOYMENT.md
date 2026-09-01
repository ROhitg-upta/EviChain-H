# EviChain — Deployment Guide

This guide covers deploying EviChain to three cloud platforms: **Railway** (easiest), **Render** (free tier), and **Fly.io** (Docker-based).

---

## Prerequisites for Any Deployment

1. **Neon PostgreSQL database** — [console.neon.tech](https://console.neon.tech) (free tier is fine)
2. **GitHub repository** — code must be pushed before deploying
3. **Environment variables** — gather these before starting:
   - `DATABASE_URL` from Neon dashboard
   - `JWT_SECRET` — 32+ random characters
   - `REFRESH_SECRET` — 32+ different random characters
   - `JWT_EXPIRES_IN` — e.g. `15m`
   - `REFRESH_EXPIRES_IN` — e.g. `7d`

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Option 1 — Railway (Recommended)

Railway auto-detects Node.js projects and handles builds without a Dockerfile.

### Backend (server/)

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select your `EviChain-H` repository
3. Railway will detect the root. You need to tell it the backend is in `server/`:
   - **Settings → Source** → set **Root Directory** to `server`
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npm start`
4. Add environment variables under **Variables**:
   ```
   DATABASE_URL=postgresql://...
   JWT_SECRET=...
   REFRESH_SECRET=...
   JWT_EXPIRES_IN=15m
   REFRESH_EXPIRES_IN=7d
   PORT=4000
   ```
5. Railway assigns a public URL like `https://evichain-backend.up.railway.app`

### Frontend (Next.js)

1. New Project → Deploy from same GitHub repo
2. **Root Directory:** leave empty (root)
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm start`
5. Add variable:
   ```
   NEXT_PUBLIC_API_URL=https://evichain-backend.up.railway.app
   ```
6. Railway assigns a frontend URL like `https://evichain.up.railway.app`

### Run Prisma migration on Railway

After first backend deploy, open the Railway shell or run via CLI:
```bash
railway run --service evichain-backend npx prisma migrate deploy
```

---

## Option 2 — Render (Free tier available)

### Backend

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect GitHub → select `EviChain-H`
3. Settings:
   - **Root Directory:** `server`
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. Add all environment variables in the **Environment** tab
5. Render assigns a URL like `https://evichain-backend.onrender.com`

> **Note:** Free tier on Render spins down after 15 min of inactivity. Use a cron ping service to keep it alive.

### Frontend

1. New → **Static Site** (or Web Service for SSR)
2. **Build Command:** `npm install && npm run build`
3. **Publish Directory:** `.next`
4. Add `NEXT_PUBLIC_API_URL` environment variable

---

## Option 3 — Fly.io (Docker-based)

### Backend

Create `server/Dockerfile`:
```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npx prisma generate && npm run build
EXPOSE 4000
CMD ["npm", "start"]
```

Deploy:
```bash
cd server
fly launch                          # creates fly.toml
fly secrets set DATABASE_URL="..." JWT_SECRET="..." REFRESH_SECRET="..." JWT_EXPIRES_IN="15m" REFRESH_EXPIRES_IN="7d"
fly deploy
```

### Frontend

Create `Dockerfile` in root:
```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
fly launch
fly secrets set NEXT_PUBLIC_API_URL="https://evichain-backend.fly.dev"
fly deploy
```

---

## Database Setup (Neon)

1. Sign up at [console.neon.tech](https://console.neon.tech)
2. Create project → name it `evichain`
3. Copy the **Connection string** from the dashboard
   - Format: `postgresql://user:pass@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`
4. Set this as `DATABASE_URL` in your deployment environment
5. Run migration after first deploy:
   ```bash
   # Railway
   railway run npx prisma migrate deploy
   
   # Render — use Render Shell or add to build command
   npx prisma migrate deploy
   
   # Fly.io
   fly ssh console -C "cd /app && npx prisma migrate deploy"
   ```

> `prisma migrate deploy` (not `dev`) is the production command — it applies existing migrations without interactive prompts.

---

## CORS Configuration for Production

By default the backend accepts all origins. Before going live, restrict to your frontend domain:

In `server/src/index.ts`:
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "http://localhost:3000",
  credentials: true,
}));
```

Add `ALLOWED_ORIGIN=https://evichain.up.railway.app` to backend environment variables.

---

## S3 File Storage (When Ready)

Currently files are hashed in memory and not persisted. To enable real file storage:

1. Create an AWS S3 bucket
2. Add environment variables:
   ```env
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=ap-south-1
   S3_BUCKET_NAME=evichain-evidence
   ```
3. In `evidence.routes.ts`, after SHA-256 computation, add S3 upload:
   ```typescript
   import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
   const s3 = new S3Client({ region: process.env.AWS_REGION });
   await s3.send(new PutObjectCommand({
     Bucket: process.env.S3_BUCKET_NAME,
     Key: storageKey,
     Body: file.buffer,
     ContentType: file.mimetype,
   }));
   ```
4. Update download endpoint to generate presigned URL instead of returning metadata.

---

## Environment Variable Reference

### Backend (complete list)

| Variable | Required | Example | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://...` | Neon connection string with `sslmode=require` |
| `JWT_SECRET` | Yes | 32+ random chars | Signs access tokens |
| `JWT_EXPIRES_IN` | Yes | `15m` | Access token lifetime |
| `REFRESH_SECRET` | Yes | 32+ random chars | Signs refresh tokens |
| `REFRESH_EXPIRES_IN` | Yes | `7d` | Refresh token lifetime |
| `PORT` | No | `4000` | Default 4000 |
| `ALLOWED_ORIGIN` | No | `https://evichain.app` | CORS origin (production) |
| `AWS_ACCESS_KEY_ID` | No | `AKIA...` | S3 upload (future) |
| `AWS_SECRET_ACCESS_KEY` | No | `...` | S3 upload (future) |
| `AWS_REGION` | No | `ap-south-1` | S3 region (future) |
| `S3_BUCKET_NAME` | No | `evichain-evidence` | S3 bucket (future) |

### Frontend (complete list)

| Variable | Required | Example | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | `https://api.evichain.app` | Backend base URL |

---

## Health Check URL

After deployment, verify the backend is running:
```bash
curl https://your-backend.railway.app/health
# → {"status":"ok","timestamp":"..."}
```

---

## Troubleshooting

### `Can't reach database server`
- Check `DATABASE_URL` is correct and includes `?sslmode=require`
- Neon free tier may sleep — first request after idle can be slow

### `Invalid or expired token` on every request
- Check `JWT_SECRET` is the same value the tokens were signed with
- Clear browser localStorage: `localStorage.clear()` in DevTools console

### Build fails on `prisma generate`
- Ensure `@prisma/client` is in `dependencies` (not just `devDependencies`)

### CORS error in browser
- Set `ALLOWED_ORIGIN` to your frontend URL on the backend
- Ensure `NEXT_PUBLIC_API_URL` points to the backend, not the frontend
