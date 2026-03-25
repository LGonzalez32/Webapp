---
title: Auth y Organizaciones
tags: [feature, auth, supabase, multitenancy]
---

# Auth y Organizaciones

## Propósito
Control de acceso multi-tenant. Cada organización (distribuidora) tiene sus propios
datos aislados. Los usuarios pertenecen a una organización y solo ven sus datos.

## Estado
⚙️ Configurado en Supabase, no activo en el frontend actual.

---

## Modelo de datos

### Tabla `organizations`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | PK |
| `name` | text | Nombre de la distribuidora |
| `join_control` | boolean | Si `true`, los nuevos usuarios necesitan aprobación manual |
| `created_at` | timestamp | |

### Tabla `profiles`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | FK → `auth.users` |
| `org_id` | uuid | FK → `organizations` |
| `role` | text | `admin` \| `manager` \| `viewer` |
| `full_name` | text | |

---

## `join_control`

Cuando `join_control = true` en una organización:
- Los nuevos usuarios que se registren con email de la misma organización
  quedan en estado `pending` hasta que un admin los aprueba.
- Evita acceso no autorizado en organizaciones sensibles.

Este toggle fue implementado como medida de seguridad proactiva.
Ver [[Changelog]] para fecha de implementación.

---

## Supabase RLS (Row Level Security)

Las políticas de RLS están configuradas para que:
- Los usuarios solo lean filas donde `org_id` coincide con su perfil
- Los admins pueden leer todas las filas de su organización
- Ningún usuario puede leer datos de otra organización

---

## Flujo de autenticación previsto

```
Usuario visita la app
  └─▶ Supabase Auth → sesión activa?
        ├─ No → LoginPage → signup/login
        │           └─▶ join_control? → pending o activo
        └─ Sí → cargar profile → orgId al store
                    └─▶ todas las queries filtradas por org_id
```

---

## Decisiones de diseño

- **Supabase Auth** sobre solución custom — menor tiempo de implementación,
  mejor seguridad por defecto, integración nativa con RLS
- **Multi-tenant desde el día 1** — aunque el primer cliente sea uno solo,
  la arquitectura no requiere refactor para agregar el segundo
- **Auth data no se loguea** — ver [[Principios]] §7

---

## Pendiente

- Conectar Auth al frontend (pendiente antes del primer cliente pagador)
- Dashboard de administrador para gestionar usuarios y organizaciones (backlog en [[Roadmap]])
- Supabase RLS validado con tests de integración
