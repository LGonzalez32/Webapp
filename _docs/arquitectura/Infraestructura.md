---
title: Infraestructura
tags: [arquitectura, infra, deploy]
updated: 2026-03-29
---

# Infraestructura — Mapa de Servicios

## Diagrama

```
                          ┌─────────────────────┐
                          │     USUARIO          │
                          │   (Browser)          │
                          └─────────┬────────────┘
                                    │
                          ┌─────────▼────────────┐
                          │   Vercel (Frontend)   │
                          │   data-solutions-     │
                          │   hub.com             │
                          │   React 19 + Vite SPA │
                          └──┬──────────┬─────────┘
                             │          │
              ┌──────────────▼──┐  ┌────▼──────────────────┐
              │  Render         │  │  Supabase              │
              │  (Backend)      │  │  (Auth + Storage + DB) │
              │  webapp-0yx8.   │  │  supabase.co           │
              │  onrender.com   │  │                        │
              │  FastAPI        │  │  ├── Auth (email/Google)│
              └──────┬──────────┘  │  ├── Storage (org-data) │
                     │             │  └── DB (orgs, members) │
              ┌──────▼──────────┐  └────────────────────────┘
              │  DeepSeek API   │
              │  api.deepseek.  │          ┌──────────────────┐
              │  com            │          │  IndexedDB        │
              │  Chat + Reasoner│          │  (Browser local)  │
              └─────────────────┘          │  sales, metas,    │
                                           │  inventory cache   │
                                           └──────────────────┘
```

## Nodos

| Nodo | URL | Qué corre | Costo |
|------|-----|-----------|-------|
| Vercel | data-solutions-hub.com | Vite SPA (React 19 + Tailwind v4) | Free tier |
| Render | webapp-0yx8.onrender.com | FastAPI, proxy DeepSeek, motor forecast | Free tier |
| Supabase | Proyecto Supabase | Auth (email + Google), Storage bucket org-data, PostgreSQL | Free tier |
| DeepSeek | api.deepseek.com | deepseek-chat + deepseek-reasoner | Pay-per-token |
| IndexedDB | Local (browser) | DB salesflow-cache, store datasets | Gratis |

## Variables de entorno

### Frontend (Vercel)

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anon de Supabase |
| `VITE_BACKEND_URL` | URL del backend Render (fallback hardcoded) |

### Backend (Render)

| Variable | Descripción |
|----------|-------------|
| `DEEPSEEK_API_KEY` | API key de DeepSeek para proxy |
| `ALLOWED_ORIGINS` | Orígenes CORS |
| `SUPABASE_URL` | URL Supabase (vacío actualmente) |
| `SUPABASE_SERVICE_KEY` | Service role key (vacío actualmente) |
| `APP_ENV` | Entorno (development/production) |
| `LOG_LEVEL` | Nivel de logging (INFO) |

## Flujos de datos

### Flujo 1: Carga de archivo CSV/XLSX
```
Browser (FileDropzone) → fileParser.ts (parse + Zod validation)
  → setSales/Metas/Inventory → Zustand store
  → dataCache.saveDatasets() → IndexedDB
  → dataSource = 'real' (localStorage)
  → isProcessed = false → useAnalysis → analysisWorker (Web Worker)
  → buildSaleIndex → compute* → generateInsights (22 detectores)
  → Resultados → store → isProcessed = true
```

### Flujo 2: App refresh / rehydrate
```
Browser → Zustand rehydrate (localStorage: selectedPeriod, configuracion, dataSource)
  → useStoreHydrated() === true
  → useAutoLoad():
      SI dataSource === 'demo' → getDemoData() → store
      SI dataSource === 'real' → IndexedDB → store
      SI dataSource === 'none' + auth → Supabase Storage → store
      SI dataSource === 'none' + no auth → redirect /cargar
  → isProcessed = false → analysisWorker → store
```

### Flujo 3: Análisis IA inline
```
Página → click "Analizar con IA" → callAI(messages)
  → fetch POST → Render /api/v1/chat → DeepSeek API
  → response → parse (RESUMEN/CRECIMIENTO/CAÍDA/HALLAZGO)
  → render inline (useState local, no persiste)
```

### Flujo 4: Chat IA completo
```
ChatPage → usuario escribe → addChatMessage() → Zustand (memoria)
  → buildSystemPrompt() (14 secciones, hasta 320K chars)
  → callAI([system + últimos 10 msgs]) → Render → DeepSeek
  → parse markdown + charts (:::chart) + follow-ups ([SEGUIMIENTO])
  → render con Recharts
```

### Flujo 5: Auth (Supabase)
```
/login → email+password o Google OAuth
  → /auth/callback → getSession() → authStore
  → getUserOrg() → orgStore
  → SI org → loadOrgData → dashboard
  → SI no org → /onboarding
```

### Flujo 6: Profundizar (inline → chat)
```
Página X → Analizar (DeepSeek inline) → texto análisis
  → Click "Profundizar"
  → navigate('/chat', { state: { prefill: fullContext, displayPrefill: shortMessage } })
  → ChatPage: muestra shortMessage visible, envía fullContext a DeepSeek
  → Respuesta profunda con contexto completo
```

Ver: [[Backend]], [[Supabase]], [[Frontend]], [[Persistencia]]
