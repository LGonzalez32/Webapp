# SalesFlow — Auditoría de Latencia del Chat IA

## Resumen ejecutivo (5 líneas)

1. La latencia "Hola en caliente" (~2 s) es dominada por el **TTFT de DeepSeek (~900–1500 ms)**; el backend FastAPI prácticamente no añade overhead (TTFB 191–217 ms).
2. El **prompt es el cuello de botella oculto y crítico**: `buildSystemPrompt` puede acercarse al límite de 320 000 caracteres (~80 000 tokens), incluyendo el dataset crudo de `sales` y todos los vendedores; inflar el prompt encarece TTFT y costo.
3. El backend tiene anti-patrones graves: `httpx.AsyncClient` se crea **por request** (no singleton), no hay reuso de conexión; `uvicorn` arranca con 1 worker por defecto; cold start ~59 s viene del rebuild del cliente y del estado de Render incluso en plan Pro.
4. El frontend hace streaming OK (SSE + `requestAnimationFrame` batching), pero el componente lee `sales` (93 k filas) del store en cada render del `useMemo` de contexto y pasa el array entero al builder.
5. La integración con Groq es trivial (un Adapter en `chat.py`), pero requiere extraer una `LLMClient` interface; **prompt caching no está activado** y es la palanca con mejor ROI.

---

## 1. Mapa del repositorio

### Top-level (`c:\Users\luisf\...\ventas`)

| Path | Propósito |
|---|---|
| `src/` | Frontend React 19 + Vite + TS |
| `backend/` | API FastAPI (Python 3.11) — forecast + chat proxy |
| `supabase/` | Migraciones (no activas en frontend) |
| `tests/`, `test-results/`, `playwright.config.ts` | Tests E2E |
| `vite.config.ts`, `tsconfig.json` | Build config |
| `vercel.json` | Deploy frontend |

### Stack exacto

**Frontend** (`package.json:18-57`):
- React 19.0.0, react-dom 19.0.0
- Vite 6.2.0, TypeScript 5.8.2
- Zustand 5.0.11 (persist v3)
- Recharts 3.8.0, Tailwind 4.1.14 (`@tailwindcss/vite`)
- @supabase/supabase-js 2.98.0
- HTTP: `fetch` nativo (no axios). SSE: lectura manual con `ReadableStream.getReader()` (`src/lib/chatService.ts:870`).

**Backend** (`backend/requirements.txt`):
- Python 3.11-slim (`backend/Dockerfile:1`)
- FastAPI 0.110.0
- uvicorn[standard] 0.27.0
- pydantic 2.6.0, pydantic-settings 2.2.0
- httpx 0.27.0 (cliente LLM)
- supabase-py 2.3.0 (no usado en chat)
- numpy/pandas/statsmodels para forecast

**Entry points**:
- Frontend: `index.html` → `src/main.tsx` → `src/App.tsx` con react-router-dom v7.13.1; ruta `/chat` → `src/pages/ChatPage.tsx`.
- Backend: `backend/main.py:17` instancia `FastAPI`, monta routers con prefijo `/api/v1`. Chat router en `backend/app/api/routes/chat.py:10`. Arranque: `uvicorn main:app --host 0.0.0.0 --port $PORT` (`backend/railway.toml:6`, `backend/Dockerfile:17`).

---

## 2. Pipeline completo de una petición de chat

End-to-end de un mensaje del usuario:

1. **Captura del input** — `src/pages/ChatPage.tsx:903` `handleSend(text)`. Detecta entidad activa (`detectEntity`, `ChatPage.tsx:816`), construye `chatContext` con `useMemo` (`ChatPage.tsx:793-805`).
2. **Build del payload** — `src/lib/chatService.ts:829` `sendChatMessageStream(messages, ctx, callbacks)`:
   - Llama `buildSystemPrompt(ctx)` (`chatService.ts:181-643`) que **serializa el contexto entero**: prompt base + detalle de hasta 20 vendedores + clientes dormidos + cruces inventario × vendedor + departamentos (top 10 + iteración por departamento sobre `salesCY`/`salesPY`) + concentración + reglas de formato + seguridad.
   - Tope hardcoded: `MAX_PROMPT_CHARS = 320_000` (`chatService.ts:179`) ≈ 80 k tokens.
   - Añade `recentMessages = messages.slice(-10)` (`chatService.ts:845`).
