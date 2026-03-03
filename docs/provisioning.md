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

## 5. Create Project Directory

```bash
mkdir -p /opt/web-runner
```

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

## 7. Deploy

From your local machine:

```bash
mise run deploy
```

This rsyncs config files to the server and starts all services. Migrations run automatically on web container startup.

## 8. Expose via Tailscale

```bash
tailscale serve --bg 3000
```

The app is now at `https://<tailscale-hostname>.ts.net`.

## 9. DigitalOcean Firewall

Create a cloud firewall and attach it to the droplet:

| Protocol | Port  | Source | Purpose             |
|----------|-------|--------|---------------------|
| TCP      | 22    | All    | SSH                 |
| TCP      | 80    | All    | HTTP (Caddy)        |
| UDP      | 41641 | All    | Tailscale WireGuard |

Do **not** open port 3000.

## 10. Register Strava Webhook

From local machine:

```bash
mise run webhook:subscribe
```

Callback URL: `http://<droplet-ip>/api/webhooks/strava`

## 11. Verify

```bash
# Webhook endpoint (should 200)
curl -i "http://<droplet-ip>/api/webhooks/strava?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test"

# Everything else blocked (should 403)
curl -i http://<droplet-ip>/

# Full app via Tailscale (from tailnet)
open https://<tailscale-hostname>.ts.net
```
