import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useAppStore } from '../store/appStore'
import { useOrgStore } from '../store/orgStore'
import { getDemoData, DEMO_EMPRESA } from '../lib/demoData'
import { parseSalesFile, parseMetasFile, parseInventoryFile, parseRawFile } from '../lib/fileParser'
import { uploadOrgFile, getOrgStorageFiles, deleteOrgFiles } from '../lib/orgService'
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

// ── Datos de ejemplo por tipo de archivo ──────────────────────────────────────

const VENTAS_HEADERS = [
  { col: 'fecha',      req: true  },
  { col: 'vendedor',   req: true  },
  { col: 'unidades',   req: true  },
  { col: 'cliente',    req: false },
  { col: 'producto',   req: false },
  { col: 'venta_neta', req: false },
  { col: 'canal',      req: false },
  { col: 'categoria',  req: false },
]
const VENTAS_ROWS = [
  ['2026-03-01','ANA MARIA LOPEZ','24','SUPER SELECTOS S.A.','ACEITE CORONA 1L','142.80','RUTEO','ALIMENTOS'],
  ['2026-03-01','CARLOS MENDOZA','15','DISTRIBUIDORA NORTE','DETERGENTE ARIEL 2KG','89.25','MAYOREO','LIMPIEZA'],
  ['2026-03-02','ANA MARIA LOPEZ','8','TIENDA LA UNION','ACEITE CORONA 1L','47.60','RUTEO','ALIMENTOS'],
  ['2026-03-03','ROBERTO CHAVEZ','31','SUPER SELECTOS S.A.','SHAMPOO PANTENE 400ML','198.40','MODERNO','CUIDADO PERSONAL'],
  ['2026-03-04','MARIA GONZALEZ','19','MERCADO CENTRAL','DETERGENTE ARIEL 2KG','113.05','RUTEO','LIMPIEZA'],
  ['2026-03-05','CARLOS MENDOZA','42','DISTRIBUIDORA NORTE','ACEITE CORONA 1L','249.90','MAYOREO','ALIMENTOS'],
  ['2026-03-06','ROBERTO CHAVEZ','7','TIENDA EL SOL','SHAMPOO PANTENE 400ML','44.80','RUTEO','CUIDADO PERSONAL'],
  ['2026-03-07','ANA MARIA LOPEZ','28','SUPER SELECTOS S.A.','DETERGENTE ARIEL 2KG','166.60','MODERNO','LIMPIEZA'],
]

const METAS_HEADERS = [
  { col: 'mes_periodo', req: true  },
  { col: 'vendedor',    req: true  },
  { col: 'meta',        req: true  },
  { col: 'canal',       req: false },
]
const METAS_ROWS = [
  ['2026-03','ANA MARIA LOPEZ','800','RUTEO'],
  ['2026-03','CARLOS MENDOZA','1200','MAYOREO'],
  ['2026-03','ROBERTO CHAVEZ','950','MODERNO'],
  ['2026-03','MARIA GONZALEZ','750','RUTEO'],
  ['2026-04','ANA MARIA LOPEZ','850','RUTEO'],
  ['2026-04','CARLOS MENDOZA','1250','MAYOREO'],
]

const INVENTARIO_HEADERS = [
  { col: 'producto',  req: true  },
  { col: 'unidades',  req: true  },
  { col: 'categoria', req: false },
  { col: 'proveedor', req: false },
]
const INVENTARIO_ROWS = [
  ['ACEITE CORONA 1L','145','ALIMENTOS','SIGMA'],
  ['DETERGENTE ARIEL 2KG','89','LIMPIEZA','P&G'],
  ['SHAMPOO PANTENE 400ML','234','CUIDADO PERSONAL','P&G'],
  ['JABON PALMOLIVE 3PK','67','CUIDADO PERSONAL','COLGATE'],
  ['ACEITE MAZOLA 900ML','43','ALIMENTOS','CJ'],
  ['SUAVITEL 850ML','156','LIMPIEZA','COLGATE'],
]

// ── Tabla de ejemplo ──────────────────────────────────────────────────────────

