# SalesFlow — Mapa del Proyecto

> Fuente de verdad para ubicar cualquier archivo del proyecto.
> Última actualización: abril 2026

---

## 📐 Reglas y Estándares

| Archivo | Propósito |
|---------|-----------|
| [`src/lib/insightStandard.ts`](./lib/insightStandard.ts) | **INSIGHT ENGINE STANDARD v2.0** — 37 reglas en 9 grupos (32 mejoradas + 5 nuevas A-E). Fuente de verdad para validación de insights. Conectada al pipeline — todo insight pasa por validarInsight(), validarProporcionalidad(), validarBalance(), detectarRedundancia(), validarCoherenciaTemporal() y sanitizarNarrativa() antes de emitirse. |

---

## 📖 Guía de Reglas del Insight Engine (`insightStandard.ts`)

### Grupo 1 — Clasificación y Priorización

| Regla | Qué hace | Por qué existe | Parámetros | Retorna | Estado |
|-------|----------|----------------|------------|---------|--------|
| `calcularPercentiles` | Divide una lista de valores en percentiles (p5 a p95) | Todos los umbrales son dinámicos, no hardcodeados | `valores: number[]` | `{ p5, p10, p20, p50, p75, p80, p90, p95 }` | ⏳ Disponible |
| `determinarMaxPrioridad` | Convierte un percentile rank en prioridad máxima elegible | Evita que insights menores aparezcan como críticos | `percentileRank: number` | `'CRITICA' \| 'ALTA' \| 'MEDIA' \| 'BAJA'` | ⏳ Disponible |
| `validarProporcionalidad` **(NUEVA C)** | Baja la prioridad si el impacto en $ es muy pequeño relativo al negocio total | Un insight de $50 no puede ser CRÍTICO en un negocio de $5M | `impactoAbsoluto, ventaTotalNegocio, prioridadActual` | `{ proporcional, prioridadSugerida, porcentajeImpacto }` | ⏳ Disponible |

### Grupo 2 — Filtros de Ruido

| Regla | Qué hace | Por qué existe | Parámetros | Retorna | Estado |
|-------|----------|----------------|------------|---------|--------|
| `pasaFiltroRuido` | Excluye clientes con poquísimas compras y bajo valor | Sin esto, clientes marginales generan insights falsos | `transacciones, valorAcumulado, percentil10Clientes, medianaTxGlobal` | `boolean` | ⏳ Disponible |
| `detectarRedundancia` **(NUEVA B)** | Encuentra pares de insights que dicen lo mismo sobre la misma entidad | Evita repetir el mismo problema con distintas palabras | `candidatos[]` con vendedor/cliente/producto/tipo/descripcion | Array de `{ mantener, descartar, razon }` | ⏳ Disponible |

### Grupo 3 — Análisis de Clientes

| Regla | Qué hace | Por qué existe | Parámetros | Retorna | Estado |
|-------|----------|----------------|------------|---------|--------|
| `calcularChurnBaseline` | Calcula la tasa histórica de pérdida de clientes, ponderando períodos recientes más fuerte | La rotación normal no es insight; solo lo que sale de lo habitual | `clientesActivosPorPeriodo[]` (mín. 4 períodos) | `{ tasaPromedio, desviacionEstandar }` | ⏳ Disponible |
| `esChurnSignificativo` | Decide si perder a un cliente específico es relevante o ruido normal | Filtrar pérdidas ordinarias de las que sí importan | `valorCliente, p75Clientes, churnActual, churnBaseline, esUnicoEnSegmento?, tendenciaCliente?` | `boolean` | ⏳ Disponible |
| `evaluarDormidoConContexto` | Determina si un cliente inactivo está realmente dormido o si hay una razón válida (patrón de compra tardío, desabasto, zona en caída, vendedor en riesgo) | Evitar reactivaciones innecesarias y detectar causas reales | `diasSinCompra, contexto (ContextoCompleto), valorCliente?, p75Clientes?` | `{ esDormidoReal, razon, reactivacionPrioritaria }` | ⏳ Disponible |
| `evaluarPenetracion` | Mide qué fracción del catálogo disponible compra este cliente, vs el promedio | Detectar oportunidad de venta cruzada sin requerir historial largo | `productosCliente, totalProductosDisponibles, promedioProductosPorCliente` | `{ penetracion, fragil, oportunidad, porDebajoDelPromedio, diferenciaVsPromedio }` | ⏳ Disponible |

### Grupo 4 — Análisis de Productos

