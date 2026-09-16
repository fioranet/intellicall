#!/bin/bash

# =============================================================================
# IntelliCall AI - Ubuntu VPS Auto-Installer & Manager
# =============================================================================
# This script performs a complete installation of IntelliCall AI on a
# fresh Ubuntu VPS, including Node.js, MongoDB, and Asterisk.
# Run with: sudo bash setup.sh
# =============================================================================

# !!!!!! THIS SCRIPT IS USED BY THE WEB INSTALLER. THIS IS AUTOMATED SCRIPT. MAY NOT WORK WHEN MANUALLY RUN. !!!!!!

# Paths
PROJECT_ROOT="$(dirname "$0")/.."
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Disable xtrace to keep logs clean, use manual progress instead
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

# Helper: Backup file
backup_file() {
    if [ -f "$1" ]; then
        local backup_path="$1.bak.$(date +%Y%m%d_%H%M%S)"
        cp "$1" "$backup_path"
        print_info "Backup created: $(basename "$backup_path")"
    fi
}

# Helper: Get input with default
get_input() {
    local prompt=$1
    local default=$2
    local result
    read -p "  $prompt [$default]: " result
    echo "${result:-$default}"
}

# Helper: Get secret input (no echo)
get_secret() {
    local prompt=$1
    local result
    read -s -r -p "  $prompt: " result
    echo "" >&2 
    printf "%s" "$result"
}

# Helper: Update or Add key in .env file
update_env_var() {
    local file=$1
    local key=$2
    local value=$3

    if [ ! -f "$file" ]; then
        echo "$key=$value" > "$file"
    else
        if grep -q "^$key=" "$file"; then
            sed "s|^$key=.*|$key=$value|" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
        else
            echo "$key=$value" >> "$file"
        fi
    fi
}

