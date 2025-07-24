#!/bin/bash

# Hotel TV Management System - Management Utility
# This script provides various management and monitoring functions

set -euo pipefail

# Configuration
SCRIPT_VERSION="1.0.0"
APP_DIR="/var/www/hotel-tv-management"
LOG_DIR="./deployment-logs"
BACKUP_DIR="./backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] [WARN] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1${NC}"
}

success() {
    echo -e "${CYAN}[$(date +'%Y-%m-%d %H:%M:%S')] [SUCCESS] $1${NC}"
}

# Check system status
check_status() {
    log "Checking Hotel TV Management System status..."
    echo ""
    
    # Check services
    local services=(
        "postgresql:PostgreSQL Database"
        "redis-server:Redis Cache"
        "nginx:Web Server"
    )
    
    echo "System Services:"
    echo "================"
    for service_info in "${services[@]}"; do
        local service="${service_info%%:*}"
        local description="${service_info##*:}"
        
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            success "$description: Running"
        else
            error "$description: Stopped"
        fi
    done
    
    echo ""
    echo "Application Processes:"
    echo "====================="
    
    # Check PM2 processes
    if command -v pm2 >/dev/null 2>&1; then
        if pm2 list | grep -q "hotel-tv-backend"; then
            success "Hotel TV Backend: Running"
            pm2 list | grep hotel-tv-backend
        else
            error "Hotel TV Backend: Not running"
        fi
    else
        warn "PM2 not installed"
    fi
    
    echo ""
    echo "Health Checks:"
    echo "=============="
    
    # Check HTTP endpoints
    local endpoints=(
        "http://localhost/health:Nginx Health"
        "http://localhost:3000/api/health:Backend API Health"
        "http://localhost/api/health:Proxied API Health"
    )
    
    for endpoint_info in "${endpoints[@]}"; do
        local endpoint="${endpoint_info%%:*}"
        local description="${endpoint_info##*:}"
        
        if curl -s -f "$endpoint" >/dev/null 2>&1; then
            success "$description: OK"
        else
            error "$description: Failed"
        fi
    done
    
    echo ""
    echo "System Resources:"
    echo "================="
    
    # Memory usage
    local memory_info=$(free -h | awk '/^Mem:/ {printf "Used: %s / %s (%.1f%%)", $3, $2, ($3/$2)*100}')
    info "Memory: $memory_info"
    
    # Disk usage
    local disk_info=$(df -h / | awk '/\// {printf "Used: %s / %s (%s)", $3, $2, $5}')
    info "Disk: $disk_info"
    
    # Load average
    local load_avg=$(uptime | awk -F'load average:' '{print $2}')
    info "Load Average:$load_avg"
    
    echo ""
}

# Show logs
show_logs() {
    local log_type=${1:-""}
    local lines=${2:-50}
    
    case $log_type in
        "app"|"application")
            if [[ -f "$APP_DIR/logs/combined.log" ]]; then
                log "Showing last $lines lines of application logs:"
                tail -n $lines "$APP_DIR/logs/combined.log"
            else
                error "Application log file not found"
            fi
            ;;
        "error"|"errors")
            if [[ -f "$APP_DIR/logs/error.log" ]]; then
                log "Showing last $lines lines of error logs:"
                tail -n $lines "$APP_DIR/logs/error.log"
            else
                error "Error log file not found"
            fi
            ;;
        "nginx")
            if [[ -f "/var/log/nginx/hotel-tv-error.log" ]]; then
                log "Showing last $lines lines of Nginx error logs:"
                sudo tail -n $lines /var/log/nginx/hotel-tv-error.log
            else
                error "Nginx error log file not found"
            fi
            ;;
        "nginx-access")
            if [[ -f "/var/log/nginx/hotel-tv-access.log" ]]; then
                log "Showing last $lines lines of Nginx access logs:"
                sudo tail -n $lines /var/log/nginx/hotel-tv-access.log
            else
                error "Nginx access log file not found"
            fi
            ;;
        "pm2")
            if command -v pm2 >/dev/null 2>&1; then
                log "Showing PM2 logs:"
                pm2 logs --lines $lines
            else
                error "PM2 not installed"
            fi
            ;;
        "deployment")
            if ls "$LOG_DIR"/deployment_*.log >/dev/null 2>&1; then
                local latest_log=$(ls -t "$LOG_DIR"/deployment_*.log | head -1)
                log "Showing last $lines lines of latest deployment log:"
                tail -n $lines "$latest_log"
            else
                error "No deployment logs found"
            fi
            ;;
        "")
            echo "Available log types:"
            echo "  app, application  - Application logs"
            echo "  error, errors     - Error logs"
            echo "  nginx            - Nginx error logs"
            echo "  nginx-access     - Nginx access logs"
            echo "  pm2              - PM2 process logs"
            echo "  deployment       - Deployment logs"
            echo ""
            echo "Usage: $0 logs [TYPE] [LINES]"
            echo "Example: $0 logs app 100"
            ;;
        *)
            error "Unknown log type: $log_type"
            echo "Run '$0 logs' to see available types"
            ;;
    esac
}