3. **Request HTTP** — `fetch` POST a `${BACKEND_URL}/api/v1/chat/stream` con body `{messages, model:"deepseek-chat", max_tokens:1024, temperature:0.3, top_p:0.9, frequency_penalty:0.1}` (`chatService.ts:852-863`). `BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://webapp-0yx8.onrender.com'` (`chatService.ts:713`).
4. **Endpoint backend** — `backend/app/api/routes/chat.py:107-119` `proxy_chat_stream`. Lee `DEEPSEEK_API_KEY` de env (`chat.py:25-29`) — si falta devuelve 503.
5. **Middlewares** — solo CORS (`backend/main.py:28-34`). **No hay** auth, validación adicional, rate-limit, logging por request, ni timing instrumentado.
6. **Construcción del payload upstream** — `payload["stream"] = True` (`chat.py:70`).
7. **Llamada LLM** — `chat.py:73-82` abre `httpx.AsyncClient(timeout=120.0)` **por request** (anti-patrón) y hace `client.stream("POST", DEEPSEEK_URL, ...)`. Modelo `deepseek-chat` o `deepseek-reasoner`. Streaming nativo SSE.
8. **Reenvío chunk a chunk** — `chat.py:85-99` itera `aiter_lines()`, parsea `data: {...}`, extrae `choices[0].delta.content` y reemite como `data: {"token": "..."}` SSE al cliente. `[DONE]` se reenvía. Headers `Cache-Control: no-cache`, `X-Accel-Buffering: no` (`chat.py:115-117`) — bien para evitar buffering en Render/nginx.
9. **Render en cliente** — `src/lib/chatService.ts:870-902` lee `response.body.getReader()`, decodifica con `TextDecoder`, parsea líneas `data: ...` y emite `onToken(token)`. `ChatPage.tsx:951-967` acumula en `streamingContentRef.current` y hace `setMessages` dentro de `requestAnimationFrame` (batched a ~60 fps). `onDone` corre `parseChartBlocks` + `parseFollowUps` y un último `setMessages` final.

---

## 3. Análisis de latencia con números estimados

Para "Hola en caliente" (TTFB 217 ms, primer token 1492 ms, total 2018 ms, 19 chunks):

| Etapa | ms estimado | Justificación |
|---|---|---|
| DNS + TLS Vercel→Render (caliente, keep-alive) | ~30–60 | TLS reusado por el navegador |
| FastAPI middleware + parsing pydantic | ~5–15 | Body pequeño, ~25 k caracteres de prompt |
| **`httpx.AsyncClient(...)` instanciado por request** | **~50–150** | TLS handshake nuevo a `api.deepseek.com` cada vez |
| Request a DeepSeek (red) | ~80–150 | Probable región US |
| **TTFT DeepSeek (`deepseek-chat`)** | **~900–1300** | Dominante. Modelos no-reasoner típicamente 600–1200 ms TTFT en prompts ~80 k tokens |
| Generación + streaming (Hola, 19 tokens) | ~500–700 | ~30–40 ms/token en `deepseek-chat` |
| Render por chunk (rAF batched) | <1 / chunk | `requestAnimationFrame` ya colapsa a 1 setState por frame |

Para "Diagnóstico completo" (TTFB 191, 1er token 933, total 12 733, 465 chunks, 24 786 bytes):
- Generación: ~11 800 ms / 465 chunks ≈ **25 ms/token** (consistente con DeepSeek a esa escala).
- El cuello aquí es **token output rate de DeepSeek**, no el backend.

