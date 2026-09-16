# IntelliCall - Sistema de Call Center com IA (Asterisk + Next.js + Node.js)
## Manual Técnico Completo de Instalação, Arquitetura e Customizações

Este documento descreve detalhadamente a infraestrutura, o processo de instalação do zero, as configurações de ambiente e, principalmente, **todas as alterações e customizações implementadas** para o ambiente de produção da **Nuvv Digital** (`flow.nuvv.com.br`).

---

## 1. Visão Geral da Arquitetura

O **IntelliCall** é uma plataforma SaaS para call center automatizado e assistido por inteligência artificial (Gemini Live / TTS / STT) integrado com telefonia VoIP Asterisk (SIP / ARI).

### Stack Tecnológica:
- **Frontend**: Next.js 16 (React 19, TypeScript, TailwindCSS, `next-intl` para i18n, Lucide Icons). Roda sob Node.js na porta interna `3000`.
- **Backend**: Node.js (Express, Socket.io, Mongoose, Asterisk ARI Client, Stripe SDK). Roda na porta interna `5001`.
- **Banco de Dados**: MongoDB 4.4.18 (executado via Docker na porta interna `27017` devido a requisitos de compatibilidade de CPU).
- **Telefonia / PBX**: Asterisk 20 com ARI (Asterisk REST Interface) na porta `8088` e SIP/RTP nas portas UDP `5060` e `10000-20000`.
- **Gerenciador de Processos**: PM2 gerenciando os processos `intellicall-backend` e `intellicall-frontend`.
- **Servidor Web / Proxy Reverso**: Nginx com certificados SSL automáticos via Let's Encrypt (Certbot).

---

## 2. Servidores, Domínios e Portas em Produção

### Dados do Servidor de Produção:
- **IP do Servidor**: `200.6.48.12`
- **Sistema Operacional**: Ubuntu 22.04 LTS (Kernel Linux x86_64)
- **Usuário Operacional**: `nuvv`
- **Diretório da Aplicação**: `/home/nuvv/Projects`

### Domínios e DNS (Cloudflare / DNS Externo):
- `flow.nuvv.com.br` -> Apontamento Tipo `A` para `200.6.48.12` (Proxy Nginx -> Porta `3000`)
- `api.flow.nuvv.com.br` -> Apontamento Tipo `A` para `200.6.48.12` (Proxy Nginx -> Porta `5001`)

### Mapeamento de Portas:
| Serviço | Porta Interna | Porta Externa / Protocolo | Finalidade |
| :--- | :--- | :--- | :--- |
| Nginx (Frontend) | `localhost:3000` | `80, 443 / TCP (flow.nuvv.com.br)` | Interface Web Next.js |
| Nginx (Backend) | `localhost:5001` | `80, 443 / TCP (api.flow.nuvv.com.br)` | REST API & WebSockets |
| MongoDB Docker | `127.0.0.1:27017` | Apenas Localhost | Armazenamento de Dados |
| Asterisk ARI | `127.0.0.1:8088` | Apenas Localhost | Controle de Chamadas via API |
| Asterisk SIP | `5060` | `5060 / UDP & TCP` | Sinalização SIP Telefonia |
| Asterisk RTP | `10000:20000` | `10000-20000 / UDP` | Fluxo de Áudio em Tempo Real |

---

## 3. Guia de Instalação Passo a Passo do Zero

Se for necessário recriar o ambiente ou provisionar um novo servidor, siga estas etapas:

