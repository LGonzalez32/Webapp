---
title: "ADR-002: Upload bloqueante con Promise.allSettled"
tags: [adr, datos, upload, bugs]
date: 2026-03-21
status: Aceptada
---

# ADR-002: Upload bloqueante con Promise.allSettled

## Estado
✅ Aceptada e implementada — bug crítico corregido

## Contexto

[[features/UploadPage]] necesita subir hasta 3 archivos a Supabase Storage
(ventas, metas, inventario) y luego actualizar el store de Zustand antes de
navegar al dashboard.

La implementación original usaba el patrón **fire-and-forget**:

```typescript
// ❌ Patrón original (incorrecto)
uploadVentas(file)
uploadMetas(file)
navigate('/dashboard')  // navega sin esperar
```

### El bug
Si el usuario navegaba antes de que los uploads terminaran:
- El store se actualizaba con datos parciales o vacíos
- El dashboard mostraba análisis incompleto o en cero
- No había mensaje de error — fallaba silenciosamente
- El usuario no sabía que sus datos no se habían cargado

## Decisión

**El upload es bloqueante.** La navegación no ocurre hasta que
`Promise.allSettled` confirma que todos los uploads terminaron
(con éxito o con error manejado).

```typescript
// ✅ Patrón correcto
const results = await Promise.allSettled([
  uploadVentas(ventasFile),
  uploadMetas(metasFile),
  uploadInventario(inventarioFile),
])

// Solo aquí se actualiza el store y se navega
setSales(parsedVentas)
setMetas(parsedMetas)
setInventory(parsedInventario)
navigate('/dashboard')
```

Se usa `allSettled` (no `all`) para que un fallo en metas o inventario
no bloquee la carga de ventas — los archivos opcionales pueden fallar
sin abortar el flujo completo.

## Consecuencias

### Positivas
- Cero pérdida silenciosa de datos
- El usuario ve un estado de carga claro mientras espera
- Los errores se reportan específicamente por archivo

### Negativas
- La navegación tarda más (el usuario espera el upload completo)
- En conexiones lentas la experiencia puede sentirse lenta

## Lección aprendida

El patrón fire-and-forget es aceptable para operaciones secundarias
(analytics, logs). **Nunca** para operaciones que determinan el estado
de la aplicación.

Ver [[features/UploadPage]] para la implementación.
Ver [[Principios]] §6 para la regla general.