| Regla | Qué hace | Por qué existe | Parámetros | Retorna | Estado |
|-------|----------|----------------|------------|---------|--------|
| `calcularPareto` | Lista los productos/vendedores/clientes que componen el 80% del volumen | Priorizar análisis en las entidades que más impactan | `entidades[]: { nombre, valor }` | `string[]` (nombres) | ⏳ Disponible |
| `esEntidadPareto` | Verifica si un nombre está en la lista Pareto | Lookup rápido en el pipeline | `nombre, paretoList` | `boolean` | ⏳ Disponible |
| `detectarFamiliasProducto` | Agrupa variantes del mismo producto base quitando medidas, formatos y sufijos promocionales | Evitar tratar "COCA 600ML" y "COCA 2L PROMO" como productos distintos al analizar declive | `productos: string[]` | `Map<familia, productos[]>` | ⏳ Disponible |
| `esVariantePromocional` | Detecta si un nombre de producto es una edición promo o bonificada | Las promos no representan demanda real; deben excluirse de trends | `nombre: string` | `boolean` | ⏳ Disponible |
| `calcularCoOcurrencia` | Cuenta cuántos clientes compran cada par de productos juntos | Base para detectar co-declive y oportunidades de venta cruzada | `clientProductMap: Map<cliente, Set<producto>>` | `Map<producto, Map<producto, count>>` | ⏳ Disponible |
| `detectarCoDeclive` | Agrupa productos en caída que comparten clientes o departamento (descarta coincidencias) | Distinguir una caída de categoría real de dos declines sin relación | `productosEnDeclive, coMatrix, totalClientes, productoDeptMap` | `string[][]` (grupos) | ⏳ Disponible |

### Grupo 5 — Análisis Cruzado

| Regla | Qué hace | Por qué existe | Parámetros | Retorna | Estado |
|-------|----------|----------------|------------|---------|--------|
| `CRUCES_DISPONIBLES` | Mapa completo de campos disponibles por entidad (vendedor, cliente, producto) | Los generadores deben intentar todos los cruces disponibles antes de emitir | Constante de solo lectura | `{ vendedor, cliente, producto }` con directos/conVentas/conOtrasTablas | ⏳ Disponible |
| `evaluarIndicadorAnticipado` | Score ponderado (0-7.5) de señales de riesgo convergentes | Detectar problemas antes de que aparezcan en ventas; no requiere justificación histórica | `{ cambioBaseClientes, cambioRevenue, tendenciaMensual3m, inventarioMesesCobertura, saludVendedor }` | `{ esAnticipado, riesgo, scoreTotal, scorePosible, señalesActivadas, confianza }` | ⏳ Disponible |
| `detectarCascadas` | Identifica entidades que aparecen en ≥2 insights, con severidad por prioridad | Una entidad con múltiples señales requiere atención urgente | `candidatos[]` con entityType/entityId/prioridad | `Map<entidad, { insights, severidad }>` | ⏳ Disponible |

### Grupo 6 — Validación Temporal

| Regla | Qué hace | Por qué existe | Parámetros | Retorna | Estado |
|-------|----------|----------------|------------|---------|--------|
| `validarComparacionTemporal` | Asigna confianza al tipo de comparación según el día del mes (escala progresiva) | Los primeros 7 días del mes no tienen suficiente data para comparar | `tipo ('YTD'\|'MTD'\|'historico'), diaDelMes, _fechaRef` | `{ valido, confianza ('alta'\|'media'\|'temprana'\|'muy_temprana') }` | ⏳ Disponible |
| `calcularConfianzaTemporal` | Mide qué tan predecible es el negocio usando coeficiente de variación | Negocios volátiles no deben proyectar igual que negocios estables | `_diaDelMes, historialPctPorDia: number[]` | `{ pctTipico, varianza, confiable, coeficienteVariacion, tipoNegocio }` | ⏳ Disponible |
| `validarCoherenciaTemporal` **(NUEVA D)** | Detecta si el texto usa certezas ("cerrará", "no llegará") en la primera semana del mes | Evitar afirmaciones falsas cuando el mes apenas empieza | `texto, diaDelMes, diasEnMes` | `{ coherente, progreso, problema }` | ⏳ Disponible |

### Grupo 7 — Calidad de Contenido