# -----------------------------------------------------------------------------
# STEP 0: VPS ENGINE INSTALLATION (UBUNTU ONLY)
# -----------------------------------------------------------------------------
vps_engine_install() {
    print_header "System Dependency Installation"
    
    # Check for root
    if [ "$EUID" -ne 0 ]; then
      print_error "Please run this script with sudo (sudo bash setup.sh)"
      exit 1
    fi

    print_step "Updating system packages..."
    apt-get update -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
    apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
    apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" curl wget git build-essential software-properties-common lsb-release

    # Install Node.js
    if ! command -v node &> /dev/null; then
        print_step "Installing Node.js v20..."
        curl -fsSL --connect-timeout 10 --max-time 60 https://deb.nodesource.com/setup_20.x -o /tmp/node_setup.sh
        bash /tmp/node_setup.sh < /dev/null
        apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" nodejs
        rm -f /tmp/node_setup.sh
    fi

    # Install MongoDB (Official Repository)
    if ! command -v mongod &> /dev/null; then
        print_step "Installing MongoDB (Official Repo)..."
        
        # Get Ubuntu version
        UBUNTU_CODENAME=$(lsb_release -sc)
        
        # Install gnupg and curl
        apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" gnupg curl

        # Import MongoDB public GPG key
        curl -fsSL --connect-timeout 10 --max-time 60 https://www.mongodb.org/static/pgp/server-7.0.asc | \
           gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg --yes

        # Create list file for MongoDB
        if [[ "$UBUNTU_CODENAME" == "jammy" ]]; then # 22.04
            echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
        elif [[ "$UBUNTU_CODENAME" == "focal" ]]; then # 20.04
            echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
        elif [[ "$UBUNTU_CODENAME" == "noble" ]]; then # 24.04
            echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
        else
            # Default to Jammy for unknown/newer versions (usually compatible)
            echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
        fi

        apt-get update -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
        apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" mongodb-org
        
        systemctl enable mongod
        systemctl start mongod
    fi

    # Install Asterisk
    if ! command -v asterisk &> /dev/null; then
        print_step "Installing Asterisk PBX..."
        apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" asterisk
        systemctl enable asterisk
        systemctl start asterisk
    fi

    # Configure ARI Credentials
    print_step "Configuring Asterisk ARI..."
    local ARI_USER="intellicall"
    local ARI_PASS=$(openssl rand -base64 12 | tr -d '/+' | cut -c1-16)

    # Backup and write ari.conf
    [ -f /etc/asterisk/ari.conf ] && cp /etc/asterisk/ari.conf /etc/asterisk/ari.conf.bak
    cat > /etc/asterisk/ari.conf << EOF
[general]
enabled = yes
pretty = yes
allowed_origins = *

[$ARI_USER]
type = user
read_only = no
password = $ARI_PASS
EOF

    # Ensure HTTP is enabled
    [ -f /etc/asterisk/http.conf ] && cp /etc/asterisk/http.conf /etc/asterisk/http.conf.bak
    cat > /etc/asterisk/http.conf << EOF
[general]
enabled = yes
bindaddr = 127.0.0.1
bindport = 8088
EOF

    # Ensure required modules are loaded and buggy ones are disabled
    if [ -f /etc/asterisk/modules.conf ]; then
        print_step "Optimizing Asterisk modules for DNS stability..."
        # Disable the unbound resolver which often causes 'Allocation failed' on VPS
        sed -i 's/noload => res_resolver_unbound.so//g' /etc/asterisk/modules.conf
        sed -i '/\[modules\]/a noload => res_resolver_unbound.so' /etc/asterisk/modules.conf
        # Load essential SIP modules
        sed -i '/\[modules\]/a load => res_ari_channels.so' /etc/asterisk/modules.conf
        sed -i '/\[modules\]/a load => res_external_media.so' /etc/asterisk/modules.conf
        sed -i '/\[modules\]/a load => res_pjsip.so' /etc/asterisk/modules.conf
    fi

    # Set permissions
    mkdir -p /etc/asterisk/intellicall
    chown -R $(whoami):$(whoami) /etc/asterisk
    chmod -R 755 /etc/asterisk

    # Create recording directory (required for call recording via ARI)
    mkdir -p /var/spool/asterisk/recording
    chown asterisk:asterisk /var/spool/asterisk/recording
    chmod 775 /var/spool/asterisk/recording
    
    # Ensure current user can read recordings (Node.js access)
    usermod -aG asterisk $(whoami)

    # Open firewall ports for SIP and RTP (if UFW is active)
    if command -v ufw &> /dev/null && ufw status | grep -q "active"; then
        print_step "Configuring firewall for SIP/RTP..."
        ufw allow 5060/tcp comment 'SIP TCP' 2>/dev/null
        ufw allow 5060/udp comment 'SIP UDP' 2>/dev/null
        ufw allow 5090/udp comment 'SIP Alt UDP' 2>/dev/null
        ufw allow 5091/tcp comment 'SIP Alt TCP' 2>/dev/null
        ufw allow 5092/tcp comment 'SIP TLS' 2>/dev/null
        ufw allow 8088/tcp comment 'Asterisk ARI' 2>/dev/null
        ufw allow 21000:30000/udp comment 'RTP Media' 2>/dev/null
        print_success "Firewall rules added for SIP/RTP"
    fi

    # Install PM2 globally for process management
    if ! command -v pm2 &> /dev/null; then
        print_step "Installing PM2 process manager..."
        npm install -g pm2
        print_success "PM2 installed"
    fi

    # Save these for the .env step
    GLOBAL_ARI_USER="$ARI_USER"
    GLOBAL_ARI_PASS="$ARI_PASS"
    GLOBAL_VPS_DONE=1

    echo "PROGRESS: System components installed successfully."
}

# -----------------------------------------------------------------------------
# MAIN EXECUTION
# -----------------------------------------------------------------------------

# If automated mode
if [ -n "$FE_DOMAIN" ]; then
    echo "PROGRESS: Starting automated installation sequence..."
    
    # 1. System Install
    echo "PROGRESS: Phase 1: Installing system dependencies..."
    vps_engine_install
    
    # 2. Configuration Prep
    echo "PROGRESS: Phase 2: Preparing configuration..."
    FE_HOST="$FE_DOMAIN"
    BE_HOST="${BE_DOMAIN:-$FE_DOMAIN}"
    MONGODB_VAL="${MONGODB_URI:-"mongodb://localhost:27017/intellicall-ai"}"
    GOOGLE_ID="$GOOGLE_CLIENT_ID"
    GOOGLE_SECRET="$GOOGLE_CLIENT_SECRET"
    BASE_URL="http://$BE_HOST"
    CLIENT_URL="http://$FE_HOST"
    
    # Pre-fetch IP to avoid heredoc hangs
    echo "PROGRESS: Discovering external IP..."
    EXTERNAL_IP=$(timeout 5 curl -s4 ifconfig.me || timeout 5 curl -s4 ipapi.co/ip/ || echo "$FE_HOST")
    
    # 3. Backend Config
    echo "PROGRESS: Phase 3: Configuring Backend..."
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | head -c 32 | base64)
    ARI_USER="${GLOBAL_ARI_USER:-"intellicall"}"
    ARI_PASS="${GLOBAL_ARI_PASS:-"intellicall_ari_secret"}"
    
    mkdir -p "$BACKEND_DIR"
    cat > "$BACKEND_DIR/.env" << EOF
