# NetGuardian Agent

A small, standalone program that runs on **your own network** and reports discovered devices to your NetGuardian dashboard. This is separate from the main NetGuardian server/website - you run this on a machine physically connected to the network you want monitored (the same PC/Raspberry Pi idea as the main backend).

## Why this exists

NetGuardian's dashboard can be used by multiple organizations at once, each seeing only their own network's devices. But scanning a network requires actually being on it - there's no way to ping/discover devices on a network from somewhere else. So each organization runs their own copy of this Agent, which does the real scanning locally and just sends the results to the shared dashboard's API.

## Setup

1. **Get your agent token** - log into your NetGuardian dashboard, go to **Settings**, find the **Agent Token** section, and click **Generate**. Copy the token shown - it's only displayed once.

2. **Copy the config template:**
   ```
   cp .env.example .env
   ```

3. **Edit `.env`** and fill in:
   - `API_URL` - your NetGuardian backend's URL (e.g. `http://localhost:5000` for local testing, or your real deployed backend URL)
   - `AGENT_TOKEN` - the token from step 1
   - `NETWORK_RANGE` - your network's CIDR range, e.g. `192.168.1.0/24` (find yours with `ipconfig` on Windows)
   - `GATEWAY_IP` - optional, your router's IP, if you want gateway-down alerts

4. **Install dependencies:**
   ```
   npm install
   ```

5. **Run it:**
   ```
   npm start
   ```

You should see output like:
```
=== NetGuardian Agent ===
Reporting to: http://localhost:5000
Scanning: 192.168.1.0/24
Interval: every 60s

[Agent] Scanning 192.168.1.0/24...
[Agent] Found 12 device(s) in 4231ms
[Agent] Report sent: 3 new, 9 updated
```

## Keeping it running

Like the main backend, this needs to stay running continuously to keep reporting. For a real setup, use PM2:
```
npm install -g pm2
pm2 start agent.js --name netguardian-agent
pm2 startup
pm2 save
```

## Troubleshooting

- **"AGENT_TOKEN is not set"** - you haven't filled in `.env`, or forgot to copy `.env.example` to `.env`
- **"Invalid agent token"** - the token doesn't match what's in your organization's Settings. Regenerate a new one and update `.env`
- **"Report failed with status..."** - check that `API_URL` is correct and the NetGuardian backend is actually running/reachable from this machine
- **Found 0 devices** - confirm `NETWORK_RANGE` matches the network this machine is actually connected to (check with `ipconfig`/`ip a`)
