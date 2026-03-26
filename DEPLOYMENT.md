# Production Deployment Guide

Complete guide for deploying Etsy Automation Platform to production.

## Prerequisites

- **VPS/Server**: 4GB RAM, 2 CPU cores minimum (8GB RAM recommended)
- **Domain**: Registered domain name with DNS access
- **SSL Certificate**: For HTTPS (via Let's Encrypt)
- **Docker**: v24+ with Docker Compose v2+
- **Git**: For cloning the repository

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│   Next.js   │────▶│   FastAPI   │
│  (Port 80)  │     │  (Port 3000)│     │  (Port 8080)│
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                    ┌──────────────────────────┴───────────┐
                    ▼                          ▼           ▼
              ┌──────────┐              ┌──────────┐  ┌──────────┐
              │PostgreSQL│              │  Redis   │  │  Celery  │
              │   (DB)   │              │  (Cache) │  │ Workers  │
              └──────────┘              └──────────┘  └──────────┘
```

---

## Deployment Options

### Option 1: VPS/Self-Hosted (Recommended)

Best for full control and data privacy.

**Supported Providers:**
- DigitalOcean
- Linode
- Vultr
- AWS EC2
- Hetzner
- Any VPS with Docker support

### Option 2: Docker Compose (This Guide)

Using the included `docker-compose.prod.yml` for production deployment.

---

## Step-by-Step Deployment

### 1. Server Setup (30 minutes)

#### 1.1 Initial Server Access

```bash
# SSH into your server
ssh root@YOUR_SERVER_IP

# Update system packages
apt update && apt upgrade -y

# Install required packages
apt install -y git curl ufw
```

#### 1.2 Create Deployment User

```bash
# Create deploy user
adduser deploy
usermod -aG sudo deploy
su - deploy
```

#### 1.3 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install -y docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

#### 1.4 Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

### 2. DNS Configuration (10 minutes)

In your domain registrar's DNS settings:

1. **Create A Record:**
   - Name: `@` or `etsyauto`
   - Type: A
   - Value: `YOUR_SERVER_IP`
   - TTL: 300 (5 minutes)

2. **Verify DNS propagation:**
   ```bash
   nslookup etsyauto.yourdomain.com
   ```

Wait 5-10 minutes for DNS to propagate globally.

---

### 3. Clone and Configure (15 minutes)

#### 3.1 Clone Repository

```bash
cd /home/deploy
git clone YOUR_REPO_URL etsy-automation-platform
cd etsy-automation-platform
```

#### 3.2 Create Environment File

```bash
cp .env.example .env
nano .env
```

**Required Environment Variables:**

```bash
# Database
DB_PASSWORD=YOUR_SECURE_PASSWORD_HERE

# JWT Keys (generate these)
JWT_PRIVATE_KEY=your_private_key
JWT_PUBLIC_KEY=your_public_key
NEXTAUTH_SECRET=your_nextauth_secret

# Application
NEXTAUTH_URL=https://etsyauto.yourdomain.com
NEXT_PUBLIC_API_URL=https://etsyauto.yourdomain.com

# Etsy API
ETSY_CLIENT_ID=your_etsy_client_id
ETSY_CLIENT_SECRET=your_etsy_client_secret
ETSY_REDIRECT_URI=https://etsyauto.yourdomain.com/oauth/etsy/callback

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://etsyauto.yourdomain.com/api/auth/callback/google

# Email (Resend recommended)
RESEND_API_KEY=re_...
USE_RESEND=true

# Security
ENCRYPTION_KEY=your_32_byte_base64_key
```

#### 3.3 Generate Secrets

```bash
# Generate JWT keys
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Copy keys to .env (or set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY)

# Generate encryption key
openssl rand -base64 32

# Generate NextAuth secret
openssl rand -base64 32
```

---

### 4. Nginx Configuration (15 minutes)

#### 4.1 Create Nginx Config

```bash
sudo nano /etc/nginx/sites-available/etsyauto
```

**Configuration:**

```nginx
server {
    listen 80;
    server_name etsyauto.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeouts for long-running requests
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
```

#### 4.2 Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/etsyauto /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

### 5. SSL Certificate (10 minutes)

#### 5.1 Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

#### 5.2 Obtain Certificate

```bash
sudo certbot --nginx -d etsyauto.yourdomain.com
```

Follow the prompts. Certbot will automatically configure HTTPS.

#### 5.3 Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot automatically sets up a cron job for renewal
```

---

### 6. Deploy Application (10 minutes)

#### 6.1 Build and Start

```bash
cd /home/deploy/etsy-automation-platform

# Build images
docker compose -f docker-compose.prod.yml build

# Start services
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps
```

#### 6.2 Run Database Migrations

```bash
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

#### 6.3 Verify Services

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs -f

# Test API
curl http://localhost:8080/healthz

# Test Web
curl http://localhost:3000
```

---

## Post-Deployment

### Health Checks

```bash
# Check all services
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs api
docker compose -f docker-compose.prod.yml logs web
docker compose -f docker-compose.prod.yml logs worker
docker compose -f docker-compose.prod.yml logs nginx

# Test endpoints
curl https://etsyauto.yourdomain.com/healthz
```

### Monitoring

1. **Prometheus**: http://YOUR_DOMAIN:9090 (if exposed)
2. **Grafana**: http://YOUR_DOMAIN:3001 (if exposed)
3. **Logs**: `docker compose -f docker-compose.prod.yml logs -f`

### Backup Strategy

```bash
# Backup database
docker compose -f docker-compose.prod.yml exec db pg_dump -U postgres etsy_platform > backup_$(date +%Y%m%d).sql

# Backup environment
cp .env .env.backup

# Backup nginx config
sudo cp /etc/nginx/sites-available/etsyauto nginx_backup.conf
```

---

## Maintenance

### Updating the Application

```bash
cd /home/deploy/etsy-automation-platform

# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# Run migrations
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

### Scaling Workers

Edit `docker-compose.prod.yml`:

```yaml
worker:
  ...
  deploy:
    replicas: 4  # Scale to 4 workers
```

Then:

```bash
docker compose -f docker-compose.prod.yml up -d --scale worker=4
```

---

## Troubleshooting

### 502 Bad Gateway

**Check backend services:**
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs api
docker compose -f docker-compose.prod.yml logs web
```

**Check nginx:**
```bash
sudo nginx -t
sudo systemctl status nginx
sudo journalctl -u nginx -n 50
```

### Database Connection Issues

```bash
# Check database
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d etsy_platform -c "\dt"

# Restart database
docker compose -f docker-compose.prod.yml restart db

# Check database logs
docker compose -f docker-compose.prod.yml logs db
```

### SSL Certificate Issues

```bash
# Check certificate status
sudo certbot certificates

# Renew certificate
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

### Out of Memory

```bash
# Check memory usage
free -h
docker stats

# Restart services
docker compose -f docker-compose.prod.yml restart
```

### View All Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs --tail 100

# Specific service
docker compose -f docker-compose.prod.yml logs api --tail 100 -f
```

---

## Security Checklist

- [ ] Firewall configured (UFW)
- [ ] SSH key-based authentication
- [ ] Strong database password
- [ ] SSL certificate installed
- [ ] Environment variables secured
- [ ] Encryption key set
- [ ] Regular backups configured
- [ ] Monitoring enabled
- [ ] Rate limiting configured
- [ ] CORS origins restricted

---

## Performance Optimization

### Enable Redis Caching

Already enabled in `docker-compose.prod.yml`.

### Database Tuning

Edit PostgreSQL settings:

```bash
docker compose -f docker-compose.prod.yml exec db psql -U postgres
```

```sql
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '512MB';
ALTER SYSTEM SET effective_cache_size = '2GB';
```

### CDN for Static Assets

Use Cloudflare or AWS CloudFront for:
- Images
- CSS/JS bundles
- Static files

---

## Cost Estimate

**Monthly costs (approximate):**

| Service | Cost |
|---------|------|
| VPS (4GB RAM) | $20-40 |
| Domain | $10-15/year |
| SSL | $0 (Let's Encrypt) |
| Resend Email | $0-20 (usage-based) |
| **Total** | **$30-60/month** |

---

## Support

**Deployment issues?**
1. Check logs: `docker compose -f docker-compose.prod.yml logs`
2. Verify environment variables
3. Check firewall and DNS settings
4. Review nginx configuration

---

## Quick Reference Commands

```bash
# Start services
docker compose -f docker-compose.prod.yml up -d

# Stop services
docker compose -f docker-compose.prod.yml down

# Restart services
docker compose -f docker-compose.prod.yml restart

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Update application
git pull && docker compose -f docker-compose.prod.yml up -d --build

# Database backup
docker compose -f docker-compose.prod.yml exec db pg_dump -U postgres etsy_platform > backup.sql

# Run migrations
docker compose -f docker-compose.prod.yml exec api alembic upgrade head

# Health check
curl https://YOUR_DOMAIN/healthz
```

---

**Deployment complete! Your Etsy Automation Platform is now live at `https://etsyauto.yourdomain.com`** 🚀
