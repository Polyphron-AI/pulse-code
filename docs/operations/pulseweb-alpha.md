# Pulse Code web alpha

Moved on 2026-09-09 from Salt production to shared development, `102.202.192.80`, accessed with `ssh pulse` as `quinton`.

The hosted web client now runs in its own Docker container, `pulse-code-web-alpha`. It serves static frontend files; users connect their own Pulse Code environments. No agent runtime, cloud history database, or per-user cloud environment was moved or created.

## Installed resources

- Compose directory: `/opt/pulse-code-web-alpha`.
- Static release: `/opt/pulse-code-web-alpha/releases/alpha-20260909-00164ddd1bb9`.
- Container image: `nginx@sha256:72ba65eb42c10344912a84ff42408db7d34f2feb642204570ab8fc5ffd29f1d3`.
- Container listener: `8080`, published only at `127.0.0.1:8088`.
- Container runs as `101:101`, read-only, with all capabilities dropped, no new privileges, a 128 MiB memory limit, 0.5 CPU limit, and bounded logs.
- Host nginx site: `/etc/nginx/sites-available/pulseweb`, enabled through its matching symlink.
- Request route: `pulseweb.polyphronai.com` → host nginx → loopback `8088` → container nginx.
- ACME webroot: `/var/www/pulseweb/acme`.
- Docker Engine 29.1.3 and Compose 2.40.3 were installed from the configured Ubuntu repositories. Other application services were not restarted.

Deployment configuration lives in `deploy/pulseweb/compose.yaml`, `container-nginx.conf`, and `nginx.conf`.

## Artifact provenance

The original alpha was built from a working tree containing uncommitted changes. This move preserved the installed build byte-for-byte rather than rebuilding a different source revision. The deployment configuration branch is separate from that frontend build.

- Files: 501, about 60 MB uncompressed.
- Index SHA-256: `00164ddd1bb95f5eb80cacd2f7d8544838025ab10cdd07fa0e5844718c860107`.
- Transfer archive SHA-256: `dcbac37967cb0a4ee48d92c0276fb4494f48eb52ee5bfd12e5803caadcaa7e15`.
- Per-file manifest: `/opt/pulse-code-web-alpha/source-sha256.txt`.

## Verification performed

- Transfer archive checksum and all 501 extracted file checksums matched.
- All 501 files also matched when fetched through the new host nginx route.
- `/`, `/pair`, and `/settings` returned HTTP 200 and the expected SPA index hash.
- A missing asset returned 404.
- Compose and container nginx configuration validation passed.
- Host nginx validation passed, with its pre-existing overlapping TLS-listen warnings for ThusaMSP.
- Container health and restart recovery passed.
- Existing Pulse API/worker, ThusaMSP, PostgreSQL, Redis, MinIO, nginx and Docker remained active.
- The current existing application domains `pulse.polyphronai.com`, `pulse-minio.polyphronai.com`, and `thusa-dev.polyphronai.com` returned 200. The older `pulse-dev` hostname is absent from current nginx configuration and returned Cloudflare 525; it is not the current Pulse route.
- Salt fetched the expected alpha index from the development IP before its old site was disabled. Salt web, worker, nginx, PostgreSQL and Redis remained active afterward.
- The public site loaded in a real browser with the expected environment
  connection screen and no failed network requests.
- No end-to-end environment pairing check was performed.

## Public DNS and HTTPS

Cloudflare proxies the `pulseweb` A record to `102.202.192.80`. Certbot installed
a dedicated Let's Encrypt certificate for `pulseweb.polyphronai.com`, added the
HTTPS listener and HTTP redirect, and configured automatic renewal. Public HTTPS
checks returned 200 for `/` and `/pair`.

For a direct origin check that bypasses Cloudflare, use:

```sh
curl --resolve pulseweb.polyphronai.com:80:102.202.192.80 http://pulseweb.polyphronai.com/
```

## Operations and rollback

On shared development:

```sh
cd /opt/pulse-code-web-alpha
sudo docker compose ps
sudo docker compose logs --tail 50
sudo docker compose up -d --wait
```

Salt's `/etc/nginx/sites-enabled/pulseweb` symlink was removed and nginx reloaded. Its site configuration, `/var/www/pulseweb/current`, and original release remain intact for rollback. A migration marker is at `/var/www/pulseweb/moved-to-development-20260909.json`.

To roll back, verify Salt's retained index hash and certificate, restore the exact nginx symlink, run `nginx -t`, reload nginx, and verify the old host route. Change DNS back to Salt only after that check. Then disable the development site's matching symlink, validate and reload nginx, and stop `pulse-code-web-alpha` with Compose. Never remove shared Docker networking or restart unrelated application services as part of rollback.
