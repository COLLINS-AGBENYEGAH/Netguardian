# NetGuardian

Intelligent network monitoring and access control system. Discovers devices on a LAN, tracks online/offline status, flags unauthorized devices, generates alerts, and produces reports.

## Stack

- **Frontend:** HTML5, CSS3, Bootstrap 5, Chart.js &rarr; deploy on Vercel
- **Backend:** Node.js, Express &rarr; deploy on Render
- **Database:** MongoDB Atlas
- **Network discovery:** OS ping + ARP table read (built-in, no extra install), with optional deeper `nmap` scans if the binary is present on the host

## Project Structure

```
netguardian/
  server/            Express API
    config/          DB connection
    models/          Mongoose schemas (User, Device, Alert, Log, Report)
    controllers/      Route handlers
    routes/           Express routers
    services/         discoveryService.js (scanning), monitorService.js (scheduling + alerts)
    middleware/       JWT auth + role-based access
    utils/            Token helper, admin seed script
    server.js         App entry point
  client/            Static frontend (Bootstrap + Chart.js)
    index.html        Login / Register
    dashboard.html     Stats, charts, recent alerts
    devices.html        Device inventory, filters, authorize/block/delete
    alerts.html          Alert feed
    reports.html         Generate + view reports
    assets/js/api.js     Shared fetch wrapper for the backend
```

## Local Setup

### 1. Backend

```bash
cd server
cp .env.example .env
# edit .env: set MONGO_URI (MongoDB Atlas connection string), JWT_SECRET,
# and NETWORK_RANGE to your LAN's CIDR (e.g. 192.168.1.0/24)
npm install
npm run dev
```

The API runs on `http://localhost:5000`. The first user who registers via `/api/auth/register` automatically becomes `admin`. Alternatively run `npm run seed:admin` to create an admin directly.

### 2. Frontend

Open `client/index.html` with a static server (e.g. VS Code Live Server, or `npx serve client`). `assets/js/api.js` auto-detects `localhost` and points at `http://localhost:5000/api`; update `API_BASE_URL` there once you deploy the backend.

## Deployment

### Backend &rarr; Render

1. Push the `server/` folder to GitHub.
2. Create a new **Web Service** on Render, point it at the repo, root directory `server`.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables from `.env.example` in Render's dashboard (Mongo URI, JWT secret, network range, etc.).
5. Note: Render's containers sit outside your school/office LAN, so **live device scanning only works if the API runs on a machine physically on that network** (e.g. a small always-on PC or Raspberry Pi on-site). For a pure cloud demo, you can still exercise every other feature (auth, manual device CRUD, alerts, reports) — the scan step just won't see real local devices unless deployed on-network.

### Frontend &rarr; Vercel

1. Push `client/` to GitHub (or a subfolder of the same repo, setting the Vercel project root to `client`).
2. Vercel auto-detects it as a static site — no build step needed.
3. Update `API_BASE_URL` in `assets/js/api.js` to your live Render URL before deploying.

### Database &rarr; MongoDB Atlas

Free M0 cluster is enough for this project. Whitelist `0.0.0.0/0` (or Render's static egress IPs if you enable that add-on) in Atlas Network Access, and use the generated connection string as `MONGO_URI`.

## Important Note on Network Scanning

Because true device discovery (ARP/ping) requires being on the same physical network segment as the devices, **run the backend on a machine connected to the network you want to monitor** for real data (a lab PC, a Raspberry Pi, or your own laptop on that Wi-Fi). This mirrors how real network monitoring appliances work — they sit on-prem even when the dashboard is cloud-hosted.

## Roles

- **admin** — full access, including deleting devices
- **technician** — can scan, add/edit/authorize/block devices, generate reports
- **viewer** — read-only access to dashboard, devices, alerts, reports

## Next Steps / Future Improvements

Per the original requirements: VLAN management, firewall integration, Cisco/FortiGate automation, SNMP polling, bandwidth monitoring, captive portal auth, and an AI troubleshooting assistant are natural extensions once the core MVP above is validated.
