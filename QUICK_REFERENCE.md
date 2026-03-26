# Quick Reference - Production Commands

## 🚀 Deploy to Production
```bash
./deploy-to-production.sh
```

## 📊 Monitor Services
```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f worker
docker compose -f docker-compose.prod.yml logs -f web

# Check service status
docker compose -f docker-compose.prod.yml ps
```

## 🗄️ Database Operations
```bash
# Backup database
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U postgres etsy_platform > backup_$(date +%Y%m%d).sql

# Restore database
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres etsy_platform < backup_YYYYMMDD.sql

# Check migration status
docker compose -f docker-compose.prod.yml exec api alembic current

# Run migrations
docker compose -f docker-compose.prod.yml exec api alembic upgrade head

# View migration history
docker compose -f docker-compose.prod.yml exec api alembic history
```

## 🔄 Service Management
```bash
# Restart all services
docker compose -f docker-compose.prod.yml restart

# Restart specific service
docker compose -f docker-compose.prod.yml restart api

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Stop all services
docker compose -f docker-compose.prod.yml down

# Start all services
docker compose -f docker-compose.prod.yml up -d
```

## 🔍 Troubleshooting
```bash
# Check container health
docker compose -f docker-compose.prod.yml ps

# Enter container shell
docker compose -f docker-compose.prod.yml exec api bash
docker compose -f docker-compose.prod.yml exec web sh

# Check environment variables
docker compose -f docker-compose.prod.yml exec api env

# Check disk space
df -h

# Check Docker disk usage
docker system df
```

## 🔐 Git Operations
```bash
# Check current status
git status

# Pull latest changes
git pull origin main

# View recent commits
git log --oneline -10

# Rollback to specific commit
git reset --hard <COMMIT_HASH>
```

## 🧹 Cleanup
```bash
# Remove unused Docker images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove unused networks
docker network prune

# Remove everything unused
docker system prune -a --volumes
```

## 🆘 Emergency Reset
```bash
# Complete database reset (⚠️ DELETES ALL DATA)
docker compose -f docker-compose.prod.yml down
docker volume rm etsyauto_postgres_data
docker compose -f docker-compose.prod.yml up -d
sleep 10
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
docker compose -f docker-compose.prod.yml restart
```
