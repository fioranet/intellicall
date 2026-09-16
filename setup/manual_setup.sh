#!/bin/bash

# =============================================================================
# IntelliCall AI - Ubuntu VPS Auto-Installer & Manager
# =============================================================================
# This script performs a complete installation of IntelliCall AI on a
# fresh Ubuntu VPS, including Node.js, MongoDB, and Asterisk.
# Run with: sudo bash setup.sh
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Paths
PROJECT_ROOT="$(dirname "$0")/.."
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

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
            sed "s#^$key=.*#$key=$value#" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
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
    apt update && apt upgrade -y
    apt install -y curl wget git build-essential software-properties-common lsb-release

    # Install Node.js
    if ! command -v node &> /dev/null; then
        print_step "Installing Node.js v20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt install -y nodejs
    fi

    # Install MongoDB (Official Repository)
    if ! command -v mongod &> /dev/null; then
        print_step "Installing MongoDB (Official Repo)..."
        
        # Get Ubuntu version
        UBUNTU_CODENAME=$(lsb_release -sc)
        
        # Install gnupg and curl
        apt install -y gnupg curl

        # Import MongoDB public GPG key
        curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
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

        apt update
        apt install -y mongodb-org
        
        systemctl enable mongod
        systemctl start mongod
    fi

    # Install Asterisk
    if ! command -v asterisk &> /dev/null; then
        print_step "Installing Asterisk PBX..."
        apt install -y asterisk
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

    # Ensure required modules are loaded (Step 3.8)
    if [ -f /etc/asterisk/modules.conf ]; then
        print_step "Ensuring Asterisk modules are enabled..."
        sed -i '/\[modules\]/a load => res_ari_channels.so' /etc/asterisk/modules.conf
        sed -i '/\[modules\]/a load => res_external_media.so' /etc/asterisk/modules.conf
        sed -i '/\[modules\]/a load => res_pjsip.so' /etc/asterisk/modules.conf
    fi

    # Set permissions
    mkdir -p /etc/asterisk/intellicall
    chown -R $USER:$USER /etc/asterisk
    chmod -R 755 /etc/asterisk

    # Create recording directory (required for call recording via ARI)
    mkdir -p /var/spool/asterisk/recording
    chown asterisk:asterisk /var/spool/asterisk/recording
    chmod 775 /var/spool/asterisk/recording

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
    GLOBAL_ARI_USER=$ARI_USER
    GLOBAL_ARI_PASS=$ARI_PASS
    GLOBAL_VPS_DONE=1

    print_success "System components installed successfully!"
}

