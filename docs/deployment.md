# Deployment Guide

## Architecture

```
Public Internet                    Tailscale
    |                                  |
    v                                  v
 Caddy (:80)                   tailscale serve
    | only /api/webhooks/*         localhost:3000
    v                                  |
 web:3000 (Docker network) <-----------+
```

- **Caddy**: HTTP on port 80, only proxies `/api/webhooks/strava*`, returns 403 for everything else
- **Tailscale**: `tailscale serve` exposes `localhost:3000` as `https://carthage.panda-boa.ts.net` with automatic HTTPS
- **Port 3000**: bound to `127.0.0.1` only — not publicly accessible

## One-Time Setup

### 1. Install Tailscale on the Droplet - DONE

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

Enable the systemd service so Tailscale starts on boot:

```bash
systemctl enable tailscaled
```

Expose the web app over Tailscale:

```bash
tailscale serve --bg 3000
```

The `--bg` flag makes the serve configuration persistent — it survives both Tailscale restarts and system reboots.

After this, the app is available at `https://carthage.panda-boa.ts.net`.

### 2. DigitalOcean Firewall DONE

Create or update the cloud firewall with these inbound rules:

| Protocol | Port  | Source | Purpose                    |
|----------|-------|--------|----------------------------|
| TCP      | 22    | All    | SSH                        |
| TCP      | 80    | All    | HTTP (Caddy)               |
| UDP      | 41641 | All    | Tailscale WireGuard        |

Port 3000 is **not** open publicly — it's only accessible via localhost (Tailscale serve) or Docker network (Caddy).

### 3. Production Environment Variables DONE

Set these in the droplet's `/opt/web-runner/.env`:

```bash
# Tailscale URL for the web app
ORIGIN=https://carthage.panda-boa.ts.net

# Strava OAuth callback must use the Tailscale URL
STRAVA_REDIRECT_URI=https://carthage.panda-boa.ts.net/auth/strava/callback

# Strava API credentials
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_WEBHOOK_VERIFY_TOKEN=...
```

### 4. Strava Webhook Registration

Register the Strava webhook subscription using the droplet's public IP:

```bash
mise run webhook:delete   # remove old subscription if needed
mise run webhook:subscribe
```

The webhook callback URL should be `http://<droplet-ip>/api/webhooks/strava`.

Note: Strava sends webhooks over HTTP as well as HTTPS, so a plain IP on port 80 works.

## Deploy

```bash
mise run deploy
```

This runs:
```bash
ssh carthage 'cd /opt/web-runner && docker compose pull && docker compose up -d'
```

## Verification

### Public endpoint (webhook only)

```bash
# Should return 200 (webhook verification)
curl -i "http://<droplet-ip>/api/webhooks/strava?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"

# Should return 403 (everything else blocked)
curl -i http://<droplet-ip>/
curl -i http://<droplet-ip>/auth/strava
```

### Tailscale (full app access)

Open `https://carthage.panda-boa.ts.net` in a browser while connected to your tailnet. The full web UI should load.

### Bull Board

Accessible at `http://localhost:3001` on the droplet (via SSH tunnel):

```bash
ssh -L 3001:localhost:3001 carthage
# Then open http://localhost:3001 in your browser
```