PORT=5001
MONGODB_URI=$MONGODB_VAL
NODE_ENV=production
JWT_SECRET=$JWT_SECRET
BASE_URL=$BASE_URL
GOOGLE_CLIENT_ID=$GOOGLE_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_SECRET
CLIENT_URL=$CLIENT_URL
ASTERISK_ARI_URL=http://localhost:8088
ASTERISK_ARI_USER=$ARI_USER
ASTERISK_ARI_PASSWORD=$ARI_PASS
ASTERISK_CONFIG_DIR=/etc/asterisk
IC_SIP_PORT=5090
EXTERNAL_IP=$EXTERNAL_IP
SIP_RECORDING_PATH=/var/spool/asterisk/recording
EOF
    echo "PROGRESS: Backend .env created."

    # 4. Dependencies
    echo "PROGRESS: Phase 4: Installing dependencies..."
    cd "$BACKEND_DIR" && npm install

    echo "PROGRESS: Installing Playwright Chromium (Knowledge Base — import from website)..."
    (cd "$BACKEND_DIR" && npx playwright install chromium) || echo "PROGRESS: Playwright Chromium skipped or failed; run: cd backend && npx playwright install chromium"
    
    echo "PROGRESS: Configuring Frontend..."
    mkdir -p "$FRONTEND_DIR"
    echo "NEXT_PUBLIC_API_URL=$BASE_URL/api" > "$FRONTEND_DIR/.env.local"
    
    cd "$FRONTEND_DIR" && npm install
    
    echo "PROGRESS: Phase 5: Building Frontend (this takes time)..."
    npm run build
    
    echo "PROGRESS: Phase 6: Finalizing SIP..."
    cd "$BACKEND_DIR" && node services/sip/asterisk-config.js
    
    # Asterisk restart
    systemctl stop asterisk || true
    pkill -9 asterisk || true
    systemctl start asterisk || true
    
    echo "PROGRESS: Installation finalized."
    exit 0
fi

    # Load existing secrets if .env exists to prevent data loss (e.g. JWT_SECRET change causes bad decrypt)
    local JWT_SECRET=""
    local ARI_USER="intellicall"
    local ARI_PASS=""

    if [ -f "$BACKEND_DIR/.env" ]; then
        print_info "Loading existing secrets from .env..."
        JWT_SECRET=$(grep "^JWT_SECRET=" "$BACKEND_DIR/.env" | cut -d'=' -f2-)
        ARI_USER=$(grep "^ASTERISK_ARI_USER=" "$BACKEND_DIR/.env" | cut -d'=' -f2-)
        ARI_PASS=$(grep "^ASTERISK_ARI_PASSWORD=" "$BACKEND_DIR/.env" | cut -d'=' -f2-)
    fi

    # Generate only if not found
    if [ -z "$JWT_SECRET" ]; then
        print_step "Generating secure secrets..."
        JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | head -c 32 | base64)
    fi
    
    # Use ARI credentials if system install was just done
    ARI_USER=${ARI_USER:-${GLOBAL_ARI_USER:-"intellicall"}}
    if [ -z "$ARI_PASS" ]; then
        ARI_PASS=${GLOBAL_ARI_PASS:-"intellicall_ari_secret"}
    fi

    # Write Backend .env
    print_header "Step 3: Configuring Backend"
    backup_file "$BACKEND_DIR/.env"
    cat > "$BACKEND_DIR/.env" << EOF
PORT=5001
MONGODB_URI=$MONGODB_VAL
NODE_ENV=production
JWT_SECRET=$JWT_SECRET
BASE_URL=$BASE_URL

# Google OAuth
GOOGLE_CLIENT_ID=$GOOGLE_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_SECRET
CLIENT_URL=$CLIENT_URL

# Asterisk
ASTERISK_ARI_URL=http://localhost:8088
ASTERISK_ARI_USER=$ARI_USER
ASTERISK_ARI_PASSWORD=$ARI_PASS
ASTERISK_CONFIG_DIR=/etc/asterisk
IC_SIP_PORT=5090

# SIP NAT Traversal — IMPORTANT: set to your server's public IP
# Outbound Profile in the provider's portal.
EXTERNAL_IP=$(curl -s4 --max-time 5 ifconfig.me || echo "$FE_HOST")

