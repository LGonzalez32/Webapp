import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useAppStore } from '../store/appStore'
import { useOrgStore } from '../store/orgStore'
import { getDemoData, DEMO_EMPRESA } from '../lib/demoData'
import { parseSalesFile, parseMetasFile, parseInventoryFile, parseRawFile } from '../lib/fileParser'
import { uploadOrgFile } from '../lib/orgService'
import LoadingOverlay from '../components/ui/LoadingOverlay'
import StepIndicator from '../components/upload/StepIndicator'
import FileDropzone from '../components/upload/FileDropzone'
import DataPreview from '../components/upload/DataPreview'
import { cn } from '../lib/utils'
import { Sparkles, FileDown, Trash2, ChevronRight, ChevronLeft, ShieldOff } from 'lucide-react'
import type { UploadStep } from '../types'

const INITIAL_STEPS: UploadStep[] = [
  {
    id: 'ventas',
    label: 'Datos de Ventas',
    description: 'El archivo base. Con solo fecha + vendedor + unidades el sistema detecta rachas, proyecciones y riesgos de meta.',
    required: true,
    status: 'pending',
  },
  {
    id: 'metas',
    label: 'Metas de Ventas',
    description: 'Con las metas activarás el semáforo de cumplimiento, proyecciones vs. objetivo y alertas de meta en riesgo.',
    required: false,
    status: 'pending',
  },
  {
    id: 'inventario',
    label: 'Inventario Actual',
    description: 'Conecta tus ventas con tu stock para detectar rupturas antes de que ocurran.',
    required: false,
    status: 'pending',
  },
]

const COLUMN_INFO: Record<string, { required: string[]; optional: { col: string; unlock: string }[] }> = {
  ventas: {
    required: ['fecha', 'vendedor', 'unidades'],
    optional: [
      { col: 'cliente', unlock: 'Activa: clientes dormidos, caída explicada, concentración de riesgo' },
      { col: 'producto', unlock: 'Activa: productos sin movimiento, análisis de mix' },
      { col: 'venta_neta', unlock: 'Activa: ticket promedio, análisis de facturación' },
    ],
  },
  metas: {
    required: ['mes_periodo', 'vendedor', 'meta'],
    optional: [],
  },
  inventario: {
    required: ['producto', 'unidades'],
    optional: [],
  },
}

