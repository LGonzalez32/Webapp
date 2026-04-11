# SalesFlow — Mapa del Proyecto

> Fuente de verdad para ubicar cualquier archivo del proyecto.
> Última actualización: abril 2026

---

## 📐 Reglas y Estándares

| Archivo | Propósito |
|---------|-----------|
| [`src/lib/insightStandard.ts`](./lib/insightStandard.ts) | **INSIGHT ENGINE STANDARD v1.0** — 19 reglas (4 filtros, 6 calidad, 9 estructurales). Fuente de verdad para validación de insights. Todo insight pasa por `validarInsight()` antes de emitirse. |

---

## ⚙️ Configuración Raíz

| Archivo | Propósito |
|---------|-----------|
| [`index.html`](../index.html) | Entry point HTML |
| [`vite.config.js`](../vite.config.js) | Configuración de Vite |
| [`tsconfig.json`](../tsconfig.json) | TypeScript config principal |
| [`tsconfig.app.json`](../tsconfig.app.json) | TypeScript config app |
| [`tsconfig.node.json`](../tsconfig.node.json) | TypeScript config node |
| [`postcss.config.js`](../postcss.config.js) | PostCSS config |
| [`postcss.config.cjs`](../postcss.config.cjs) | PostCSS config (CJS) |
| [`eslint.config.js`](../eslint.config.js) | ESLint config |
| [`.env.local`](../.env.local) | Variables de entorno locales |

---

## 🚀 Entry Points

| Archivo | Propósito |
|---------|-----------|
| [`src/main.tsx`](./main.tsx) | Bootstrap de React, providers, router |
| [`src/App.tsx`](./App.tsx) | Router principal, layout base |
| [`src/index.css`](./index.css) | Estilos globales (Tailwind v4) |

---

## 🗄️ Estado (Zustand)

| Archivo | Propósito |
|---------|-----------|
| [`src/store/store.ts`](./store/store.ts) | Store principal — sales, insights, vendorAnalysis, clienteSummaries, productoSummaries, departamentoSummaries, inventory, concentracionRiesgo, clientesDormidos, monthlyTotals, configuracion |
| [`src/store/useStore.ts`](./store/useStore.ts) | Hook de acceso al store |
| [`src/store/index.ts`](./store/index.ts) | Re-exports del store |

---

## 🧠 Motor de Análisis (src/lib/)

### Core del insight engine
| Archivo | Propósito | Relación con insightStandard |
|---------|-----------|------------------------------|
| [`src/lib/insightStandard.ts`](./lib/insightStandard.ts) | Reglas, filtros y validaciones | **ES** el estándar |
| [`src/lib/insightEngine.ts`](./lib/insightEngine.ts) | Generador de insights (28 funciones actuales) | Debe importar y respetar `insightStandard.ts` |
| [`src/lib/insightRenderer.ts`](./lib/insightRenderer.ts) | Renderizado/formato de insights para UI | Usa `FORMATO` de insightStandard |

### Análisis por dimensión
| Archivo | Propósito |
|---------|-----------|
| [`src/lib/vendorAnalysis.ts`](./lib/vendorAnalysis.ts) | Análisis de vendedores (YTD, variación, riesgo, ticket, clientes activos) |
| [`src/lib/clientAnalysis.ts`](./lib/clientAnalysis.ts) | Análisis de clientes (summaries, dormidos, riesgo, frecuencia) |
| [`src/lib/productAnalysis.ts`](./lib/productAnalysis.ts) | Análisis de productos (YTD, variación, clientes activos) |
| [`src/lib/departmentAnalysis.ts`](./lib/departmentAnalysis.ts) | Análisis por departamento |
| [`src/lib/canalAnalysis.ts`](./lib/canalAnalysis.ts) | Análisis por canal |
| [`src/lib/categoryAnalysis.ts`](./lib/categoryAnalysis.ts) | Análisis por categoría |
| [`src/lib/supervisorAnalysis.ts`](./lib/supervisorAnalysis.ts) | Análisis por supervisor |
| [`src/lib/concentracionAnalysis.ts`](./lib/concentracionAnalysis.ts) | Riesgo de concentración (Pareto de clientes) |
| [`src/lib/dormidosAnalysis.ts`](./lib/dormidosAnalysis.ts) | Clientes dormidos (frecuencia, recovery score) |
| [`src/lib/rotacionAnalysis.ts`](./lib/rotacionAnalysis.ts) | Análisis de rotación |
| [`src/lib/metasAnalysis.ts`](./lib/metasAnalysis.ts) | Cumplimiento de metas |
| [`src/lib/monthlyAnalysis.ts`](./lib/monthlyAnalysis.ts) | Totales mensuales y same-day |
| [`src/lib/teamAnalysis.ts`](./lib/teamAnalysis.ts) | Stats del equipo |
| [`src/lib/forecastAnalysis.ts`](./lib/forecastAnalysis.ts) | Proyecciones / forecast |

