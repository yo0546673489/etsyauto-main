#!/bin/bash
set -e

echo "🚀 Starting Production Deployment..."
echo "=================================="

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_info() { echo -e "ℹ $1"; }

# Function to check if services are healthy
check_health() {
    print_info "Checking service health..."
    
    # Check API health
    if curl -f http://localhost:8080/healthz > /dev/null 2>&1; then
        print_success "API is healthy"
    else
        print_error "API health check failed"
        return 1
    fi
    
    # Check Web health
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        print_success "Web is healthy"
    else
        print_error "Web health check failed"
        return 1
    fi
    
    return 0
}

# Function to backup database
backup_database() {
    print_info "Creating database backup..."
    mkdir -p $BACKUP_DIR
    
    docker compose -f $COMPOSE_FILE exec -T db pg_dump -U postgres etsy_platform > "$BACKUP_DIR/db_backup_$TIMESTAMP.sql"
    
    if [ $? -eq 0 ]; then
        print_success "Database backup created: $BACKUP_DIR/db_backup_$TIMESTAMP.sql"
        return 0
    else
        print_error "Database backup failed"
        return 1
    fi
}

# Function to restore database from backup
restore_database() {
    local backup_file=$1
    print_warning "Restoring database from backup: $backup_file"
    
    docker compose -f $COMPOSE_FILE exec -T db psql -U postgres etsy_platform < "$backup_file"
    
    if [ $? -eq 0 ]; then
        print_success "Database restored successfully"
        return 0
    else
        print_error "Database restore failed"
        return 1
    fi
}

# Main deployment workflow
main() {
    # Step 1: Pre-deployment checks
    print_info "Step 1: Pre-deployment checks"
    if [ ! -f ".env" ]; then
        print_error ".env file not found!"
        exit 1
    fi
    print_success "Pre-deployment checks passed"
    echo ""
    
    # Step 2: Backup database
    print_info "Step 2: Database backup"
    if ! backup_database; then
        print_error "Backup failed. Aborting deployment."
        exit 1
    fi
    echo ""
    
    # Step 3: Pull latest code
    print_info "Step 3: Pulling latest code from GitHub"
    git fetch origin main
    CURRENT_COMMIT=$(git rev-parse HEAD)
    git pull origin main
    NEW_COMMIT=$(git rev-parse HEAD)
    
    if [ "$CURRENT_COMMIT" == "$NEW_COMMIT" ]; then
        print_warning "No new commits. Already up to date."
    else
        print_success "Code updated: $CURRENT_COMMIT -> $NEW_COMMIT"
    fi
    echo ""
    
    # Step 4: Build and restart services
    print_info "Step 4: Building and restarting services"
    docker compose -f $COMPOSE_FILE build
    docker compose -f $COMPOSE_FILE up -d
    print_success "Services restarted"
    echo ""
    
    # Step 5: Run database migrations
    print_info "Step 5: Running database migrations"
    sleep 5  # Wait for services to be ready
    
    # Check current migration state
    docker compose -f $COMPOSE_FILE exec api alembic current
    
    # Run migrations
    if docker compose -f $COMPOSE_FILE exec api alembic upgrade head; then
        print_success "Migrations completed successfully"
    else
        print_error "Migration failed!"
        print_warning "Rolling back to previous state..."
        
        # Restore database
        restore_database "$BACKUP_DIR/db_backup_$TIMESTAMP.sql"
        
        # Rollback code
        git reset --hard $CURRENT_COMMIT
        docker compose -f $COMPOSE_FILE up -d --build
        
        print_error "Deployment failed and rolled back"
        exit 1
    fi
    echo ""
    
    # Step 6: Health checks
    print_info "Step 6: Running health checks (waiting 10s for services to stabilize)"
    sleep 10
    
    if check_health; then
        print_success "All health checks passed"
    else
        print_error "Health checks failed!"
        print_warning "Services may need manual intervention"
        exit 1
    fi
    echo ""
    
    # Step 7: Cleanup old backups (keep last 5)
    print_info "Step 7: Cleaning up old backups (keeping last 5)"
    cd $BACKUP_DIR
    ls -t db_backup_*.sql | tail -n +6 | xargs -r rm
    cd ..
    print_success "Cleanup complete"
    echo ""
    
    # Deployment complete
    echo "=================================="
    print_success "🎉 Deployment completed successfully!"
    echo "=================================="
    echo ""
    print_info "Deployment Summary:"
    echo "  • Commit: $NEW_COMMIT"
    echo "  • Backup: $BACKUP_DIR/db_backup_$TIMESTAMP.sql"
    echo "  • Timestamp: $(date)"
    echo ""
    print_info "View logs: docker compose -f $COMPOSE_FILE logs -f"
}

# Run main function
main
