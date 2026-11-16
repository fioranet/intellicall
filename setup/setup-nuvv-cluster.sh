#!/bin/bash
# =============================================================================
# Nuvv Telco - Provisionamento Automático de Cluster Privado L2 (10.20.30.6)
# =============================================================================
set -e

echo "=== Configurando Cluster Privado Nuvv Telco no Nuvv Flow ==="

# 1. Rede Netplan (10.20.30.6/24)
NETPLAN_CFG="/etc/netplan/50-cloud-init.yaml"
if [ -f "$NETPLAN_CFG" ]; then
    if ! grep -q "10.20.30.6/24" "$NETPLAN_CFG"; then
        echo "[1/4] Adicionando 10.20.30.6/24 ao Netplan..."
        sed -i '/addresses:/a \      - 10.20.30.6/24' "$NETPLAN_CFG"
        netplan apply || true
    else
        echo "[1/4] IP 10.20.30.6/24 já presente no Netplan."
    fi
fi

# 2. Firewall UFW
if command -v ufw >/dev/null 2>&1; then
    echo "[2/4] Assegurando permissão da subrede 10.20.30.0/24 no UFW..."
    ufw allow from 10.20.30.0/24 to any comment 'Cluster Privado Nuvv Telco' || true
fi

# 3. Arquivos Asterisk Trunk e Dialplan
ASTERISK_DIR="/etc/asterisk"
TEMPLATES_DIR="$(dirname "$0")/../backend/services/sip/templates"

echo "[3/4] Sincronizando arquivos de configuração Asterisk..."
cp -f "$TEMPLATES_DIR/nuvv_cluster_trunk.conf" "$ASTERISK_DIR/nuvv_cluster_trunk.conf"
cp -f "$TEMPLATES_DIR/nuvv_cluster_dialplan.conf" "$ASTERISK_DIR/nuvv_cluster_dialplan.conf"
chown asterisk:asterisk "$ASTERISK_DIR/nuvv_cluster_"*.conf || true
chmod 664 "$ASTERISK_DIR/nuvv_cluster_"*.conf || true

# 4. Assegurar includes nos arquivos mestres
grep -q 'nuvv_cluster_trunk.conf' "$ASTERISK_DIR/pjsip.conf" || echo '#include "nuvv_cluster_trunk.conf"' >> "$ASTERISK_DIR/pjsip.conf"
grep -q 'nuvv_cluster_dialplan.conf' "$ASTERISK_DIR/extensions.conf" || echo '#include "/etc/asterisk/nuvv_cluster_dialplan.conf"' >> "$ASTERISK_DIR/extensions.conf"

# 5. Recarregar Asterisk
if command -v asterisk >/dev/null 2>&1; then
    echo "[4/4] Recarregando PJSIP e Dialplan no Asterisk..."
    asterisk -rx "pjsip reload" || true
    asterisk -rx "dialplan reload" || true
fi

echo "✅ Cluster Privado Nuvv Telco sincronizado com sucesso!"
