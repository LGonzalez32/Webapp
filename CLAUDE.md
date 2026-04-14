# SalesFlow — Monitor de Riesgo Comercial
## v2.0 | React + TypeScript + Zustand + Recharts + Vite

---

## PRODUCTO
B2B SaaS para empresas con equipos de ventas. Detecta riesgos comerciales
antes de que afecten resultados. NO es un dashboard BI,
es un motor de decisiones.

---

## STACK FRONTEND (activo)
- React 19 + TypeScript + Vite
- Zustand v5 (persist v3, key: salesflow-storage)
- Recharts para gráficas
- Tailwind v4 (sin tailwind.config.js)
- react-router-dom v7
- Lucide React para iconos
- Sonner para toasts
- PapaParse + XLSX para archivos
- Zod para validación

## STACK BACKEND (construido, no conectado al frontend)
- Python FastAPI en /backend
- Modelos: NAIVE, ETS, SARIMA, ENSEMBLE
- Endpoints: /api/v1/forecast, /health
- NO tocar backend salvo instrucción explícita

## SERVICIOS EXTERNOS
- DeepSeek API (chat): https://api.deepseek.com/chat/completions
  Modelos: deepseek-chat (chat normal), deepseek-reasoner (análisis profundo)
  API key: configuracion.deepseek_api_key (guardada en store)
- Supabase: configurado pero NO activo en frontend actual

---

## ARQUITECTURA FRONTEND

### Flujo de datos
1. Upload → fileParser.ts → setSales/setMetas/setInventory
2. useAnalysis.ts → detectDataAvailability → computeCommercialAnalysis
   → computeCategoriasInventario → generateInsights → store
3. Páginas leen del store via useAppStore()
4. TopBar cambia selectedPeriod → isProcessed=false → re-análisis

### Store (appStore.ts)
PERSISTIDO: selectedPeriod, configuracion, orgId
SOLO MEMORIA (recalculado): vendorAnalysis, teamStats, insights,
  clientesDormidos, concentracionRiesgo, categoriasInventario,
  forecastData, isProcessed, isLoading

### Análisis
- fechaReferencia = SIEMPRE max(sales.fecha), NUNCA new Date()
- YTD: comparación homóloga (1 ene año actual vs 1 ene año anterior)
- Inventario: PM3 de 3 meses CERRADOS antes de selectedPeriod

---

## REGLAS DE NEGOCIO CRÍTICAS

### Comparaciones de períodos (ABSOLUTO — nunca romper)
- Solo 2 tipos válidos de comparación:
  - YTD: Jan 1 a fechaReferencia del año actual vs mismo rango año anterior
  - MTD YoY: día 1 al día N del mes actual vs mismo rango del mismo mes año anterior
- NUNCA comparar un período parcial (ej: 9 días) contra un mes completo (30 días)
- Cuando isCurrentMonth=true: filtrar año anterior con getDate() <= diasTranscurridos

### recoveryScore
- Existe internamente en vendorAnalysis para ordenar/priorizar
- NUNCA mostrar el número x/100 al usuario en ninguna UI
- Mostrar solo: etiqueta en español + texto de acción contextual

### tipoMetaActivo
- Valores: 'uds' | 'usd'
- Todos los KPIs, cards y tablas deben mostrar SOLO el tipo activo
- No mezclar métricas en la misma vista

### Componentes — DO NOT TOUCH (salvo instrucción explícita)
- PulsoPanel.tsx (Content components ya enriquecidos con cross-table)
- VendedorPanel.tsx (análisis correcto)
- AnalysisDrawer.tsx (soporta analysisContent JSX además de texto plano)
- El chat / asistente virtual
- La apariencia de las PULSO cards en el dashboard

### Componentes UI reutilizables (usar siempre en lugar de <select>/<input> nativos)
- src/components/ui/SFSelect.tsx — select estilizado con chevron propio
- src/components/ui/SFSearch.tsx — input de búsqueda con icono integrado

## REGLAS DE DESARROLLO

### Edición de código
- Usar str_replace, NO reescribir archivos completos
- Leer SOLO las funciones afectadas, no el archivo entero
- Cambios quirúrgicos únicamente
- tsc --noEmit debe dar 0 errores al terminar

### Lo que NO tocar salvo instrucción explícita
- backend/ (Python FastAPI — no conectado)
- supabase/ (migraciones — no activo)
- forecastApi.ts (código muerto, pendiente reconexión)
- errorHandler.ts (código muerto, no interfiere)

### Dependencias
- NO instalar librerías nuevas sin preguntar
- NO usar react-markdown ni librerías de parsing externas
- Tailwind v4: no tiene tailwind.config.js, usa @tailwindcss/vite

---

## PÁGINAS ACTIVAS (9 rutas)
/dashboard      → EstadoComercialPage  (pantalla principal)
/vendedores     → VendedoresPage
/rendimiento    → RendimientoPage      (pivot table + LineChart)
/clientes       → ClientesPage         (condicional has_cliente)
/rotacion       → RotacionPage         (condicional has_inventario)
/metas          → MetasPage            (condicional has_metas)
/chat           → ChatPage             (DeepSeek conectado)
/cargar         → UploadPage
/configuracion  → ConfiguracionPage

---

## INSIGHTS (insightEngine.ts)
Prioridades: CRITICA > ALTA > MEDIA > BAJA
fechaReferencia propagada a todos los detectores.
~26 detectores activos con cross-table analysis (vendedores × clientes × productos × inventario).
Todos los detectores usan same-day-range para comparaciones YoY.
Insights con impacto_economico (solo si has_venta_neta):
  Meta en Peligro, Concentración Sistémica, Equipo No Cerrará Meta,
  Doble Riesgo, Caída Explicada

---

## DATOS DEMO

Empresa: Los Pinos S.A.
8 vendedores, 20 productos, 30 clientes, 93,155 filas de ventas
Rango: Enero 2024 – Abril 2026 (fecha ref: Abr 9, 2026)
4 categorías: Refrescos, Lácteos, Limpieza, Snacks
3 canales: Mayoreo, Mostrador, Autoservicio
3 supervisores, 10 departamentos (El Salvador)

---

## DEUDA TÉCNICA (pendiente, no urgente)
- Conectar backend Python forecast a RendimientoPage
- Supabase Auth + RLS (antes del primer cliente pagador)
- MetasPage: expandir para dimensiones producto/cliente/canal

---

## PRÓXIMO MILESTONE
Validar demo con 2 clientes piloto usando datos reales CSV.