### 3.1. Preparação do Sistema Operacional
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential ufw software-properties-common apt-transport-https ca-certificates gnupg
```

### 3.2. Instalação do Node.js 20 (LTS) e PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 3.3. Instalação e Gotcha Crítico do MongoDB (QEMU / Falta de AVX)
> [!IMPORTANT]
> **Atenção ao Provedor VPS / QEMU**: Versões do MongoDB a partir da 5.0 exigem suporte obrigatório a instruções de CPU **AVX**. Em ambientes virtualizados KVM/QEMU onde o hypervisor não expõe flags AVX, o binário do MongoDB 5.0+ ou 6.0+ sofre crash imediato com `Illegal instruction (core dumped)`.
>
> **Solução Definitiva Testada**: Executar o **MongoDB 4.4.18** via contêiner oficial Docker.

```bash
# 1. Instalar Docker
sudo apt install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker $USER

# 2. Criar diretório de dados persistente
sudo mkdir -p /var/lib/mongodb_docker

# 3. Executar MongoDB 4.4.18
sudo docker run -d \
  --name mongodb \
  --restart always \
  -p 127.0.0.1:27017:27017 \
  -v /var/lib/mongodb_docker:/data/db \
  mongo:4.4.18

# 4. Validar funcionamento:
sudo docker ps
nc -zv 127.0.0.1 27017
```

### 3.4. Instalação do Asterisk 20 e Configuração do ARI
```bash
sudo apt install -y asterisk asterisk-modules asterisk-config
sudo systemctl enable --now asterisk
```
Configurar o arquivo `/etc/asterisk/ari.conf`:
```ini
[general]
enabled = yes
pretty = yes
allowed_origins = *

[intellicall]
type = user
read_only = no
password = SUA_SENHA_ARI_AQUI
```
Configurar o arquivo `/etc/asterisk/http.conf`:
```ini
[general]
enabled = yes
bindaddr = 127.0.0.1
bindport = 8088
```
Recarregar o Asterisk:
```bash
sudo asterisk -rx "core restart when convenient"
```

### 3.5. Deploy da Aplicação (Repositório)
Clone o repositório ou copie os arquivos para `/home/nuvv/Projects`:
```bash
cd /home/nuvv
git clone https://github.com/fioranet/intellicall.git Projects
cd /home/nuvv/Projects
```

#### Backend Setup:
```bash
cd /home/nuvv/Projects/backend
npm install
# Configurar o arquivo .env (vide seção 4)
```

#### Frontend Setup & Build:
```bash
cd /home/nuvv/Projects/frontend
npm install
# Configurar o arquivo .env.local (vide seção 4)
npm run build
```

### 3.6. Configuração do PM2
No diretório do backend:
```bash
cd /home/nuvv/Projects/backend
pm2 start server.js --name intellicall-backend
```
No diretório do frontend:
```bash
cd /home/nuvv/Projects/frontend
pm2 start npm --name intellicall-frontend -- start
```
Salvar configuração para inicialização no boot:
```bash
pm2 save
pm2 startup
# Execute o comando 'sudo env PATH...' fornecido na saída do pm2 startup
```

### 3.7. Configuração do Nginx e SSL (Certbot)
Arquivo `/etc/nginx/sites-available/flow.nuvv.com.br`:
```nginx
# Frontend
server {
    server_name flow.nuvv.com.br;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 80;
}

# Backend API
server {
    server_name api.flow.nuvv.com.br;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 80;
}
```
Ativar e gerar certificados SSL:
```bash
sudo ln -s /etc/nginx/sites-available/flow.nuvv.com.br /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d flow.nuvv.com.br -d api.flow.nuvv.com.br --non-interactive --agree-tos -m admin@nuvv.com.br
```

---

## 4. Variáveis de Ambiente

### Backend (`/home/nuvv/Projects/backend/.env`):
```env
PORT=5001
MONGODB_URI=mongodb://127.0.0.1:27017/intellicall
JWT_SECRET=intellicall_jwt_secret_key_2024_secure
FRONTEND_URL=https://flow.nuvv.com.br
BACKEND_URL=https://api.flow.nuvv.com.br

# Asterisk ARI Configuration
ASTERISK_ARI_URL=http://127.0.0.1:8088/ari
ASTERISK_ARI_USERNAME=intellicall
ASTERISK_ARI_PASSWORD=sua_senha_ari
ASTERISK_APP_NAME=intellicall

