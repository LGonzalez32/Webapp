---
title: Principios
tags: [principios, producto, ingenieria]
---

# 🧭 Principios — SalesFlow

Estos principios guían todas las decisiones de producto e ingeniería.
Son la razón detrás de las decisiones documentadas en [[Arquitectura]] y los [[decisiones/ADR-001-deepseek-backend|ADRs]].

---

## Principios de producto

### 1. Surfacear la respuesta antes de que el usuario la pida
SalesFlow no es un dashboard BI donde el usuario explora datos.
Es un motor de decisiones que detecta el problema y lo presenta con contexto.
El usuario ideal no sabe qué pregunta hacer — nosotros debemos hacerla por él.

### 2. Específico o inútil
Los insights deben incluir números, porcentajes, conteos, nombres.
Un insight genérico ("las ventas están bajas") no tiene valor.
Un insight útil: "Vendedor Carlos Ramírez está al 54% de su meta con 6 días hábiles restantes."

### 3. IA como infraestructura invisible
La IA no es una sección de la app — es el motor que potencia cada página.
Ver [[decisiones/ADR-003-ia-como-puente]].
El usuario no debe sentir que "usa IA", sino que la app simplemente entiende su negocio.

### 4. Diseñado para no-técnicos
Usuarios objetivo: gerentes comerciales y directores de ventas de distribuidoras.
No saben qué es una API, un CSV o un JOIN.
La interfaz debe funcionar sin manual de usuario.

### 5. El Salvador primero, LATAM después
El contexto cultural, económico y de negocio de El Salvador es el punto de partida.
La internacionalización viene después, cuando haya tracción local.

---

## Principios de ingeniería

### 6. Integridad de datos sobre conveniencia
Si un upload puede fallar silenciosamente, es inaceptable aunque sea más rápido.
Ver [[decisiones/ADR-002-upload-bloqueante]].

### 7. Seguridad no negociable
Las API keys nunca se exponen en el frontend.
Los datos de autenticación no se loguean en consola.
CORS restringido desde el inicio, no como afterthought.
Ver [[decisiones/ADR-001-deepseek-backend]].

### 8. Cambios quirúrgicos
No reescribir lo que funciona. Editar solo lo que debe cambiar.
`tsc --noEmit` debe dar 0 errores al terminar cada sesión.

### 9. No instalar dependencias sin justificación
Cada librería nueva es deuda de mantenimiento.
Si se puede hacer con lo que ya existe, se hace con lo que ya existe.

### 10. El código muerto no bloquea, pero se documenta
`forecastApi.ts` y `errorHandler.ts` están inactivos pero no interfieren.
No se tocan hasta que haya una razón específica.
Ver [[Arquitectura]] para la lista completa.

---

## Criterios de priorización del backlog

Al priorizar items del [[Roadmap]], se evalúa:

1. **¿Bloquea a un cliente piloto?** → Prioridad inmediata
2. **¿Es riesgo de seguridad o pérdida de datos?** → Prioridad inmediata
3. **¿Aumenta la retención del usuario existente?** → Alta prioridad
4. **¿Reduce fricción en el onboarding?** → Alta prioridad
5. **¿Es un nice-to-have sin usuario que lo pida?** → Backlog bajo
