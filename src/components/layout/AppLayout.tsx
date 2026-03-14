import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { Toaster } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { useAutoLoad } from '../../lib/useAutoLoad'

export default function AppLayout() {
  useAutoLoad()
  const tema = useAppStore((s) => s.configuracion.tema)

  useEffect(() => {
    if (tema === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [tema])

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-200 selection:bg-[#00B894]/30">
      <Toaster position="top-right" theme={tema} richColors />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
