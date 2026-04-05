# Configuración del Chat IA — Reglas que NO deben cambiar

> Referencia: https://github.com/LGonzalez32/Webapp  
> Última verificación funcional: Abril 2026

---

## Cómo funciona (arquitectura)

```
LOCALHOST (desarrollo)
  Browser (localhost:3000)
    → fetch("http://localhost:8000/api/v1/chat")   ← .env.development
    → Backend Python local (uvicorn, puerto 8000)
    → DeepSeek API (con DEEPSEEK_API_KEY del backend/.env)

PRODUCCIÓN (Vercel + Render)
  Browser (data-solutions-hub.com)
    → fetch("https://webapp-0yx8.onrender.com/api/v1/chat")  ← .env
    → Render backend (FastAPI)
    → DeepSeek API (con DEEPSEEK_API_KEY del env de Render)
```

---

## Archivos de configuración — Estado correcto

### `vite.config.ts`
**NO debe tener `proxy`**. Solo esto en `server`:
```ts
server: {
  hmr: process.env.DISABLE_HMR !== 'true',
},
```

### `.env.development` — Para desarrollo local
```
VITE_BACKEND_URL=http://localhost:8000
```
- Vite lo carga automáticamente al correr `npm run dev`
- Le dice al frontend que llame al backend local en puerto 8000

### `.env` — Para producción (Vercel)
```
VITE_BACKEND_URL=https://webapp-0yx8.onrender.com
```
- Vercel usa este archivo para el build de producción
- El frontend llama directamente a Render

### `.env.local` — NO debe existir
- Si existe, sobreescribe `.env.development` y puede romper el desarrollo local
- **Borrar si aparece**: `rm .env.local`

### `backend/.env` — API key del backend local
```
DEEPSEEK_API_KEY=sk-be7fa627e4a04ca6a0d0be9bdb3fc29c
```
- Solo para desarrollo local
- El backend de Render tiene su propia key en el dashboard de Render

### `backend/main.py` — CORS
```python
_allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "https://data-solutions-hub.com,http://localhost:5173,http://localhost:3000"
).split(",")
```
- El default incluye localhost:3000 y localhost:5173
- **No cambiar** a `["*"]` ni a lista vacía

### `src/lib/chatService.ts` — URL del backend
```ts
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'https://webapp-0yx8.onrender.com'
```
- Usa `??` (nullish coalescing), NO `||`
- Si `VITE_BACKEND_URL` es `undefined` → usa Render (fallback)
- Si `VITE_BACKEND_URL` es string vacío `""` → **rompe todo** (no usa el fallback)
- Por eso `.env.local` no debe tener `VITE_BACKEND_URL=` vacío

---

## Para arrancar en desarrollo

Correr `start.bat` (arranca backend + frontend).

O manualmente en dos terminales:

**Terminal 1 — Backend:**
```
cd backend
python -m uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```
npm run dev
```

Verificar que el backend responde:
```
curl http://localhost:8000/api/v1/health
# → {"status":"ok","version":"1.0.0"}
```

---

## Diagnóstico rápido si el chat falla

| Error en browser | Causa | Solución |
|---|---|---|
| `Failed to fetch` | Backend local no está corriendo | Correr `start.bat` |
| `Failed to fetch` | `.env.local` existe con valor vacío | Borrar `.env.local` |
| `Error al conectar` (genérico) | Render durmiendo o key inválida | Esperar 60s y reintentar |
| `API key no configurada` | Falta `DEEPSEEK_API_KEY` en `backend/.env` | Agregar la key |

**Verificar estado en 30 segundos:**
```bash
# ¿Backend local corriendo?
curl http://localhost:8000/api/v1/health

# ¿.env.local existe? (NO debe existir)
ls .env.local

# ¿Qué URL usa el frontend?
cat .env.development   # debe ser http://localhost:8000
```

---

## Reglas para Claude Code (IA)

Cuando se trabaje en este proyecto, **NO cambiar**:

1. **`vite.config.ts`**: No agregar `proxy` ni `port`. El proxy rompe el desarrollo local al no tener el backend corriendo. La referencia es el GitHub.
2. **`.env.development`**: Siempre debe apuntar a `localhost:8000`.
3. **`.env`**: Siempre debe apuntar a Render para producción.
4. **No crear `.env.local`**: Sobreescribe `.env.development` y rompe el setup.
5. **`backend/main.py` CORS**: Mantener el default con localhost:3000 y localhost:5173.
6. **`chatService.ts`**: El operador `??` es intencional. No cambiar a `||`.

Si el chat no funciona en localhost → **primero verificar que el backend está corriendo** antes de cambiar cualquier configuración.