### Procesamiento de datos
| Archivo | Propósito |
|---------|-----------|
| [`src/lib/dataProcessor.ts`](./lib/dataProcessor.ts) | Procesamiento principal de datos cargados |
| [`src/lib/excelParser.ts`](./lib/excelParser.ts) | Parser de archivos Excel |
| [`src/lib/csvParser.ts`](./lib/csvParser.ts) | Parser de archivos CSV |
| [`src/lib/fileProcessor.ts`](./lib/fileProcessor.ts) | Orquestador de carga de archivos |
| [`src/lib/parseUtils.ts`](./lib/parseUtils.ts) | Utilidades de parsing |
| [`src/lib/columnMapping.ts`](./lib/columnMapping.ts) | Mapeo de columnas del usuario a formato interno |

### Utilidades y servicios
| Archivo | Propósito |
|---------|-----------|
| [`src/lib/utils.ts`](./lib/utils.ts) | Utilidades generales |
| [`src/lib/formatters.ts`](./lib/formatters.ts) | Formateo de números, moneda, fechas |
| [`src/lib/dateUtils.ts`](./lib/dateUtils.ts) | Utilidades de fechas |
| [`src/lib/chartUtils.ts`](./lib/chartUtils.ts) | Utilidades para gráficos |
| [`src/lib/constants.ts`](./lib/constants.ts) | Constantes globales |
| [`src/lib/config.ts`](./lib/config.ts) | Configuración de la app |
| [`src/lib/theme.ts`](./lib/theme.ts) | Configuración de tema (claro/oscuro) |
| [`src/lib/routes.ts`](./lib/routes.ts) | Definición de rutas |
| [`src/lib/types.ts`](./lib/types.ts) | Tipos TypeScript compartidos |
| [`src/lib/api.ts`](./lib/api.ts) | Llamadas al backend (FastAPI) |
| [`src/lib/auth.ts`](./lib/auth.ts) | Autenticación |
| [`src/lib/supabaseClient.ts`](./lib/supabaseClient.ts) | Cliente de Supabase |
| [`src/lib/chatService.ts`](./lib/chatService.ts) | Servicio del chatbot / asistente virtual |
| [`src/lib/forecastService.ts`](./lib/forecastService.ts) | Servicio de forecast |
| [`src/lib/reportGenerator.ts`](./lib/reportGenerator.ts) | Generación de reportes |
| [`src/lib/workerManager.ts`](./lib/workerManager.ts) | Gestor de Web Workers |

---

## 👷 Workers

| Archivo | Propósito |
|---------|-----------|
| [`src/lib/analysisWorker.ts`](./lib/analysisWorker.ts) | Worker de análisis (lib/) |
| [`src/workers/analysisWorker.ts`](./workers/analysisWorker.ts) | Worker de análisis (workers/) |
| [`src/workers/dataWorker.ts`](./workers/dataWorker.ts) | Worker de procesamiento de datos |
| [`src/workers/parseWorker.ts`](./workers/parseWorker.ts) | Worker de parsing |

---

## 📄 Páginas

| Archivo | Ruta | Propósito |
|---------|------|-----------|
| [`src/pages/Dashboard.tsx`](./pages/Dashboard.tsx) | `/dashboard` | Estado Comercial — alertas, semáforo, KPIs, insights |
| [`src/pages/Vendedores.tsx`](./pages/Vendedores.tsx) | `/vendedores` | Panel de vendedores |
| [`src/pages/Clientes.tsx`](./pages/Clientes.tsx) | `/clientes` | Análisis de clientes |
| [`src/pages/Rotacion.tsx`](./pages/Rotacion.tsx) | `/rotacion` | Rotación de clientes |
| [`src/pages/Departamentos.tsx`](./pages/Departamentos.tsx) | `/departamentos` | Análisis por departamento |
| [`src/pages/RendimientoAnual.tsx`](./pages/RendimientoAnual.tsx) | `/rendimiento` | Rendimiento anual |
| [`src/pages/Metas.tsx`](./pages/Metas.tsx) | `/metas` | Gestión de metas |
| [`src/pages/Supervisor.tsx`](./pages/Supervisor.tsx) | `/supervisor` | Vista de supervisor |
| [`src/pages/Categorias.tsx`](./pages/Categorias.tsx) | `/categorias` | Análisis por categoría |
| [`src/pages/Canales.tsx`](./pages/Canales.tsx) | `/canales` | Análisis por canal |
| [`src/pages/Productos.tsx`](./pages/Productos.tsx) | `/productos` | Análisis de productos |
| [`src/pages/AsistenteVirtual.tsx`](./pages/AsistenteVirtual.tsx) | `/asistente` | Chatbot / Asistente Virtual |
| [`src/pages/CargarDatos.tsx`](./pages/CargarDatos.tsx) | `/cargar` | Carga de archivos (Excel/CSV) |
| [`src/pages/Login.tsx`](./pages/Login.tsx) | `/login` | Autenticación |
| [`src/pages/EstadoComercial.tsx`](./pages/EstadoComercial.tsx) | — | Componente de estado comercial |
| [`src/pages/NotFound.tsx`](./pages/NotFound.tsx) | `*` | 404 |

