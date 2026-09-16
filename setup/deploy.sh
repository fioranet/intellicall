#!/bin/bash

# =============================================================================
# IntelliCall AI - Production Deployment Wizard (Ubuntu)
# =============================================================================
# This script handles Nginx, PM2, and SSL (Let's Encrypt) setup to make
# your IntelliCall AI platform live on the internet.
# Run with: sudo bash deploy.sh
# =============================================================================

# !!!!!! THIS SCRIPT IS USED BY THE WEB INSTALLER. THIS IS AUTOMATED SCRIPT. MAY NOT WORK WHEN MANUALLY RUN. !!!!!!

# Paths
PROJECT_ROOT="$(dirname "$0")/.."
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Disable xtrace
set +x

# UI Functions
print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_info() { echo -e "${CYAN}ℹ️  $1${NC}"; }
print_step() { echo -e "${BOLD}${BLUE}▶ $1${NC}"; }
print_box() {
    local title=$1
    echo -e "${CYAN}╭───────────────────────────────────────────────────────────╮${NC}"
    echo -e "${CYAN}│ ${BOLD}${YELLOW}$title${NC}${CYAN}$([[ ${#title} -lt 58 ]] && printf ' %.0s' $(seq 1 $((58 - ${#title}))))│${NC}"
    echo -e "${CYAN}├───────────────────────────────────────────────────────────┤${NC}"
}
print_box_footer() {
    echo -e "${CYAN}╰───────────────────────────────────────────────────────────╯${NC}"
}

# Check for root
if [ "$EUID" -ne 0 ]; then
  print_error "Please run this script with sudo (sudo bash deploy.sh)"
  exit 1
fi

print_header "Production Deployment Wizard"
print_info "DEBUG: Starting Production Deployment Wizard"
print_info "This script will install Nginx, PM2, and Let's Encrypt SSL."

# Start automated path if FE_DOMAIN is set
if [ -n "$FE_DOMAIN" ]; then
    echo "PROGRESS: Starting automated deployment sequence..."
    
    # Pre-fetch IP
    echo "PROGRESS: Discovering external IP..."
    IPV4_ADDR=$(timeout 5 curl -s4 ifconfig.me || timeout 5 curl -s4 ipapi.co/ip/ || echo "unknown")
    
    echo "PROGRESS: Step 1: Installing Nginx and Certbot..."
    apt-get update -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
    apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" nginx certbot python3-certbot-nginx
    
    if ! command -v pm2 &> /dev/null; then
        echo "PROGRESS: Installing PM2..."
        npm install -g pm2
    fi

    # Domain cleaning
    FE_DOMAIN=$(echo "$FE_DOMAIN" | sed -e 's|^[^/]*//||' -e 's|/$||')
    BE_DOMAIN=$(echo "${BE_DOMAIN:-$FE_DOMAIN}" | sed -e 's|^[^/]*//||' -e 's|/$||')

    echo "PROGRESS: Step 2: Configuring Nginx for $FE_DOMAIN and $BE_DOMAIN..."
    # Backend Nginx
    cat > /etc/nginx/sites-available/intellicall-api << EOF
