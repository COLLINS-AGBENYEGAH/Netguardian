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




# NetGuardian Agent — Setup Guide

The Agent is a small program that runs on a computer inside **your own network**. It finds devices connected to your network and reports them to your NetGuardian dashboard.

**Important:** the Agent must run on a computer that is physically connected to the network you want to monitor — it cannot run in the cloud, because it needs direct access to your local network to work.

---

## What you'll need

- A Windows, Mac, or Linux computer that stays on and connected to your network (this can be a regular PC, but ideally something that's always on)
- [Node.js](https://nodejs.org) installed on that computer (download the "LTS" version if you don't have it already)
- The `netguardian-agent.zip` file you downloaded from your NetGuardian dashboard's Settings page

---

## Setup Steps

### 1. Unzip the download

Extract `netguardian-agent.zip` to a folder you'll remember — for example, your Desktop, or a folder like `C:\NetGuardianAgent`.

### 2. Open a terminal inside that folder

You need to open a command-line terminal that's already pointed at the unzipped folder. There are a few ways to do this on Windows:

**Option A — Shift + Right-click (most reliable)**
1. Open the unzipped folder in File Explorer
2. Hold **Shift** and **right-click** on an empty space inside the folder
3. Click **"Open PowerShell window here"** or **"Open command window here"**

**Option B — Right-click (Windows 11)**
1. Right-click inside the folder
2. Click **"Open in Terminal"**

**Option C — Type the path manually**
1. Click the address bar at the top of File Explorer (this selects the full folder path)
2. Copy it (Ctrl+C)
3. Open Command Prompt (search "cmd" in the Start menu)
4. Type `cd ` (with a space), then paste the path, then press Enter — for example:
   ```
   cd C:\Users\yourname\Desktop\netguardian-agent
   ```

**On Mac:** right-click the folder → **"New Terminal at Folder"** (or open Terminal and `cd` to the folder manually, same as Option C).

**On Linux:** most file managers (Nautilus/Files, Dolphin, etc.) have a right-click option like **"Open Terminal Here"** or **"Open in Terminal"**. If not, open a terminal normally and `cd` to the folder:
```
cd ~/Downloads/netguardian-agent
```

### 3. Confirm you're in the right folder

Type:
```
dir
```
(on Mac/Linux, use `ls` instead)

You should see files like `agent.js`, `package.json`, and `.env` listed. If you don't see these, you're in the wrong folder — go back to Step 2.

### 4. Install dependencies

```
npm install
```

This downloads the small set of packages the Agent needs. Takes a few seconds to a minute.

### 5. Start the Agent

```
npm start
```

You should immediately see something like:

```
=== NetGuardian Agent ===
Reporting to: https://your-netguardian-url.com
Scanning: 192.168.1.0/24 (will sync with dashboard Settings each cycle)
Interval: every 60s
```

### 6. Leave it running

**The terminal window must stay open** for the Agent to keep working. Closing it stops the Agent, and your dashboard will stop receiving updates.

---

## Confirming it's working

1. Check the terminal — after a short delay, you should see a line like:
   ```
   [Agent] Found 8 device(s) in 2400ms (3 with a resolved hostname)
   [Agent] Report sent: 8 new, 0 updated
   ```
2. Go to your NetGuardian dashboard's **Devices** page — devices should start appearing within a minute or two.
3. Go to **Settings** — under "Agent Token," you should see a green message like *"Agent last reported just now."*

---

## Changing what network it scans

You don't need to touch the Agent or re-download it to change settings. Just go to your dashboard's **Settings** page and update the **Network Range** or **Gateway IP** — the running Agent will automatically pick up the change within about a minute, on its next scan cycle.

---

## Linux-specific notes

The Agent uses your system's `ip neigh` command (falling back to `arp`) to read discovered devices' MAC addresses. On most Linux distributions this works out of the box, but a couple of things to check if devices aren't showing up:

- **Minimal/server distros** (bare Ubuntu Server, Debian minimal installs, etc.) sometimes don't include the `arp` command by default. If `ip neigh` isn't available either, install the `net-tools` package:
  ```
  sudo apt install net-tools
  ```
  (or the equivalent for your distro — `dnf install net-tools` on Fedora, etc.)

- **Ping permissions:** some Linux distributions restrict raw ICMP ping for non-root users by default. If the Agent reports 0 devices found even though your network clearly has devices on it, try running once with `sudo` to confirm this is the cause:
  ```
  sudo npm start
  ```
  If that fixes it, you can grant ping permission permanently instead of always needing `sudo`, with:
  ```
  sudo sysctl -w net.ipv4.ping_group_range="0 2147483647"
  ```

- **Running as a background service long-term:** Linux users should use **systemd** rather than `pm2` or Task Scheduler — see the "Keeping the Agent running long-term" section below.

## Troubleshooting

**"npm is not recognized"** — Node.js isn't installed, or your computer needs a restart after installing it. Download and install Node.js from [nodejs.org](https://nodejs.org), then try again.

**Agent shows "AGENT_TOKEN is not set"** — the `.env` file is missing or wasn't included correctly. Try re-downloading the Agent from your dashboard's Settings page.

**Agent runs but no devices appear on the dashboard** — double-check the Network Range in Settings matches your actual network (check your computer's IP address and make sure the range covers it).

**"Agent last reported" turns red / goes stale on the dashboard** — this means the Agent's terminal was likely closed, or the computer running it went to sleep/restarted. Reopen the terminal and run `npm start` again from inside the Agent's folder.

---

## Keeping the Agent running long-term

For real, ongoing use, you'll eventually want the Agent to run automatically in the background — surviving computer restarts, without needing to keep a terminal window open manually. Options for this include:

- **pm2** (a process manager for Node.js, works on Windows, Mac, and Linux) — keeps the Agent running and restarts it automatically if it crashes:
  ```
  npm install -g pm2
  pm2 start agent.js --name netguardian-agent
  pm2 save
  pm2 startup
  ```
  (the last two commands make it survive a computer restart)

- **Windows Task Scheduler** — can be configured to start the Agent automatically when the computer boots

- **A Linux systemd service** — create a file at `/etc/systemd/system/netguardian-agent.service` with:
  ```ini
  [Unit]
  Description=NetGuardian Agent
  After=network.target

  [Service]
  Type=simple
  WorkingDirectory=/path/to/netguardian-agent
  ExecStart=/usr/bin/npm start
  Restart=on-failure

  [Install]
  WantedBy=multi-user.target
  ```
  Then enable and start it:
  ```
  sudo systemctl enable netguardian-agent
  sudo systemctl start netguardian-agent
  ```

Ask your NetGuardian administrator if you'd like help setting this up.