export default function UploadPage() {
  const { setSales, setMetas, setInventory, setIsProcessed, setSelectedPeriod, resetAll, configuracion, setConfiguracion } = useAppStore()
  const { org } = useOrgStore()
  const canEdit = useOrgStore(s => s.canEdit())
  const navigate = useNavigate()

  const [steps, setSteps] = useState<UploadStep[]>(INITIAL_STEPS)
  const [currentStep, setCurrentStep] = useState(0)
  const [processingStep, setProcessingStep] = useState<number | null>(null)
  const [loading, setLoading] = useState<{ title: string; subtitle: string; progress: number } | null>(null)

  const updateStep = (idx: number, partial: Partial<UploadStep>) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...partial } : s)))

  const handleFileSelect = async (idx: number, file: File) => {
    setProcessingStep(idx)
    updateStep(idx, { file, status: 'pending', parsedData: undefined })

    try {
      const stepId = steps[idx].id
      let parsed: any[] = []

      if (stepId === 'ventas') {
        const res = await parseSalesFile(file)
        parsed = res.data
      } else if (stepId === 'metas') {
        const res = await parseMetasFile(file)
        parsed = res.data
      } else {
        const res = await parseInventoryFile(file)
        parsed = res.data
      }

      updateStep(idx, {
        parsedData: parsed,
        status: parsed.length > 0 ? 'loaded' : 'error',
      })
    } catch {
      updateStep(idx, { status: 'error' })
    } finally {
      setProcessingStep(null)
    }
  }

  const handleSkip = (idx: number) => {
    updateStep(idx, { status: 'skipped' })
    if (idx < steps.length - 1) setCurrentStep(idx + 1)
  }

  const canGoNext = () => {
    const step = steps[currentStep]
    return step.status === 'loaded' || step.status === 'skipped' || (!step.required && step.status === 'pending')
  }

  const allRequiredDone = () => steps.filter((s) => s.required).every((s) => s.status === 'loaded')

  const handleAnalyze = () => {
    const salesData = steps[0].parsedData ?? []
    const metasData = steps[1].parsedData ?? []
    const inventoryData = steps[2].parsedData ?? []

    // Mostrar overlay inmediatamente para dar feedback visual
    setLoading({
      title: 'Cargando datos...',
      subtitle: `Procesando ${salesData.length.toLocaleString()} registros de ventas`,
      progress: 30,
    })

    // Dejar que el overlay renderice antes de bloquear el hilo con setSales
    setTimeout(() => {
      // Auto-detectar el último mes en los datos para usarlo como período activo
      if (salesData.length > 0) {
        const lastDate = salesData.reduce((max: Date, s: any) => {
          const d = new Date(s.fecha)
          return d > max ? d : max
        }, new Date(0))
        if (lastDate.getFullYear() > 1970) {
          setSelectedPeriod({ year: lastDate.getFullYear(), month: lastDate.getMonth() })
        }
      }

      setIsProcessed(false)
      setSales(salesData)
      setMetas(metasData)
      setInventory(inventoryData)

      // Fire-and-forget: subir archivos al Storage de la org
      if (org) {
        steps.forEach((step) => {
          if (step.status === 'loaded' && step.file) {
            uploadOrgFile(org.id, step.id as 'ventas' | 'metas' | 'inventario', step.file)
              .catch(console.warn)
          }
        })
      }

      setLoading({ title: 'Iniciando análisis...', subtitle: 'Detectando patrones y riesgos comerciales', progress: 70 })

      setTimeout(() => {
        setLoading(null)
        navigate('/dashboard')
      }, 400)
    }, 50)
  }

  const handleLoadDemo = () => {
    setLoading({ title: 'Cargando demo...', subtitle: 'Generando datos de Distribuidora Los Pinos', progress: 30 })
    setTimeout(() => {
      const { sales, metas, inventory } = getDemoData()
      setSales(sales)
      setMetas(metas)
      setInventory(inventory)
      setConfiguracion({ empresa: DEMO_EMPRESA })
      setLoading({ title: '¡Listo!', subtitle: 'Redirigiendo al dashboard', progress: 100 })
      setTimeout(() => {
        setLoading(null)
        navigate('/dashboard')
      }, 400)
    }, 600)
  }

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['fecha', 'vendedor', 'unidades', 'cliente', 'producto', 'venta_neta'],
        ['2025-01-05', 'Carlos', 45, 'Tienda Norte', 'Aceite 1L', 202.50],
        ['2025-01-08', 'Ana', 32, 'Supermercado López', 'Harina 1kg', 38.40],
      ]),
      'Ventas'
    )

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['mes_periodo', 'vendedor', 'meta'],
        ['2025-01', 'Carlos', 650],
        ['2025-01', 'Ana', 720],
      ]),
      'Metas'
    )

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['producto', 'unidades'],
        ['Aceite 1L', 180],
        ['Harina 1kg', 240],
      ]),
      'Inventario'
    )

    XLSX.writeFile(wb, 'plantilla-salesflow.xlsx')
  }

  // Guard: solo owner/editor pueden subir archivos
  if (!canEdit) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 space-y-4">
        <ShieldOff className="w-10 h-10 text-zinc-600" />
        <h2 className="text-lg font-bold text-zinc-300">Sin permiso para cargar archivos</h2>
        <p className="text-sm text-zinc-500 text-center max-w-sm">
          Solo el propietario o un editor puede cargar archivos. Contacta al propietario de la organización.
        </p>
      </div>
    )
  }

  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1
  const colInfo = COLUMN_INFO[step.id]

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20 animate-in fade-in duration-700">
      <LoadingOverlay
        isVisible={loading !== null}
        title={loading?.title ?? ''}
        subtitle={loading?.subtitle ?? ''}
        progress={loading?.progress}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50 tracking-tight">Cargar Datos</h1>
          <p className="text-zinc-500 mt-1">Sube tus ventas y activa el monitor de riesgo comercial.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { resetAll(); setSteps(INITIAL_STEPS); setCurrentStep(0) }}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar
          </button>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-xs font-bold text-zinc-300 transition-all"
          >
            <FileDown className="w-3.5 h-3.5" />
            Plantilla Excel
          </button>
        </div>
      </div>

      {/* Demo banner */}
      <div className="bg-[#00B894]/5 border border-[#00B894]/15 rounded-2xl p-6 flex items-center gap-4">
        <div className="bg-[#00B894]/20 p-2 rounded-lg shrink-0">
          <Sparkles className="w-5 h-5 text-[#00B894]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-200">Explorar con datos demo</p>
          <p className="text-xs text-zinc-500">
            Distribuidora Los Pinos · 8 vendedores · 18 meses · activa los 5 insights críticos
          </p>
        </div>
        <button
          onClick={handleLoadDemo}
          className="shrink-0 px-4 py-2 bg-[#00B894] hover:bg-[#00a884] text-black rounded-lg text-xs font-bold transition-all"
        >
          Cargar demo
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex justify-center">
        <StepIndicator steps={steps} currentStepIndex={currentStep} />
      </div>

      {/* Step card */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">
              Paso {currentStep + 1} de {steps.length}
            </span>
            {!step.required && (
              <span className="px-1.5 py-0.5 bg-zinc-800 rounded text-[9px] font-bold text-zinc-500 uppercase">opcional</span>
            )}
          </div>
          <h2 className="text-xl font-bold text-zinc-100">{step.label}</h2>
          <p className="text-sm text-zinc-500 mt-1">{step.description}</p>
        </div>

        {/* Column guide */}
        {step.status === 'pending' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {colInfo.required.map((col) => (
                <span key={col} className="px-2.5 py-1 bg-[#00B894]/10 border border-[#00B894]/20 rounded-lg text-[11px] font-bold text-[#00B894]">
                  {col} <span className="opacity-60 font-normal">requerido</span>
                </span>
              ))}
            </div>
            {colInfo.optional.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Columnas opcionales que desbloquean funciones</p>
                {colInfo.optional.map(({ col, unlock }) => (
                  <div key={col} className="flex items-start gap-2 text-xs">
                    <span className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-400 font-mono shrink-0">{col}</span>
                    <span className="text-zinc-500">{unlock}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <FileDropzone
          step={step}
          onFileSelect={(file) => handleFileSelect(currentStep, file)}
          onSkip={!step.required ? () => handleSkip(currentStep) : undefined}
          isProcessing={processingStep === currentStep}
        />

        {step.parsedData && step.parsedData.length > 0 && step.status === 'loaded' && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Vista previa — {step.parsedData.length.toLocaleString()} registros
            </p>
            <DataPreview data={step.parsedData} maxRows={5} />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentStep((c) => c - 1)}
          disabled={currentStep === 0}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all',
            currentStep === 0
              ? 'opacity-30 cursor-not-allowed text-zinc-600'
              : 'bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300'
          )}
        >
          <ChevronLeft className="w-4 h-4" />
          Anterior
        </button>

        <div className="flex items-center gap-3">
          {isLastStep ? (
            <button
              onClick={handleAnalyze}
              disabled={!allRequiredDone()}
              className={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all',
                allRequiredDone()
                  ? 'bg-[#00B894] hover:bg-[#00a884] text-black shadow-lg shadow-[#00B894]/20'
                  : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
              )}
            >
              Analizar ventas
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setCurrentStep((c) => c + 1)}
              disabled={!canGoNext()}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all',
                canGoNext()
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                  : 'bg-zinc-900 text-zinc-700 cursor-not-allowed'
              )}
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
