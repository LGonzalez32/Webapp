---
title: Supabase
tags: [arquitectura, supabase, auth, storage]
updated: 2026-03-29
---

# Supabase — Auth + Storage + DB

## Tablas (12 total)

### Activas (2)

| Tabla | RLS | Frontend | Descripción |
|-------|-----|----------|-------------|
| organizations | ✅ | Lee/Escribe | Organizaciones multi-tenant |
| organization_members | ✅ | Lee/Escribe | Membresías con roles |

### Infrautilizada (1)

| Tabla | RLS | Descripción |
|-------|-----|-------------|
| organization_invitations | ✅ | Invitaciones — no usada directamente en frontend |

### Solo-backend (2) — sin credenciales configuradas

| Tabla | RLS | Descripción |
|-------|-----|-------------|
| sales_forecasts | ❌ | Forecast engine intenta escribir (falla) |
| sales_forecast_results | ❌ | Resultados forecast (falla) |

### Huérfanas (7) — candidatas a eliminar

| Tabla | Descripción original |
|-------|---------------------|
| upload_sessions | Sesiones de carga |
| inventory_positions | Posiciones inventario |
| sales_history | Historial ventas |
| forecast_snapshots | Snapshots forecast |
| forecast_results | Resultados forecast |
| inventory_projections | Proyecciones inventario |
| sales_aggregated | Ventas agregadas |

> **Recomendación**: Eliminar las 7 tablas huérfanas. No tienen RLS, no se usan desde ningún lado, y representan un intento anterior de persistir datos en PostgreSQL que fue reemplazado por IndexedDB + Supabase Storage.

## Storage

| Bucket | Público | Contenido |
|--------|---------|-----------|
| org-data | No (privado) | `{orgId}/ventas.csv`, `{orgId}/metas.csv`, `{orgId}/inventario.csv` |

### Políticas RLS del bucket

| Política | Quién |
|----------|-------|
| Upload | owner / editor |
| Read | Todos los miembros |
| Delete | owner / editor |
| Update | owner / editor |

## Auth

- **Providers**: Email+Password, Google OAuth
- **Redirect URL**: `https://data-solutions-hub.com/auth/callback`
- **Roles**: owner / editor / viewer (columna `role` en `organization_members`)
- **Frontend**: `RequireAuth` wrapper en rutas protegidas, `useAuth` hook para listener

## Funciones SQL (SECURITY DEFINER)

| Función | Propósito |
|---------|-----------|
| `get_my_org_ids()` | Org IDs donde el usuario es miembro |
| `get_my_admin_org_ids()` | Org IDs donde es admin |
| `get_my_owner_org_ids()` | Org IDs donde es owner |
| `get_my_editor_org_ids()` | Org IDs donde es owner/editor |
| `update_updated_at()` | Trigger para `updated_at` en organizations |

Estas funciones se usan en las políticas RLS de `organizations` y `organization_members` para filtrar por membresía.

Ver: [[Infraestructura]], [[Persistencia]], [[Pendientes]]