# SIP Recording
SIP_RECORDING_PATH=/var/spool/asterisk/recording

# SIP TLS (optional — only if your provider requires encrypted SIP signaling)
# SIP_TLS_CERT=/etc/asterisk/keys/asterisk.pem
# SIP_TLS_KEY=/etc/asterisk/keys/asterisk.key
# SIP_TLS_CA=
EOF
    print_success "Backend .env created"

    print_step "Installing backend dependencies (this may take a minute)..."
    (cd "$BACKEND_DIR" && npm install)

    print_step "Installing Playwright Chromium (Knowledge Base — import from website)..."
    (cd "$BACKEND_DIR" && npx playwright install chromium) || print_warning "Playwright Chromium install failed or skipped. For KB import from website, run: cd backend && npx playwright install chromium"

    # Write Frontend .env.local
    print_header "Step 4: Configuring Frontend"
    backup_file "$FRONTEND_DIR/.env.local"
    cat > "$FRONTEND_DIR/.env.local" << EOF
NEXT_PUBLIC_API_URL=$BASE_URL/api
EOF
    print_success "Frontend .env.local created"

    print_step "Installing frontend dependencies (this may take a minute)..."
    (cd "$FRONTEND_DIR" && npm install)

    print_step "Building frontend for production (this may take a few minutes)..."
    (cd "$FRONTEND_DIR" && npm run build) || print_error "Frontend build failed. Continuing anyway..."
    print_info "DEBUG: Frontend built."

    # Final Link - Generate Asterisk configs and ensure proper include placement
    print_step "Finalizing SIP integration..."
    
    # Generate the Asterisk config files
    (cd "$BACKEND_DIR" && node services/sip/asterisk-config.js)
    
    # CRITICAL: Ensure #include is at the TOP of pjsip.conf (ONLY ONCE)
    # This is required for proper endpoint loading
    PJSIP_CONF="/etc/asterisk/pjsip.conf"
    INCLUDE_LINE='#include "intellicall/pjsip_intellicall.conf"'
    
    if [ -f "$PJSIP_CONF" ]; then
        # Remove ALL existing include lines first (prevents duplicates)
        sed -i "\|$INCLUDE_LINE|d" "$PJSIP_CONF" 2>/dev/null || true
        # Prepend include at the very top of the file (must be first line)
        sed -i "1i $INCLUDE_LINE" "$PJSIP_CONF" 2>/dev/null || true
        print_success "PJSIP include configured at top of config"
    fi
    
    # Do the same for extensions.conf
    EXT_CONF="/etc/asterisk/extensions.conf"
    EXT_INCLUDE='#include "intellicall/extensions_intellicall.conf"'
    if [ -f "$EXT_CONF" ]; then
        sed -i "\|$EXT_INCLUDE|d" "$EXT_CONF" 2>/dev/null || true
        echo "$EXT_INCLUDE" >> "$EXT_CONF"
    fi
    
    # CRITICAL: Clean restart to remove "Zombie" registrations and clear memory
    print_step "Performing CLEAN Asterisk restart..."
    systemctl stop asterisk 2>/dev/null || true
    sleep 2
    pkill -9 asterisk 2>/dev/null || true
    systemctl start asterisk 2>/dev/null || true
    
    for i in $(seq 1 15); do
        if systemctl is-active --quiet asterisk 2>/dev/null || asterisk -rx "core show version" &>/dev/null; then
            print_success "Asterisk is running"
            break
        fi
        [ "$i" -eq 15 ] && print_warning "Asterisk taking long to start; proceeding anyway..."
        sleep 1
    done
    sleep 2
    
    # Reload Asterisk with all PJSIP components
    asterisk -rx "dialplan reload" 2>/dev/null
    asterisk -rx "pjsip reload" 2>/dev/null
    asterisk -rx "module reload res_pjsip_outbound_registration.so" 2>/dev/null
    
    # Verify SIP is working
    print_step "Verifying SIP configuration..."
    sleep 2
    if asterisk -rx "pjsip show endpoints" 2>/dev/null | grep -q "trunk-"; then
        print_success "SIP endpoints loaded successfully!"
    else
        print_warning "No SIP trunks configured yet. Add trunks via the web UI."
    fi

    print_info "DEBUG: SIP verification finished."
    print_info "DEBUG: run_full_setup logic finished."
}

