---
title: Configuracion
tags: [pagina, config]
ruta: /configuracion
loc: 212
updated: 2026-03-29
---

# Configuración — Parámetros Empresa

**Ruta**: `/configuracion`
**LOC**: 212
**IA**: No

## Datos que consume
`configuracion`, `setConfiguracion`, `setIsProcessed`

## Secciones UI
1. **Empresa** — input nombre (`empresa`), dropdown moneda (`moneda`: USD, MXN, GTQ, HNL, CRC, COP, PEN, ARS, BRL)
2. **Parámetros de análisis**:
   - `dias_dormido_threshold` (7–180) — días para marcar cliente dormido
   - `semanas_racha_threshold` (1–8) — semanas bajo promedio antes de alerta
   - `pct_concentracion_threshold` (10–90) — % umbral para riesgo concentración
3. **Umbrales de inventario** (con validación en cascada):
   - `umbral_riesgo_quiebre` (1–30 días)
   - `umbral_baja_cobertura` (2–60 días)
   - `umbral_normal` (3–120 días)
   - Validación: `riesgo_quiebre < baja_cobertura < normal`
4. **Botón Guardar** → `setConfiguracion(local)` + `setIsProcessed(false)` (dispara re-análisis)

## Filtros
Ninguno.

## Integración IA
Ninguna.

## Efecto de guardar
Cambiar configuración marca `isProcessed = false`, lo que dispara el `analysisWorker` para recalcular todo el análisis con los nuevos umbrales.

## Estado
- Light mode: Sí
- Dark mode: Sí

Ver: [[Frontend]], [[Persistencia]]
