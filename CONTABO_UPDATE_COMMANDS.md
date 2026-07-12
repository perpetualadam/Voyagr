# Contabo Production Deployment

**Production host:** Contabo VPS (`/opt/voyagr`)  
**CI:** GitHub Actions runs tests on every push to `main` — it does **not** deploy to Contabo.  
**After merge:** SSH to Contabo and pull + restart (below).

---

## Quick deploy

```bash
cd /opt/voyagr
sudo bash deploy/deploy-pull.sh
```

`deploy-pull.sh` fetches `main`, fixes permissions, and restarts the `voyagr` systemd service.

### Manual alternative

```bash
cd /opt/voyagr
git pull origin main
sudo systemctl restart voyagr
sudo systemctl status voyagr
journalctl -u voyagr -n 50 --no-pager
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/api/app-settings
```

---

## Verify the deploy

```bash
git log --oneline -1
# e.g. 0b58820 Fix UK lane guidance defaulting to right on 2-lane Valhalla routes

systemctl status voyagr
# expect: active (running)
```

**Frontend changes:** hard-refresh the browser (Ctrl+F5) so new `?v=` cache-bust query strings load.

---

## First-time / full server setup

- `deploy/setup-contabo.sh` — initial VPS setup (nginx, venv, systemd)
- `deploy/setup-valhalla-contabo.sh` — Valhalla routing on the same host
- `CONTABO_VALHALLA_SETUP.md` — Valhalla details

---

## Troubleshooting

### Service won't start

```bash
journalctl -u voyagr -n 100 --no-pager
netstat -tulpn | grep 5000
cd /opt/voyagr && python3 voyagr_web.py   # Ctrl+C then restart service
```

### Git pull fails (local changes)

```bash
git status
git stash
git pull origin main
```

### Changes not visible in browser

- Hard refresh (Ctrl+F5)
- Confirm `templates/index.html` script `?v=` versions changed in the pulled commit
- `sudo systemctl restart voyagr`

---

## Service quick reference

```bash
sudo systemctl restart voyagr
sudo systemctl status voyagr
journalctl -u voyagr -f
```
