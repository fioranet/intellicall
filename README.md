# IntelliCall - AI Call Center & Voice Agent Platform

Sistema de Call Center inteligente baseado em IA (Gemini Live / TTS / STT), telefonia Asterisk (ARI / SIP), backend Node.js e frontend Next.js 16.

Ambiente de Produção: [flow.nuvv.com.br](https://flow.nuvv.com.br)  
API Backend: [api.flow.nuvv.com.br](https://api.flow.nuvv.com.br)

---

## 📚 Documentação Completa

O manual completo de instalação, arquitetura, infraestrutura, gotchas de hardware (MongoDB AVX/QEMU) e o catálogo exaustivo de todas as customizações implementadas estão disponíveis em:
👉 **[docs/MANUAL_INSTALACAO_E_CUSTOMIZACOES.md](docs/MANUAL_INSTALACAO_E_CUSTOMIZACOES.md)**

---

## 🚀 Resumo das Customizações Implementadas (Nuvv Digital)

- **Tradução 100% pt-BR**: Todos os 17 módulos do frontend traduzidos e revisados (`messages/pt/*.json`).
- **Terminologia Corporativa**: Preservação de termos técnicos ("Asterisk", "Dashboard", "Leads", "Trial"), ajuste de "Agenda" (em vez de compromissos) e "Suporte" (em vez de apoiar).
- **Plurais e Sintaxe ICU**: Correção gramatical na contagem de agentes, campanhas e usuários (`1 Agente`, `2 Agentes`).
- **Moeda Real Brasileiro (BRL / R$)**: Suporte nativo completo no frontend e backend com integração Stripe.
- **Fuso Horário do Brasil**: Timezone padrão do sistema configurado para `America/Sao_Paulo` (UTC-3 / Horário de Brasília).
- **Acesso Direto ao Sistema**: Rota raiz `/` redireciona diretamente para login ou dashboard. A Landing Page promocional permanece preservada e acessível em `/landing`.
- **Branding Nuvv Digital**: Background personalizado da tela de login (`public/images/auth-bg.png`) e identidades visuais configuradas.
- **MongoDB em Docker 4.4.18**: Contorno definitivo para ausência de instruções de CPU AVX no ambiente de virtualização QEMU.

---

## 🛠️ Estrutura do Repositório

```
├── backend/          # API Express, WebSockets, Mongoose, Asterisk ARI Client
├── frontend/         # Next.js 16 (Turbopack, TailwindCSS, next-intl)
├── setup/            # Scripts de instalação e deploy automatizados
└── docs/             # Manuais e documentações técnicas do sistema
```

---

## ⚡ Comandos Rápidos de Manutenção no Servidor

```bash
# Ver status dos serviços
pm2 status

# Reiniciar backend e frontend
pm2 restart all

# Ver logs
pm2 logs

# Checar banco de dados MongoDB
sudo docker ps
sudo docker logs --tail 50 mongodb

# Checar status do Asterisk
sudo asterisk -rx "core show channels"
```

Consulte [MANUAL_INSTALACAO_E_CUSTOMIZACOES.md](docs/MANUAL_INSTALACAO_E_CUSTOMIZACOES.md) para orientações detalhadas de deploy e rotinas de atualização.
