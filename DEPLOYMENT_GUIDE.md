# AnmolKala — Complete Railway & Supabase A-to-Z Guide

This guide explains how the deployment works, how the "Application failed to respond" error is prevented, and exactly where to locate every variable in Supabase and Railway.

---

## 1. What Caused "Application Failed to Respond" on Railway & What Was Fixed

1. **Module Scoping Issue (`__dirname` before declaration)**:
   - In ES Modules, `__dirname` was used before its declaration inside a fallback try/catch block at the top of `server.ts`. This caused a fatal Node runtime error immediately on startup before the server could bind to the port.
   - **Fixed**: `__dirname` and `__filename` are now declared at the very top of `server.ts`.

2. **Production Build Tool Availability**:
   - `vite`, `@vitejs/plugin-react`, and `typescript` were previously in `devDependencies`. When `NODE_ENV=production` is set in Railway, `npm install` skips devDependencies by default, causing `vite build` to fail with `vite: not found`.
   - **Fixed**: Build tools are now in `dependencies` in `package.json` so they are installed in every Railway build.

3. **Production Mode Detection**:
   - `isProd` was only checking `process.env.NODE_ENV === 'production'`. If `NODE_ENV` was omitted in Railway, it attempted to run Vite in dev middleware mode inside the container.
   - **Fixed**: `isProd` now checks `RAILWAY_ENVIRONMENT`, `PORT`, and whether `dist/index.html` exists.

4. **Node.js Version Mismatch (`styleText` in `node:util` error)**:
   - Modern Vite 8 / Rolldown requires Node.js >= 20.12 or Node.js 22 because it uses `styleText` from `node:util`.
   - Railway's default Nixpacks image without explicit Node version configuration defaults to Node.js 18.20.5, throwing `SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'`.
   - **Fixed**: We added `.nvmrc` (`22`), `.node-version` (`22`), and `nixpacks.toml` (`nodejs_22`), locking Node 22 across all build environments.

5. **Health Check Speed & Port Binding**:
   - Railway health checks now hit `/api/health` and `/health` immediately without waiting for database pool timeouts.
   - Timeout increased to 120s in both `railway.json` and `railway.toml`.
   - Single-Page Application (SPA) fallback safely verifies `dist/index.html` so `res.sendFile` never crashes.

---

## 2. Where to Find Every Variable

### 1. `DATABASE_URL` (Supabase PostgreSQL Connection String)
- **Where to find it:**
  1. Open [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
  2. Click the **Settings (gear ⚙️) icon** at the bottom-left sidebar.
  3. Click **Database** in the sub-menu.
  4. Scroll down to the **Connection parameters** or **Connection Pooling** section.
  5. Select the **URI** tab.
  6. Choose **Transaction** (port 6543) or **Session** (port 5432).
  7. Copy the URI string. It has this format:
     ```text
     postgres://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require
     ```
  8. **Important**: Replace `[YOUR-PASSWORD]` with the database password you chose when creating your Supabase project. If your password has special characters like `@`, `#`, or `$`, URL-encode them (e.g. `@` becomes `%40`).

---

### 2. `NODE_ENV` & `NIXPACKS_NODE_VERSION`
- **`NODE_ENV`:** `production`
- **`NIXPACKS_NODE_VERSION`:** `22`
- **Where to set them:** Directly inside Railway:
  1. Open [Railway Dashboard](https://railway.com).
  2. Click your service box -> Go to **Variables** tab -> Click **+ Add Variable**.
  3. Add `NODE_ENV` = `production`.
  4. Add `NIXPACKS_NODE_VERSION` = `22`.

---

### 3. `PORT`
- **Do not manually set this on Railway!**
- Railway automatically assigns a dynamic port and injects it into `process.env.PORT`.
- Our server automatically reads `process.env.PORT` and binds to `0.0.0.0`.

---

### 4. `ADMIN_USERNAME`
- **Value:** your admin email address.
- **Where to set it:** Railway Variables tab.

---

### 5. `ADMIN_PASSWORD` *(required)*
- **Value:** a strong, unique password. There is no default; if it is unset (and no saved password exists), admin login returns 503.
- **Where to set it:** Railway Variables tab.

---

### 6. `SESSION_SECRET` *(required)*
- **Value:** a random 32+ character string, e.g. generated with `openssl rand -hex 32`. If unset, the server logs an error and uses a random secret that changes on every restart, logging all admins out.
- **Where to set it:** Railway Variables tab.

---

### 6b. `ADMIN_RECOVERY_SECRET` *(optional)*
- **Value:** a random secret used by the forgot/reset password flow. If unset, forgot/reset password is disabled (403).
- **Where to set it:** Railway Variables tab.

---

### 7. `SUPABASE_URL` & `SUPABASE_KEY` *(Optional)*
- Only needed if you use Supabase Storage buckets for custom files:
  1. In Supabase Dashboard -> **Settings (⚙️)** -> **API**.
  2. Copy **Project URL** -> `SUPABASE_URL`.
  3. Copy **anon / public key** or **service_role key** -> `SUPABASE_KEY`.

---

## 3. Step-by-Step: Push to GitHub & Deploy on Railway

1. **Commit & Push to GitHub**:
   All files are now fixed and verified. Push the repo to your GitHub:
   ```bash
   git add .
   git commit -m "Fix Railway deployment, port binding, build scripts, and production dependencies"
   git push origin main
   ```

2. **Connect to Railway**:
   - Go to [Railway](https://railway.com) -> **+ New Project** -> **Deploy from GitHub repo**.
   - Select your repository.

3. **Add Variables in Railway**:
   - Click the service box -> **Variables** tab -> Add:
     - `DATABASE_URL` = your Supabase connection string
     - `NODE_ENV` = `production`
     - `SESSION_SECRET` = a random 32+ character string
     - `ADMIN_USERNAME` = your admin email
     - `ADMIN_PASSWORD` = a strong, unique password
     - `ADMIN_RECOVERY_SECRET` = *(optional)* enables forgot/reset password

4. **Deploy & Generate Domain**:
   - Railway will automatically run:
     - `npm run build` (builds React + Vite into `dist/`)
     - `npm start` (starts the production server on `0.0.0.0:${PORT}`)
   - Go to **Settings** -> **Networking** -> Click **Generate Domain**.
   - Open your generated domain (e.g., `https://your-app.up.railway.app`).

5. **Verify**:
   - Check `https://your-app.up.railway.app/api/health`
   - Response:
     ```json
     {
       "status": "ok",
       "service": "AnmolKala API",
       "database": {
         "connected": true,
         "provider": "Supabase PostgreSQL (Connected via DATABASE_URL)"
       }
     }
     ```
   - Storefront and admin login (`/admin/login`) are ready to use.