| Regla | Qué hace | Por qué existe | Parámetros | Retorna | Estado |
|-------|----------|----------------|------------|---------|--------|
| `validarAccionConcreta` | Rechaza acciones vagas (monitorear, evaluar, dar seguimiento) y sin datos de respaldo | Las acciones deben ser ejecutables, no filosóficas | `accion: AccionConcreta` | `boolean` | ⏳ Disponible |
| `TERMINOS_PROHIBIDOS_EN_OUTPUT` | Lista de términos técnicos prohibidos en texto para el usuario final | El usuario no es analista de datos; no debe ver "churn", "YoY", "SKU", etc. | Constante | `string[]` (22 términos) | ✅ Activa (via `contieneJerga`) |
| `sustituirJerga` | Reemplaza términos técnicos por equivalentes en español natural | Garantizar lenguaje comprensible sin edición manual | `texto: string` | `string` (texto limpio) | ✅ Activa |
| `contieneJerga` | Detecta si un texto contiene algún término prohibido | Permite rechazar o corregir antes de mostrar al usuario | `texto: string` | `{ tieneJerga, terminosEncontrados }` | ✅ Activa |
| `esConclusionValida` | Rechaza conclusiones genéricas ("requiere atención", "es importante", etc.) | La conclusión debe interpretar, no repetir los datos | `conclusion: string` | `boolean` | ✅ Activa |
| `sanitizarNarrativa` **(NUEVA A)** | Corrige tiempo verbal (mes no cerrado → presente progresivo) y concordancia de número | Evitar "cerró el mes con" cuando el mes aún va a la mitad | `texto, { diaDelMes, diasEnMes }` | `string` (texto corregido) | ⏳ Disponible |
| `limitarRepeticionKPI` **(NUEVA E)** | Detecta si el Estado General repite valores que ya muestran las cards | El texto explicativo debe complementar las KPIs, no duplicarlas | `texto, kpiValues: { ventaYTD?, variacionYTD?, ... }` | `{ tieneRepeticiones, valoresRepetidos }` | ⏳ Disponible |

### Grupo 8 — Integración de Datos

| Regla | Qué hace | Por qué existe | Parámetros | Retorna | Estado |
|-------|----------|----------------|------------|---------|--------|
| `formatearImpacto` | Formatea un número como "$1.2M", "$450k" o "1,200 uds" según disponibilidad de venta neta | Presentar impacto en unidades apropiadas para cada empresa | `valor, hasVentaNeta, simboloMoneda? (default '$')` | `string` | ✅ Activa |
| `evaluarIntegracionInventario` | Cruza un producto con el inventario para obtener stock actual y meses de cobertura | El inventario explica muchos declines de venta; debe cruzarse siempre | `producto, inventory[], ventasMensualesPromedio` | `{ stockActual, mesesCobertura, sinStock, sobrestock } \| null` | ⏳ Disponible |
| `evaluarIntegracionMetas` | Cruza un vendedor con sus metas del mes y calcula cumplimiento, gap y dos proyecciones | Contexto de meta es obligatorio para insights de vendedor | `vendedor, metas[], fechaRef, ventaActualMes, ventaUltimos7Dias?` | `{ metaMes, cumplimiento, gap, proyeccion, proyeccionReciente, tipoMeta } \| null` | ⏳ Disponible |
| `calcularDiasEnMes` / `calcularDiaDelMes` | Utilitarios de fecha | Centralizar cálculo de días para consistencia | `fecha: Date` | `number` | ⏳ Disponible |
| `FORMATO` | Objeto con funciones de formateo estándar (moneda, porcentaje, número) | API uniforme para formateo en todos los generadores | — | `{ moneda, porcentaje, numero }` | ⏳ Disponible |

### Grupo 9 — Pipeline

| Regla | Qué hace | Por qué existe | Parámetros | Retorna | Estado |
|-------|----------|----------------|------------|---------|--------|
| `resolverContradiccion` | Cuando una misma entidad tiene múltiples candidatos, mantiene el de mayor impacto y fusiona los títulos de los descartados en `contextoAdicional` | Evitar que el mismo vendedor aparezca con dos insights contradictorios | `candidatos[]` | `candidatos[]` (sin duplicados de entidad) | ⏳ Disponible |
| `validarBalance` | Verifica ratio mínimo de 1 insight positivo por cada 4 negativos; si no hay ningún positivo sugiere `cap_negativos` | Un reporte solo de malas noticias es parcial y desmotiva | `insights[]: { esPositivo }` | `{ balanceado, positivosFaltantes, sugerencia? }` | ⏳ Disponible |
| `validarInsight` | 18 checks secuenciales sobre un candidato real del engine: cruces mínimos, impacto cuantificado, descripción suficiente, comparación temporal, acción concreta, sin jerga, conclusión válida | Puerta de calidad final antes de emitir; usa campos reales (`__impactoAbs`, `cruces`, `descripcion`) | `candidato, config: { percentileRank?, comparacionTipo?, diaDelMes }` | `{ aprobado, razon?, maxPrioridad, warnings[] }` | ⏳ Disponible |

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
