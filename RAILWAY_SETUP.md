# Railway Setup for Wifey Dating App (Backend + Admin Dashboard)

This monorepo has TWO services on Railway:
1. **Backend** (wifey-backend-production) — Node.js API at `https://wifey-backend-production.railway.app`
2. **Admin Dashboard** (wifey-web-production) — React Router web app at `https://wifey-dating-app-admin.railway.app`

---

## Setup Instructions

### Step 1: Create Second Railway Project (or use same project with 2 services)

Go to https://railway.app/dashboard

**Option A (Recommended): Add second service to existing project**
1. Click on `wifey-backend-production` project
2. Click "+ New Service" → "GitHub Repo"
3. Select `ethanserbantes/wifey-dating-app` (same repo)
4. In settings:
   - **Build command**: Leave blank (auto-detected)
   - **Dockerfile**: `Dockerfile.web` (custom path)
   - **Start command**: `node server.js`
   - **Port**: 3000
   - **Root directory**: `.` (monorepo root)

**Option B: Create separate project**
1. Create new Railway project
2. Connect same GitHub repo
3. Configure service same as Option A

### Step 2: Configure Environment Variables

In Railway dashboard for the web service, add:

```
NODE_ENV=production
PORT=3000
REACT_APP_API_URL=https://wifey-backend-production.railway.app
```

### Step 3: Configure Domains

**Backend service:**
- Custom domain: `wifey-api.wifeydating.app` (optional)

**Web service:**
- Custom domain: `wifey-dating-app-admin.railway.app` (auto-generated)
- Or: Point `wifeydating.app/admin` to this service (using routing rules)

### Step 4: Verify Services

After deployment:
- Backend: `https://wifey-backend-production.railway.app/api/health`
- Admin: `https://[web-service-domain]/` should load dashboard

---

## Local Development

```bash
# Terminal 1: Backend
cd /Users/moltbot/Downloads
node wifey-backend.js

# Terminal 2: Admin Dashboard
cd /Users/moltbot/Downloads/Wifey-App/apps/web
npm run dev

# Then open:
# - Mobile app: connects to http://192.168.1.78:3001
# - Admin: http://localhost:5173
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│         Railway Project                 │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────┐                   │
│  │  Backend Service │                   │
│  │ (Node.js + Exp)  │                   │
│  │  Port: 3001      │                   │
│  │  /api/*          │                   │
│  └──────────────────┘                   │
│         ▲                               │
│         │                               │
│    ┌────┴─────┬──────────────┐          │
│    │           │              │         │
│    v           v              v         │
│  Mobile    Admin Dashboard   (future)   │
│   App      (React Router)     Service   │
│            Port: 3000                   │
│                                         │
└─────────────────────────────────────────┘
```

---

## DNS Configuration

After both services are running on Railway:

1. Login to Anything.com domain manager
2. Update A record for `wifeydating.app`:
   - Currently: Points to Railway backend
   - Future: Use routing rules to split:
     - `/` → Admin dashboard
     - `/api/*` → Backend service

**Or simpler**: Use subdomains:
- `api.wifeydating.app` → Backend
- `admin.wifeydating.app` → Web app

---

## Troubleshooting

### Web service won't build
- Check `Dockerfile.web` uses correct paths
- Verify `apps/web/server.js` exists
- Check logs in Railway dashboard

### Admin dashboard shows 404 API errors
- Verify `REACT_APP_API_URL` environment variable is set
- Check backend service is running
- Confirm API endpoints match (e.g., `/api/quiz/start`)

### DNS not resolving
- Wait 15-30 minutes for DNS propagation
- Clear browser cache
- Try incognito mode