server {
    listen 80;
    server_name $BE_DOMAIN;
    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

    # Frontend Nginx
    cat > /etc/nginx/sites-available/intellicall-ui << EOF
server {
    listen 80;
    server_name $FE_DOMAIN;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    ln -sf /etc/nginx/sites-available/intellicall-api /etc/nginx/sites-enabled/
    ln -sf /etc/nginx/sites-available/intellicall-ui /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl restart nginx
    
    echo "PROGRESS: Step 3a: Backend dependencies & Playwright (Knowledge Base — import from website)..."
    (cd "$BACKEND_DIR" && npm install) || echo "PROGRESS: Backend npm install failed — check logs"
    (cd "$BACKEND_DIR" && npx playwright install chromium) || echo "PROGRESS: Playwright Chromium skipped or failed; run: cd backend && npx playwright install chromium"

    echo "PROGRESS: Step 3b: Starting Backend with PM2..."
    cd "$BACKEND_DIR" && pm2 delete intellicall-api 2>/dev/null || true
    pm2 start server.js --name "intellicall-api"
    
    echo "PROGRESS: Step 4: Starting Frontend with PM2..."
    cd "$FRONTEND_DIR"
    if [ ! -d ".next" ]; then
        echo "PROGRESS: Building frontend..."
        npm run build
    fi
    pm2 delete intellicall-ui 2>/dev/null || true
    pm2 start npm --name "intellicall-ui" -- start
    pm2 save
    
    # SSL
    INSTALL_SSL="n"
    if [ "$INSTALL_SSL_ENV" = "true" ]; then INSTALL_SSL="y"; fi
    if [[ "$INSTALL_SSL" =~ ^[Yy]$ ]]; then
        echo "PROGRESS: Step 5: Installing SSL with Certbot..."
        certbot --nginx -d $FE_DOMAIN -d $BE_DOMAIN --non-interactive --agree-tos --register-unsafely-without-email
        
        # Update URLs to HTTPS
        sed -i "s|http://$BE_DOMAIN|https://$BE_DOMAIN|g" "$BACKEND_DIR/.env"
        sed -i "s|http://$FE_DOMAIN|https://$FE_DOMAIN|g" "$BACKEND_DIR/.env"
        sed -i "s|http://$BE_DOMAIN|https://$BE_DOMAIN|g" "$FRONTEND_DIR/.env.local"
        
        echo "PROGRESS: Rebuilding frontend for HTTPS..."
        cd "$FRONTEND_DIR" && npm run build
        pm2 restart all
    fi
    
    echo "PROGRESS: Deployment sequence finished."
    exit 0
fi

# 1. Install Dependencies
print_step "Installing Nginx and Certbot..."
apt-get update -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" nginx certbot python3-certbot-nginx

if ! command -v pm2 &> /dev/null; then
    print_step "Installing PM2 globally..."
    npm install -g pm2
fi

# 2. Get Domains
print_header "Domain Configuration"
if [ -n "$FE_DOMAIN" ]; then
    # FE_DOMAIN and BE_DOMAIN already set from env
    print_info "Using domains from environment: $FE_DOMAIN / $BE_DOMAIN"
else
    read -p "  Enter Frontend Domain (e.g., app.domain.com): " FE_DOMAIN
    read -p "  Enter Backend Domain  (e.g., api.domain.com): " BE_DOMAIN
fi

# Strip http:// or https:// and trailing slashes
FE_DOMAIN=$(echo "$FE_DOMAIN" | sed -e 's|^[^/]*//||' -e 's|/$||')
BE_DOMAIN=$(echo "$BE_DOMAIN" | sed -e 's|^[^/]*//||' -e 's|/$||')

if [[ -z "$FE_DOMAIN" || -z "$BE_DOMAIN" ]]; then
    print_error "Domains cannot be empty. Exiting."
    exit 1
fi

# 3. Nginx Configuration for Backend
print_step "Configuring Nginx for Backend ($BE_DOMAIN)..."
cat > /etc/nginx/sites-available/intellicall-api << EOF
server {
    listen 80;
    server_name $BE_DOMAIN;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

# 4. Nginx Configuration for Frontend
print_step "Configuring Nginx for Frontend ($FE_DOMAIN)..."
cat > /etc/nginx/sites-available/intellicall-ui << EOF
server {
    listen 80;
    server_name $FE_DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

# Enable sites
ln -sf /etc/nginx/sites-available/intellicall-api /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/intellicall-ui /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

print_step "Testing Nginx configuration..."
nginx -t && systemctl restart nginx

# 5. Application Startup with PM2
print_header "Process Management (PM2)"

# Backend
print_step "Installing backend dependencies & Playwright Chromium (Knowledge Base — import from website)..."
(cd "$BACKEND_DIR" && npm install) || print_warning "Backend npm install failed — continuing"
(cd "$BACKEND_DIR" && npx playwright install chromium) || print_warning "Playwright Chromium install failed or skipped. For KB import from website, run: cd backend && npx playwright install chromium"

print_step "Starting Backend API..."
cd "$BACKEND_DIR"
pm2 delete intellicall-api 2>/dev/null
pm2 start server.js --name "intellicall-api"

# Frontend
print_step "Starting Frontend Dashboard..."
cd "$FRONTEND_DIR"
# Ensure production build exists
if [ ! -d ".next" ]; then
    print_warning "Production build not found. Running npm run build..."
    npm run build
fi
pm2 delete intellicall-ui 2>/dev/null
pm2 start npm --name "intellicall-ui" -- start

# Save PM2 state
pm2 save
pm2 startup | grep "sudo" | bash

# Helper: Update or Add key in .env file
update_env_var() {
    local file=$1
    local key=$2
    local value=$3
    if [ ! -f "$file" ]; then
        echo "$key=$value" > "$file"
    else
        if grep -q "^$key=" "$file"; then
            sed -i "s#^$key=.*#$key=$value#" "$file"
        else
            echo "$key=$value" >> "$file"
        fi
    fi
}

# 6. SSL Configuration
print_header "SSL Setup (Let's Encrypt)"
print_warning "Ensure your domains are pointing to this server IP before continuing."

if [ -n "$FE_DOMAIN" ]; then
    INSTALL_SSL="n"
    if [ "$INSTALL_SSL_ENV" = "true" ]; then INSTALL_SSL="y"; fi
    print_info "Automated SSL mode: $INSTALL_SSL"
else
    read -p "  Do you want to install SSL certificates now? [y/N]: " INSTALL_SSL
fi

if [[ $INSTALL_SSL =~ ^[Yy]$ ]]; then
    print_step "Running Certbot..."
    certbot --nginx -d $FE_DOMAIN -d $BE_DOMAIN --non-interactive --agree-tos --register-unsafely-without-email
    
    # Update .env files with HTTPS
    print_step "Updating environment files with secure HTTPS URLs..."
    
    # Backend .env
    update_env_var "$BACKEND_DIR/.env" "BASE_URL" "https://$BE_DOMAIN"
    update_env_var "$BACKEND_DIR/.env" "CLIENT_URL" "https://$FE_DOMAIN"
    
    # Frontend .env.local
    update_env_var "$FRONTEND_DIR/.env.local" "NEXT_PUBLIC_API_URL" "https://$BE_DOMAIN/api"
    
    print_warning "Next.js requires a rebuild to apply new environment variables."
    print_step "Rebuilding frontend with HTTPS configuration..."
    (cd "$FRONTEND_DIR" && npm run build)
    
    print_info "Restarting apps to apply HTTPS changes..."
    pm2 restart all
fi

print_header "🚀 DEPLOYMENT SUCCESSFUL!"
echo -e "${GREEN}  Frontend URL: ${BOLD}https://$FE_DOMAIN${NC}"
echo -e "${GREEN}  Backend API:  ${BOLD}https://$BE_DOMAIN${NC}"
echo ""
print_info "Your platform is now LIVE and secured with SSL."
print_info "Use 'pm2 logs' to monitor your application."
print_info "DEBUG: Reached the end of deploy.sh"
exit 0
