---
title: Changelog
tags: [changelog, historial]
---

# 📓 Changelog — SalesFlow

Registro cronológico de sesiones de trabajo.
Para el plan de lo que viene, ver [[Roadmap]].

---

## 2026-03-21 — [[sesiones/2026-03-21]]

- Configurado vault Obsidian en `_docs/` para documentación del proyecto
- Estructura inicial: [[Roadmap]], [[Arquitectura]], [[Principios]], features, ADRs, sesiones

---

## 2026 — Sesiones anteriores (resumen)

### Seguridad
- API key de DeepSeek movida al backend — ver [[decisiones/ADR-001-deepseek-backend]]
- Auth data eliminada de console logs
- CORS restringido via env vars
- Toggle `join_control` agregado a tabla organizations — ver [[features/AuthOrganizaciones]]

### Integridad de datos
- Bug crítico de uploads corregido — ver [[decisiones/ADR-002-upload-bloqueante]]
- Lógica de autoload corregida tras visitar `/cargar`

### [[features/EstadoComercial]]
- KPI badges compactos con comparación año anterior (YoY)
- Causas de atraso expandibles con detalle por vendor y canal
- Bloque de simulación de dos escenarios
- Botones "Analizar con IA" pre-conectados a [[features/ChatIA]]
- Sección de oportunidades detectadas automáticamente

### [[features/ChatIA]]
- Markdown rendering mejorado en respuestas
- System prompt refinado con contexto de distribución LATAM
- Follow-up chips dinámicos tras cada respuesta
- Detección de entidades (productos, clientes, departamentos)

### Performance
- `useDeferredValue` para secciones secundarias en páginas pesadas
- Reducción de iteraciones redundantes en `useMemo`

### [[features/DepartamentosPage]]
- Heat map SVG con los 14 departamentos de El Salvador
- Colores proporcionales a cumplimiento de meta
- Botones de insight IA por fila

### [[features/UploadPage]]
- Typed `ParseError` objects con 8 códigos de error
- Columnas opcionales: `departamento`, `supervisor`, `codigo_producto`, `codigo_cliente`
- Bloque de estado de archivos en Supabase Storage
