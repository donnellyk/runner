# Droplet Provisioning

Steps to provision a new DigitalOcean droplet for web-runner.

## 1. Create the Droplet

- Image: Ubuntu 24.04
- Size: smallest available (1 vCPU / 1 GB)
- Region: NYC or nearest
- Authentication: SSH key
- Note the public IP

## 2. SSH Config (local machine)

Add to `~/.ssh/config`:

```
Host <name>
    HostName <droplet-ip>
    User root
```

## 3. Install Docker

```bash
ssh <name>

curl -fsSL https://get.docker.com | sh
```

Verify: `docker compose version`

## 4. Install Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
systemctl enable tailscaled
```

Authenticate via the link printed by `tailscale up`.

## 5. Clone the Repo

```bash
mkdir -p /opt/web-runner
cd /opt/web-runner
git clone https://github.com/donnellyk/runner.git .
```

Or if using GHCR images without building locally, you only need the compose file, Caddyfile, and `.env`.

## 6. Create `.env`

```bash
cat > /opt/web-runner/.env << 'EOF'
ORIGIN=https://<tailscale-hostname>.ts.net
STRAVA_REDIRECT_URI=https://<tailscale-hostname>.ts.net/auth/strava/callback
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_WEBHOOK_VERIFY_TOKEN=
EOF
```

Fill in the Strava credentials. The Tailscale hostname is shown by `tailscale status`.

## 7. Start Services

```bash
cd /opt/web-runner
docker compose up -d
```

## 8. Run Migrations

```bash
docker compose exec web node -e "import('./build/db/migrate.js')"
```

Or from local machine:

```bash
mise run deploy
# then SSH in and run migrations
```

## 9. Expose via Tailscale

```bash
tailscale serve --bg 3000
```

The app is now at `https://<tailscale-hostname>.ts.net`.

## 10. DigitalOcean Firewall

Create a cloud firewall and attach it to the droplet:

| Protocol | Port  | Source | Purpose             |
|----------|-------|--------|---------------------|
| TCP      | 22    | All    | SSH                 |
| TCP      | 80    | All    | HTTP (Caddy)        |
| UDP      | 41641 | All    | Tailscale WireGuard |

Do **not** open port 3000.

## 11. Register Strava Webhook

From local machine:

```bash
mise run webhook:subscribe
```

Callback URL: `http://<droplet-ip>/api/webhooks/strava`

## 12. Verify

```bash
# Webhook endpoint (should 200)
curl -i "http://<droplet-ip>/api/webhooks/strava?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test"

# Everything else blocked (should 403)
curl -i http://<droplet-ip>/

# Full app via Tailscale (from tailnet)
open https://<tailscale-hostname>.ts.net
```
