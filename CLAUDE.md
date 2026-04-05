# SalesFlow — Monitor de Riesgo Comercial
## v2.3 | React + TypeScript + Zustand + Recharts + Vite

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

## LOS 20 INSIGHTS (insightEngine.ts)
Prioridades: CRITICA > ALTA > MEDIA > BAJA
fechaReferencia propagada a todos los detectores.
Insights con impacto_economico (solo si has_venta_neta):
  #1 Meta en Peligro, #9 Concentración Sistémica,
  #15 Equipo No Cerrará Meta, #19 Doble Riesgo,
  #20 Caída Explicada

---

## DATOS DEMO
Empresa: Comercializadora Los Pinos S.A.
8 vendedores, 12 productos, 11 clientes, 18 meses historial
3 canales: Mostrador, Visita directa, Teléfono
Inventario demo: 5 categorías activas

---

## DEUDA TÉCNICA (pendiente, no urgente)
- Conectar backend Python forecast a RendimientoPage
- Supabase Auth + RLS (antes del primer cliente pagador)
- MetasPage: expandir para dimensiones producto/cliente/canal

---

## PRÓXIMO MILESTONE
Validar demo con 2 clientes piloto usando datos reales CSV.