function TablaEjemplo({ headers, rows }: { headers: { col: string; req: boolean }[]; rows: string[][] }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
        <thead>
          <tr>
            {headers.map(({ col, req }) => (
              <th key={col} style={{
                padding: '0.35rem 0.625rem',
                textAlign: 'left',
                borderBottom: '2px solid #3f3f46',
                background: '#18181b',
                color: '#a1a1aa',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}>
                {col}
                {req && <span style={{ marginLeft: '0.25rem', color: '#10b981', fontSize: '0.625rem', fontWeight: 700 }}>*</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : '#18181b' }}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '0.3rem 0.625rem',
                  borderBottom: '1px solid #27272a',
                  color: '#d4d4d8',
                  whiteSpace: 'nowrap',
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: '0.6875rem', color: '#71717a', marginTop: '0.375rem' }}>
        * Requerido — las demás columnas son opcionales y activan funciones adicionales.
      </p>
    </div>
  )
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

  type StorageFiles = {
    ventas:     { exists: boolean; name: string | null; updated_at: string | null }
    metas:      { exists: boolean; name: string | null; updated_at: string | null }
    inventario: { exists: boolean; name: string | null; updated_at: string | null }
  }
  const [storageFiles, setStorageFiles] = useState<StorageFiles | null>(null)
  const [storageLoading, setStorageLoading] = useState(false)

  useEffect(() => {
    if (!org?.id) return
    setStorageLoading(true)
    getOrgStorageFiles(org.id)
      .then(setStorageFiles)
      .finally(() => setStorageLoading(false))
  }, [org?.id])

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

  const handleAnalyze = async () => {
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
    await new Promise(resolve => setTimeout(resolve, 50))

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

    // Subir archivos al Storage ANTES de navegar
    if (org) {
      setLoading({ title: 'Guardando en la nube...', subtitle: 'Subiendo archivos a tu organización', progress: 60 })

      const toUpload = steps.filter(s => s.status === 'loaded' && s.file)
      const results = await Promise.allSettled(
        toUpload.map(s => uploadOrgFile(org.id, s.id as 'ventas' | 'metas' | 'inventario', s.file!))
      )

      const failed = results.filter(
        r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)
      ).length

      if (failed > 0) {
        toast.warning(
          'Los datos se cargaron correctamente, pero no se pudieron guardar en la nube. Al cerrar sesión tendrás que subir los archivos de nuevo.',
          { duration: 8000 }
        )
      }
    }

    setLoading({ title: 'Iniciando análisis...', subtitle: 'Detectando patrones y riesgos comerciales', progress: 90 })
    await new Promise(resolve => setTimeout(resolve, 400))
    setLoading(null)
    navigate('/dashboard')
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

  const handleLimpiar = async () => {
    resetAll()
    setSteps(INITIAL_STEPS)
    setCurrentStep(0)
    setStorageFiles(null)
    if (org?.id) {
      await deleteOrgFiles(org.id)
    }
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
            onClick={handleLimpiar}
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

      {/* Archivos existentes en Storage */}
      {storageFiles && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Archivos en la nube
            </p>
            {storageLoading && (
              <span className="text-xs text-zinc-600">Verificando...</span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {([
              { key: 'ventas',     label: 'Ventas',     required: true  },
              { key: 'metas',      label: 'Metas',      required: false },
              { key: 'inventario', label: 'Inventario', required: false },
            ] as const).map(({ key, label, required }) => {
              const file = storageFiles[key]
              const fechaStr = file.updated_at
                ? new Date(file.updated_at).toLocaleDateString('es', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })
                : null
              return (
                <div
                  key={key}
                  className="rounded-lg border bg-zinc-950 p-3 flex flex-col gap-1"
                  style={{ borderColor: file.exists ? 'rgb(39,39,42)' : 'rgb(28,28,30)' }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[0.8125rem] font-medium text-zinc-200">{label}</span>
                    <span className={`text-[0.625rem] font-semibold px-1.5 py-0.5 rounded-full ${
                      file.exists
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {file.exists ? '✓ Subido' : required ? 'Requerido' : 'Opcional'}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-600">
                    {file.exists && fechaStr
                      ? `Actualizado: ${fechaStr}`
                      : file.exists
                      ? 'En la nube'
                      : 'No subido aún'}
                  </span>
                </div>
              )
            })}
          </div>

          {storageFiles.ventas.exists && (
            <p className="text-xs text-zinc-600 pt-1 border-t border-zinc-800">
              Puedes subir nuevos archivos para reemplazar los actuales. Los datos anteriores se sobreescribirán.
            </p>
          )}
        </div>
      )}

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
          <TablaEjemplo
            headers={step.id === 'ventas' ? VENTAS_HEADERS : step.id === 'metas' ? METAS_HEADERS : INVENTARIO_HEADERS}
            rows={step.id === 'ventas' ? VENTAS_ROWS : step.id === 'metas' ? METAS_ROWS : INVENTARIO_ROWS}
          />
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
