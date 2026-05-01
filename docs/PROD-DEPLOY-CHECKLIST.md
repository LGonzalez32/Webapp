# SalesFlow — Production Deploy Checklist

**Fecha de creación:** 2026-05-01 (Sprint I4)
**Audiencia:** humano operando un deploy. No requiere Claude Code.

---

## 0. Pre-flight (5 min, antes de pushear)

```bash
# Desde la raíz del repo
git status                                 # working tree limpio
git log --oneline -5                       # confirmar últimos commits
npx tsc --noEmit                           # 0 errores
npx vitest run                             # todos PASS
npm run build                              # bundle generado, sin errors

# Inspeccionar tamaño del bundle (regression check)
du -sh dist/assets/*.js | sort -hr | head -5
```

**Bloqueadores automáticos:**
- ❌ `tsc` con error → no deploy.
- ❌ `vitest` con fail → no deploy.
- ❌ `npm run build` con error → no deploy.

**Bloqueadores de revisión:**
- ⚠️ Bundle principal creció >10% vs el deploy anterior → investigar antes de subir.
- ⚠️ Algún warning nuevo en `npm run build` no investigado.

---

## 1. Variables de entorno

### Frontend (`.env.production` o variables en Vercel/Render)

| Variable | Valor | Notas |
|---|---|---|
| `VITE_SUPABASE_URL`              | `https://musjxpjqpgyilrbsvcqm.supabase.co` | Producción confirmado |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | `eyJhbGc...` (anon/publishable) | **NUNCA** la service-role key |
| `VITE_BACKEND_URL`               | `https://<backend>.onrender.com`        | URL pública del FastAPI |

**Verificación:**
```bash
# En el host del deploy, listar variables (Render → Environment)
# Confirmar que VITE_SUPABASE_PUBLISHABLE_KEY NO empieza con sb_secret_ ni service_role
```

### Backend (Render `.env`)

| Variable | Valor | Notas |
|---|---|---|
| `DEEPSEEK_API_KEY`               | `sk-...` | Cuenta con budget activo |
| `SUPABASE_URL`                   | mismo que frontend | |
| `SUPABASE_SERVICE_ROLE_KEY`      | `eyJhbGc...` | **Solo backend**, jamás en frontend |
| `ALLOWED_ORIGINS`                | `https://<dominio-prod>` | Coma-separado, sin localhost en prod |
| `LOG_LEVEL`                      | `INFO` | |

---

## 2. Verificaciones de seguridad pre-deploy (críticas)

### 2.1 RLS — base de datos

Auditado en [`AUDIT-RLS-H4.md`](AUDIT-RLS-H4.md) (Sprint H4) y [`AUDIT-I1-FOLLOWUPS.md`](AUDIT-I1-FOLLOWUPS.md) (Sprint I1).

- ✅ Las 47 tablas de `public` tienen RLS habilitado.
- ✅ `profiles` tiene policies `select_own` / `update_own`.
- ✅ `subscriptions` solo SELECT (manejado por backend con service-role para INSERT/UPDATE).
- ✅ Storage bucket `org-data` tiene 4 policies (SELECT member, INSERT/UPDATE/DELETE admin).

**Re-validar antes de cada deploy mayor:**
```sql
-- Cualquier tabla nueva en public sin RLS?
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;
-- Esperado: 0 filas.
```

### 2.2 Backend chat — ⚠️ BLOQUEADOR PRE-PROD ABIERTO

Ver [`AUDIT-CHAT-BACKEND-I2.md`](AUDIT-CHAT-BACKEND-I2.md). El endpoint `/api/v1/chat/stream` **no exige auth ni tiene rate limiting**.

**No deployar a un dominio público sin:**
- (a) Validación JWT de Supabase en `chat.py:proxy_chat_stream`, o
- (b) Rate limiting per-IP (slowapi/fastapi-limiter), o
- (c) Mover el endpoint detrás de Cloudflare con WAF + rate limiting.

Mientras esto no se cierre, el deploy debe restringirse a un dominio no-público o con CORS estrictamente acotado a tu IP.

### 2.3 Secrets en el repo

```bash
# Buscar accidentes
git log --all --pretty=format: --name-only | sort -u | grep -E "\.env$|\.env\.local"
# Esperado: solo .env.example (template). Nunca .env real comiteado.

# Buscar tokens hardcoded en el código
grep -rEn "sk-[a-z0-9]{20,}|sbp_[a-z0-9]{20,}|service_role" src/ backend/app/ \
  --exclude-dir=node_modules --exclude-dir=__pycache__ 2>/dev/null
# Esperado: 0 resultados o solo comentarios de docs.
```

---

## 3. Smoke tests post-deploy (browser, ~5 min)

Hacerlos en este orden, cada uno en una pestaña limpia (incógnito).

### 3.1 Auth + datos

1. Abrir `https://<dominio-prod>/login` → form de login visible.
2. Login con cuenta de prueba → redirect a `/cargar` (si org sin datos) o `/dashboard` (si org con datos).
3. DevTools → Application → Local Storage:
   - `sb-musjxpjqpgyilrbsvcqm-auth-token` presente (JWT activo).
   - `salesflow-storage` puede estar presente con dataSource real.
4. Subir Excel de muestra (en `samples/` o demo) → spinner → llega a `/dashboard`.
5. KPIs no son `—` ni "Cargando…". Cards de PulsoPanel renderizan narrative.

