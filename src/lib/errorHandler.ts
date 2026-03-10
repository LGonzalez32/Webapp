export function handleSupabaseError(error: unknown): string {
  if (!error) return 'Error inesperado. Intenta de nuevo'

  const msg = (error as any)?.message ?? ''
  const code = (error as any)?.code ?? ''

  if (
    msg.toLowerCase().includes('failed to fetch') ||
    msg.toLowerCase().includes('network') ||
    msg.toLowerCase().includes('fetch') ||
    (error as any)?.name === 'TypeError'
  ) {
    return 'Error de conexión. Verifica tu internet'
  }

  if (msg.toLowerCase().includes('duplicate key') || code === '23505') {
    return 'Ya existe un registro con ese nombre'
  }

  if (
    msg.toLowerCase().includes('permission denied') ||
    code === '42501' ||
    msg.toLowerCase().includes('insufficient privilege')
  ) {
    return 'Sin permisos para esta acción'
  }

  if (
    msg.toLowerCase().includes('jwt') ||
    msg.toLowerCase().includes('auth') ||
    code === 'PGRST301'
  ) {
    return 'Sesión expirada. Recarga la página'
  }

  if (msg.toLowerCase().includes('timeout')) {
    return 'La operación tardó demasiado. Intenta de nuevo'
  }

  if (msg) return msg

  return 'Error inesperado. Intenta de nuevo'
}
