---
title: Frontend
tags: [arquitectura, frontend, react]
updated: 2026-03-29
---

# Frontend — React 19 + Vite + Tailwind v4

> **Nota legacy:** esta pagina pertenece al wiki `_docs/` y puede tener LOC o
> nombres historicos. Para el motor de insights activo, usar
> `docs/ROADMAP-Z11-PIPELINE-BASELINE.md`, `docs/MANIFIESTO-MOTOR-INSIGHTS.md`
> y `docs/GLOSARIO-MOTOR-INSIGHTS.md`.

## Stack
- React 19 + TypeScript + Vite
- Zustand v5 (persist v3, key: `salesflow-storage`, version 6)
- Recharts para gráficas
- Tailwind v4 (sin tailwind.config.js, usa @tailwindcss/vite)
- react-router-dom v7
- Lucide React para iconos
- Sonner para toasts
- PapaParse + XLSX para archivos
- Zod para validación

## Estructura de archivos

```
src/
├── App.tsx                              — Router principal, lazy imports, RequireAuth
├── main.tsx                             — Entry point
├── index.css                            — Tailwind + CSS variables (--sf-*)
│
├── pages/ (16 archivos, ~8,040 LOC)
│   ├── EstadoComercialPage.tsx    1740  — Dashboard, feed insights, KPIs
│   ├── ChatPage.tsx                962  — Chat IA (DeepSeek chat + reasoner)
│   ├── UploadPage.tsx              892  — Wizard 3 pasos CSV/XLSX
│   ├── ClientesPage.tsx            882  — Dormidos, Pareto, Riesgo temprano
│   ├── DepartamentosPage.tsx       857  — Mapa SVG El Salvador + ranking
│   ├── RendimientoPage.tsx         847  — Pivot table drag-drop + chart YoY
│   ├── VendedoresPage.tsx          814  — Tabla jerárquica vendedores
│   ├── RotacionPage.tsx            436  — Clasificación inventario PM3
│   ├── OrganizacionPage.tsx        305  — Miembros, roles, invite link
│   ├── OnboardingPage.tsx          279  — Crear/unirse organización
│   ├── AuthPage.tsx                273  — Login (email + Google)
│   ├── MetasPage.tsx               271  — Cumplimiento metas
│   ├── ConfiguracionPage.tsx       212  — Params empresa + umbrales
│   ├── InvitationPage.tsx          140  — Join org via link
│   ├── AuthCallbackPage.tsx         56  — OAuth callback
│   └── NotFoundPage.tsx             25  — 404
│
├── components/ (15)
│   ├── layout/ (AppLayout, Sidebar, TopBar)
│   ├── auth/ (RequireAuth)
│   ├── insights/ (InsightCard)
│   ├── vendedor/ (VendedorPanel)
│   ├── upload/ (FileDropzone, DataPreview, StepIndicator,
│   │            ColumnGuide, ValidationPanel, TemplatePreviewModal)
│   └── ui/ (LoadingOverlay, EmptyState)
│
├── store/ (3 Zustand stores)
│   ├── appStore.ts    — Datos + análisis + UI + chatMessages + dataSource
│   ├── authStore.ts   — User + Session
│   └── orgStore.ts    — Organization + Members + Role
│
├── lib/ (14 archivos)
│   ├── chatService.ts      — buildSystemPrompt, callAI, parseAIResponse
│   ├── insight-engine.ts   — motor 2 activo de insights
│   ├── insightEngine.ts    — motor 1 legacy, no tocar salvo instruccion explicita
│   ├── analysis.ts         — buildSaleIndex, compute*, analyze*
│   ├── analysisWorker.ts   — Web Worker análisis off-thread
│   ├── fileParser.ts       — Parse CSV/XLSX + Zod
│   ├── dataCache.ts        — IndexedDB wrapper
│   ├── forecastApi.ts      — Client HTTP forecast backend (muerto)
│   ├── orgService.ts       — CRUD orgs + Storage
│   ├── demoData.ts         — Datos demo (8 vendedores, 18 meses)
│   ├── supabaseClient.ts   — Singleton Supabase
│   ├── useAuth.ts          — Hook auth listener
│   ├── useAutoLoad.ts      — Hook restore datos on mount
│   ├── useAnalysis.ts      — Hook dispara Worker
│   └── utils.ts            — cn() helper
│
├── workers/ (2)
│   ├── parseWorker.ts      — Parse CSV/XLSX off-thread
│   └── pivotWorker.ts      — Cálculo pivot off-thread
│
└── types/index.ts (437 LOC, 50+ tipos)
```

## Router

| Ruta | Componente | Auth | Sidebar | Descripción |
|------|-----------|------|---------|-------------|
| /login | AuthPage | No | No | Login/Register |
| /auth/callback | AuthCallbackPage | No | No | OAuth redirect |
| /join/:orgId | InvitationPage | No | No | Join org |
| /onboarding | OnboardingPage | Sí | No | Setup org |
| / | Navigate | Sí | — | → /dashboard o /cargar |
| /cargar | [[CargarDatos]] | Sí | Sí | Upload archivos |
| /dashboard | [[EstadoComercial]] | Sí | Sí | Dashboard principal |
| /vendedores | [[Vendedores]] | Sí | Sí | Vendedores |
| /rendimiento | [[Rendimiento]] | Sí | Sí | Pivot + chart |
| /rotacion | [[Rotacion]] | Sí | Condicional | Requiere has_inventario |
| /clientes | [[Clientes]] | Sí | Condicional | Requiere has_cliente |
| /metas | [[Metas]] | Sí | Condicional | Requiere has_metas |
| /departamentos | [[Departamentos]] | Sí | Sí | Mapa departamentos |
| /chat | [[ChatIA]] | Sí | Sí | Chat IA |
| /organizacion | OrganizacionPage | Sí | Sí | Gestión equipo |
| /configuracion | [[Configuracion]] | Sí | Sí | Configuración |

