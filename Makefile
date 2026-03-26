.PHONY: help setup start stop restart logs clean test db-migrate db-reset

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: ## Initial project setup
	@echo "🔧 Setting up project..."
	cp .env.example .env
	@echo "✅ Created .env file"
	@echo "⚠️  Please edit .env with your configuration"
	@echo "💡 Run 'make keys' to generate JWT keys"

keys: ## Generate JWT RS256 keypair
	@echo "🔐 Generating JWT keys..."
	openssl genrsa -out private.pem 2048
	openssl rsa -in private.pem -pubout -out public.pem
	@echo "✅ Keys generated: private.pem, public.pem"
	@echo "💡 Add these to your .env file"

start: ## Start all services
	@echo "🚀 Starting all services..."
	docker compose up -d
	@echo "✅ Services started!"
	@echo "📊 Frontend: http://localhost:3000"
	@echo "🔌 API: http://localhost:8080"
	@echo "📚 API Docs: http://localhost:8080/docs"

stop: ## Stop all services
	@echo "🛑 Stopping services..."
	docker compose down

restart: ## Restart all services
	@echo "🔄 Restarting services..."
	docker compose restart

logs: ## View logs from all services
	docker compose logs -f

logs-api: ## View API logs only
	docker compose logs -f api

logs-worker: ## View worker logs only
	docker compose logs -f worker

logs-web: ## View frontend logs only
	docker compose logs -f web

clean: ## Stop and remove all containers, volumes, and networks
	@echo "🧹 Cleaning up..."
	docker compose down -v
	rm -rf apps/web/.next
	rm -rf apps/web/node_modules
	@echo "✅ Cleanup complete"

test: ## Run all tests
	@echo "🧪 Running tests..."
	cd apps/api && pytest
	cd apps/web && npm test

test-api: ## Run API tests only
	cd apps/api && pytest -v

test-web: ## Run frontend tests only
	cd apps/web && npm test

db-migrate: ## Run database migrations
	@echo "📦 Running migrations..."
	docker compose exec api alembic upgrade head

db-create-migration: ## Create new database migration (usage: make db-create-migration msg="your message")
	@echo "📝 Creating migration: $(msg)"
	docker compose exec api alembic revision -m "$(msg)"

db-reset: ## Reset database (WARNING: destroys all data)
	@echo "⚠️  WARNING: This will destroy all data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker compose down -v; \
		docker compose up -d db; \
		sleep 5; \
		docker compose exec api alembic upgrade head; \
		echo "✅ Database reset complete"; \
	fi

shell-api: ## Open shell in API container
	docker compose exec api bash

shell-worker: ## Open shell in worker container
	docker compose exec worker bash

shell-db: ## Open PostgreSQL shell
	docker compose exec db psql -U postgres -d etsy_platform

shell-redis: ## Open Redis CLI
	docker compose exec redis redis-cli

install-api: ## Install API dependencies
	cd apps/api && pip install -r requirements.txt

install-web: ## Install frontend dependencies
	cd apps/web && npm install

dev-api: ## Run API in development mode (outside Docker)
	cd apps/api && uvicorn main:app --reload --port 8080

dev-web: ## Run frontend in development mode (outside Docker)
	cd apps/web && npm run dev

dev-worker: ## Run Celery worker in development mode
	cd apps/worker && celery -A tasks worker --loglevel=info --reload

health: ## Check health of all services
	@echo "🏥 Checking service health..."
	@echo ""
	@echo "API:"
	@curl -s http://localhost:8080/healthz | jq . || echo "❌ API not responding"
	@echo ""
	@echo "Frontend:"
	@curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost:3000 || echo "❌ Frontend not responding"
	@echo ""
	@echo "Database:"
	@docker compose exec -T db pg_isready -U postgres && echo "✅ Database healthy" || echo "❌ Database not ready"
	@echo ""
	@echo "Redis:"
	@docker compose exec -T redis redis-cli ping && echo "✅ Redis healthy" || echo "❌ Redis not responding"

ps: ## Show status of all services
	docker compose ps

build: ## Build all Docker images
	docker compose build

rebuild: ## Rebuild and restart all services
	docker compose build
	docker compose up -d

init: setup keys build start ## Initialize project (setup + keys + build + start)
	@echo ""
	@echo "✅ Project initialized!"
	@echo "📊 Access the dashboard at: http://localhost:3000"
	@echo "🔌 API documentation at: http://localhost:8080/docs"
