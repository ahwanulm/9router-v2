# Deployment Guide — Linux / Armbian Server

Panduan lengkap deploy **9Router v2** ke server Linux (Armbian, Debian, Ubuntu).  
Mencakup systemd service, Nginx reverse proxy, Cloudflare Tunnel, dan Python automation.

---

## Daftar Isi

- [Prasyarat](#prasyarat)
- [Struktur Direktori](#struktur-direktori)
- [1. Clone & Build](#1-clone--build)
- [2. Node.js Module Symlinks](#2-nodejs-module-symlinks)
- [3. Python Virtual Environment](#3-python-virtual-environment)
- [4. Systemd Service](#4-systemd-service)
- [5. Nginx Reverse Proxy](#5-nginx-reverse-proxy)
- [6. Cloudflare Tunnel](#6-cloudflare-tunnel)
- [7. Database](#7-database)
- [8. Update / Redeploy](#8-update--redeploy)
- [Troubleshooting](#troubleshooting)

---

## Prasyarat

| Kebutuhan | Versi |
|-----------|-------|
| Node.js   | ≥ 22.5.0 |
| npm       | ≥ 10 |
| Python    | ≥ 3.10 |
| Nginx     | ≥ 1.18 |
| sshpass   | opsional (remote deploy) |

Disarankan install di **disk HDD/SSD terpisah** (misal `/mnt/hdd`) agar tidak membebani system storage.

---

## Struktur Direktori

```
/mnt/hdd/
├── AMRouter/              ← root project
│   ├── backend/
│   │   ├── dist/            ← compiled JS (output tsc)
│   │   ├── open-sse/        ← JS handlers (path alias via symlink)
│   │   └── .venv/           ← Python virtual environment
│   ├── frontend/
│   │   └── dist/            ← compiled frontend (output vite build)
│   └── node_modules/        ← npm workspaces (includes symlinks)
│       ├── open-sse -> ../backend/open-sse
│       └── @/
│           └── lib -> ../../backend/dist/lib
└── .amrouter/             ← data directory (DB, backups)
    └── db/
        └── data.sqlite
```

> **Penting**: `/root/.amrouter` → symlink ke `/mnt/hdd/.amrouter`

---

## 1. Clone & Build

### Clone repo

```bash
cd /mnt/hdd
git clone <REPO_URL> AMRouter
cd AMRouter
```

### Install npm dependencies

```bash
npm install
```

### Build backend (TypeScript → JS)

```bash
cd backend
npm run build
# Output: backend/dist/
```

### Build frontend (Vite)

```bash
cd ../frontend
npm run build
# Output: frontend/dist/
```

---

## 2. Node.js Module Symlinks

Beberapa import path alias perlu symlink agar Node.js bisa resolve saat runtime.  
**Tanpa ini, `/v1/models` dan route lain akan gagal mount dan merespons `{"error":"Not found"}`.**

### `open-sse` (workspace package)

```bash
# Dari root project
mkdir -p node_modules
ln -sf ../backend/open-sse node_modules/open-sse
```

### `@/lib` (TypeScript path alias → dist/lib)

```bash
mkdir -p node_modules/@
ln -sf ../../backend/dist/lib node_modules/@/lib
```

Verifikasi:
```bash
ls -la node_modules/open-sse    # → ../backend/open-sse
ls -la node_modules/@/lib       # → ../../backend/dist/lib
```

---

## 3. Python Virtual Environment

Backend menggunakan Python untuk automation (signup akun, scraping token, dll).

### Buat venv di HDD

```bash
python3 -m venv /mnt/hdd/AMRouter/backend/.venv
```

### Install camoufox + GeoIP

```bash
/mnt/hdd/AMRouter/backend/.venv/bin/pip install 'camoufox[geoip]'
```

Paket yang ter-install:
- `camoufox` — stealth browser automation
- `geoip2` / `maxminddb` — GeoIP lookup
- `playwright`, `browserforge` — browser driver
- `aiohttp`, `requests` — HTTP clients

### Fetch camoufox browser binary (opsional, untuk automation signup)

```bash
/mnt/hdd/AMRouter/backend/.venv/bin/python3 -m camoufox fetch
```

### Verifikasi

```bash
/mnt/hdd/AMRouter/backend/.venv/bin/python3 -c 'import camoufox; print("camoufox OK")'
```

> **Catatan**: Backend mencari venv di `<WorkingDirectory>/.venv/bin/python`.  
> Pastikan `WorkingDirectory` di systemd service = `/mnt/hdd/AMRouter/backend`.

---

## 4. Systemd Service

### Buat file service

```bash
cat > /etc/systemd/system/amrouter.service << 'EOF'
[Unit]
Description=9Router v2 Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/mnt/hdd/AMRouter/backend
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3011

[Install]
WantedBy=multi-user.target
EOF
```

> **Port**: Gunakan port yang tidak konflik dengan service lain.  
> Jika ada service lain di port 3001 (misal amcloud), gunakan 3011, 3012, dst.

### Aktifkan & jalankan

```bash
systemctl daemon-reload
systemctl enable amrouter
systemctl start amrouter
systemctl status amrouter
```

### Cek logs

```bash
journalctl -u amrouter -f
```

---

## 5. Nginx Reverse Proxy

### Buat konfigurasi site

```bash
cat > /etc/nginx/sites-available/api.yourdomain.com << 'EOF'
server {
    listen 80;
    server_name api.yourdomain.com;

    # Frontend statis
    root /mnt/hdd/AMRouter/frontend/dist;
    index index.html;

    # Semua request ke /api, /v1, /v1beta -> backend
    location ~ ^/(api|v1|v1beta)(/|$) {
        proxy_pass http://127.0.0.1:3011;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
```

### Aktifkan site

```bash
ln -sf /etc/nginx/sites-available/api.yourdomain.com \
        /etc/nginx/sites-enabled/
nginx -t && nginx -s reload
```

---

## 6. Cloudflare Tunnel

> Pastikan `cloudflared` sudah terinstall dan tunnel sudah dibuat.

### Konfigurasi tunnel

File: `/etc/cloudflared/config.yml`

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /root/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: api.yourdomain.com
    service: http://127.0.0.1:80   # ke Nginx, bukan langsung backend
  - hostname: cloud.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
```

> **Penting**: Arahkan ke Nginx (port 80), bukan langsung ke backend.  
> Biarkan Nginx yang handle routing `/api` vs static files.

### Restart cloudflared

```bash
systemctl restart cloudflared
```

### Verifikasi

```bash
journalctl -u cloudflared --lines 20 | grep -E 'Registered|ERR'
```

---

## 7. Database

Database SQLite disimpan di data directory terpisah dari code agar tidak terhapus saat update.

### Lokasi default

```
/root/.amrouter/db/data.sqlite
```

### Pindah ke HDD (disarankan untuk server dengan system storage terbatas)

```bash
# Stop backend dulu
systemctl stop amrouter

# Copy ke HDD
mkdir -p /mnt/hdd/.amrouter
cp -a /root/.amrouter/. /mnt/hdd/.amrouter/

# Hapus original, buat symlink
rm -rf /root/.amrouter
ln -sf /mnt/hdd/.amrouter /root/.amrouter

# Start kembali
systemctl start amrouter
```

### Migrasi DB dari mesin lain

```bash
# Di mesin sumber (lokal)
scp ~/.amrouter/db/data.sqlite \
    root@<SERVER_IP>:/root/.amrouter/db/data.sqlite

# Di server — restart agar DB ter-load
systemctl restart amrouter
```

---

## 8. Update / Redeploy

### Update code dari git

```bash
cd /mnt/hdd/AMRouter
git pull
```

### Rebuild backend

```bash
cd backend
npm run build
systemctl restart amrouter
```

### Rebuild frontend

```bash
cd /mnt/hdd/AMRouter/frontend
npm run build
```

Atau dari mesin lokal (build lokal lalu sync):
```bash
# Di lokal
cd frontend && npm run build

# Sync ke server
rsync -az --delete dist/ \
    root@<SERVER_IP>:/mnt/hdd/AMRouter/frontend/dist/
```

### Re-create symlinks (setelah fresh clone atau update node_modules)

```bash
cd /mnt/hdd/AMRouter

# open-sse symlink
mkdir -p node_modules
ln -sf ../backend/open-sse node_modules/open-sse

# @/lib symlink
mkdir -p node_modules/@
ln -sf ../../backend/dist/lib node_modules/@/lib
```

---

## Troubleshooting

### Backend tidak jalan

```bash
journalctl -u amrouter --lines 50
```

**`ERR_MODULE_NOT_FOUND: Cannot find package 'open-sse'`**

```bash
ln -sf ../backend/open-sse /mnt/hdd/AMRouter/node_modules/open-sse
systemctl restart amrouter
```

**`ERR_MODULE_NOT_FOUND: Cannot find package '@/lib'`**

```bash
mkdir -p /mnt/hdd/AMRouter/node_modules/@
ln -sf ../../backend/dist/lib /mnt/hdd/AMRouter/node_modules/@/lib
systemctl restart amrouter
```

**Port konflik**

```bash
ss -tlnp | grep :3011
# Ganti PORT di service file
nano /etc/systemd/system/amrouter.service
systemctl daemon-reload && systemctl restart amrouter
```

---

### `/v1/models` mengembalikan `{"error":"Not found"}`

1. Cek symlinks ada:
   ```bash
   ls -la /mnt/hdd/AMRouter/node_modules/open-sse
   ls -la /mnt/hdd/AMRouter/node_modules/@/lib
   ```
2. Cek route mount log:
   ```bash
   journalctl -u amrouter | grep 'Failed to import\|Mounted'
   ```

---

### Cloudflare Tunnel 502

```bash
# Cek config yang dipakai cloudflared
systemctl cat cloudflared | grep config
cat /etc/cloudflared/config.yml | grep -A2 'api\.'

# Pastikan service arah ke port 80, bukan langsung 3011
```

---

### Camoufox: "package not installed in python environment"

```bash
# Install di venv yang benar
/mnt/hdd/AMRouter/backend/.venv/bin/pip install 'camoufox[geoip]'

# Verifikasi
/mnt/hdd/AMRouter/backend/.venv/bin/python3 -c 'import camoufox; print("OK")'
```

Pastikan `WorkingDirectory` di systemd = `/mnt/hdd/AMRouter/backend`  
karena backend spawn Python via: `path.resolve(process.cwd(), ".venv/bin/python")`

---

### Database kosong / 0 models setelah deploy

```bash
# Cek file DB ada
ls -lh /root/.amrouter/db/data.sqlite

# Cek isi DB
sqlite3 /root/.amrouter/db/data.sqlite \
  "SELECT provider, COUNT(*) FROM providerConnections GROUP BY provider;"

# Restart agar DB ter-load ulang
systemctl restart amrouter
```

---

## Referensi Cepat

```bash
# Status semua service
systemctl status amrouter cloudflared nginx

# Restart semua
systemctl restart amrouter && nginx -s reload

# Tail logs backend
journalctl -u amrouter -f

# Test endpoint lokal
curl http://127.0.0.1:3011/v1/models | python3 -m json.tool

# Test endpoint publik
curl https://api.yourdomain.com/v1/models | python3 -m json.tool

# Disk usage
df -h / /mnt/hdd
du -sh /mnt/hdd/AMRouter/
```