### 3.2 Chat (validar el blocker 2.2 mitigado)

1. Abrir `/chat` (logueado).
2. Enviar "ping" → respuesta no vacía en <8s (p95 conocido en logs).
3. **Desde otra pestaña sin auth, intentar `curl https://<backend>/api/v1/chat/stream -X POST -d '{"messages":[{"role":"user","content":"ping"}]}' -H "Content-Type: application/json"`**:
   - Esperado tras fix: 401/403.
   - Si responde 200 con texto → BLOQUEADOR sigue abierto, **rollback inmediato**.

### 3.3 Demo route (debe funcionar sin auth)

1. Abrir `https://<dominio-prod>/demo/dashboard` en incógnito (no auth).
2. Carga datos demo (Los Pinos S.A.), KPIs renderizan.
3. Local Storage: `salesflow-storage` debe tener payload mínimo (G1 storage wrapper) — sin `configuracion.empresa = "Los Pinos S.A."`.

### 3.4 Logout limpio (regresión Sprint A T5-FIX)

1. Logueado en cuenta real, navegar `/configuracion` → Logout.
2. Local Storage tras logout:
   - ❌ `salesflow-storage` ausente.
   - ❌ `salesflow-alert-status` ausente.
   - ❌ `sf_chat_messages` ausente.
   - ✅ `sf_sidebar_collapsed` puede sobrevivir (UI pref).
   - ❌ `sb-...-auth-token` ausente.

### 3.5 ErrorBoundary (regresión Sprint I3)

1. En la consola del browser logueado: `throw new Error('test')` desde un componente.
   - Más práctico: temporariamente forzar un error en una page secundaria, redeployar, verificar.
2. Ver fallback "Algo falló inesperadamente" + botón "Recargar" + botón "Limpiar caché y recargar".
3. Click "Recargar" → vuelve a la app.

---

## 4. Monitoreo primeros 30 min post-deploy

### 4.1 Render logs

```bash
# En el dashboard de Render del backend
# Filtrar por "ERROR" y "WARN" en los últimos 30 min
```

**Alertas de ruido aceptable:**
- `chat_timing` JSON logs (instrumentación normal).
- 401 ocasional de chat (clients viejos sin token tras fix de seguridad).

**Alertas reales:**
- ❌ Cualquier 5xx que no sea de un endpoint deshabilitado.
- ❌ Stack traces de Python (excepción no capturada).
- ❌ Tasa de 429 (rate limit) elevada → posible abuso.

### 4.2 Frontend errors

Hoy no hay Sentry. Hasta que se instale, los errores de browser se ven solo en `console.error` del usuario. ErrorBoundary loggea con prefix `[ErrorBoundary]` — visible si se pide al usuario abrir DevTools.

**Mitigación interim:** monitorear Render logs por 5xx; si sube anormalmente → asumir que algo en frontend está fallando masivamente (reportes de usuarios).

---

## 5. Rollback procedure

### 5.1 Frontend (Render Static Site / Vercel)

1. Render dashboard → Site → Deploys.
2. Click "Rollback to this deploy" en el deploy anterior estable.
3. Confirmación: refrescar el dominio público en incógnito → versión anterior.

### 5.2 Backend (Render Web Service)

1. Render dashboard → Service → Deploys.
2. Click "Rollback" en el deploy anterior.
3. Wait for status = Live.
4. Smoke test: `curl https://<backend>/` debe responder `{"status":"ok"}`.

### 5.3 Migrations Supabase

Hoy todas las migrations son aditivas e idempotentes (ver `supabase/migrations/`). No hay procedimiento `down.sql`. Si una migration nueva rompe algo:

1. **No re-aplicar `npx supabase db reset`** — borra producción.
2. Escribir un SQL de remedio que revierta el cambio (drop column, drop policy, etc.).
3. Aplicar con `npx supabase db query --linked -f remediate.sql`.
4. Re-deployar el frontend con el código compatible con el schema rollback-eado.

### 5.4 Cuándo hacer rollback inmediato

- Smoke test 3.1 falla (login roto).
- Smoke test 3.2 muestra que el endpoint chat sigue abierto sin auth (blocker I2 vivo).
- Tasa de 5xx en Render >5% en primeros 5 min.

---

## 6. Comunicación

| Quién | Cuándo | Cómo |
|---|---|---|
| Operador del deploy | Antes de empezar | Mensaje a sí mismo + timestamp en notas |
| Customer success / piloto | Si va a haber downtime >2 min | Mail/WhatsApp 30 min antes |
| Operador del deploy | Si rollback ejecutado | Anotar causa + ticket de seguimiento |

---

## 7. Deuda conocida que NO bloquea deploy (acumulada hasta Sprint I)

- Backend chat sin auth/rate-limit → **mitigar con CORS o rollback rápido si abusan** (ver 2.2).
- Frontend sin Sentry → ErrorBoundary cubre crashes pero no exporta a sistema central.
- `subscriptions` sin INSERT/UPDATE policy → asume que billing es backend-only o manual.
- Forecast Python (backend `/forecast`) sin cliente conectado en frontend.
- Tests no cubren chat end-to-end (DeepSeek mockeado).

Cada item arriba debería tener un ticket o estar en CLAUDE.md como deuda explícita.
