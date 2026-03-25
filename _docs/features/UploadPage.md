---
title: UploadPage
tags: [feature, upload, parser, datos]
---

# UploadPage

## Propósito
Punto de entrada de datos al sistema. Permite cargar archivos CSV o Excel de ventas,
metas e inventario hacia Supabase Storage.

La decisión de diseño más importante de esta página está documentada en
[[decisiones/ADR-002-upload-bloqueante]].

## Estado
✅ Producción

## Ruta
`/cargar`

---

## Componentes clave

### FileDropzone
- Acepta CSV y Excel (`.xlsx`, `.xls`)
- Drag & drop o click para seleccionar
- Validación de tipo de archivo antes de parsear

### Parser de ventas (`fileParser.ts`)
Columnas **obligatorias:**
- `fecha`, `vendedor`, `producto`, `monto`

Columnas **opcionales** (activan features condicionales):
- `departamento` → activa [[DepartamentosPage]]
- `supervisor` → activa filtro por supervisor
- `codigo_producto` → enriquece análisis de productos
- `codigo_cliente` → activa [[ClientesPage]]
- `venta_neta` → activa `impacto_economico` en insights

### ParseError tipado
8 códigos de error específicos:
- `MISSING_COLUMN` — columna obligatoria ausente
- `INVALID_DATE` — formato de fecha no reconocido
- `INVALID_NUMBER` — monto no numérico
- `EMPTY_FILE` — archivo sin filas de datos
- `ENCODING_ERROR` — problema de codificación (común en Excel LATAM)
- `DUPLICATE_ROW` — fila duplicada detectada
- `FUTURE_DATE` — fecha mayor a hoy
- `UNKNOWN` — error no clasificado

### Bloque de estado Supabase
- Muestra archivos actualmente cargados en Storage
- Permite ver qué datos están activos en el período seleccionado

### StepIndicator
- Muestra el progreso: Seleccionar → Validar → Cargar → Listo
- No navega hasta confirmar que el upload terminó

---

## Flujo de upload

```
Usuario selecciona archivo
  └─▶ fileParser.ts → ParseResult | ParseError[]
        ├─ Si hay errores → mostrar errores, no continuar
        └─ Si OK → Promise.allSettled([uploadVentas, uploadMetas, uploadInventario])
                        └─ Solo al resolver → setSales() + setMetas() + setInventory()
                                                └─ navigate('/dashboard')
```

**Nunca** se navega antes de que `Promise.allSettled` resuelva.
Ver [[decisiones/ADR-002-upload-bloqueante]].

---

## Decisiones de diseño

- **Upload bloqueante** — la promesa del upload debe resolver antes de navegar.
  El patrón fire-and-forget causaba pérdida silenciosa de datos.
- **Columnas opcionales como flags** — en lugar de rechazar archivos incompletos,
  el sistema adapta las features disponibles a lo que trae el archivo.
- **Errores tipados** — mensajes de error en español, específicos para el contexto
  de distribución (fechas, montos, codificaciones LATAM).

---

## Pendiente

- Tests de integración para el parser (en [[Roadmap]])
