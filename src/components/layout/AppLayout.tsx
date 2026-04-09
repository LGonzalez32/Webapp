import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { Toaster } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { useAutoLoad } from '../../lib/useAutoLoad'
import { useAnalysis } from '../../lib/useAnalysis'
import WelcomeModal, { useShowWelcome } from '../onboarding/WelcomeModal'
import OnboardingTour, { useShowTour } from '../onboarding/OnboardingTour'
import TrialBanner from '../ui/TrialBanner'

export default function AppLayout() {
  useAutoLoad()
  useAnalysis()
  const tema = useAppStore((s) => s.configuracion.tema)
  const empresa = useAppStore((s) => s.configuracion.empresa)
  const location = useLocation()
  const isProcessed = useAppStore((s) => s.isProcessed)
  const shouldShowWelcome = useShowWelcome()
  const [showWelcome, setShowWelcome] = useState(shouldShowWelcome)
  const shouldShowTour = useShowTour(isProcessed)
  const [showTour, setShowTour] = useState(false)

  // Show tour after welcome modal closes and data is not loaded
  useEffect(() => {
    if (shouldShowTour && !showWelcome) setShowTour(true)
  }, [shouldShowTour, showWelcome])

  useEffect(() => {
    if (tema === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [tema])

  return (
    <div className="flex h-screen overflow-hidden selection:bg-[#00D68F]/25" style={{ background: 'var(--sf-sidebar)' }}>
      <Toaster position="top-right" theme={tema} richColors />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-950 text-zinc-200">
        <TrialBanner />
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-8" data-print-empresa={empresa || 'SalesFlow'}>
          <div key={location.pathname} className="animate-in fade-in duration-200 min-h-full">
            <Outlet />
          </div>
        </main>
      </div>
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
      {showTour && <OnboardingTour onClose={() => setShowTour(false)} />}
    </div>
  )
}