### Cold start (~59 s)
- Render Pro $25 dice "no sleep" pero contenedores se reciclan tras inactividad larga o redeploys; arranque inicial: imagen Docker python:3.11-slim + `pip install -r requirements.txt` ya está compilada, pero `numpy/pandas/statsmodels/scipy/sklearn` cargan ~3–8 s en import (`backend/main.py:46-48` los importa **lazy** con try/except, lo cual ayuda, pero el módulo `services/forecast_engine.py` los toca igual al primer request a `/forecast`).
- `pydantic-settings` lee env, `Settings()` se instancia a import (`backend/app/core/config.py:14`).
- Probable causa principal: contenedor frío + warmup de uvicorn + import-time work. **No hay healthcheck activo de auto-warmup**.

### Top 3 cuellos de botella
1. **TTFT del LLM (~900–1500 ms)** — único factor que importa para queries cortas. No se mitiga sin cambiar provider o reducir prompt.
2. **Tamaño del prompt (~25–80 k tokens)** — `buildSystemPrompt` envía `sales` (93 k filas) al builder y serializa todos los vendedores + cruces. Cada token en el prompt cuesta TTFT y dinero. Sin prompt caching.
3. **Cold start backend (~59 s)** — sin warmup keepalive. `httpx.AsyncClient` no singleton añade ~50–150 ms en cada request en caliente.

---

## 4. Auditoría del prompt

System prompt construido en `src/lib/chatService.ts:181-643` (función `buildSystemPrompt`, **463 líneas**).

Estructura (resumida):

```
Eres el asistente de inteligencia comercial de {empresa} (giro: {giro}).
[PERSONALIDAD: 7 bullets]
[CÓMO RESPONDER: 5 bullets]
[TABLAS Y DATOS NUMÉRICOS: 3 bullets]
PERÍODO ANALIZADO: {mes} {año}
NOTA DE UNIDADES: ...
REGLA CRÍTICA DE COMPARACIONES TEMPORALES: [bloque dinámico con día/mes]
EQUIPO — RESUMEN: 4 métricas
DETALLE POR VENDEDOR: hasta 20 vendedores con ~12 líneas cada uno
  - Por cada vendedor: clientes dormidos (top 2), top clientes activos (top 3),
    productos ausentes (top 2), canal principal
OTROS VENDEDORES: resumen 1-line por vendedor restante
ALERTAS ACTIVAS: top 5 insights
INVENTARIO: quiebre + baja cobertura + lento + sin movimiento
CRUCE INVENTARIO × VENDEDOR × CANAL: top 3 productos con vendedores
DEPARTAMENTOS: top 10 con top-3 vendedores cada uno
CLIENTES CONCENTRACIÓN: top 5
FORMATO: ~50 líneas de reglas markdown + chart spec
SEGURIDAD: 8 bullets anti-jailbreak
CONFIANZA EN PROYECCIONES
```

**Tokens estimados**: el cap es 320 000 caracteres ≈ **80 000 tokens**. En la práctica, con el dataset demo (8 vendedores, 30 clientes, 93 155 ventas) el prompt está probablemente entre **15 000 y 30 000 tokens**.

**Problemas críticos**:

- `chatService.ts:181-192` recibe `sales: SaleRecord[]` completo (93 155 filas en demo). No se serializa entero, pero se itera en `topClientesPorVendedor`, `productosAusentesDelVendedor`, `crucInventarioVendedor`, y un loop completo en la sección DEPARTAMENTOS (`chatService.ts:445-464`). Coste CPU en cliente: ~50–200 ms por construcción del prompt.
- `chatService.ts:444-509` — el bloque DEPARTAMENTOS hace **una pasada completa sobre `sales`** y crea `salesCY`/`salesPY` arrays nuevos en cada construcción del prompt. **Cada mensaje** rebuilds esto.
- **Sin prompt caching**: DeepSeek soporta context caching automático cuando el prefijo del prompt es estable; aquí el prompt cambia en `recentMessages`, pero el system prompt es 95 % estable entre mensajes. **No se separa cache-friendly prefix de la parte volátil**. La nota dinámica de "Hoy es día N de M" inserta variabilidad en medio del prompt (`chatService.ts:284-295`), rompiendo cache.
- Redundancia: las reglas de FORMATO (50+ líneas) y SEGURIDAD (8 bullets) podrían ir como prefijo cacheable; la fecha/día actual debería ir al final.
- `PERSONALIDAD` y `CÓMO RESPONDER` se solapan en intención.