# Restart services
restart_services() {
    local service=${1:-"all"}
    
    case $service in
        "app"|"application")
            log "Restarting application..."
            if command -v pm2 >/dev/null 2>&1; then
                pm2 restart hotel-tv-backend
                success "Application restarted"
            else
                error "PM2 not available"
            fi
            ;;
        "nginx")
            log "Restarting Nginx..."
            sudo systemctl restart nginx
            success "Nginx restarted"
            ;;
        "redis")
            log "Restarting Redis..."
            sudo systemctl restart redis-server
            success "Redis restarted"
            ;;
        "postgresql")
            log "Restarting PostgreSQL..."
            sudo systemctl restart postgresql
            success "PostgreSQL restarted"
            ;;
        "all")
            log "Restarting all services..."
            
            # Restart in order
            if systemctl is-active --quiet postgresql; then
                sudo systemctl restart postgresql
                success "PostgreSQL restarted"
            fi
            
            if systemctl is-active --quiet redis-server; then
                sudo systemctl restart redis-server
                success "Redis restarted"
            fi
            
            if command -v pm2 >/dev/null 2>&1; then
                pm2 restart hotel-tv-backend
                success "Application restarted"
            fi
            
            if systemctl is-active --quiet nginx; then
                sudo systemctl restart nginx
                success "Nginx restarted"
            fi
            
            success "All services restarted"
            ;;
        *)
            error "Unknown service: $service"
            echo "Available services: app, nginx, redis, postgresql, all"
            ;;
    esac
}

# Show system information
show_info() {
    log "Hotel TV Management System Information"
    echo ""
    
    echo "System Information:"
    echo "=================="
    info "Hostname: $(hostname)"
    info "OS: $(lsb_release -d 2>/dev/null | cut -f2 || uname -s)"
    info "Kernel: $(uname -r)"
    info "Architecture: $(uname -m)"
    info "Uptime: $(uptime -p 2>/dev/null || uptime)"
    
    echo ""
    echo "Application Information:"
    echo "======================="
    if [[ -f "$APP_DIR/package.json" ]]; then
        local app_version=$(grep '"version"' "$APP_DIR/package.json" | cut -d'"' -f4)
        info "Application Version: $app_version"
    fi
    
    if [[ -f "$APP_DIR/backend/.env" ]]; then
        local deployment_date=$(grep "DEPLOYMENT_DATE" "$APP_DIR/backend/.env" | cut -d'=' -f2)
        local deployment_version=$(grep "DEPLOYMENT_VERSION" "$APP_DIR/backend/.env" | cut -d'=' -f2)
        if [[ -n "$deployment_date" ]]; then
            info "Deployment Date: $deployment_date"
        fi
        if [[ -n "$deployment_version" ]]; then
            info "Deployment Version: $deployment_version"
        fi
    fi
    
    info "Installation Directory: $APP_DIR"
    
    echo ""
    echo "Network Information:"
    echo "==================="
    local server_ip=$(hostname -I | awk '{print $1}')
    info "Server IP: $server_ip"
    info "Web Interface: http://$server_ip"
    info "API Endpoint: http://$server_ip/api"
    info "Health Check: http://$server_ip/health"
    
    echo ""
    echo "Storage Information:"
    echo "==================="
    if [[ -d "$APP_DIR" ]]; then
        local app_size=$(du -sh "$APP_DIR" 2>/dev/null | cut -f1)
        info "Application Size: $app_size"
    fi
    
    if [[ -d "$APP_DIR/logs" ]]; then
        local log_size=$(du -sh "$APP_DIR/logs" 2>/dev/null | cut -f1)
        info "Log Directory Size: $log_size"
    fi
    
    if [[ -d "$BACKUP_DIR" ]]; then
        local backup_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
        local backup_count=$(find "$BACKUP_DIR" -type d -name "pre_deployment_*" | wc -l)
        info "Backup Size: $backup_size ($backup_count backups)"
    fi
    
    echo ""
}

