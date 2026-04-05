import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from './authStore'
import { useOrgStore } from './orgStore'

export type AlertStatus = 'pending' | 'following' | 'resolved'

export interface AlertStatusRecord {
  status: AlertStatus
  updatedAt: string    // ISO string
  reopenedAt?: string  // ISO string — se establece al reabrir automáticamente
  note?: string        // nota opcional del usuario
}

interface AlertStatusState {
  alertStatuses: Record<string, AlertStatusRecord>

  // Cambia el estado de una alerta y sincroniza con Supabase si hay sesión activa
  setAlertStatus: (alertKey: string, status: AlertStatus, note?: string) => Promise<void>

  // Carga estados desde Supabase (llamar al montar si hay sesión)
  loadAlertStatuses: (orgId: string) => Promise<void>

  // Revisa si alertas resueltas hace más de 7 días volvieron a aparecer
  checkReopened: (activeAlertKeys: string[]) => string[]

  reset: () => void
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export const useAlertStatusStore = create<AlertStatusState>()(
  persist(
    (set, get) => ({
      alertStatuses: {},

      setAlertStatus: async (alertKey, status, note) => {
        const now = new Date().toISOString()
        set(state => ({
          alertStatuses: {
            ...state.alertStatuses,
            [alertKey]: {
              status,
              updatedAt: now,
              // Preservar reopenedAt si existía
              reopenedAt: state.alertStatuses[alertKey]?.reopenedAt,
              note: note ?? state.alertStatuses[alertKey]?.note,
            },
          },
        }))

        // Sincronizar con Supabase si el usuario está autenticado
        const user = useAuthStore.getState().user
        const org  = useOrgStore.getState().org
        if (user && org) {
          await supabase.from('alert_status').upsert(
            {
              org_id:     org.id,
              user_id:    user.id,
              alert_key:  alertKey,
              status,
              updated_at: now,
            },
            { onConflict: 'org_id,alert_key' }
          )
        }
      },

      loadAlertStatuses: async (orgId) => {
        const { data, error } = await supabase
          .from('alert_status')
          .select('alert_key, status, updated_at, reopened_at')
          .eq('org_id', orgId)

        if (error || !data) return

        const statuses: Record<string, AlertStatusRecord> = {}
        for (const row of data) {
          statuses[row.alert_key] = {
            status:      row.status as AlertStatus,
            updatedAt:   row.updated_at,
            reopenedAt:  row.reopened_at ?? undefined,
          }
        }
        set({ alertStatuses: statuses })
      },

      /**
       * Revisa si alertas resueltas hace más de 7 días siguen activas.
       * Las reabre automáticamente y devuelve las claves afectadas.
       */
      checkReopened: (activeAlertKeys) => {
        const { alertStatuses } = get()
        const now = Date.now()
        const reopenedKeys: string[] = []
        const updates: Record<string, AlertStatusRecord> = {}

        for (const key of activeAlertKeys) {
          const record = alertStatuses[key]
          if (!record || record.status !== 'resolved') continue

          const resolvedAt = new Date(record.updatedAt).getTime()
          if (now - resolvedAt > SEVEN_DAYS_MS) {
            updates[key] = {
              ...record,
              status:      'pending',
              reopenedAt:  new Date().toISOString(),
            }
            reopenedKeys.push(key)
          }
        }

        if (reopenedKeys.length > 0) {
          set(state => ({
            alertStatuses: { ...state.alertStatuses, ...updates },
          }))
        }

        return reopenedKeys
      },

      reset: () => set({ alertStatuses: {} }),
    }),
    {
      name: 'salesflow-alert-status',
      version: 1,
    }
  )
)
