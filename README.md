# 🎯 Etsy Automation Platform

**AI-powered, policy-compliant automation exclusively for Etsy sellers**

> **Note**: This platform is built specifically for Etsy. It focuses on Etsy's unique requirements, policies, and API capabilities to provide the best experience for Etsy shop owners.

## 🚀 Quick Start

```bash
# Clone and setup
git clone <repo-url>
cd etsy-automation-platform
cp .env.example .env

# Start all services
docker compose up -d

# Access
# Frontend: http://localhost:3000
# API: http://localhost:8080
# API Docs: http://localhost:8080/docs
```

## 📦 Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Next.js   │─────▶│   FastAPI   │─────▶│  PostgreSQL │
│  Dashboard  │      │     API     │      │   Database  │
└─────────────┘      └─────────────┘      └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │   Celery    │
                     │   Workers   │
                     └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │    Redis    │
                     │   Broker    │
                     └─────────────┘
```

## 🛠 Tech Stack

- **Frontend**: Next.js 14, Tailwind CSS, Auth.js
- **Backend**: FastAPI (Python 3.11), Pydantic v2
- **Database**: PostgreSQL 16
- **Queue**: Celery + Redis 7
- **Auth**: JWT (RS256), OAuth 2.0 (Etsy)
- **Monitoring**: Prometheus + Grafana + Sentry

## 📁 Project Structure

```
apps/
  web/          Next.js frontend
  api/          FastAPI backend
  worker/       Celery workers
packages/
  shared/       Shared types & utils
docs/           Documentation
```

## 🎯 Core Features (MVP v1)

✅ **Etsy-Focused Dashboard** - Multi-tenant with RBAC  
✅ **Product Management** - CSV/JSON ingestion for Etsy listings  
✅ **AI Content Generation** - Etsy-optimized titles, descriptions, and tags  
✅ **Policy Compliance** - Automatic Etsy policy checker  
✅ **Smart Publishing** - Rate-limited Etsy API integration  
✅ **Automated Scheduling** - Queue management for Etsy listings  
✅ **Order Sync** - Etsy orders with manual tracking
✅ **Usage Tracking** - Cost tracking & comprehensive audit logs  

## 🔐 Security

- JWT tokens (5min TTL, RS256)
- Encrypted OAuth tokens (AES-GCM)
- RBAC: Owner/Admin/Creator/Viewer
- Audit logs for all actions
- Data minimization (GDPR-friendly)

## 📊 Monitoring

- Health: `/healthz`
- Metrics: `/metrics` (Prometheus)
- Logs: Structured JSON
- Alerts: SLO-based thresholds

## 🧪 Testing

```bash
# Backend tests
cd apps/api
pytest

# Frontend tests
cd apps/web
npm test

# E2E tests
npm run test:e2e
```

## 📝 License

Proprietary - All rights reserved

## 🤝 Contributing

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md)

---

## 🎨 Why Etsy-Only?

This platform is **exclusively designed for Etsy** because:

- **Etsy-Specific Policies**: Built-in compliance with Etsy's unique marketplace rules
- **Optimized API Usage**: Tailored to Etsy's rate limits and API patterns
- **Etsy SEO**: AI trained on Etsy's search algorithm and best practices
- **Community Focus**: Features designed for handmade, vintage, and craft sellers
- **Deep Integration**: Leverages Etsy's full API capabilities without compromise

---

## 🎉 Production Status

**Status**: Production-Ready ✅  
**Version**: 1.0.0  
**Last Updated**: January 28, 2026

This codebase has undergone comprehensive production hardening:
- ✅ All debug code removed
- ✅ Database queries optimized  
- ✅ Security hardened
- ✅ Documentation consolidated
- ✅ Ready for deployment

See [PRODUCTION_READY.md](PRODUCTION_READY.md) for complete details.

---

**Built with ❤️ for Etsy creators**