---

## 5. Configuración del LLM

- **Provider**: DeepSeek (`https://api.deepseek.com/chat/completions`, `backend/app/api/routes/chat.py:12`).
- **Modelos**: `deepseek-chat` (default) y `deepseek-reasoner` aceptado por el endpoint pero no usado por el frontend.
- **Región API**: probablemente China/global edge — sin override.
- **Params** (frontend): `temperature=0.3`, `top_p=0.9`, `frequency_penalty=0.1`, `max_tokens=1024` chat normal; `max_tokens=3000` para `sendDeepAnalysis` (`chatService.ts:800`). No hay `stop`.
- **Timeout**: `httpx.AsyncClient(timeout=120.0)` para stream (`chat.py:73`), `90.0` para non-stream (`chat.py:47`).
- **Retry / circuit breaker**: **no hay**. Un fallo de red devuelve `API_ERROR` y termina.
- **Streaming activado en TODA la cadena**: sí — `payload["stream"]=True` (`chat.py:70`), `aiter_lines()` (`chat.py:85`), `StreamingResponse` con `X-Accel-Buffering: no` (`chat.py:117`), frontend con `getReader()` (`chatService.ts:870`). **El backend NO bufferea**.

---

## 6. Frontend — render del stream

- **Manejo de state**: `streamingContentRef.current += token` (`ChatPage.tsx:953`) acumula sin re-render. Un `requestAnimationFrame` programa **un solo `setMessages`** por frame (`ChatPage.tsx:954-966`). Bien.
- **Cancelación**: `cancelAnimationFrame` en `onDone` y `onError` (`ChatPage.tsx:969-971`). Bien.
- **Persistencia a localStorage**: `useEffect` en `ChatPage.tsx:867-869` con guard `!isStreaming` para no escribir cada token. Bien.
- **`useMemo` de chatContext** (`ChatPage.tsx:793-805`): depende de `sales` (93 k filas) y de `vendorAnalysis`/`teamStats`/etc. Cuando estas referencias cambian se rebuild — pero `sales` solo cambia en upload/period switch, no por mensaje, así que OK.
- **Componentes pesados que re-renderizan**: cada token causa `setMessages([...cur, {content: streaming...}])`. Esto re-renderiza la lista entera de mensajes. La lista podría usar `memo` por mensaje. `parseContent` y `renderMarkdown` (`ChatPage.tsx:29-100+`) corren al render — durante streaming, sobre el último mensaje en cada frame. Para textos de 24 KB y 60 fps, son ~120 ejecuciones. No es crítico pero es la palanca de UX más obvia.
- **decision-engine / insight-engine / diagnostic-actions**: **no se invocan en `ChatPage.tsx`** (Grep en `pages/ChatPage.tsx` por estos nombres → 0 matches). Su CPU puede aparecer cuando el usuario navega o el `useAnalysis` se dispara, pero no bloquea el send/stream del chat.
- **useAnalysis()** (`ChatPage.tsx:759`): se llama en cada mount — si el user llega con `isProcessed=false` lanza el pipeline pesado. Esto puede competir con el thread principal **mientras el stream llega**, deteriorando la sensación de fluidez.

---

## 7. Backend — health del servicio