# Gemini AI / Sarvam
GEMINI_API_KEY=sua_chave_gemini_aqui

# Timezone Padrão do Sistema
DEFAULT_TIMEZONE=America/Sao_Paulo
```

### Frontend (`/home/nuvv/Projects/frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=https://api.flow.nuvv.com.br/api
NEXT_PUBLIC_SOCKET_URL=https://api.flow.nuvv.com.br
```

---

## 5. Catálogo Completo das Nossas Alterações e Customizações

Todas as modificações abaixo foram desenvolvidas especificamente para o projeto e estão versionadas neste repositório:

### 5.1. Tradução Integral para Português do Brasil (pt-BR)
- **Local dos Arquivos**: `frontend/messages/pt/*.json`
- **Módulos Traduzidos (17 arquivos)**:
  1. `admin.json`: Painel Administrativo, gestão de planos, configurações do sistema, gateways, troncos e usuários.
  2. `agents.json`: Configuração de agentes de voz, prompts, voz, temperatura e comportamentos.
  3. `appointments.json`: Tradução e padronização da **Agenda** de contatos.
  4. `auth.json`: Login, registro, recuperação de senha e mensagens de erro de autenticação.
  5. `calls.json`: Histórico de chamadas, transcrições, gravações e status de ligações.
  6. `campaigns.json`: Campanhas de discagem, status, listas de contatos e progresso.
  7. `common.json`: Botões gerais, ações de salvar, cancelar, carregar e paginação.
  8. `dashboard.json`: Indicadores estatísticos, gráficos de desempenho e métricas gerais.
  9. `errors.json`: Tratamento de mensagens de erro amigáveis ao usuário.
  10. `knowledge.json`: Base de conhecimento para IA, upload de documentos e treinamento.
  11. `leads.json`: Gestão e acompanhamento de leads.
  12. `nav.json`: Menus laterais do painel de usuário e do painel de superadmin.
  13. `numbers.json`: Alocação de números de telefone e troncos virtuais.
  14. `settings.json`: Configurações de perfil, fuso horário, moedas e integrações.
  15. `sip.json`: Configuração de provedores SIP e troncos de telefonia.
  16. `support.json`: Tickets de suporte, status de atendimento e mensagens.
  17. `users.json`: Gestão de usuários, permissões e papéis.

### 5.2. Ajustes Terminológicos Específicos
- **"Asterisk"**: Mantido o nome técnico correto (foi revertida a tradução inadequada para "Asterisco").
- **"Dashboard" e "Leads"**: Mantidos os termos consagrados do mercado corporativo.
- **"Agenda"**: Substituiu os termos "Compromissos" e "Agendamentos".
- **"Suporte"**: Substituiu o termo "Apoiar" (tradução literal incorreta de "Support").
- **"Trial"**: Mantido sem tradução para planos de avaliação.
- **Tronco SIP**: Removidas referências a operadoras árabes locais `(STC, Mobily, Zain)` do formulário e textos de ajuda.

### 5.3. Correção de Plurais e Ordem ICU (`next-intl`)
- **Problema Corrigido**: Em português, expressões com plural estavam sendo renderizadas com a ordem inversa (ex: `Agentes 1` em vez de `1 Agente` ou `2 Agentes`).
- **Arquivos Ajustados**:
  - `frontend/messages/pt/admin.json`: Chaves de contagem de agentes (`{count, plural, one {1 Agente} other {# Agentes}}`), campanhas (`{count, plural, one {1 Campanha} other {# Campanhas}}`), etc.
  - `frontend/messages/pt/settings.json`.

### 5.4. Moeda Real Brasileiro (BRL / R$) e Gateway
- **Frontend**:
  - `frontend/lib/currency-symbols.ts`: Adicionado mapeamento `BRL: 'R$'`.
  - `frontend/app/settings/page.tsx` e `frontend/app/admin/settings/page.tsx`: Inclusão da opção `BRL - Real Brasileiro (R$)` nos dropdowns de moeda.
- **Backend**:
  - `backend/models/Settings.js`: Adicionado `'BRL'` no enum de moedas permitidas e valor padrão ajustável.
  - `backend/routes/settings.js`: Validação de moeda aceitando `BRL`.
- **Gateway**: Mantido o Stripe ativo com suporte a cobranças em BRL.

### 5.5. Fuso Horário Local do Brasil (`America/Sao_Paulo` / UTC-3)
- **Frontend & Backend**:
  - Configuração do fuso horário padrão do sistema para `America/Sao_Paulo` (Horário de Brasília, UTC-3) em todas as exibições de data e métricas do dashboard (`backend/routes/dashboard.js` e `backend/routes/settings.js`).

### 5.6. Redirecionamento da Rota Raiz e Preservação da Landing Page
- **Comportamento da Rota Raiz (`/`)**:
  - Arquivo `frontend/app/page.tsx`: Modificado para redirecionar diretamente para `/dashboard` se o usuário já estiver autenticado, ou para `/login` caso não esteja autenticado.
- **Preservação da Landing Page (`/landing`)**:
  - A landing page promocional completa foi movida para `frontend/app/landing/page.tsx`. Ela permanece totalmente acessível pela URL `https://flow.nuvv.com.br/landing` caso a empresa deseje utilizá-la para conversão de novos clientes no futuro.

### 5.7. Identidade Visual e Branding (Nuvv Digital)
- **Fundo da Tela de Login**: Imagem personalizada da Nuvv Digital implementada em `frontend/public/images/auth-bg.png` (resolução nítida, 639 KB).
- **Logotipos e Favicon**: Armazenados em `backend/uploads/branding/` e configurados no painel SuperAdmin.

---

## 6. Procedimento Seguro para Futuros Updates e Atualizações

Quando a desenvolvedora upstream (CodeCanyon) lançar uma nova versão do sistema IntelliCall:

### Estratégia de Branches Git Recomendada:
1. **Branch `upstream`**: Contém o código original sem modificações da CodeCanyon.
2. **Branch `main`**: Contém a versão de produção com todas as nossas customizações (pt-BR, BRL, Timezone, Branding).

### Passo a Passo para Atualizar:
1. No seu ambiente local, crie uma branch para o pacote novo:
   ```bash
   git checkout -b update-vX.Y
   ```
2. Sobrescreva os arquivos do sistema com o novo pacote recebido (exceto as pastas de customização).
3. Utilize `git diff` para revisar se as novas funcionalidades afetam:
   - `frontend/messages/pt/`
   - `frontend/lib/currency-symbols.ts`
   - `frontend/app/page.tsx`
   - `backend/models/Settings.js`
4. Mescle com a branch principal e faça o push:
   ```bash
   git commit -m "chore: upgrade upstream to version X.Y"
   git checkout main
   git merge update-vX.Y
   git push origin main
   ```
5. No servidor de produção (`200.6.48.12`), basta rodar:
   ```bash
   cd /home/nuvv/Projects
   git pull origin main
   cd backend && npm install
   cd ../frontend && npm install && npm run build
   pm2 restart all
   ```

---

## 7. Comandos de Manutenção Diária

```bash
# Verificar status das aplicações PM2
pm2 status

# Visualizar logs em tempo real
pm2 logs intellicall-backend
pm2 logs intellicall-frontend

# Reiniciar todas as instâncias
pm2 restart all

# Verificar contêiner do MongoDB
sudo docker ps
sudo docker logs --tail 50 mongodb

# Verificar status do Asterisk
sudo asterisk -rx "core show channels"
sudo asterisk -rx "ari show apps"

# Testar e recarregar Nginx
sudo nginx -t && sudo systemctl reload nginx
```