# -----------------------------------------------------------------------------
# OPTION 1: COMPLETE INSTALLATION
# -----------------------------------------------------------------------------
run_full_setup() {
    print_header "Complete Application Setup"
    
    print_info "This will perform a full installation on your Ubuntu VPS."
    read -p "  Install system dependencies (Node, Mongo, Asterisk)? [Y/n]: " WANT_INSTALL
    if [[ ! $WANT_INSTALL =~ ^[Nn]$ ]]; then
        vps_engine_install
    fi

    # Configuration Prompts
    print_header "Step 2: Configuration"
    
    local PUBLIC_IP=$(curl -4 -s https://ifconfig.me/ip || curl -4 -s https://ipapi.co/ip/ || echo "localhost")
    
    print_info "Enter the names for your platform (e.g., app.domain.com or 1.2.3.4)."
    local FE_HOST=$(get_input "Frontend Domain/IP" "$PUBLIC_IP")
    local BE_HOST=$(get_input "Backend (API) Domain/IP" "$FE_HOST")
    
    # Strip protocols and trailing slashes
    FE_HOST=$(echo "$FE_HOST" | sed -e 's|^[^/]*//||' -e 's|/$||')
    BE_HOST=$(echo "$BE_HOST" | sed -e 's|^[^/]*//||' -e 's|/$||')
    
    local MONGODB_URI=$(get_input "MongoDB URI (e.g., mongodb://localhost:27017/db)" "mongodb://localhost:27017/intellicall-ai")
    
    print_step "Authentication Setup"
    print_info "Google OAuth is required for user login."
    local GOOGLE_ID=$(get_input "Google Client ID (from Google Console)" "your_google_id")
    local GOOGLE_SECRET=$(get_input "Google Client Secret (from Google Console)" "your_google_secret")
    
    print_step "URLs Configuration"
    print_info "These will be automatically secured with HTTPS during deployment."
    local BASE_URL=$(get_input "Backend Base URL (e.g., http://api.com)" "http://$BE_HOST")
    local CLIENT_URL=$(get_input "Frontend Client URL (e.g., http://app.com)" "http://$FE_HOST")

    # Generate Secret
    print_step "Generating secure secrets..."
    local JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | head -c 32 | base64)
    
    # Use ARI credentials if system install was just done
    local ARI_USER=${GLOBAL_ARI_USER:-"intellicall"}
    local ARI_PASS=${GLOBAL_ARI_PASS:-"intellicall_ari_secret"}

    # Write Backend .env
    print_header "Step 3: Configuring Backend"
    backup_file "$BACKEND_DIR/.env"
    cat > "$BACKEND_DIR/.env" << EOF
PORT=5001
MONGODB_URI=$MONGODB_URI
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
# Without this, one-way audio or no audio will occur on most VPS/cloud setups
EXTERNAL_IP=$(curl -s4 ifconfig.me || echo "")

# SIP TLS (optional — only if your provider requires encrypted SIP signaling)
# SIP_TLS_CERT=/etc/asterisk/keys/asterisk.pem
# SIP_TLS_KEY=/etc/asterisk/keys/asterisk.key
# SIP_TLS_CA=
EOF
    print_success "Backend .env created"

    print_step "Installing backend dependencies..."
    (cd "$BACKEND_DIR" && npm install --silent)

    print_step "Installing Playwright Chromium (Knowledge Base — import from website)..."
    (cd "$BACKEND_DIR" && npx playwright install chromium) || print_warning "Playwright Chromium install failed or skipped. For KB import from website, run: cd backend && npx playwright install chromium"

    # Write Frontend .env.local
    print_header "Step 4: Configuring Frontend"
    backup_file "$FRONTEND_DIR/.env.local"
    cat > "$FRONTEND_DIR/.env.local" << EOF
NEXT_PUBLIC_API_URL=$BASE_URL/api
EOF
    print_success "Frontend .env.local created"

    print_step "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install --silent)

    print_step "Building frontend for production..."
    (cd "$FRONTEND_DIR" && npm run build)

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
    
    # Restart Asterisk to apply all changes (run in background so script never hangs on slow shutdown)
    print_step "Restarting Asterisk..."
    ( systemctl restart asterisk 2>/dev/null || service asterisk restart 2>/dev/null ) &
    for i in $(seq 1 30); do
        if systemctl is-active --quiet asterisk 2>/dev/null || asterisk -rx "core show version" &>/dev/null; then
            print_success "Asterisk is running"
            break
        fi
        [ "$i" -eq 30 ] && print_warning "Asterisk may still be starting; continuing..."
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

    print_header "🎉 Installation Complete!"
    print_box "🚀 START YOUR APPLICATION"
    echo -e "${CYAN}│${NC} Start Backend:  ${BOLD}cd backend && pm2 start server.js --name intellicall${NC}"
    echo -e "${CYAN}│${NC} Start Frontend: ${BOLD}cd frontend && pm2 start npm --name ui -- start${NC}"
    echo -e "${CYAN}│${NC} Save PM2 Config:${BOLD} pm2 save && pm2 startup${NC}"
    echo -e "${CYAN}│${NC}                                                          ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} ${YELLOW}SIP Trunk Setup:${NC}                                         ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} 1. Add SIP trunk in the web UI (SIP Trunks page)         ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} 2. Add a phone number linked to the trunk                ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} 3. Configure AI keys in Settings (Deepgram,              ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC}    ElevenLabs, OpenRouter)                                ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} 4. Create an Agent with the phone number                 ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} 5. Use 'Test Call' on the Phone Numbers page             ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC}                                                          ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} ${YELLOW}If calls fail:${NC} Check the error toast in the web UI.      ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} Common issues: IP not whitelisted, wrong credentials,     ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} or missing Outbound Profile in the provider's portal.    ${CYAN}│${NC}"
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
    
    print_step "Regenerating Asterisk configs..."
    (cd "$BACKEND_DIR" && node services/sip/asterisk-config.js)
    
    # CRITICAL FIX: Ensure #include is at the TOP of pjsip.conf (ONLY ONCE)
    # Duplicates cause "configuration contains a duplicate object" errors
    PJSIP_CONF="/etc/asterisk/pjsip.conf"
    INCLUDE_LINE='#include "intellicall/pjsip_intellicall.conf"'
    
    if [ -f "$PJSIP_CONF" ]; then
        print_step "Fixing PJSIP include placement..."
        
        # Remove ALL existing include lines first (prevents duplicates)
        sed -i "\|$INCLUDE_LINE|d" "$PJSIP_CONF" 2>/dev/null || true
        
        # Prepend include at the very top of the file (must be first line)
        sed -i "1i $INCLUDE_LINE" "$PJSIP_CONF" 2>/dev/null || true
        
        # Verify only one include exists
        INCLUDE_COUNT=$(grep -c "$INCLUDE_LINE" "$PJSIP_CONF" 2>/dev/null || echo "0")
        if [ "$INCLUDE_COUNT" -eq 1 ]; then
            print_success "PJSIP include correctly placed (1 instance at top)"
        else
            print_warning "Include count: $INCLUDE_COUNT - manual fix may be needed"
        fi
    else
        print_error "pjsip.conf not found at $PJSIP_CONF"
        return
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
    
    # Ensure recording directory exists
    mkdir -p /var/spool/asterisk/recording
    chown asterisk:asterisk /var/spool/asterisk/recording
    chmod 775 /var/spool/asterisk/recording
    
    print_step "Restarting Asterisk..."
    ( systemctl restart asterisk 2>/dev/null || service asterisk restart 2>/dev/null ) &
    for i in $(seq 1 30); do
        if systemctl is-active --quiet asterisk 2>/dev/null || asterisk -rx "core show version" &>/dev/null; then
            print_success "Asterisk is running"
            break
        fi
        [ "$i" -eq 30 ] && print_warning "Asterisk may still be starting; continuing..."
        sleep 1
    done
    sleep 2
    
    print_step "Reloading PJSIP modules..."
    asterisk -rx "module load res_pjsip.so" 2>/dev/null
    asterisk -rx "module load chan_pjsip.so" 2>/dev/null
    asterisk -rx "pjsip reload" 2>/dev/null
    asterisk -rx "module reload res_pjsip_outbound_registration.so" 2>/dev/null
    sleep 2
    
    print_step "Verifying endpoints..."
    ENDPOINTS=$(asterisk -rx "pjsip show endpoints" 2>/dev/null)
    if echo "$ENDPOINTS" | grep -q "trunk-"; then
        print_success "✅ SIP endpoints loaded successfully!"
        echo ""
        echo "$ENDPOINTS" | head -20
    else
        # Check for common issues
        print_warning "No endpoints found. Checking for issues..."
        
        # Check if any trunks exist in DB
        TRUNK_COUNT=$(cd "$BACKEND_DIR" && node -e "
            require('dotenv').config();
            const mongoose = require('mongoose');
            mongoose.connect(process.env.MONGODB_URI).then(async () => {
                const count = await mongoose.connection.db.collection('siptrunks').countDocuments({status:'active'});
                console.log(count);
                process.exit(0);
            }).catch(() => { console.log('0'); process.exit(0); });
        " 2>/dev/null || echo "0")
        
        if [ "$TRUNK_COUNT" = "0" ]; then
            print_info "No SIP trunks configured yet. Add trunks via the web UI."
        else
            print_error "Trunks exist but endpoints not loading."
            print_info "Check logs: asterisk -rvvv then run 'pjsip reload'"
        fi
    fi
    
    print_success "SIP configuration fix complete!"
}

# -----------------------------------------------------------------------------
# MAIN MENU LOOP
# -----------------------------------------------------------------------------
while true; do
    clear
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