---

## 🧩 Componentes

### Layout y navegación
| Archivo | Propósito |
|---------|-----------|
| [`src/components/Layout.tsx`](./components/Layout.tsx) | Layout principal (sidebar + content) |
| [`src/components/Sidebar.tsx`](./components/Sidebar.tsx) | Barra lateral de navegación |
| [`src/components/Navbar.tsx`](./components/Navbar.tsx) | Barra de navegación |
| [`src/components/Header.tsx`](./components/Header.tsx) | Header |
| [`src/components/TopBar.tsx`](./components/TopBar.tsx) | Barra superior (moneda, tema, etc.) |
| [`src/components/ThemeToggle.tsx`](./components/ThemeToggle.tsx) | Toggle claro/oscuro |
| [`src/components/ProtectedRoute.tsx`](./components/ProtectedRoute.tsx) | Rutas protegidas por auth |
| [`src/components/ErrorBoundary.tsx`](./components/ErrorBoundary.tsx) | Captura de errores React |
| [`src/components/LoadingScreen.tsx`](./components/LoadingScreen.tsx) | Pantalla de carga |

### Insights
| Archivo | Propósito | Relación con insightStandard |
|---------|-----------|------------------------------|
| [`src/components/InsightCard.tsx`](./components/InsightCard.tsx) | Card individual de insight | Renderiza datos validados por el estándar |
| [`src/components/InsightPanel.tsx`](./components/InsightPanel.tsx) | Panel contenedor de insights | Agrupa y ordena por prioridad (F1, F4) |
| [`src/components/InsightList.tsx`](./components/InsightList.tsx) | Lista de insights | Presentación |
| [`src/components/InsightSection.tsx`](./components/InsightSection.tsx) | Sección de insights | Agrupación visual |
| [`src/components/InsightDetail.tsx`](./components/InsightDetail.tsx) | Vista detallada de insight | Muestra cruces completos (C1) |
| [`src/components/Profundizar.tsx`](./components/Profundizar.tsx) | Botón/panel de profundización | Deep-dive en insight |
| [`src/components/DeepDive.tsx`](./components/DeepDive.tsx) | Análisis profundo | Expansión de insight |

### Paneles de análisis
| Archivo | Propósito |
|---------|-----------|
| [`src/components/VendedorPanel.tsx`](./components/VendedorPanel.tsx) | Panel de vendedor (**NO TOCAR**) |
| [`src/components/VendedorCard.tsx`](./components/VendedorCard.tsx) | Card de vendedor |
| [`src/components/ClientePanel.tsx`](./components/ClientePanel.tsx) | Panel de cliente |
| [`src/components/ClienteCard.tsx`](./components/ClienteCard.tsx) | Card de cliente |
| [`src/components/ProductoPanel.tsx`](./components/ProductoPanel.tsx) | Panel de producto |
| [`src/components/DepartamentoPanel.tsx`](./components/DepartamentoPanel.tsx) | Panel de departamento |
| [`src/components/CanalPanel.tsx`](./components/CanalPanel.tsx) | Panel de canal |
| [`src/components/MetasPanel.tsx`](./components/MetasPanel.tsx) | Panel de metas |
| [`src/components/SemaforoVendedor.tsx`](./components/SemaforoVendedor.tsx) | Semáforo de riesgo |
| [`src/components/ConcentracionCard.tsx`](./components/ConcentracionCard.tsx) | Card de concentración |

### Visualización de datos
| Archivo | Propósito |
|---------|-----------|
| [`src/components/Charts.tsx`](./components/Charts.tsx) | Gráficos |
| [`src/components/ForecastChart.tsx`](./components/ForecastChart.tsx) | Gráfico de forecast |
| [`src/components/DataTable.tsx`](./components/DataTable.tsx) | Tabla de datos |
| [`src/components/KPICard.tsx`](./components/KPICard.tsx) | Cards de KPIs |

