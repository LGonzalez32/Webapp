# AUDIT — Chat Backend (Sprint I2)

**Fecha:** 2026-05-01
**Tipo:** Read-only audit del backend `backend/`. Cero cambios funcionales.

---

## 🚨 Hallazgo bloqueador

**`/api/v1/chat/stream` y `/api/v1/chat` están abiertos al mundo sin auth ni rate limiting.**

Cualquier persona con la URL del backend puede:
- Hacer requests ilimitados al endpoint.
- Agotar el budget de DeepSeek (cuesta dinero por token).
- Eventualmente causar 429 desde DeepSeek y degradar el servicio para usuarios reales.
- (Aplicado a costo conocido: 1 request de chat ≈ 1k tokens ≈ $0.0014. 1M requests/día = ~$1,400/día sin tope.)

**No deployar el backend a un dominio público hasta cerrar esto.**

---

## Evidencia

### `backend/app/api/routes/chat.py:55-78`

```python
@router.post("/chat")
async def proxy_chat(
    body: ChatRequest,
    http: httpx.AsyncClient = Depends(get_http_client),
):
    api_key = _get_api_key()
    payload = body.model_dump(exclude_none=True)
    # ... proxy directo a DeepSeek, sin verificar quién hace el request
```

### `backend/app/api/routes/chat.py:229-247`

```python
@router.post("/chat/stream")
async def proxy_chat_stream(
    body: ChatRequest,
    http: httpx.AsyncClient = Depends(get_http_client),
):
    # Mismo patrón. Solo Depends(get_http_client). Sin auth dependency.
```

### `backend/app/api/dependencies.py:1-7`

```python
from supabase import Client
from ..core.supabase_client import get_supabase

def get_db() -> Client:
    return get_supabase()
```

**Solo expone `get_db()`.** No hay `get_current_user()` ni helper de validación de JWT.

### `backend/main.py`

- Middleware: solo CORS (`CORSMiddleware`). Sin middleware de auth.
- `ALLOWED_ORIGINS` por env var, default incluye `http://localhost:5173,http://localhost:3000` — esto es defensa débil (curl ignora CORS).

### Rate limiting

```bash
grep -rn "rate.limit\|slowapi\|@limiter\|RateLimit" backend/
# (sin resultados)
```

**No hay slowapi, fastapi-limiter, redis, ni cualquier middleware de rate limiting.**

### Frontend (`src/lib/chatService.ts`)

El frontend manda `Authorization: Bearer <jwt>` en algunas llamadas, pero el backend **no valida el header** — lo ignora. (Verificado: `chat.py` no lee `request.headers.get('authorization')`.)

---

## Recomendaciones (en orden de prioridad)

### 1. Mínimo viable para deployar (1–2h de trabajo)

Agregar dependency `get_current_user` que valide el JWT de Supabase:

```python
# backend/app/api/dependencies.py
from fastapi import Header, HTTPException
from supabase import Client
from ..core.supabase_client import get_supabase

async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='UNAUTHORIZED')
    token = authorization.replace('Bearer ', '', 1)
    sb = get_supabase()
    try:
        user = sb.auth.get_user(token).user
        if not user: raise ValueError()
        return user
    except Exception:
        raise HTTPException(status_code=401, detail='INVALID_TOKEN')
```

Y en `chat.py`:

```python
@router.post("/chat/stream")
async def proxy_chat_stream(
    body: ChatRequest,
    http: httpx.AsyncClient = Depends(get_http_client),
    user = Depends(get_current_user),  # ← bloquea si no hay JWT válido
):
    ...
```

Verificar después: `curl -X POST <backend>/api/v1/chat/stream` sin Authorization → 401.

### 2. Rate limiting básico (30 min)

```bash
pip install slowapi
```

```python
# backend/main.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
```

```python
# backend/app/api/routes/chat.py
@router.post("/chat/stream")
@limiter.limit("20/minute")
async def proxy_chat_stream(request: Request, ...):
    ...
```

20 req/min/IP es generoso para uso humano y bloquea bots.

### 3. Per-user rate limiting (mejor que IP)

Una vez que `get_current_user` está activo, usar `user.id` como clave en lugar de IP. Esto evita NAT colateral (varios usuarios reales detrás del mismo IP).

### 4. Logging de quién hace cada request

Hoy se loggea `chat_timing` con `request_id` aleatorio. Agregar `user_id` al log permite trazar abusos:

```python
logger.info(json.dumps({"evt": "chat_timing", "user_id": str(user.id), **timing}))
```

### 5. Defensa adicional: Cloudflare WAF

Independiente del fix backend, poner el dominio detrás de Cloudflare con:
- WAF rules contra patterns de scraping.
- Rate limit per-IP a nivel CDN.
- Bot fight mode.

---

## Estado de los otros endpoints del backend

| Ruta | Auth | Rate limit | Riesgo |
|---|---|---|---|
| `GET /` | — | — | Bajo (solo health) |
| `/api/v1/health` | — | — | Bajo (read-only) |
| `/api/v1/chat` | ❌ | ❌ | 🚨 **CRÍTICO** (cuesta dinero) |
| `/api/v1/chat/stream` | ❌ | ❌ | 🚨 **CRÍTICO** (cuesta dinero) |
| `/api/v1/forecast` | ❌ | ❌ | Medio (CPU intenso, no cuesta API externa) |
| `/api/v1/sales-forecast` | ❌ | ❌ | Medio (mismo) |

Los endpoints de forecast también deberían tener auth, pero no son tan urgentes como chat (no cuestan dinero por request, solo CPU del Render instance).

---

## Mitigaciones interim mientras se cierra (si hay que deployar igual)

1. **CORS estricto:** dejar `ALLOWED_ORIGINS` solo con el dominio de prod (`https://app.salesflow.com` o equivalente). NO listar `http://localhost:*`.
2. **Cloudflare delante:** activar Bot Fight Mode + Under Attack Mode al primer signo de abuso.
3. **DeepSeek budget cap:** configurar en el dashboard de DeepSeek un límite mensual fijo. Si se consume → endpoint falla con 503, no factura más.
4. **Monitor activo:** revisar Render logs cada hora primeras 24h. Buscar patterns de IP único repitiendo `/chat/stream`.

Estas mitigaciones reducen riesgo pero **no son sustituto** de auth + rate limiting reales.

---

## Decisión que debe tomar el usuario

**Antes del primer cliente pagador, ejecutar al menos las recomendaciones 1 + 2.**

Si no se puede hoy: documentar el riesgo aceptado y poner una alarma de costo en DeepSeek + Cloudflare delante del backend.