- **`httpx.AsyncClient` no es singleton**: `backend/app/api/routes/chat.py:47, 73` — `async with httpx.AsyncClient(timeout=...)` por request. Esto crea pool nuevo, hace TLS handshake cada vez, y descarta el connection pool. Penaliza ~50–150 ms por request en caliente. **Quick win**: instanciarlo una vez en startup como `app.state.http_client`.
- **Workers**: `Dockerfile:17` y `railway.toml:6` arrancan `uvicorn main:app --host 0.0.0.0 --port $PORT` **sin `--workers`**. Default = 1 worker, 1 process. En Render Pro con 2+ vCPU se está dejando capacidad ociosa. Recomendado: `uvicorn ... --workers 2` o gunicorn con uvicorn workers.
- **Async correcto**: handler es `async def`; usa `httpx.AsyncClient`; itera `aiter_lines()` async. **No hay bloqueos sync detectados** en el path del chat.
- **Lazy load de pesados**: `backend/main.py:46-51` carga `forecast`/`sales_forecast` en try/except — es **eager** en startup, por eso el cold start de ~59 s. `numpy/pandas/statsmodels/scipy/sklearn` se importan al arranque del módulo `forecast_engine.py`. Estas son ~50–80 MB de bytecode y pueden tomar 3–10 s solo en imports. Para chat puro no son necesarios.
- **Instrumentación de timing existente**: **ninguna** en `chat.py`. Sin `time.perf_counter`, sin logging por request, sin métricas. No hay manera de saber dónde se gastan los 12 s del diagnóstico salvo en cliente.
- **`@app.on_event("startup")`** (`main.py:54-56`) está deprecated en FastAPI 0.110 (debería usar `lifespan`). Es solo un log.
- **CORS** permite GET/POST y headers básicos — bien.

---

## 8. Llamadas a Supabase

`profiles` se consulta desde:

- `src/lib/orgService.ts:100-103` — `getOrgMembersWithEmail(orgId)` — `select id,full_name,email,avatar_url` filtrado por `in('id', userIds)`. Una sola query batched. Llamada solo desde `ConfiguracionPage` / member listing (no aparece en `useAuth`).
- `src/lib/useAuth.ts:19` — `update({email}).eq('id', userId)` cada vez que cambia la sesión Supabase (`onAuthStateChange`, `useAuth.ts:38-47`). **`onAuthStateChange` se dispara en cada token refresh** y en cada navegación que monte `useAuth` — esto puede generar updates spamados si el hook se monta múltiples veces.

**Las 14+ requests duplicadas de `/profiles?id=eq.X`** observadas:
- No hay un `select` por `id=eq.X` literal en el código del frontend (todos los SELECT usan `.in()`). Las requests `?id=eq.X` con 700–1900 ms son probablemente de **Realtime / RLS row-level fetches** o del **PostgREST internal query** generado por la combinación de filtros del componente Members.
- Sospecha alternativa: cada componente que monta `useAuth` dispara `getUserOrg` + `update profiles` (`useAuth.ts:8-19`). En `App.tsx`/layouts esto puede ocurrir varias veces por navegación. Si `OnboardingPage`/`InvitationPage` montan `getUserOrg` adicional (`Grep` en sección anterior), se multiplica.
- **Recomendación**: cachear `profiles` por `userId` en `useAuthStore` con TTL, y cambiar el `update profiles` en `useAuth.ts:19` para que solo se ejecute si el email **realmente cambió** (comparar contra valor cacheado). Hoy se ejecuta unconditionally en cada `onAuthStateChange`.
- Estas consultas **no afectan el flujo del chat** directamente (chat no toca Supabase), pero compiten por banda y por CPU de UI thread.

---

## 9. Quick wins (<30 min cada uno)

Ordenados por impacto/esfuerzo:

| # | Archivo:líneas | Cambio | Impacto |
|---|---|---|---|
| QW1 | `backend/app/api/routes/chat.py:47, 73` | Crear `httpx.AsyncClient` singleton en `startup` (`app.state.http_client`) y reusarlo en `_stream_deepseek` y `proxy_chat`. | -50 a -150 ms por request en caliente. TLS keep-alive a DeepSeek. |
| QW2 | `backend/Dockerfile:17` o `backend/railway.toml:6` | Cambiar `CMD` a `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2 --loop uvloop --http httptools` | +throughput, mejor utilización Render Pro. ~0 ms en latencia simple, evita head-of-line blocking. |
| QW3 | `backend/app/api/routes/chat.py` (nuevo) | Añadir `time.perf_counter()` antes/después del `client.stream` y emitir un evento SSE final `data: {"timing":{...}}` o log. | 0 ms; observabilidad para futuras decisiones. |
| QW4 | `backend/main.py:46-51` | Mover los imports de `forecast`/`sales_forecast` detrás de un `lifespan` handler **lazy-on-first-request** o solo cargar si `ENABLE_FORECAST=1`. | Recorta ~3–8 s del cold start. |
| QW5 | `src/lib/chatService.ts:181` (`buildSystemPrompt`) | Mover la "REGLA CRÍTICA DE COMPARACIONES TEMPORALES" (`chatService.ts:283-295`, fecha de hoy) **al final del prompt** y mantener el bloque grande estable arriba. | Habilita prompt caching de DeepSeek (auto). -30 a -50% TTFT en mensajes 2..N de la conversación. |
| QW6 | `src/lib/useAuth.ts:18-20` | Guard: solo `update profiles` si `email !== lastSyncedEmail` (cachear en zustand o ref). | Elimina N writes redundantes a Supabase por sesión. |
| QW7 | `src/pages/ChatPage.tsx` (lista de mensajes) | Memoizar el componente que renderiza un mensaje individual (`React.memo`) clavando `key=msg.id`. Hoy cada token re-renderiza todos los mensajes. | -10 a -30 ms por token en conversaciones largas; UX más suave. |
| QW8 | `src/lib/chatService.ts:179` `MAX_PROMPT_CHARS` | Bajar tope a `120_000` (~30 k tokens) y truncar por secciones (priorizar vendedores críticos). | -10 a -30 % TTFT en prompts grandes; -costo. |
| QW9 | `backend/main.py` | Agregar healthcheck `/api/v1/health` ya existe — configurar **Render health check path** si no está ya, y un **cron externo (UptimeRobot/Better Stack)** que pingue cada 5 min. | Elimina cold start de 59 s para usuarios reales. |

---

## 10. Refactors mayores (>2 h)

### R1 — Routing dual de modelos rápido/preciso

**Problema actual**: todas las queries (saludos, preguntas simples, diagnóstico complejo) usan `deepseek-chat` con prompt de 25–30 k tokens. TTFT ~1 s aun para "Hola".

**Propuesta**: clasificador en cliente o backend con heurística cheap (regex de saludo, longitud de mensaje, presencia de palabras "diagnóstico", "análisis profundo", entidad detectada). Rutas:

- "Hola/gracias/saludo" → modelo rápido (Groq llama-3.1-8b-instant) con prompt mínimo (200 tokens). TTFT ~150 ms.
- "Pregunta puntual sobre vendedor X" → DeepSeek con prompt **filtrado** a ese vendedor (~3 k tokens).
- "Diagnóstico completo" → DeepSeek-chat con prompt full o DeepSeek-reasoner.

**Impacto**: queries simples pasan de 2 s a ~400 ms; complejas siguen igual.
**Riesgo**: clasificador se equivoca y devuelve respuesta superficial — mitigar con fallback "ampliar respuesta" en UI.

### R2 — Web Worker para `decision-engine` y `insight-engine`

**Problema actual**: `useAnalysis()` corre en thread principal (`ChatPage.tsx:759`). Si el usuario abre `/chat` con `isProcessed=false`, el motor (insight-engine.ts 6773 líneas) bloquea por segundos justo cuando empieza a streamear el LLM.

**Propuesta**: mover `computeCommercialAnalysis` + `generateInsights` a un Web Worker (postMessage con `sales`/`metas`/`inventory`). Frontend espera el resultado vía promesa.
**Impacto**: thread principal libre durante el stream → tokens se renderizan a 60 fps real.
**Riesgo**: serialización de 93 k filas a/desde el worker (~50–200 ms una vez) puede ser perceptible en datasets grandes; mitigar con `Transferable` o IndexedDB shared.