### Carga de datos
| Archivo | Propósito |
|---------|-----------|
| [`src/components/FileUpload.tsx`](./components/FileUpload.tsx) | Componente de upload |
| [`src/components/ColumnMapper.tsx`](./components/ColumnMapper.tsx) | Mapeo visual de columnas |
| [`src/components/StepIndicator.tsx`](./components/StepIndicator.tsx) | Indicador de pasos |

### Chat
| Archivo | Propósito |
|---------|-----------|
| [`src/components/ChatBot.tsx`](./components/ChatBot.tsx) | Componente del chatbot |
| [`src/components/ChatMessage.tsx`](./components/ChatMessage.tsx) | Mensajes del chat |

### UI primitivos
| Archivo | Propósito |
|---------|-----------|
| [`src/components/ui/Button.tsx`](./components/ui/Button.tsx) | Botón |
| [`src/components/ui/Card.tsx`](./components/ui/Card.tsx) | Card |
| [`src/components/ui/Modal.tsx`](./components/ui/Modal.tsx) | Modal |
| [`src/components/ui/Input.tsx`](./components/ui/Input.tsx) | Input |
| [`src/components/ui/Select.tsx`](./components/ui/Select.tsx) | Select |
| [`src/components/ui/Badge.tsx`](./components/ui/Badge.tsx) | Badge |
| [`src/components/ui/Tabs.tsx`](./components/ui/Tabs.tsx) | Tabs |
| [`src/components/ui/Table.tsx`](./components/ui/Table.tsx) | Table |
| [`src/components/ui/Tooltip.tsx`](./components/ui/Tooltip.tsx) | Tooltip |
| [`src/components/ui/Dropdown.tsx`](./components/ui/Dropdown.tsx) | Dropdown |
| [`src/components/ui/Skeleton.tsx`](./components/ui/Skeleton.tsx) | Skeleton loader |
| [`src/components/ui/Switch.tsx`](./components/ui/Switch.tsx) | Switch toggle |
| [`src/components/ui/Dialog.tsx`](./components/ui/Dialog.tsx) | Dialog |
| [`src/components/ui/Alert.tsx`](./components/ui/Alert.tsx) | Alert |

---

## 🪝 Hooks

| Archivo | Propósito |
|---------|-----------|
| [`src/hooks/useAuth.ts`](./hooks/useAuth.ts) | Hook de autenticación |
| [`src/hooks/useTheme.ts`](./hooks/useTheme.ts) | Hook de tema |
| [`src/hooks/useStore.ts`](./hooks/useStore.ts) | Hook del store |
| [`src/hooks/useForecast.ts`](./hooks/useForecast.ts) | Hook de forecast |
| [`src/lib/hooks.ts`](./lib/hooks.ts) | Hooks adicionales |

---

## 🔐 Contextos

| Archivo | Propósito |
|---------|-----------|
| [`src/context/AuthContext.tsx`](./context/AuthContext.tsx) | Contexto de autenticación |
| [`src/context/ThemeContext.tsx`](./context/ThemeContext.tsx) | Contexto de tema |

---

## 📝 Tipos

| Archivo | Propósito |
|---------|-----------|
| [`src/types/index.ts`](./types/index.ts) | Tipos principales |
| [`src/types/types.ts`](./types/types.ts) | Tipos adicionales |
| [`src/lib/types.ts`](./lib/types.ts) | Tipos en lib |

---

## 🚫 NO TOCAR

Estos archivos/carpetas están fuera del scope de modificación:

| Archivo/Carpeta | Razón |
|----------------|-------|
| `src/components/VendedorPanel.tsx` | Instrucción explícita del usuario |
| `backend/` | Python FastAPI — scope separado |
| `supabase/` | Migrations — scope separado |
| Botón `chatQuestion` | No modificar el trigger del asistente |

---

## 🔗 Flujo de datos del Insight Engine
```
Archivos de venta (Excel/CSV)
  → fileProcessor.ts → excelParser.ts / csvParser.ts
    → columnMapping.ts → dataProcessor.ts
      → analysisWorker.ts (Web Worker)
        → vendorAnalysis.ts, clientAnalysis.ts, productAnalysis.ts...
          → insightEngine.ts
            → insightStandard.ts (VALIDACIÓN)
              → store.ts (insights[])
                → InsightPanel.tsx → InsightCard.tsx

Total: 97 archivos mapeados
