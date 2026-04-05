---
title: CargarDatos
tags: [pagina, herramientas, upload]
ruta: /cargar
loc: 892
updated: 2026-03-29
---

# Cargar Datos — Upload Wizard

**Ruta**: `/cargar`
**LOC**: 892
**IA**: No

## Datos que consume (acciones)
`setSales`, `setMetas`, `setInventory`, `setIsProcessed`, `setSelectedPeriod`, `setDataSource`, `resetAll`, `configuracion`, `setConfiguracion`

También usa `useOrgStore` para `org` y `canEdit()`.

## Secciones UI
1. **Step indicator** (StepIndicator) — 3 pasos: Ventas (requerido), Metas (opcional), Inventario (opcional)
2. **Current step panel** — FileDropzone + DataPreview + detección de columnas
3. **Example format toggle** — TablaEjemplo expandible con headers y filas ejemplo por tipo
4. **Discarded rows warning** — lista expandible de filas descartadas durante parsing
5. **Navigation buttons** — Anterior / Siguiente / Saltar (para pasos opcionales)
6. **Demo data shortcut** — "Cargar datos demo" (Comercializadora Los Pinos)
7. **Success overlay** — animación de confirmación antes de redirect a `/dashboard`

## Columnas de ventas
- **Requeridas**: `fecha`, `vendedor`, `unidades`
- **Opcionales**: `cliente`, `producto`, `venta_neta`, `canal`, `categoria`, `departamento`, `supervisor`, `codigo_producto`, `codigo_cliente`

## Filtros
Ninguno.

## Integración IA
Ninguna.

## Flujo de procesamiento
```
FileDropzone → archivo CSV/XLSX
  → parseWorker.ts (Web Worker) → PapaParse/XLSX
  → Zod validation → SaleRecord[] / MetaRecord[] / InventoryItem[]
  → setSales/Metas/Inventory → store
  → dataCache.saveDatasets() → IndexedDB
  → dataSource = 'real'
  → redirect → /dashboard
```

## Estado
- Light mode: Sí
- Dark mode: Sí

Ver: [[Frontend]], [[Persistencia]]