### R3 — Prompt caching nativo

**Problema actual**: cada mensaje regenera el system prompt entero y DeepSeek lo procesa from-scratch.

**Propuesta**:
- Refactorizar `buildSystemPrompt` para emitir un **prefijo estable** (reglas, formato, seguridad, datos del periodo — ~80 % del contenido) y un **sufijo volátil** (fecha actual, `activeEntityHint`, conversación reciente).
- DeepSeek aplica caching automático cuando el prefix coincide. Verificar `prompt_cache_hit_tokens` en la respuesta.
- Para Anthropic Groq/Cloud: usar `cache_control: {"type":"ephemeral"}`.

**Impacto**: TTFT 2..N de la conversación cae ~30–60 %; costo de input tokens cae ~75 % en hits.
**Riesgo**: bajo, requiere validar que DeepSeek no "ve" diferencias por saltos de línea o variables interpoladas.

### R4 — Streaming SSE optimizado con compression y batching de tokens

**Problema actual**: cada token de DeepSeek se reemite como un evento SSE individual (~50 bytes overhead por chunk). En el diagnóstico hay 465 chunks, ~24 KB de data sobre ~24 KB de overhead JSON+SSE framing.

**Propuesta**:
- En backend, **bufferear 50–100 ms** de tokens y emitir un solo evento SSE con `tokens: ["a","b","c"]`. Reduce overhead a la mitad.
- Activar `gzip` en uvicorn / Render para SSE (con cuidado: `X-Accel-Buffering: no` debe seguir).
- Frontend: cambiar onToken para iterar el array.

**Impacto**: -200 a -500 ms en respuestas largas; menos load de UI thread.
**Riesgo**: aumenta latencia perceptual del **primer** token (espera el buffer) — ajustar buffer a 30–50 ms o emitir el primer token inmediato y bufferear el resto.

---

## 11. Preparación para Groq

### Estado actual de acoplamiento

- **No existe `LLMClient` interface**. La integración con DeepSeek está hardcoded en `backend/app/api/routes/chat.py:12, 49, 76` (URL, headers, formato del payload, parsing de SSE).
- En frontend (`src/lib/chatService.ts:725, 820, 857`) se asume modelo `deepseek-chat`.
- No hay registry de providers ni feature flags por modelo.

### Patrón sugerido — **Strategy + Factory**

Crear `backend/app/services/llm/`:

```
llm/
  __init__.py
  base.py          # LLMClient ABC: async stream(messages, model, **params)
  deepseek.py      # DeepseekClient(LLMClient)
  groq.py          # GroqClient(LLMClient)
  anthropic.py     # (futuro)
  factory.py       # get_client(model: str) -> LLMClient
```

`base.py` define:

```python
class LLMClient(Protocol):
    async def stream(
        self, messages: list[dict], model: str, **params
    ) -> AsyncIterator[str]: ...
```

`factory.py`:

```python
def get_client(model: str) -> LLMClient:
    if model.startswith("deepseek"): return _deepseek
    if model.startswith("llama") or model.startswith("mixtral"): return _groq
    raise ValueError(f"Unknown model: {model}")
```

`chat.py` queda:

```python
client = get_client(body.model)
async for token in client.stream(body.messages, body.model, **params):
    yield f"data: {json.dumps({'token': token})}\n\n"
```

### Archivos a tocar para integrar Groq

| Archivo | Cambio |
|---|---|
| `backend/requirements.txt` | Añadir `groq==X.Y.Z` (oficial) o reusar httpx con endpoint Groq |
| `backend/app/services/llm/base.py` | Nueva interface |
| `backend/app/services/llm/deepseek.py` | Mover lógica de `chat.py:68-104` aquí |
| `backend/app/services/llm/groq.py` | Implementar (Groq tiene SSE compatible con OpenAI format) |
| `backend/app/services/llm/factory.py` | Nuevo |
| `backend/app/api/routes/chat.py` | Refactor a usar factory; mantener endpoint igual |
| `backend/app/core/config.py` | Añadir `groq_api_key` a `Settings` |
| `backend/.env.example` | Documentar `GROQ_API_KEY` |
| `src/lib/chatService.ts:725, 820, 857` | Aceptar `model` dinámico desde un router en cliente |
| **NUEVO** `src/lib/llmRouter.ts` | Heurística para decidir modelo (saludo → groq/llama; análisis → deepseek) |

