# Nginx Configuration

## SSL Certificate Setup

For HTTPS to work, you need to place your SSL certificates in the `nginx/ssl/` directory:

```
nginx/
├── ssl/
│   ├── fullchain.pem  (SSL certificate + intermediate certificates)
│   └── privkey.pem    (Private key)
├── nginx.conf
└── README.md
```

### Option 1: Let's Encrypt (Recommended)

If you're using Let's Encrypt (certbot), your certificates are typically located at:
```
/etc/letsencrypt/live/etsyauto.bigbotdrivers.com/fullchain.pem
/etc/letsencrypt/live/etsyauto.bigbotdrivers.com/privkey.pem
```

Copy them to the nginx/ssl directory:
```bash
sudo cp /etc/letsencrypt/live/etsyauto.bigbotdrivers.com/fullchain.pem ./nginx/ssl/
sudo cp /etc/letsencrypt/live/etsyauto.bigbotdrivers.com/privkey.pem ./nginx/ssl/
sudo chmod 644 ./nginx/ssl/fullchain.pem
sudo chmod 600 ./nginx/ssl/privkey.pem
```

### Option 2: Existing SSL Certificates

If you already have SSL certificates from another source, place them in `nginx/ssl/`:
- `fullchain.pem` - Your SSL certificate (may be named `certificate.crt` or similar)
- `privkey.pem` - Your private key (may be named `private.key` or similar)

### Security Note

⚠️ **IMPORTANT**: The `nginx/ssl/` directory is **git-ignored** for security. Never commit SSL certificates to version control!

## Configuration Details

- **Port 80 (HTTP)**: Automatically redirects to HTTPS
- **Port 443 (HTTPS)**: Main application server with SSL/TLS
- **SSL Protocols**: TLSv1.2 and TLSv1.3
- **HTTP/2**: Enabled for better performance

## Testing

After placing your certificates, test the nginx configuration:
```bash
docker compose -f docker-compose.prod.yml exec nginx nginx -t
```

Reload nginx if configuration is valid:
```bash
docker compose -f docker-compose.prod.yml restart nginx
```