# -----------------------------------------------------------------------------
# FINAL OUTPUT
# -----------------------------------------------------------------------------
finish_setup_step() {
    print_header "🎉 Installation Complete!"
    print_box "🚀 START YOUR APPLICATION"
    echo -e "${CYAN}│${NC} Start Backend:  ${BOLD}cd backend && pm2 start server.js --name intellicall${NC}"
    echo -e "${CYAN}│${NC} Start Frontend: ${BOLD}cd frontend && pm2 start npm --name ui -- start${NC}"
    echo -e "${CYAN}│${NC} Save PM2 Config:${BOLD} pm2 save && pm2 startup${NC}"
    print_box_footer
}

# -----------------------------------------------------------------------------
# OPTION 2: UPDATE CONFIGURATION
# -----------------------------------------------------------------------------
update_config() {
    print_header "Update Environment Configuration"
    local BE_ENV="$BACKEND_DIR/.env"
    local FE_ENV="$FRONTEND_DIR/.env.local"

    if [ ! -f "$BE_ENV" ]; then
        print_error "System not configured. Run 'Complete Installation' first."
        return
    fi

    # Load current values
    while IFS='=' read -r key value; do
        if [[ ! $key =~ ^# && -n $key ]]; then
            eval "CUR_$key='$value'"
        fi
    done < "$BE_ENV"

    local NEW_MONGO=$(get_input "MongoDB URI" "$CUR_MONGODB_URI")
    local NEW_GOOGLE_ID=$(get_input "Google Client ID" "$CUR_GOOGLE_CLIENT_ID")
    local NEW_GOOGLE_SECRET=$(get_input "Google Client Secret" "$CUR_GOOGLE_CLIENT_SECRET")
    local NEW_BASE_URL=$(get_input "Base URL" "$CUR_BASE_URL")
    local NEW_CLIENT_URL=$(get_input "Client URL" "$CUR_CLIENT_URL")

    print_step "Updating environment values..."
    backup_file "$BE_ENV"
    
    update_env_var "$BE_ENV" "MONGODB_URI" "$NEW_MONGO"
    update_env_var "$BE_ENV" "GOOGLE_CLIENT_ID" "$NEW_GOOGLE_ID"
    update_env_var "$BE_ENV" "GOOGLE_CLIENT_SECRET" "$NEW_GOOGLE_SECRET"
    update_env_var "$BE_ENV" "BASE_URL" "$NEW_BASE_URL"
    update_env_var "$BE_ENV" "CLIENT_URL" "$NEW_CLIENT_URL"

    # Sync Frontend API URL
    if [ -f "$FE_ENV" ]; then
        update_env_var "$FE_ENV" "NEXT_PUBLIC_API_URL" "$NEW_BASE_URL/api"
    fi

    print_success "Configuration updated! Restart app via PM2 to apply."
}

# -----------------------------------------------------------------------------
# OPTION 3: FIX SIP CONFIGURATION
# -----------------------------------------------------------------------------
fix_sip_config() {
    print_header "Fix SIP/Asterisk Configuration"
    
    # Check for root
    if [ "$EUID" -ne 0 ]; then
        print_error "Please run this script with sudo (sudo bash setup.sh)"
        return
    fi

    # 1. Check DNS resolution and apply fix if needed
    print_step "Checking DNS resolution for configured trunks..."
    
    # Apply system DNS fix
    echo "nameserver 1.1.1.1" > /etc/resolv.conf
    echo "nameserver 8.8.8.8" >> /etc/resolv.conf
    print_success "System DNS nameservers updated to 1.1.1.1/8.8.8.8"

    # Disable Asterisk Unbound resolver if present
    if [ -f /etc/asterisk/modules.conf ] && ! grep -q "noload => res_resolver_unbound.so" /etc/asterisk/modules.conf; then
        sed -i '/\[modules\]/a noload => res_resolver_unbound.so' /etc/asterisk/modules.conf
        print_info "Disabled res_resolver_unbound to prevent 'Allocation failed' errors."
    fi
    
    print_step "Regenerating Asterisk configs..."
    (cd "$BACKEND_DIR" && node services/sip/asterisk-config.js)
    
    # CRITICAL FIX: Ensure #include is at the TOP of pjsip.conf (ONLY ONCE)
    PJSIP_CONF="/etc/asterisk/pjsip.conf"
    INCLUDE_LINE='#include "intellicall/pjsip_intellicall.conf"'
    
    if [ -f "$PJSIP_CONF" ]; then
        print_step "Fixing PJSIP include placement..."
        # Remove ALL existing include lines first (prevents duplicates)
        sed -i "\|$INCLUDE_LINE|d" "$PJSIP_CONF" 2>/dev/null || true
        # Prepend include at the very top of the file (must be first line)
        sed -i "1i $INCLUDE_LINE" "$PJSIP_CONF" 2>/dev/null || true
        print_success "PJSIP include correctly placed at top"
    fi
    
    # Also fix extensions.conf
    EXT_CONF="/etc/asterisk/extensions.conf"
    EXT_INCLUDE='#include "intellicall/extensions_intellicall.conf"'
    if [ -f "$EXT_CONF" ]; then
        sed -i "\|$EXT_INCLUDE|d" "$EXT_CONF" 2>/dev/null || true
        echo "$EXT_INCLUDE" >> "$EXT_CONF"
        print_success "Extensions include configured"
    fi
    
    # Clean up any duplicate config files created by Asterisk
    rm -f /etc/asterisk/intellicall/pjsip_intellicall.conf~~* 2>/dev/null
    
    print_step "Checking recording directory and permissions..."
    mkdir -p /var/spool/asterisk/recording
    chown asterisk:asterisk /var/spool/asterisk/recording
    chmod 775 /var/spool/asterisk/recording
    usermod -aG asterisk $(whoami) 2>/dev/null || true
    print_success "Recording directory configured (/var/spool/asterisk/recording)"
    
    # CRITICAL: Clean restart to remove "Zombie" registrations and clear memory
    print_step "Performing CLEAN Asterisk restart..."
    systemctl stop asterisk 2>/dev/null || true
    sleep 2
    # Kill any hung asterisk processes
    pkill -9 asterisk 2>/dev/null || true
    systemctl start asterisk 2>/dev/null || true
    
    for i in $(seq 1 15); do
        if systemctl is-active --quiet asterisk 2>/dev/null || asterisk -rx "core show version" &>/dev/null; then
            print_success "Asterisk is running"
            break
        fi
        [ "$i" -eq 15 ] && print_warning "Asterisk taking long to start; proceeding anyway..."
        sleep 1
    done
    sleep 2
    
    print_step "Initializing SIP modules..."
    asterisk -rx "dialplan reload" 2>/dev/null
    asterisk -rx "pjsip reload" 2>/dev/null
    asterisk -rx "module reload res_pjsip_outbound_registration.so" 2>/dev/null
    sleep 2
    
    print_step "Verifying SIP status..."
    ENDPOINTS=$(asterisk -rx "pjsip show endpoints" 2>/dev/null)
    REGS=$(asterisk -rx "pjsip show registrations" 2>/dev/null)
    
    if echo "$ENDPOINTS" | grep -q "trunk-"; then
        print_success "SIP endpoints loaded!"
        echo ""
        echo -e "${YELLOW}Trunk Status:${NC}"
        echo "$ENDPOINTS" | grep "trunk-" | head -10
        echo ""
        echo -e "${YELLOW}Registration Status:${NC}"
        echo "$REGS" | head -10
    else
        print_warning "No active endpoints found. Check logs: asterisk -rvvv"
    fi
    
    print_success "SIP configuration fix complete!"
}

# -----------------------------------------------------------------------------
# MAIN MENU LOOP
# -----------------------------------------------------------------------------

# AUTO-EXECUTE if unattended mode detected
if [ -n "$FE_DOMAIN" ]; then
    print_info "DEBUG: Pre-flight check passed. Starting Automated run_full_setup..."
    run_full_setup
    print_info "DEBUG: run_full_setup has returned to main."
    finish_setup_step
    print_info "Automated setup complete. Exiting."
    exit 0
fi

while true; do
    # clear (Removed for automation compatibility)
    echo -e "${CYAN}"
    echo "  IntelliCall AI - Ubuntu VPS Auto-Installer"
    echo -e "${NC}"
    echo -e "${BOLD}  Zero-Touch Deployment Wizard${NC}"
    echo "  ================================================="
    echo "  1) Complete Installation (Ubuntu VPS)"
    echo "  2) Update Application Configuration"
    echo "  3) Fix SIP/Asterisk Configuration"
    echo "  4) Exit"
    echo "  ================================================="
    echo ""
    read -p "  Select an option [1-4]: " CHOICE

    case $CHOICE in
        1) run_full_setup ;;
        2) update_config ;;
        3) fix_sip_config ;;
        4) print_info "Exiting. Goodbye!"; exit 0 ;;
        *) print_error "Invalid option. Please try again." ;;
    esac

    echo ""
    echo -e "${YELLOW}  Press Enter to return to the main menu...${NC}"
    read
done