Groq usa la **misma estructura SSE de OpenAI** (`data: {choices:[{delta:{content:"..."}}]}`), por lo que `_stream_deepseek` se generaliza renombrando a `_stream_openai_compatible(url, key, payload)`.

---

## 12. Problemas no-latencia

### Bugs / correctness

- `backend/app/api/routes/chat.py:58, 103`: `except Exception` swallows todo y devuelve `API_ERROR` genérico — sin logging del traceback. Imposible diagnosticar fallos en producción.
- `backend/main.py:54`: `@app.on_event("startup")` deprecated; FastAPI recomienda `lifespan`.
- `src/lib/chatService.ts:227-232`: `fechaReferencia` cae a `new Date()` si `sales.length === 0`, contradiciendo regla CLAUDE.md "fechaReferencia = SIEMPRE max(sales.fecha), NUNCA new Date()". Aceptable como fallback degradado, pero debería loguearse.
- `src/lib/useAuth.ts:19`: `supabase.from('profiles').update({email}).eq('id', userId).then(() => {})` — promise sin `await` ni `.catch`. Si Supabase rechaza, error silencioso.

### Security

- `backend/app/api/routes/chat.py` no tiene **rate limiting** ni **autenticación**. Cualquier cliente con la URL pública puede consumir DeepSeek a costo del owner. Mitigación: middleware `slowapi` + verificación de Supabase JWT en header.
- `backend/main.py:23-26`: CORS por env `ALLOWED_ORIGINS` con default que incluye `data-solutions-hub.com` y `localhost`. Si la env var no se setea en Render, el default puede dejar pasar localhost en prod (no es secret leak pero es laxo).
- DEEPSEEK API key: leída de env via `os.getenv("DEEPSEEK_API_KEY")` (`chat.py:26`). **No hardcoded**. Marcado como `[REDACTED]` por defecto. ✅
- Frontend: `VITE_SUPABASE_ANON_KEY` (`src/lib/supabaseClient.ts:4`) — esto es público por diseño (anon key), pero confirmar que RLS está activo en todas las tablas (especialmente `profiles`, `organization_members`, `sales`).

### Código muerto / TS `any`

- `backend/app/api/routes/forecast.py`, `sales_forecast.py` — cargados perezosamente, pero CLAUDE.md dice "backend forecast no conectado al frontend" → si no se usa, considerar eliminar de la imagen Docker para reducir cold start.
- `src/lib/chatService.ts:752` `callDeepSeek(_storeKey, ...)` recibe un parámetro no usado — legacy de cuando se leía la API key del store.
- `src/lib/orgService.ts:20-21` usa `(membership as any).organizations` — type unsafe, evitable con tipos generados de Supabase.
- `src/pages/ChatPage.tsx:1004-1005` y similares: `error: any` repetido en varios catches.

### Tests críticos faltantes

- `backend/tests/` existe pero no se verificó cobertura del endpoint `/chat/stream`. Sin test del happy path SSE ni del 503/401/429.
- No hay test E2E del flujo "user envía → token llega → chart se parsea" (Playwright en `tests/` apunta a stress tests en `.mjs` pero no a una suite cohesiva).
- Sin contract test entre frontend y backend para el formato `data: {token}` y `data: [DONE]`.

### Secrets

- No se detectaron API keys hardcoded en `src/`, `backend/app/`, `backend/main.py`. `.env.example` usa placeholder `sk-your-deepseek-key-here` ([REDACTED] en convención).
- Verificar que `.env` real **no** está commitada (no la encontré en el repo, ✅).

