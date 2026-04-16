# SalesFlow — Monitor de Riesgo Comercial
## v2.0 | React + TypeScript + Zustand + Recharts + Vite

---

## PRODUCTO
B2B SaaS para empresas con equipos de ventas. Detecta riesgos comerciales
antes de que afecten resultados. NO es un dashboard BI, es un motor de decisiones.

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
- NO tocar backend salvo instrucción explícita

## SERVICIOS EXTERNOS
- DeepSeek API (chat): https://api.deepseek.com/chat/completions
  Modelos: deepseek-chat, deepseek-reasoner
  API key: configuracion.deepseek_api_key (en store)
- Supabase: configurado pero NO activo en frontend

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
SOLO MEMORIA: vendorAnalysis, teamStats, insights, clientesDormidos,
  concentracionRiesgo, categoriasInventario, forecastData, isProcessed, isLoading

### Análisis
- fechaReferencia = SIEMPRE max(sales.fecha), NUNCA new Date()
- YTD: comparación homóloga (1 ene año actual vs 1 ene año anterior)
- Inventario: PM3 de 3 meses CERRADOS antes de selectedPeriod

---

## REGLAS DE NEGOCIO CRÍTICAS

### Comparaciones de períodos (ABSOLUTO — nunca romper)
- YTD: Jan 1 a fechaReferencia año actual vs mismo rango año anterior
- MTD YoY: día 1 al día N del mes actual vs mismo rango del mismo mes año anterior
- NUNCA comparar período parcial contra mes completo
- isCurrentMonth=true: filtrar año anterior con getDate() <= diasTranscurridos

### recoveryScore
- Interno en vendorAnalysis — NUNCA mostrar el número x/100 en UI
- Mostrar solo: etiqueta en español + texto de acción contextual

### tipoMetaActivo ('uds' | 'usd')
- Todos los KPIs, cards y tablas muestran SOLO el tipo activo
- No mezclar métricas en la misma vista

### Componentes — DO NOT TOUCH (salvo instrucción explícita)
- PulsoPanel.tsx, VendedorPanel.tsx, AnalysisDrawer.tsx
- El chat / asistente virtual
- La apariencia de las PULSO cards en el dashboard

### Componentes UI reutilizables (siempre en lugar de nativos)
- src/components/ui/SFSelect.tsx — select estilizado
- src/components/ui/SFSearch.tsx — input de búsqueda

---

## REGLAS DE DESARROLLO

### Edición de código
- Usar str_replace, NO reescribir archivos completos
- Leer SOLO las funciones afectadas, no el archivo entero
- Cambios quirúrgicos únicamente
- tsc --noEmit debe dar 0 errores al terminar

### Lo que NO tocar salvo instrucción explícita
- backend/ (Python FastAPI — no conectado)
- supabase/ (migraciones — no activo)
- forecastApi.ts, errorHandler.ts (código muerto)

### Dependencias
- NO instalar librerías nuevas sin preguntar
- NO usar react-markdown ni librerías de parsing externas
- Tailwind v4: no tiene tailwind.config.js, usa @tailwindcss/vite

---

## PÁGINAS ACTIVAS (9 rutas)
/dashboard      → EstadoComercialPage
/vendedores     → VendedoresPage
/rendimiento    → RendimientoPage
/clientes       → ClientesPage (condicional has_cliente)
/rotacion       → RotacionPage (condicional has_inventario)
/metas          → MetasPage (condicional has_metas)
/chat           → ChatPage (DeepSeek conectado)
/cargar         → UploadPage
/configuracion  → ConfiguracionPage

---

## INSIGHTS (insightEngine.ts)
Prioridades: CRITICA > ALTA > MEDIA > BAJA
fechaReferencia propagada a todos los detectores.
~26 detectores activos con cross-table analysis (vendedores × clientes × productos × inventario).
Same-day-range para comparaciones YoY.
Impacto económico (solo si has_venta_neta): Meta en Peligro, Concentración Sistémica,
  Equipo No Cerrará Meta, Doble Riesgo, Caída Explicada

---

## DATOS DEMO
Empresa: Los Pinos S.A.
8 vendedores, 20 productos, 30 clientes, 93,155 filas de ventas
Rango: Enero 2024 – Abril 2026 | 4 categorías | 3 canales | 10 departamentos (El Salvador)

---

## DEUDA TÉCNICA
- Conectar backend Python forecast a RendimientoPage
- Supabase Auth + RLS (antes del primer cliente pagador)
- MetasPage: expandir para dimensiones producto/cliente/canal

---

## RESPONSE STYLE
- Chat: máx. 5 líneas resumiendo archivos cambiados. Detalle va en los archivos.
- No hacer dumps de código en el chat — usar Edit/Write directamente.
- Análisis extensos → escribir en archivo .md, no en el chat.

## BUILD & VERIFICATION
- Después de editar .ts/.tsx: correr `npx tsc --noEmit` y confirmar 0 errores.
- Si tsc falla: diagnosticar y corregir antes de continuar.

## REFACTORING RULES
- Preservar edge-cases, fallbacks y error paths a menos que se indique eliminarlos.
- Si se eliminó algo no pedido explícitamente: restaurar o preguntar primero.

## PERFORMANCE WORK
- Medir tiempo actual antes de optimizar (console.time o similar).
- Solo conservar el cambio si los números mejoran. Si es más lento: revertir.
