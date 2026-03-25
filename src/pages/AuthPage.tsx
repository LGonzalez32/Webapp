import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Zap, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAppStore } from '../store/appStore'

type Mode = 'login' | 'register'

export default function AuthPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const joinOrgId = searchParams.get('join')
  const isProcessed = useAppStore((s) => s.isProcessed)

  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
    setSuccess(null)
    setPassword('')
    setConfirmPassword('')
  }

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos.')
      setLoading(false)
      return
    }
    if (joinOrgId && data.user) {
      await supabase
        .from('organization_members')
        .insert({ org_id: joinOrgId, user_id: data.user.id, role: 'viewer' })
      // ignorar error de duplicado
      navigate('/dashboard', { replace: true })
    } else {
      navigate(isProcessed ? '/dashboard' : '/cargar', { replace: true })
    }
    setLoading(false)
  }

  const handleRegister = async () => {
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Revisa tu email para confirmar tu cuenta.')
    }
    setLoading(false)
  }

  const handleGoogle = async () => {
    const redirectTo = joinOrgId
      ? `${window.location.origin}/auth/callback?join=${joinOrgId}`
      : `${window.location.origin}/auth/callback`
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
  }

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Ingresa tu email primero.')
      return
    }
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    setSuccess('Revisa tu email para restablecer tu contraseña.')
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'login') handleLogin()
    else handleRegister()
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-[#00B894] rounded-xl flex items-center justify-center mb-3">
            <Zap className="w-6 h-6 text-black" />
          </div>
          <h1 className="text-2xl font-black text-[#00B894] tracking-tight">SalesFlow</h1>
          <p className="text-sm text-zinc-500 mt-1">Monitor de Riesgo Comercial</p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-lg font-bold text-zinc-100 mb-6">
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nombre — solo en registro */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                  Nombre <span className="text-zinc-600 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#00B894] transition-colors"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#00B894] transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#00B894] transition-colors"
              />
            </div>

            {/* Confirmar password — solo en registro */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#00B894] transition-colors"
                />
              </div>
            )}

            {/* Forgot password — solo en login */}
            {mode === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-zinc-500 hover:text-[#00B894] transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {/* Error / Success */}
            {error && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-[#00B894] bg-[#00B894]/10 border border-[#00B894]/30 rounded-lg px-3 py-2">
                {success}
              </p>
            )}

            {/* Botón principal */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00B894] hover:bg-[#00a884] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          </form>

          {/* Divisor */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-600">o</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogle}
            className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-medium py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-3"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
              <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
              <path d="M6.306 14.691l6.571 4.819C14.655 15.108 19.001 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
              <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
              <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
            </svg>
            Continuar con Google
          </button>

          {/* Toggle modo */}
          <p className="text-center text-sm text-zinc-600 mt-6">
            {mode === 'login' ? (
              <>
                ¿No tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="text-[#00B894] hover:underline font-medium"
                >
                  Regístrate
                </button>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-[#00B894] hover:underline font-medium"
                >
                  Inicia sesión
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