## Stores

### appStore (persistido en localStorage, version 6)

**Persistido:**

| Campo | Tipo |
|-------|------|
| selectedPeriod | `{ year: number; month: number }` (0-indexed month) |
| configuracion | `Configuracion` |
| orgId | `string` |
| dataSource | `'none' \| 'demo' \| 'real'` |

**En memoria (recalculado):**

| Campo | Tipo |
|-------|------|
| sales | `SaleRecord[]` |
| metas | `MetaRecord[]` |
| inventory | `InventoryItem[]` |
| vendorAnalysis | `VendorAnalysis[]` |
| teamStats | `TeamStats \| null` |
| insights | `Insight[]` |
| clientesDormidos | `ClienteDormido[]` |
| concentracionRiesgo | `ConcentracionRiesgo[]` |
| categoriasInventario | `CategoriaInventario[]` |
| categoriasInventarioPorCategoria | `InventarioPorCategoria[]` |
| supervisorAnalysis | `SupervisorAnalysis[]` |
| categoriaAnalysis | `CategoriaAnalysis[]` |
| canalAnalysis | `CanalAnalysis[]` |
| dataAvailability | `DataAvailability` |
| chatMessages | `ChatMessage[]` |
| forecastData | `ForecastData \| null` |
| isProcessed, isLoading | `boolean` |

### authStore
- `user: User | null`
- `session: Session | null`

### orgStore
- `org: Organization | null`
- `members: OrganizationMember[]`
- `role: 'owner' | 'editor' | 'viewer' | null`

## Tipos principales

- **SaleRecord**: `fecha`, `vendedor`, `unidades`, `producto?`, `cliente?`, `venta_neta?`, `categoria?`, `canal?`, `departamento?`, `supervisor?`
- **VendorAnalysis**: `vendedor`, `ventas_periodo`, `riesgo` (critico/riesgo/ok/superando), `ytd_actual/anterior`, `promedio_3m`, `variacion_vs_promedio_pct`, `top_clientes_periodo`, `productos_ausentes`, `canal_principal`
- **Insight**: `id`, `tipo` (7 tipos), `prioridad` (4 niveles), `emoji`, `titulo`, `descripcion`, `vendedor?`, `impacto_economico?`, `accion_sugerida?`
- **ClienteDormido**: `cliente`, `vendedor`, `dias_sin_actividad`, `valor_historico`, `recovery_score`, `recovery_label` (alta/recuperable/dificil/perdido)
- **ChatMessage**: `role`, `content`, `timestamp`, `navegacion?`, `isDeepAnalysis?`, `followUps?`, `chart?`
- **CategoriaInventario**: `producto`, `categoria`, `unidades_actuales`, `pm3`, `dias_inventario`, `clasificacion` (5 tipos)
- **Configuracion**: `empresa`, `moneda`, `dias_dormido_threshold`, `semanas_racha_threshold`, `pct_concentracion_threshold`, `umbral_riesgo_quiebre`, `umbral_baja_cobertura`, `umbral_normal`, `tema`
- **DataAvailability**: `has_producto`, `has_cliente`, `has_venta_neta`, `has_categoria`, `has_canal`, `has_supervisor`, `has_departamento`, `has_metas`, `has_inventario`

## Páginas — Resumen

| Página | LOC | IA | Filtros | Features clave |
|--------|-----|-----|---------|----------------|
| [[EstadoComercial]] | 1740 | Inline | Feed tipo, período | KPIs, chart YTD, feed insights, Analizar + Profundizar |
| [[Vendedores]] | 814 | No | Search, estado, canal, métrica, sort | Tabla jerárquica, color-coding riesgo |
| [[Rendimiento]] | 847 | No | Pivot dims, año, vendedor, métrica | Pivot drag-drop, chart YoY |
| [[Clientes]] | 882 | 2 inline | Tab, vendedor, sort | Dormidos + Pareto + Riesgo temprano |
| [[Departamentos]] | 857 | 2 inline | Hover/click mapa | Mapa SVG El Salvador, ranking |
| [[Rotacion]] | 436 | Inline | Expandir clasificación | 5 clasificaciones inventario |
| [[Metas]] | 271 | No | Ninguno | Progress bars, tabla 6 meses |
| [[ChatIA]] | 962 | Heavy | Deep analysis toggle | Markdown, charts Recharts, follow-ups |
| [[CargarDatos]] | 892 | No | Step navigator | Wizard 3 pasos, drag-drop, validación |
| [[Configuracion]] | 212 | No | Inputs | Umbrales, empresa, moneda |

Ver: [[Infraestructura]], [[Persistencia]], [[System Prompt]]
