#!/bin/bash

# Hotel TV Management System - Rollback Script
# This script rolls back to a previous deployment

set -euo pipefail

# Configuration
SCRIPT_VERSION="1.0.0"
BACKUP_DIR="./backups"
LOG_DIR="./deployment-logs"
ROLLBACK_LOG="$LOG_DIR/rollback_$(date +%Y%m%d_%H%M%S).log"
APP_DIR="/var/www/hotel-tv-management"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Create logs directory
mkdir -p "$LOG_DIR"

# Redirect all output to log file while also displaying on screen
exec > >(tee -a "$ROLLBACK_LOG")
exec 2> >(tee -a "$ROLLBACK_LOG" >&2)

# Logging functions
log() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[$timestamp] [INFO] $1${NC}"
}

warn() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}[$timestamp] [WARN] $1${NC}"
}

error() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${RED}[$timestamp] [ERROR] $1${NC}"
}

info() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[$timestamp] [INFO] $1${NC}"
}

success() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${CYAN}[$timestamp] [SUCCESS] $1${NC}"
}

# List available backups
list_backups() {
    log "Available backups:"
    echo ""
    
    if [[ ! -d "$BACKUP_DIR" ]]; then
        error "No backup directory found at $BACKUP_DIR"
        return 1
    fi
    
    local backups=($(ls -1 "$BACKUP_DIR" | grep "pre_deployment_" | sort -r))
    
    if [[ ${#backups[@]} -eq 0 ]]; then
        error "No backups found in $BACKUP_DIR"
        return 1
    fi
    
    local count=1
    for backup in "${backups[@]}"; do
        local backup_path="$BACKUP_DIR/$backup"
        if [[ -f "$backup_path/deployment_info.txt" ]]; then
            local backup_date=$(head -1 "$backup_path/deployment_info.txt" | cut -d': ' -f2- | xargs)
            local deployment_id=$(echo "$backup" | sed 's/pre_deployment_//')
            printf "%2d. %s (%s)\n" $count "$deployment_id" "$backup_date"
        else
            printf "%2d. %s (No info available)\n" $count "$backup"
        fi
        ((count++))
    done
    echo ""
    
    return 0
}

# Get backup info
get_backup_info() {
    local deployment_id=$1
    local backup_path="$BACKUP_DIR/pre_deployment_$deployment_id"
    
    if [[ ! -d "$backup_path" ]]; then
        error "Backup not found: $backup_path"
        return 1
    fi
    
    echo ""
    info "Backup Information:"
    info "==================="
    
    if [[ -f "$backup_path/deployment_info.txt" ]]; then
        while IFS= read -r line; do
            info "$line"
        done < "$backup_path/deployment_info.txt"
    else
        warn "No deployment info available"
    fi
    
    # Show backup contents
    echo ""
    info "Backup Contents:"
    info "================"
    
    if [[ -d "$backup_path/hotel-tv-management" ]]; then
        local app_size=$(du -sh "$backup_path/hotel-tv-management" 2>/dev/null | cut -f1)
        info "Application backup: $app_size"
    fi
    
    if [[ -f "$backup_path/database_backup.sql" ]]; then
        local db_size=$(du -sh "$backup_path/database_backup.sql" 2>/dev/null | cut -f1)
        info "Database backup: $db_size"
    fi
    
    echo ""
}

# Stop current services
stop_services() {
    log "Stopping current services..."
    
    # Stop PM2 processes
    if command -v pm2 >/dev/null 2>&1; then
        pm2 stop all 2>/dev/null || true
        pm2 delete all 2>/dev/null || true
        success "PM2 processes stopped"
    fi
    
    # Stop Nginx
    if systemctl is-active --quiet nginx 2>/dev/null; then
        sudo systemctl stop nginx
        success "Nginx stopped"
    fi
    
    success "Services stopped"
}

# Create pre-rollback backup
create_pre_rollback_backup() {
    log "Creating pre-rollback backup..."
    
    local rollback_backup_dir="$BACKUP_DIR/pre_rollback_$(date +%Y%m%d_%H%M%S)"
    
    if [[ -d "$APP_DIR" ]]; then
        sudo mkdir -p "$rollback_backup_dir"
        sudo cp -r "$APP_DIR" "$rollback_backup_dir/" 2>/dev/null || true
        
        # Backup current database
        if command -v pg_dump >/dev/null 2>&1; then
            sudo -u postgres pg_dump hotel_tv_management > "$rollback_backup_dir/database_backup.sql" 2>/dev/null || true
        fi
        
        # Store rollback info
        cat > "$rollback_backup_dir/rollback_info.txt" << EOF
Pre-Rollback Backup
Created: $(date)
Original App Directory: $APP_DIR
Rollback Script Version: $SCRIPT_VERSION
Created by: $(whoami)
EOF
        
        success "Pre-rollback backup created at $rollback_backup_dir"
    else
        warn "No current installation found to backup"
    fi
}

# Restore application files
restore_application() {
    local deployment_id=$1
    local backup_path="$BACKUP_DIR/pre_deployment_$deployment_id"
    
    log "Restoring application files..."
    
    if [[ ! -d "$backup_path/hotel-tv-management" ]]; then
        error "Application backup not found in $backup_path"
        return 1
    fi
    
    # Remove current installation
    if [[ -d "$APP_DIR" ]]; then
        sudo rm -rf "$APP_DIR"
    fi
    
    # Restore from backup
    sudo cp -r "$backup_path/hotel-tv-management" "$APP_DIR"
    sudo chown -R $USER:$USER "$APP_DIR"
    
    success "Application files restored"
}

# Restore database
restore_database() {
    local deployment_id=$1
    local backup_path="$BACKUP_DIR/pre_deployment_$deployment_id"
    
    if [[ ! -f "$backup_path/database_backup.sql" ]]; then
        warn "No database backup found, skipping database restore"
        return 0
    fi
    
    log "Restoring database..."
    
    # Check if PostgreSQL is running
    if ! systemctl is-active --quiet postgresql; then
        error "PostgreSQL is not running"
        return 1
    fi
    
    # Drop and recreate database
    sudo -u postgres psql << EOF
DROP DATABASE IF EXISTS hotel_tv_management;
CREATE DATABASE hotel_tv_management WITH OWNER hotel_tv_user;
\q
EOF
    
    # Restore database
    sudo -u postgres psql hotel_tv_management < "$backup_path/database_backup.sql" || {
        error "Database restore failed"
        return 1
    }
    
    success "Database restored"
}

# Start services
start_services() {
    log "Starting services..."
    
    # Start Nginx
    if systemctl is-enabled --quiet nginx 2>/dev/null; then
        sudo systemctl start nginx
        if systemctl is-active --quiet nginx; then
            success "Nginx started"
        else
            error "Failed to start Nginx"
        fi
    fi
    
    # Start application with PM2
    if [[ -f "$APP_DIR/ecosystem.config.js" ]]; then
        cd "$APP_DIR"
        pm2 start ecosystem.config.js
        pm2 save
        success "Application started with PM2"
    else
        warn "No PM2 configuration found, application not started"
    fi
    
    success "Services started"
}

# Verify rollback
verify_rollback() {
    log "Verifying rollback..."
    
    local verification_failed=false
    
    # Check if application directory exists
    if [[ -d "$APP_DIR" ]]; then
        success "Application directory exists"
    else
        error "Application directory not found"
        verification_failed=true
    fi
    
    # Check services
    local services=(
        "postgresql:PostgreSQL database"
        "nginx:Web server"
    )
    
    for service_info in "${services[@]}"; do
        local service="${service_info%%:*}"
        local description="${service_info##*:}"
        
        if systemctl is-active --quiet "$service"; then
            success "$description is running"
        else
            error "$description is not running"
            verification_failed=true
        fi
    done
    
    # Check PM2 processes
    if pm2 list | grep -q "hotel-tv-backend"; then
        success "Application process is running"
    else
        error "Application process is not running"
        verification_failed=true
    fi
    
    # Check HTTP endpoints
    sleep 5  # Wait for services to be ready
    
    if curl -s -f http://localhost/health >/dev/null 2>&1; then
        success "Web server health check passed"
    else
        error "Web server health check failed"
        verification_failed=true
    fi
    
    if curl -s -f http://localhost:3000/api/health >/dev/null 2>&1; then
        success "Application health check passed"
    else
        error "Application health check failed"
        verification_failed=true
    fi
    
    if [[ "$verification_failed" == "true" ]]; then
        error "Rollback verification failed"
        return 1
    else
        success "Rollback verification passed"
        return 0
    fi
}

# Main rollback function
perform_rollback() {
    local deployment_id=$1
    
    echo ""
    log "Starting rollback to deployment: $deployment_id"
    echo ""
    
    # Get and display backup info
    get_backup_info "$deployment_id"
    
    # Confirm rollback
    echo ""
    warn "This will rollback your current installation!"
    warn "Current data will be backed up before rollback."
    echo ""
    read -p "Continue with rollback? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Rollback cancelled"
        exit 0
    fi
    
    log "Starting rollback process..."
    
    # Create pre-rollback backup
    create_pre_rollback_backup
    
    # Stop current services
    stop_services
    
    # Restore application and database
    restore_application "$deployment_id"
    restore_database "$deployment_id"
    
    # Start services
    start_services
    
    # Verify rollback
    if verify_rollback; then
        success "Rollback verification passed"
    else
        error "Rollback verification failed - check logs for details"
        exit 1
    fi
    
    echo ""
    echo "================================================================"
    success "🎉 Rollback Completed Successfully!"
    echo "================================================================"
    echo ""
    info "System has been rolled back to deployment: $deployment_id"
    info "Pre-rollback backup created in: $BACKUP_DIR/pre_rollback_*"
    info "Rollback log: $ROLLBACK_LOG"
    echo ""
    info "System should now be accessible at:"
    info "  🌐 Web interface: http://$(hostname -I | awk '{print $1}')"
    echo ""
    success "Rollback completed successfully! 🚀"
    echo ""
}

# Show help
show_help() {
    echo "Hotel TV Management System - Rollback Script v$SCRIPT_VERSION"
    echo ""
    echo "Usage: $0 [DEPLOYMENT_ID|COMMAND]"
    echo ""
    echo "Commands:"
    echo "  --list, -l     List available backups"
    echo "  --info ID      Show backup information"
    echo "  --help, -h     Show this help message"
    echo ""
    echo "Arguments:"
    echo "  DEPLOYMENT_ID  Deployment ID to rollback to (format: YYYYMMDD_HHMMSS)"
    echo ""
    echo "Examples:"
    echo "  $0 --list                    # List available backups"
    echo "  $0 --info 20240724_143022    # Show backup info"
    echo "  $0 20240724_143022           # Rollback to specific deployment"
    echo ""
    echo "Notes:"
    echo "  - Rollback creates a backup of current state before proceeding"
    echo "  - Database will be restored if backup includes database dump"
    echo "  - All services will be restarted after rollback"
    echo ""
}

# Main script logic
case "${1:-}" in
    --list|-l)
        echo "Hotel TV Management System - Rollback Script v$SCRIPT_VERSION"
        echo ""
        list_backups
        ;;
    --info)
        if [[ -z "${2:-}" ]]; then
            error "Please provide a deployment ID"
            echo "Usage: $0 --info DEPLOYMENT_ID"
            exit 1
        fi
        echo "Hotel TV Management System - Rollback Script v$SCRIPT_VERSION"
        get_backup_info "$2"
        ;;
    --help|-h)
        show_help
        ;;
    "")
        echo "Hotel TV Management System - Rollback Script v$SCRIPT_VERSION"
        echo ""
        warn "No deployment ID provided"
        echo ""
        list_backups
        echo ""
        info "Usage: $0 DEPLOYMENT_ID"
        info "Example: $0 20240724_143022"
        ;;
    *)
        local deployment_id="$1"
        
        # Validate deployment ID format
        if [[ ! "$deployment_id" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
            error "Invalid deployment ID format: $deployment_id"
            error "Expected format: YYYYMMDD_HHMMSS (e.g., 20240724_143022)"
            exit 1
        fi
        
        # Check if backup exists
        if [[ ! -d "$BACKUP_DIR/pre_deployment_$deployment_id" ]]; then
            error "Backup not found for deployment ID: $deployment_id"
            echo ""
            info "Available backups:"
            list_backups
            exit 1
        fi
        
        perform_rollback "$deployment_id"
        ;;
esac