# Database operations
database_operations() {
    local operation=${1:-""}
    
    case $operation in
        "backup")
            log "Creating database backup..."
            local backup_file="manual_db_backup_$(date +%Y%m%d_%H%M%S).sql"
            
            if sudo -u postgres pg_dump hotel_tv_management > "$backup_file"; then
                success "Database backup created: $backup_file"
            else
                error "Database backup failed"
            fi
            ;;
        "status")
            log "Database status:"
            echo ""
            
            if systemctl is-active --quiet postgresql; then
                success "PostgreSQL service is running"
                
                # Connection test
                if sudo -u postgres psql -c '\l' >/dev/null 2>&1; then
                    success "Database connection successful"
                    
                    # Database size
                    local db_size=$(sudo -u postgres psql -d hotel_tv_management -c "SELECT pg_size_pretty(pg_database_size('hotel_tv_management'));" -t | xargs)
                    info "Database size: $db_size"
                    
                    # Table count
                    local table_count=$(sudo -u postgres psql -d hotel_tv_management -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" -t | xargs)
                    info "Number of tables: $table_count"
                    
                else
                    error "Cannot connect to database"
                fi
            else
                error "PostgreSQL service is not running"
            fi
            ;;
        "")
            echo "Database operations:"
            echo "  backup  - Create manual database backup"
            echo "  status  - Show database status"
            echo ""
            echo "Usage: $0 database [OPERATION]"
            ;;
        *)
            error "Unknown database operation: $operation"
            ;;
    esac
}

# Performance monitoring
show_performance() {
    log "System Performance Monitoring"
    echo ""
    
    # CPU usage
    echo "CPU Usage:"
    echo "=========="
    if command -v top >/dev/null 2>&1; then
        top -bn1 | head -20
    fi
    
    echo ""
    echo "Memory Usage:"
    echo "============"
    free -h
    
    echo ""
    echo "Disk Usage:"
    echo "==========="
    df -h
    
    echo ""
    echo "Network Connections:"
    echo "==================="
    ss -tuln | grep -E ':(80|443|3000|5432|6379)'
    
    echo ""
    echo "Process Information:"
    echo "==================="
    if command -v pm2 >/dev/null 2>&1; then
        pm2 monit
    fi
}

# Maintenance operations
maintenance_mode() {
    local action=${1:-""}
    local maintenance_file="/tmp/hotel-tv-maintenance"
    
    case $action in
        "enable")
            touch "$maintenance_file"
            log "Maintenance mode enabled"
            
            # Optional: Stop application
            read -p "Stop application services? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                restart_services app
            fi
            ;;
        "disable")
            rm -f "$maintenance_file"
            log "Maintenance mode disabled"
            
            # Restart services
            restart_services all
            ;;
        "status")
            if [[ -f "$maintenance_file" ]]; then
                warn "System is in maintenance mode"
            else
                success "System is in normal operation mode"
            fi
            ;;
        *)
            echo "Maintenance operations:"
            echo "  enable  - Enable maintenance mode"
            echo "  disable - Disable maintenance mode"
            echo "  status  - Check maintenance status"
            ;;
    esac
}

# Show help
show_help() {
    echo "Hotel TV Management System - Management Utility v$SCRIPT_VERSION"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  status              Show system status"
    echo "  logs [TYPE] [LINES] Show logs (app, error, nginx, pm2, deployment)"
    echo "  restart [SERVICE]   Restart services (app, nginx, redis, postgresql, all)"
    echo "  info                Show system information"
    echo "  database [OP]       Database operations (backup, status)"
    echo "  performance         Show performance monitoring"
    echo "  maintenance [OP]    Maintenance mode (enable, disable, status)"
    echo "  help                Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 status                    # Show system status"
    echo "  $0 logs app 100             # Show last 100 app log lines"
    echo "  $0 restart nginx            # Restart Nginx"
    echo "  $0 database backup          # Create database backup"
    echo "  $0 maintenance enable       # Enable maintenance mode"
    echo ""
}

# Main script logic
case "${1:-}" in
    "status")
        check_status
        ;;
    "logs")
        show_logs "${2:-}" "${3:-50}"
        ;;
    "restart")
        restart_services "${2:-all}"
        ;;
    "info")
        show_info
        ;;
    "database")
        database_operations "${2:-}"
        ;;
    "performance")
        show_performance
        ;;
    "maintenance")
        maintenance_mode "${2:-}"
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    "")
        echo "Hotel TV Management System - Management Utility v$SCRIPT_VERSION"
        echo ""
        warn "No command specified"
        echo ""
        show_help
        ;;
    *)
        error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
