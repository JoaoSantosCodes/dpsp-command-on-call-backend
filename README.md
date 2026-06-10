# dpsp-command-on-call-backend

Microsserviço backend do Command On-Call. Responsável pela API REST, integração com Datadog, motor de escalonamento, gestão de escalas de plantão e persistência de dados.

---

## Índice

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Configuração](#configuração)
- [Execução Local](#execução-local)
- [API Endpoints](#api-endpoints)
- [Serviços Internos](#serviços-internos)
- [Banco de Dados](#banco-de-dados)
- [WebSocket](#websocket)
- [Autenticação e Autorização](#autenticação-e-autorização)
- [Deploy em Kubernetes](#deploy-em-kubernetes)
- [Testes](#testes)

---

## Visão Geral

O backend é o núcleo da aplicação Command On-Call. Ele:

1. **Consulta a API do Datadog** a cada 30 segundos (polling com backoff exponencial)
2. **Identifica a área responsável** por cada monitor alertado (mapeamento por palavras-chave)
3. **Gerencia escalas de plantão** (importação CSV, CRUD manual)
4. **Executa escalonamento automático** (15 min por nível: 1º → 2º → 3º → 4º)
5. **Notifica o frontend em tempo real** via WebSocket
6. **Controla autenticação** com JWT e perfis de acesso (Adm, Responsável, Plantonista)

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│              Express Server (porta 3000)                  │
├──────────────────────────────────────────────────────────┤
│     REST API (server.ts)  │  WebSocket (websocket.ts)    │
├──────────────────────────────────────────────────────────┤
│                    Middleware                             │
│         auth.ts (JWT + Roles + Área Filter)              │
├──────────────────────────────────────────────────────────┤
│                     Serviços                             │
│  DatadogPolling │ EscalationEngine │ ScheduleManager     │
│  MonitorMapping │ CSVProcessor │ IncidentHistory │ Auth  │
├──────────────────────────────────────────────────────────┤
│                   Repositories                           │
│  Team │ Schedule │ EscalationChain │ Incident │ User     │
│  Area │ Periodo │ Escala │ MonitorMapping                │
├──────────────────────────────────────────────────────────┤
│                SQLite (better-sqlite3)                    │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
            ┌─────────────────────────┐
            │     Datadog API v1      │
            └─────────────────────────┘
```

---

## Tecnologias

| Tecnologia | Uso |
|------------|-----|
| Node.js 20 | Runtime |
| Express 4 | Servidor HTTP / API REST |
| TypeScript | Tipagem estática |
| better-sqlite3 | Banco de dados SQLite |
| ws | WebSocket server |
| jsonwebtoken | Tokens JWT |
| bcrypt | Hash de senhas |
| @datadog/datadog-api-client | Integração com Datadog |
| multer | Upload de arquivos CSV |
| papaparse | Parser de CSV |
| node-cron | Agendamento de tarefas |
| uuid | Geração de IDs |

---

## Configuração

### Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATADOG_API_KEY` | Sim | API Key do Datadog |
| `DATADOG_APP_KEY` | Sim | Application Key do Datadog |
| `JWT_SECRET` | Sim | Segredo para assinatura de tokens JWT |
| `PORT` | Não | Porta do servidor (padrão: 3000) |

### Secrets (Kubernetes)

Gerenciados via AWS Secrets Manager + External Secrets Operator:

```
Secret Path: dpsp-command-on-call-backend/credentials
Region: sa-east-1
```

Propriedades adicionais para Kong:
- `user_kong` — usuário de autenticação Kong
- `password_kong` — senha de autenticação Kong
- `kongCredType` — tipo de credencial Kong

---

## Execução Local

### Pré-requisitos

- Node.js 20+
- npm

### Instalação

```bash
npm install
```

### Criar arquivo .env

```env
DATADOG_API_KEY=sua_api_key
DATADOG_APP_KEY=sua_app_key
JWT_SECRET=uma-chave-secreta
PORT=3000
```

### Executar

```bash
# Desenvolvimento (hot reload)
npm run dev:backend

# Build de produção
npm run build:backend

# Iniciar produção
npm start
```

---

## API Endpoints

### Status

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/status` | Não | Status da conexão com Datadog |

### Monitores

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/monitors` | Não | Lista monitores com estado atual |
| GET | `/api/monitors/:id` | Não | Detalhes (template, query, tags) |
| GET | `/api/monitors/:id/responsible` | Não | Plantonistas responsáveis (todos os escalões) |

### Escalonamento

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/escalation/import` | Sim | Upload CSV de escalonamento |
| GET | `/api/escalation/areas` | Não | Áreas com escalonamento |
| GET | `/api/escalation/on-call` | Não | Plantonista atual por área |
| GET | `/api/escalation/template` | Não | Download template CSV |

### Times

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/teams` | Não | Lista todos os times |
| POST | `/api/teams` | Sim | Cria time |
| PUT | `/api/teams/:id` | Sim | Atualiza time |
| DELETE | `/api/teams/:id` | Sim | Remove time |
| GET | `/api/teams/:id/escalation-chain` | Não | Cadeia de escalação |
| PUT | `/api/teams/:id/escalation-chain` | Sim | Atualiza cadeia |

### Incidentes

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/incidents` | Sim | Lista com filtros |
| POST | `/api/incidents/:id/acknowledge` | Sim | Reconhece incidente |

### Autenticação

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/auth/login` | Não | Login → retorna JWT |
| POST | `/api/auth/register` | Não | Cadastro |
| GET | `/api/auth/me` | Sim | Dados do usuário |
| POST | `/api/auth/select-area` | Sim | Selecionar área |

### Administração (Adm)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| CRUD | `/api/areas` | Sim | Gestão de áreas |
| CRUD | `/api/periodos` | Sim | Gestão de períodos |
| CRUD | `/api/escalas` | Sim | Gestão de escalas |
| CRUD | `/api/users` | Sim | Gestão de usuários |
| GET/PUT | `/api/monitor-mappings` | Sim | Mapeamento monitor → time |

---

## Serviços Internos

### DatadogPollingService

- Consulta `MonitorsApi` a cada 30 segundos
- Backoff exponencial em caso de erro (máx. 5 min)
- Detecta mudança de estado e dispara callbacks
- Cache local dos monitores para consulta imediata

### EscalationEngine

- Inicia timer ao detectar incidente em alerta
- Timeout de 15 minutos por nível
- Escalação: Direto → 1º → 2º → 3º → 4º escalão
- Registra eventos no banco (audit trail)

### ScheduleManager

- Identifica o plantonista atual por time (data + horário)
- Suporta turnos de 24h e turnos parciais
- Retorna cadeia de escalação completa

### MonitorMappingService

- Mapeamento manual de monitores para times via API
- Lista monitores não mapeados

### Monitor-Area Mapping (Automático)

Mapeamento por palavras-chave no nome do monitor:

| Palavras-chave | Área |
|----------------|------|
| `farmacia`, `gdb` | Torre Soluções de Saúde |
| `redis`, `kubernetes`, `pod` | DevOps/Cloud |
| `estoque` | Torre Logística |
| `pdv`, `tira-teima` | Torre Lojas |

### CSVProcessor

- Importação em massa de escalas e escalonamentos
- Criação automática de áreas e plantonistas inexistentes
- Validação de formato e campos obrigatórios

### AuthService

- Login com bcrypt (salt rounds: 10)
- Geração de JWT com expiração configurável
- Perfis: Adm, Responsável, Plantonista

---

## Banco de Dados

**SQLite** via `better-sqlite3` — arquivo: `data/command-center.db`

### Tabelas

| Tabela | Descrição |
|--------|-----------|
| `teams` | Times (11 pré-cadastrados) |
| `monitor_team_mapping` | Associação monitor → time |
| `schedules` | Escalas de plantão |
| `escalation_chains` | Cadeia de escalação por time |
| `incidents` | Registro de incidentes |
| `escalation_events` | Eventos de escalação |
| `areas` | Áreas de operação |
| `users` | Usuários do sistema |
| `periodos` | Períodos de escala |
| `escalas` | Vinculação área + período + plantonista |
| `escalation_schedules` | Dados importados via CSV |

O banco é criado automaticamente na primeira execução (`database/init.ts`).

---

## WebSocket

Servidor WebSocket acoplado ao HTTP server (porta 3000).

### Eventos (Server → Client)

| Evento | Descrição |
|--------|-----------|
| `monitors_update` | Estado de monitor mudou |
| `escalation_event` | Escalação ocorreu |
| `incident_update` | Incidente criado/atualizado |

### Heartbeat

- Ping/pong a cada 30 segundos
- Clients inativos são desconectados

---

## Autenticação e Autorização

### Fluxo

1. `POST /api/auth/login` → valida credenciais → retorna JWT
2. Client envia `Authorization: Bearer <token>`
3. Middleware valida token e injeta `req.user`
4. `roleMiddleware` verifica perfil
5. `areaFilterMiddleware` filtra dados por área

### Perfis

| Perfil | Permissões |
|--------|-----------|
| Adm | Acesso total, todas as áreas |
| Responsável | CRUD na sua área |
| Plantonista | Somente leitura |

---

## Deploy em Kubernetes

### Namespace

```
dpsp-command-on-call
```

### Estrutura Kustomize

```
dpsp-command-on-call-backend/
├── base/
│   ├── deployment.yaml          # Deployment (porta 3000)
│   ├── service.yaml             # ClusterIP (80 → 3000)
│   ├── hpa.yaml                 # HPA (CPU/Mem 75%)
│   ├── external-secrets.yaml    # AWS Secrets Manager
│   ├── kong-basic-auth.yaml     # Plugin Basic Auth
│   ├── kong-group.yaml          # ACL group
│   ├── kong-plugin-acl.yaml     # Plugin ACL
│   ├── kong-secrets.yaml        # Credenciais Kong
│   └── kustomization.yaml
└── overlays/
    ├── dev/
    ├── qa/
    └── prd/                     # min: 3, max: 5 réplicas
```

### Deploy

```bash
# Dev
kubectl apply -k command-on-call/dpsp-command-on-call-backend/overlays/dev

# QA
kubectl apply -k command-on-call/dpsp-command-on-call-backend/overlays/qa

# Produção
kubectl apply -k command-on-call/dpsp-command-on-call-backend/overlays/prd
```

### Container Registry (ECR)

```
990365368476.dkr.ecr.sa-east-1.amazonaws.com/dpsp-command-on-call-backend
```

### Recursos por Pod

| Recurso | Request | Limit |
|---------|---------|-------|
| CPU | 200m | 300m |
| Memória | 352Mi | 768Mi |

### API Gateway (Kong)

- Plugins: Basic Auth + ACL
- ACL Group: `dpsp-command-on-call-backend`
- Credenciais via External Secrets (user_kong / password_kong)

---

## Testes

```bash
npm test
```

Cobertura:
- Repositories (CRUD)
- Serviços (escalation, schedule, polling, CSV, auth)
- Middleware (JWT, roles)
- Rotas HTTP (supertest)
- WebSocket events

---

## Estrutura de Código

```
src/backend/
├── index.ts                 # Entry point
├── server.ts                # Rotas Express
├── websocket.ts             # WebSocket server
├── middleware/auth.ts       # JWT + roles + área
├── database/
│   ├── init.ts              # Schema + seed
│   └── repositories/       # Data access layer
└── services/
    ├── datadog-polling.ts
    ├── escalation-engine.ts
    ├── schedule-manager.ts
    ├── monitor-mapping.ts
    ├── monitor-area-mapping.ts
    ├── csv-processor.ts
    ├── escalation-csv-processor.ts
    ├── incident-history.ts
    └── auth.ts
```
