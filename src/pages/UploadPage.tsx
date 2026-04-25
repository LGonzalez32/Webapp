import React, { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useAppStore } from '../store/appStore'
import { useOrgStore } from '../store/orgStore'
import { getDemoData, DEMO_EMPRESA } from '../lib/demoData'
import { parseSalesFileInWorker, parseMetasFileInWorker, parseInventoryFileInWorker } from '../lib/fileParser'
import { uploadOrgFile, getOrgStorageFiles, deleteOrgFiles } from '../lib/orgService'
import { saveDatasets, clearDatasets } from '../lib/dataCache'
import LoadingOverlay from '../components/ui/LoadingOverlay'
import StepIndicator from '../components/upload/StepIndicator'
import FileDropzone from '../components/upload/FileDropzone'
import DataPreview from '../components/upload/DataPreview'
import { cn } from '../lib/utils'
import { Trash2, ChevronRight, ChevronLeft, ShieldOff, Check, AlertTriangle, Info, Lock } from 'lucide-react'
import type { UploadStep, ParseResult, ParseError, DiscardedRow } from '../types'
import { useUserRole } from '../lib/useUserRole'

/** Type guard: estrecha ParseResult<T> al branch de error */
function parseErr<T>(r: ParseResult<T>): r is { success: false; error: ParseError } {
  return r.success === false
}

const INITIAL_STEPS: UploadStep[] = [
  {
    id: 'ventas',
    label: 'Datos de Ventas',
    description: 'Sube tu historial de ventas. Solo necesito tres cosas: la fecha, cuánto vendiste (en unidades ó en dólares) y algo para agrupar (vendedor, cliente, producto…).',
    required: true,
    status: 'pending',
  },
  {
    id: 'metas',
    label: 'Metas de Ventas',
    description: 'Opcional. Sube tus metas por vendedor, cliente, producto o categoría. Con metas activas se habilita el semáforo de cumplimiento y proyecciones vs. objetivo.',
    required: false,
    status: 'pending',
  },
  {
    id: 'inventario',
    label: 'Inventario Actual',
    description: 'Opcional. Conecta tu stock actual con tus ventas para detectar riesgos de ruptura antes de que ocurran.',
    required: false,
    status: 'pending',
  },
]

// ── Datos de ejemplo por tipo de archivo ──────────────────────────────────────

const VENTAS_HEADERS = [
  { col: 'fecha',            req: true  },
  { col: 'unidades',         req: false },
  { col: 'venta_neta',       req: false },
  { col: 'vendedor',         req: false },
  { col: 'cliente',          req: false },
  { col: 'producto',         req: false },
  { col: 'categoria',        req: false },
  { col: 'subcategoria',     req: false },
  { col: 'canal',            req: false },
  { col: 'departamento',     req: false },
  { col: 'supervisor',       req: false },
  { col: 'proveedor',        req: false },
  { col: 'codigo_producto',  req: false },
  { col: 'codigo_cliente',   req: false },
  { col: 'costo_unitario',   req: false },
]
const VENTAS_ROWS = [
  ['2026-03-01','24','142.80','ANA MARIA LOPEZ','SUPER SELECTOS S.A.','ACEITE CORONA 1L','ALIMENTOS','ACEITES','RUTEO','CENTRAL','CARLOS HERNANDEZ','SIGMA','ACE-001','CLI-0234','4.25'],
  ['2026-03-01','15','89.25','CARLOS MENDOZA','COMERCIAL NORTE','DETERGENTE ARIEL 2KG','LIMPIEZA','DETERGENTES','MAYOREO','NORTE','MARIA SANTOS','P&G','DET-002','CLI-0891','3.80'],
  ['2026-03-02','8','47.60','ANA MARIA LOPEZ','TIENDA LA UNION','ACEITE CORONA 1L','ALIMENTOS','ACEITES','RUTEO','CENTRAL','CARLOS HERNANDEZ','SIGMA','ACE-001','CLI-0156','4.25'],
  ['2026-03-03','31','198.40','ROBERTO CHAVEZ','SUPER SELECTOS S.A.','SHAMPOO PANTENE 400ML','CUIDADO PERSONAL','SHAMPOO','MODERNO','SUR','PEDRO MOLINA','P&G','SHA-003','CLI-0234','5.20'],
  ['2026-03-04','19','113.05','MARIA GONZALEZ','MERCADO CENTRAL','DETERGENTE ARIEL 2KG','LIMPIEZA','DETERGENTES','RUTEO','CENTRAL','CARLOS HERNANDEZ','P&G','DET-002','CLI-0445','3.80'],
  ['2026-03-05','42','249.90','CARLOS MENDOZA','COMERCIAL NORTE','ACEITE CORONA 1L','ALIMENTOS','ACEITES','MAYOREO','NORTE','MARIA SANTOS','SIGMA','ACE-001','CLI-0891','4.25'],
  ['2026-03-06','7','44.80','ROBERTO CHAVEZ','TIENDA EL SOL','SHAMPOO PANTENE 400ML','CUIDADO PERSONAL','SHAMPOO','RUTEO','SUR','PEDRO MOLINA','P&G','SHA-003','CLI-0778','5.20'],
]

const METAS_HEADERS = [
  { col: 'mes_periodo',  req: true  },
  { col: 'meta',         req: true  },
  { col: 'vendedor',     req: false },
  { col: 'cliente',      req: false },
  { col: 'producto',     req: false },
  { col: 'categoria',    req: false },
  { col: 'subcategoria', req: false },
  { col: 'canal',        req: false },
  { col: 'departamento', req: false },
  { col: 'supervisor',   req: false },
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
  { col: 'producto',         req: true  },
  { col: 'unidades',         req: true  },
  { col: 'categoria',        req: false },
  { col: 'subcategoria',     req: false },
  { col: 'proveedor',        req: false },
  { col: 'codigo_producto',  req: false },
]
const INVENTARIO_ROWS = [
  ['ACEITE CORONA 1L','145','ALIMENTOS','SIGMA'],
  ['DETERGENTE ARIEL 2KG','89','LIMPIEZA','P&G'],
  ['SHAMPOO PANTENE 400ML','234','CUIDADO PERSONAL','P&G'],
  ['JABON PALMOLIVE 3PK','67','CUIDADO PERSONAL','COLGATE'],
  ['ACEITE MAZOLA 900ML','43','ALIMENTOS','CJ'],
  ['SUAVITEL 850ML','156','LIMPIEZA','COLGATE'],
]

// ── Tabla de ejemplo (usada dentro del DataGuide colapsable) ─────────────────
function TablaEjemplo({ headers, rows }: { headers: { col: string; req: boolean }[]; rows: string[][] }) {
  return (
    // [primera-impresion] Fade gradient en el borde derecho indica que la tabla
    // tiene contenido que se corta por overflow horizontal. Antes el scroll era
    // visible solo al hover y los usuarios no se daban cuenta de que faltaban
    // columnas.
    <div className="relative">
      <div className="overflow-x-auto rounded-lg border border-[var(--sf-border-subtle)]">
      <table className="w-full text-[0.72rem] border-collapse">
        <thead>
          <tr>
            {headers.map(({ col, req }) => (
              <th key={col} className="px-2.5 py-1.5 text-left border-b-2 border-[var(--sf-border)] text-[var(--sf-t2)] font-medium whitespace-nowrap" style={{ background: 'var(--sf-inset)' }}>
                {col}
                {req && <span className="ml-1 text-emerald-500 text-[0.625rem] font-bold">*</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={i % 2 === 1 ? { background: 'var(--sf-inset)' } : undefined}>
              {row.map((cell, j) => (
                <td key={j} className="px-2.5 py-1.5 border-b border-[var(--sf-border)] text-[var(--sf-t3)] whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[0.6875rem] text-[var(--sf-t4)] px-2.5 py-1.5 border-t border-[var(--sf-border)]" style={{ background: 'var(--sf-inset)' }}>
        <span className="text-emerald-500">*</span> Requerido — el resto son opcionales y enriquecen el análisis.
      </p>
      </div>
      {/* [primera-impresion-v2] Sombra suave universal: visible sobre cualquier
          fondo (blanco, warm-beige, alternado). El gradient anterior iba a
          var(--sf-card)=blanco, invisible sobre filas blancas. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 bottom-0 w-10 rounded-r-lg"
        style={{ background: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 100%)' }}
      />
    </div>
  )
}

export default function UploadPage() {
  const { setSales, setMetas, setInventory, setIsProcessed, setSelectedPeriod, setDataSource, resetAll, configuracion, setConfiguracion, dataSource, metas: existingMetas, sales: existingSales, inventory: existingInventory, wizardDraft, setWizardDraft, clearWizardDraft } = useAppStore()
  const { org } = useOrgStore()
  const canEdit = useOrgStore(s => s.canEdit())
  const { canUpload } = useUserRole()
  const navigate = useNavigate()

  const [steps, setSteps] = useState<UploadStep[]>(INITIAL_STEPS)
  const [currentStep, setCurrentStep] = useState(0)
  const [processingStep, setProcessingStep] = useState<number | null>(null)
  const [parseProgress, setParseProgress] = useState(0)
  const [parseDetail, setParseDetail] = useState('')
  const [loading, setLoading] = useState<{ title: string; subtitle: string; progress: number } | null>(null)
  const [detectedCols, setDetectedCols] = useState<Record<string, string[]>>({})
  const [discardedRowsMap, setDiscardedRowsMap] = useState<Record<string, DiscardedRow[]>>({})
  const [ignoredColumnsMap, setIgnoredColumnsMap] = useState<Record<string, string[]>>({})
  const [showIgnoredColumns, setShowIgnoredColumns] = useState<Record<string, boolean>>({})
  const [dateAmbiguityMap, setDateAmbiguityMap] = useState<Record<string, { convention: string; evidence: string; ambiguous: boolean }>>({})
  const [warningsMap, setWarningsMap] = useState<Record<string, Array<{ code: string; message: string; field?: string }>>>({})
  // [P4] Mapping detectado por step: { headerOriginal: campoCanónico }
  const [mappingMap, setMappingMap] = useState<Record<string, Record<string, string>>>({})
  const [showMapping, setShowMapping] = useState<Record<string, boolean>>({})
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showMetasConfirm, setShowMetasConfirm] = useState(false)
  // [primera-impresion] Confirmación al limpiar para no descartar trabajo por error.
  // [A1] El modal cubre 2 intents: "Limpiar" (botón corner) y "Reemplazar datos"
  // (banner re-entrada). Copy diferente según intent — el botón "Reemplazar" no
  // debe mostrar "¿Descartar?" porque rompe la promesa.
  const [limpiarIntent, setLimpiarIntent] = useState<'limpiar' | 'reemplazar' | null>(null)
  const showLimpiarConfirm = limpiarIntent !== null
  const setShowLimpiarConfirm = (show: boolean) => setLimpiarIntent(show ? 'limpiar' : null)

  const currentStepStatus = steps[currentStep]?.status
  useEffect(() => {
    setShowDiscarded(false)
  }, [currentStep])

  // [P1 + B1] Hidratar el wizard al montarse. Tres fuentes en orden de prioridad:
  // 1. existingSales (post-análisis): el store tiene datos analizados → reflejar steps
  //    como loaded con parsedData de cada dataset. Esto resuelve P1/Ω.1.0:
  //    el usuario vuelve a /cargar tras dashboard y ve sus datos, no wizard pristine.
  // 2. wizardDraft (mid-wizard, B1): el usuario subió archivos pero no analizó, y
  //    navegó fuera/volvió. El draft in-memory restaura todo (parsedData, mappings,
  //    discardedRows, dateAmbiguity, files, currentStep). Resuelve B1 (P12.A):
  //    antes el archivo se perdía silenciosamente al ir al sidebar pre-análisis.
  // 3. Si no hay nada, mantener INITIAL_STEPS (pristine real).
  useEffect(() => {
    const wizardPristine = steps.every((s) => s.status === 'pending' && !s.file)
    if (!wizardPristine) return

    // Fuente 1: datos analizados en store
    if (existingSales.length > 0) {
      setSteps((prev) => prev.map((s) => {
        if (s.id === 'ventas')                                       return { ...s, status: 'loaded', parsedData: existingSales as any }
        if (s.id === 'metas'      && existingMetas.length > 0)       return { ...s, status: 'loaded', parsedData: existingMetas as any }
        if (s.id === 'inventario' && existingInventory.length > 0)   return { ...s, status: 'loaded', parsedData: existingInventory as any }
        return s
      }))
      return
    }

    // Fuente 2: borrador del wizard (B1)
    if (wizardDraft && (wizardDraft.ventas?.length || wizardDraft.metas?.length || wizardDraft.inventario?.length)) {
      setSteps((prev) => prev.map((s) => {
        const status = wizardDraft.stepStatus?.[s.id] ?? 'pending'
        const file = wizardDraft.files?.[s.id]
        const parsedData =
          s.id === 'ventas'     ? wizardDraft.ventas :
          s.id === 'metas'      ? wizardDraft.metas :
          s.id === 'inventario' ? wizardDraft.inventario :
          undefined
        if (status === 'loaded' && parsedData && parsedData.length > 0) {
          return { ...s, status: 'loaded', parsedData: parsedData as any, file }
        }
        if (status === 'skipped') return { ...s, status: 'skipped' }
        return s
      }))
      if (wizardDraft.detectedCols)   setDetectedCols(wizardDraft.detectedCols)
      if (wizardDraft.ignoredColumns) setIgnoredColumnsMap(wizardDraft.ignoredColumns)
      if (wizardDraft.discardedRows)  setDiscardedRowsMap(wizardDraft.discardedRows as any)
      if (wizardDraft.dateAmbiguity)  setDateAmbiguityMap(wizardDraft.dateAmbiguity as any)
      if (wizardDraft.warnings)       setWarningsMap(wizardDraft.warnings)
      if (wizardDraft.mapping)        setMappingMap(wizardDraft.mapping)
      if (typeof wizardDraft.currentStep === 'number') setCurrentStep(wizardDraft.currentStep)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSales.length, existingMetas.length, existingInventory.length])

  // [B1] Persistir el borrador del wizard en el store cuando hay actividad
  // pre-análisis. Si el usuario navega fuera (sidebar → dashboard → bounce),
  // al volver a /cargar la hidratación lo restaura. Solo guardamos cuando
  // hay algo que valga la pena restaurar (algún step loaded/skipped/error).
  useEffect(() => {
    const algoCargado = steps.some((s) => s.status === 'loaded' || s.status === 'skipped')
    const yaAnalizado = existingSales.length > 0
    if (yaAnalizado) return // no pisar; el store ya es la fuente de verdad

    if (!algoCargado) {
      if (wizardDraft) clearWizardDraft()
      return
    }

    setWizardDraft({
      ventas:      steps[0].status === 'loaded' ? (steps[0].parsedData as any) : undefined,
      metas:       steps[1].status === 'loaded' ? (steps[1].parsedData as any) : undefined,
      inventario:  steps[2].status === 'loaded' ? (steps[2].parsedData as any) : undefined,
      detectedCols,
      ignoredColumns: ignoredColumnsMap,
      discardedRows: discardedRowsMap as any,
      dateAmbiguity: dateAmbiguityMap as any,
      warnings: warningsMap,
      mapping: mappingMap,
      files: Object.fromEntries(steps.filter((s) => s.file).map((s) => [s.id, s.file as File])),
      stepStatus: Object.fromEntries(steps.map((s) => [s.id, s.status])),
      currentStep,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, currentStep, detectedCols, ignoredColumnsMap, discardedRowsMap, dateAmbiguityMap, warningsMap, mappingMap, existingSales.length])

  type StorageFiles = {
    ventas:     { exists: boolean; name: string | null; updated_at: string | null }
    metas:      { exists: boolean; name: string | null; updated_at: string | null }
    inventario: { exists: boolean; name: string | null; updated_at: string | null }
  }
  const [, setStorageFiles] = useState<StorageFiles | null>(null)

  useEffect(() => {
    if (!org?.id) return
    getOrgStorageFiles(org.id).then(setStorageFiles)
  }, [org?.id])

  const updateStep = (idx: number, partial: Partial<UploadStep>) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...partial } : s)))

  // [G3] Límite de tamaño antes del worker. Evita parsear archivos enormes
  // que congelan el browser. 50MB cubre archivos reales con holgura
  // (50k filas Excel ~ 8-10MB).
  const MAX_FILE_BYTES = 50 * 1024 * 1024

  const handleFileSelect = async (idx: number, file: File) => {
    const stepId = steps[idx].id

    // [G3] Validación de tamaño ANTES de invocar al worker
    if (file.size > MAX_FILE_BYTES) {
      const sizeMB = Math.round((file.size / (1024 * 1024)) * 10) / 10
      updateStep(idx, {
        file,
        status: 'error',
        parsedData: undefined,
        parseError: {
          code: 'FILE_TOO_LARGE',
          sizeMB,
          limitMB: 50,
          message: `El archivo pesa ${sizeMB}MB y supera el límite de 50MB. Reducí el rango de fechas, eliminá hojas innecesarias o usá la plantilla.`,
        },
      })
      return
    }

    setProcessingStep(idx)
    setParseProgress(0)
    setParseDetail('Iniciando...')
    updateStep(idx, { file, status: 'pending', parsedData: undefined, parseError: undefined })
    setDetectedCols(prev => { const next = { ...prev }; delete next[stepId]; return next })
    setDiscardedRowsMap(prev => { const next = { ...prev }; delete next[stepId]; return next })
    setIgnoredColumnsMap(prev => { const next = { ...prev }; delete next[stepId]; return next })
    setDateAmbiguityMap(prev => { const next = { ...prev }; delete next[stepId]; return next })
    setWarningsMap(prev => { const next = { ...prev }; delete next[stepId]; return next })
    setMappingMap(prev => { const next = { ...prev }; delete next[stepId]; return next })

    const onProgress = (percent: number, detail: string) => {
      setParseProgress(percent)
      setParseDetail(detail)
    }

    try {
      if (stepId === 'ventas') {
        const r = await parseSalesFileInWorker(file, onProgress)
        if (parseErr(r)) { updateStep(idx, { status: 'error', parseError: r.error }); return }
        setDetectedCols(prev => ({ ...prev, [stepId]: r.columns }))
        if (r.discardedRows?.length) setDiscardedRowsMap(prev => ({ ...prev, [stepId]: r.discardedRows! }))
        if (r.ignoredColumns?.length) setIgnoredColumnsMap(prev => ({ ...prev, [stepId]: r.ignoredColumns! }))
        if (r.dateAmbiguity) setDateAmbiguityMap(prev => ({ ...prev, [stepId]: r.dateAmbiguity! }))
        if (r.warnings?.length) setWarningsMap(prev => ({ ...prev, [stepId]: r.warnings! }))
        if (r.mapping) setMappingMap(prev => ({ ...prev, [stepId]: r.mapping as Record<string, string> }))
        updateStep(idx, { parsedData: r.data, status: 'loaded', parseError: undefined })
      } else if (stepId === 'metas') {
        const r = await parseMetasFileInWorker(file, onProgress)
        if (parseErr(r)) { updateStep(idx, { status: 'error', parseError: r.error }); return }
        setDetectedCols(prev => ({ ...prev, [stepId]: r.columns }))
        if (r.discardedRows?.length) setDiscardedRowsMap(prev => ({ ...prev, [stepId]: r.discardedRows! }))
        if (r.ignoredColumns?.length) setIgnoredColumnsMap(prev => ({ ...prev, [stepId]: r.ignoredColumns! }))
        if (r.mapping) setMappingMap(prev => ({ ...prev, [stepId]: r.mapping as Record<string, string> }))
        updateStep(idx, { parsedData: r.data, status: 'loaded', parseError: undefined })
      } else {
        const r = await parseInventoryFileInWorker(file, onProgress)
        if (parseErr(r)) { updateStep(idx, { status: 'error', parseError: r.error }); return }
        setDetectedCols(prev => ({ ...prev, [stepId]: r.columns }))
        if (r.discardedRows?.length) setDiscardedRowsMap(prev => ({ ...prev, [stepId]: r.discardedRows! }))
        if (r.ignoredColumns?.length) setIgnoredColumnsMap(prev => ({ ...prev, [stepId]: r.ignoredColumns! }))
        if (r.mapping) setMappingMap(prev => ({ ...prev, [stepId]: r.mapping as Record<string, string> }))
        updateStep(idx, { parsedData: r.data, status: 'loaded', parseError: undefined })
      }
      // [GAP-MAPEO-MANUAL] Mapeo manual de columnas no reconocidas: nice-to-have
      // separado. Hoy `ignoredColumns` es read-only.
    } catch (e) {
      updateStep(idx, {
        status: 'error',
        parseError: { code: 'UNKNOWN', message: e instanceof Error ? e.message : 'Error inesperado al leer el archivo.' },
      })
    } finally {
      setProcessingStep(null)
      setParseProgress(0)
      setParseDetail('')
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

  // [Z.P1.10.d/L6 + d.1/M1 + primera-impresion] Limpiar habilitado solo si hay
  // algo VISIBLE en el wizard que limpiar. dataSource queda fuera porque se
  // persiste en localStorage: si una sesión previa cargó demo, dataSource
  // queda 'demo' aunque el wizard se vea pristine al recargar — y entonces
  // el botón quedaría habilitado mintiendo. La acción "Limpiar" se ata a lo
  // que el usuario está viendo, no al estado persistido del store.
  const hasAnythingToClear =
    processingStep !== null ||
    steps.some((s) => s.status === 'loaded' || s.status === 'error' || s.file !== undefined)

  // [Datos insuficientes] Días distintos en ventas. Warning si < 30.
  // No bloquea el avance — el usuario puede entrar al motor con poco
  // historial y ver el resultado, pero advertimos que las series no
  // van a tener tendencia/estacionalidad.
  const ventasInsuficientes = useMemo(() => {
    const data = steps[0].parsedData ?? []
    if (data.length === 0) return null
    const dias = new Set<string>()
    for (const r of data as any[]) {
      const f = r.fecha
      if (!f) continue
      const d = f instanceof Date ? f : new Date(f)
      if (isNaN(d.getTime())) continue
      dias.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
    }
    if (dias.size === 0 || dias.size >= 30) return null
    return { diasDistintos: dias.size }
  }, [steps[0].parsedData])

  // [P3] Cross-validation metas ↔ ventas. Para cada dimensión que la meta
  // declara, verificar que sus valores existan en sales. Warning, no bloqueo.
  const metasOrfanas = useMemo(() => {
    const metasData = steps[1].parsedData as any[] | undefined
    const salesData = steps[0].parsedData as any[] | undefined
    if (!metasData?.length || !salesData?.length) return null

    // Sets desde sales por dimensión
    const setsVentas: Record<string, Set<string>> = {
      vendedor:  new Set(salesData.map((s) => s.vendedor).filter(Boolean)),
      cliente:   new Set(salesData.map((s) => s.cliente).filter(Boolean)),
      producto:  new Set(salesData.map((s) => s.producto).filter(Boolean)),
      categoria: new Set(salesData.map((s) => s.categoria).filter(Boolean)),
    }

    const orfanos: Record<string, Set<string>> = {}
    for (const m of metasData) {
      for (const dim of ['vendedor', 'cliente', 'producto', 'categoria'] as const) {
        const v = m[dim]
        if (!v) continue
        if (!setsVentas[dim].has(v)) {
          if (!orfanos[dim]) orfanos[dim] = new Set()
          orfanos[dim].add(v)
        }
      }
    }
    const dims = Object.keys(orfanos).filter((d) => orfanos[d].size > 0)
    if (dims.length === 0) return null
    return dims.map((dim) => ({
      dimension: dim,
      count: orfanos[dim].size,
      examples: Array.from(orfanos[dim]).slice(0, 3),
    }))
  }, [steps[0].parsedData, steps[1].parsedData])

  // [P3] Cross-validation inventario ↔ ventas (productos/SKU).
  const inventarioOrfano = useMemo(() => {
    const invData = steps[2].parsedData as any[] | undefined
    const salesData = steps[0].parsedData as any[] | undefined
    if (!invData?.length || !salesData?.length) return null

    const productosVentas = new Set(salesData.map((s) => s.producto).filter(Boolean))
    const codigosVentas   = new Set(salesData.map((s) => s.codigo_producto).filter(Boolean))

    const productosOrfanos = new Set<string>()
    const codigosOrfanos   = new Set<string>()
    for (const it of invData) {
      if (it.producto && !productosVentas.has(it.producto)) productosOrfanos.add(it.producto)
      if (it.codigo_producto && !codigosVentas.has(it.codigo_producto)) codigosOrfanos.add(it.codigo_producto)
    }
    const result: Array<{ dimension: string; count: number; examples: string[] }> = []
    if (productosOrfanos.size > 0) result.push({ dimension: 'producto', count: productosOrfanos.size, examples: Array.from(productosOrfanos).slice(0, 3) })
    if (codigosOrfanos.size > 0)   result.push({ dimension: 'codigo_producto', count: codigosOrfanos.size, examples: Array.from(codigosOrfanos).slice(0, 3) })
    return result.length > 0 ? result : null
  }, [steps[0].parsedData, steps[2].parsedData])

  // Build detected items for the success screen
  const detectedItems = useMemo(() => {
    const salesData = steps[0].parsedData ?? []
    if (salesData.length === 0) return []
    const items: { icon: string; label: string }[] = []

    const vendedores = new Set(salesData.map((s: any) => s.vendedor).filter(Boolean))
    if (vendedores.size > 0) items.push({ icon: '\u{1F465}', label: `${vendedores.size} vendedores` })

    const cols = detectedCols['ventas'] ?? []
    if (cols.includes('departamento')) {
      const deptos = new Set(salesData.map((s: any) => s.departamento).filter(Boolean))
      if (deptos.size > 0) items.push({ icon: '\u{1F3E2}', label: `${deptos.size} departamentos` })
    }
    if (cols.includes('producto')) {
      const productos = new Set(salesData.map((s: any) => s.producto).filter(Boolean))
      if (productos.size > 0) items.push({ icon: '\u{1F4E6}', label: `${productos.size} productos` })
    }
    if (cols.includes('cliente')) {
      const clientes = new Set(salesData.map((s: any) => s.cliente).filter(Boolean))
      if (clientes.size > 0) items.push({ icon: '\u{1F3EA}', label: `${clientes.size} clientes` })
    }
    if (cols.includes('canal')) {
      const canales = new Set(salesData.map((s: any) => s.canal).filter(Boolean))
      if (canales.size > 0) items.push({ icon: '\u{1F4CA}', label: `${canales.size} canales` })
    }
    if (steps[1].status === 'loaded') items.push({ icon: '\u{1F3AF}', label: 'Metas cargadas' })
    if (steps[2].status === 'loaded') items.push({ icon: '\u{1F4E5}', label: 'Inventario cargado' })

    return items
  }, [steps, detectedCols])

  const doAnalyze = async () => {
    const salesData = steps[0].parsedData ?? []
    const metasData = steps[1].parsedData ?? []
    const inventoryData = steps[2].parsedData ?? []

    setLoading({
      title: 'Subiendo archivo...',
      subtitle: `Procesando ${salesData.length.toLocaleString()} ${salesData.length === 1 ? 'registro' : 'registros'} de ventas`,
      progress: 30,
    })

    await new Promise(resolve => setTimeout(resolve, 50))

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
    setDataSource('real')

    // Persistir en IndexedDB para sobrevivir refreshes
    saveDatasets(salesData, metasData, inventoryData).catch(() => {})

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

    setLoading({ title: 'Analizando tus datos...', subtitle: 'Detectando vendedores, productos, patrones', progress: 90 })
    await new Promise(resolve => setTimeout(resolve, 400))
    setLoading(null)

    // [B1] Datos ya en store; descartar el borrador para no duplicar memoria.
    clearWizardDraft()

    // Show success screen instead of navigating immediately
    setShowSuccess(true)
  }

  const handleAnalyze = () => {
    const metasData = steps[1].parsedData ?? []
    if (metasData.length > 0 && existingMetas.length > 0) {
      setShowMetasConfirm(true)
      return
    }
    doAnalyze()
  }

  const handleLoadDemo = () => {
    setLoading({ title: 'Cargando demo...', subtitle: 'Generando datos de Los Pinos S.A.', progress: 30 })
    setTimeout(() => {
      const { sales, metas, inventory } = getDemoData()
      setSales(sales)
      setMetas(metas)
      setInventory(inventory)
      setConfiguracion({ empresa: DEMO_EMPRESA })
      setDataSource('demo')
      setLoading({ title: '\u00A1Listo!', subtitle: 'Tu monitor comercial está activo', progress: 100 })
      // [G5] Marcar los 3 pasos como cargados para que la pantalla de éxito
      // refleje el estado real (vendedores, productos, clientes, metas, inventario)
      // y el stepper se vea coherente al volver al wizard.
      setSteps((prev) => prev.map((s) => {
        if (s.id === 'ventas')     return { ...s, status: 'loaded', parsedData: sales as any }
        if (s.id === 'metas')      return { ...s, status: 'loaded', parsedData: metas as any }
        if (s.id === 'inventario') return { ...s, status: 'loaded', parsedData: inventory as any }
        return s
      }))
      // Hidratar detectedCols mínimas para que la success screen compute items
      setDetectedCols({
        ventas: ['vendedor', 'cliente', 'producto', 'categoria', 'canal', 'departamento'],
        metas: ['vendedor'],
        inventario: ['producto'],
      })
      setTimeout(() => {
        setLoading(null)
        // [G5] No auto-redirige. La pantalla de éxito muestra resumen + CTA
        // explícito "Ir a Estado Comercial". Antes hacía navigate automático
        // tras 400ms, lo que rompía "no redirigir sin confirmar" y era
        // inconsistente con el flujo de archivo real.
        setShowSuccess(true)
      }, 400)
    }, 600)
  }

  const handleLimpiar = async () => {
    resetAll() // ya limpia wizardDraft
    clearDatasets().catch(() => {})
    setSteps(INITIAL_STEPS)
    setCurrentStep(0)
    setStorageFiles(null)
    setDetectedCols({})
    setDiscardedRowsMap({})
    setIgnoredColumnsMap({})
    setShowIgnoredColumns({})
    setDateAmbiguityMap({})
    setWarningsMap({})
    setMappingMap({})
    setShowMapping({})
    setShowSuccess(false)
    if (org?.id) {
      await deleteOrgFiles(org.id)
    }
  }

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['fecha', 'vendedor', 'unidades', 'cliente', 'producto', 'venta_neta', 'canal', 'categoria', 'departamento', 'supervisor'],
        ['2025-01-15', 'María Castillo',   120, 'Supermercado López',      'Agua Pura 500ml',       180.00, 'Mayoreo',         'Refrescos',        'San Salvador',  'Patricia Ruiz'],
        ['2025-01-15', 'María Castillo',    85, 'Tienda La Esperanza',     'Detergente 1kg',        255.00, 'Mostrador',       'Limpieza',         'La Libertad',   'Patricia Ruiz'],
        ['2025-01-16', 'Carlos Ramírez',   200, 'Abarrotería El Sol',      'Aceite 750ml',          500.00, 'Mayoreo',         'Abarrotes',        'Sonsonate',     'Roberto Méndez'],
        ['2025-01-16', 'Carlos Ramírez',    45, 'Mini Super Doña Ana',     'Jabón Protex 3pk',      135.00, 'Visita directa',  'Higiene',          'Sonsonate',     'Roberto Méndez'],
        ['2025-01-17', 'Laura Hernández',  150, 'Despensa Familiar',       'Arroz 2kg',             225.00, 'Mayoreo',         'Abarrotes',        'Santa Ana',     'Patricia Ruiz'],
        ['2025-01-17', 'Laura Hernández',   60, 'Tienda Don Pedro',        'Agua Pura 500ml',        90.00, 'Mostrador',       'Refrescos',        'Santa Ana',     'Patricia Ruiz'],
        ['2025-01-18', 'Jorge Martínez',    90, 'Supermercado López',      'Detergente 1kg',        270.00, 'Mayoreo',         'Limpieza',         'San Salvador',  'Roberto Méndez'],
        ['2025-01-18', 'Jorge Martínez',    35, 'Farmacia San Martín',     'Shampoo Familiar 1L',   175.00, 'Visita directa',  'Higiene',          'San Miguel',    'Roberto Méndez'],
        ['2025-01-19', 'Ana Morales',       75, 'Tiendas Económicas',      'Aceite 750ml',          187.50, 'Teléfono',        'Abarrotes',        'La Libertad',   'Patricia Ruiz'],
        ['2025-01-19', 'Ana Morales',      110, 'Despensa Familiar',       'Arroz 2kg',             165.00, 'Mayoreo',         'Abarrotes',        'Santa Ana',     'Patricia Ruiz'],
        ['2025-01-20', 'María Castillo',    95, 'Comercial Central',   'Jabón Protex 3pk',      285.00, 'Mayoreo',         'Higiene',          'San Salvador',  'Patricia Ruiz'],
        ['2025-01-20', 'Carlos Ramírez',    55, 'Tienda La Esperanza',     'Shampoo Familiar 1L',   275.00, 'Mostrador',       'Higiene',          'La Libertad',   'Roberto Méndez'],
        ['2025-01-21', 'Laura Hernández',  180, 'Abarrotería El Sol',      'Agua Pura 500ml',       270.00, 'Mayoreo',         'Refrescos',        'Sonsonate',     'Patricia Ruiz'],
        ['2025-01-21', 'Jorge Martínez',    40, 'Mini Super Doña Ana',     'Arroz 2kg',              60.00, 'Visita directa',  'Abarrotes',        'Sonsonate',     'Roberto Méndez'],
        ['2025-01-22', 'Ana Morales',       65, 'Farmacia San Martín',     'Detergente 1kg',        195.00, 'Visita directa',  'Limpieza',         'San Miguel',    'Patricia Ruiz'],
      ]),
      'Ventas'
    )

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['mes_periodo', 'vendedor', 'meta', 'canal'],
        ['2025-01', 'María Castillo',   800, 'Mayoreo'],
        ['2025-01', 'Carlos Ramírez',  1200, 'Mayoreo'],
        ['2025-01', 'Laura Hernández',  950, 'Mayoreo'],
        ['2025-01', 'Jorge Martínez',   750, 'Mayoreo'],
        ['2025-01', 'Ana Morales',      700, 'Teléfono'],
      ]),
      'Metas'
    )

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['producto', 'unidades', 'categoria', 'proveedor'],
        ['Agua Pura 500ml',       320, 'Refrescos',  'La Constancia'],
        ['Detergente 1kg',        145, 'Limpieza',   'Henkel'],
        ['Aceite 750ml',          210, 'Abarrotes',  'Unilever'],
        ['Arroz 2kg',             180, 'Abarrotes',  'Arrocera San Francisco'],
        ['Jabón Protex 3pk',       95, 'Higiene',    'Colgate-Palmolive'],
        ['Shampoo Familiar 1L',   120, 'Higiene',    'P&G'],
      ]),
      'Inventario'
    )

    XLSX.writeFile(wb, 'plantilla-salesflow.xlsx')
  }

  // Guard: solo owner/editor pueden subir archivos (solo aplica si hay org activa)
  if (org && !canEdit) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 space-y-4">
        <ShieldOff className="w-10 h-10 text-[var(--sf-t4)]" />
        <h2 className="text-lg font-bold text-[var(--sf-t1)]">Necesitas permisos de editor</h2>
        <p className="text-sm text-[var(--sf-t3)] text-center max-w-sm">
          Tu administrador puede darte acceso desde Configuración → Equipo.
        </p>
      </div>
    )
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (showSuccess) {
    const totalRegistros = steps[0].parsedData?.length ?? 0
    return (
      <div className="max-w-3xl mx-auto pb-20 animate-in fade-in duration-700">
        <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div className="text-center py-16">
          {/* Check icon */}
          <div
            className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-emerald-500 flex items-center justify-center text-white"
            style={{ animation: 'fadeInUp 0.3s ease forwards' }}
          >
            <Check className="w-8 h-8" strokeWidth={3} />
          </div>

          {/* Headline */}
          <h2
            className="text-xl font-semibold text-[var(--sf-t1)] mb-1 opacity-0"
            style={{ animation: 'fadeInUp 0.3s ease 0.1s forwards' }}
          >
            {totalRegistros.toLocaleString()} {totalRegistros === 1 ? 'registro cargado' : 'registros cargados'}
          </h2>
          <p
            className="text-sm text-[var(--sf-t3)] mb-8 opacity-0"
            style={{ animation: 'fadeInUp 0.3s ease 0.2s forwards' }}
          >
            Tu monitor comercial está activo
          </p>

          {/* Detected items */}
          <div className="flex flex-wrap gap-2 justify-center mb-10">
            {detectedItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--sf-border)] text-sm font-medium text-[var(--sf-t1)] opacity-0"
                style={{
                  background: 'var(--sf-elevated)',
                  animation: `fadeInUp 0.3s ease ${0.3 + i * 0.08}s forwards`,
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div
            className="flex gap-3 justify-center opacity-0"
            style={{ animation: 'fadeInUp 0.3s ease 0.8s forwards' }}
          >
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors"
            >
              Ir a Estado Comercial →
            </button>
            {steps[1].status !== 'loaded' && (
              <button
                onClick={() => { setShowSuccess(false); setCurrentStep(1) }}
                className="px-6 py-3 rounded-xl border border-[var(--sf-border)] text-[var(--sf-t2)] text-sm font-medium hover:bg-[var(--sf-hover)] transition-colors"
              >
                Subir metas (opcional)
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1
  const wizardStatusCopy =
    processingStep === currentStep ? 'Leyendo archivo y validando columnas.'
    : step.status === 'loaded' ? 'Listo para continuar.'
    : step.status === 'error' ? 'Revisa el mensaje y prueba con otro archivo.'
    : step.status === 'skipped' ? 'Paso omitido.'
    : step.required ? 'Sube un archivo o carga el demo para continuar.'
    : 'Puedes subir este archivo u omitir el paso.'

  // Viewer restriction: show message if user is viewer in an org
  if (org && !canUpload) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 animate-in fade-in duration-500">
        <Lock className="w-10 h-10" style={{ color: 'var(--sf-t5)' }} />
        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: 'var(--sf-t1)' }}>No tienes permisos para subir archivos</p>
          <p className="text-sm mt-1" style={{ color: 'var(--sf-t4)' }}>
            Tu rol actual es <strong>Visor</strong>. Contacta al propietario de la organización para cambiar tu rol.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 pb-20 animate-in fade-in duration-700">
      <LoadingOverlay
        isVisible={loading !== null}
        title={loading?.title ?? ''}
        subtitle={loading?.subtitle ?? ''}
        progress={loading?.progress}
      />

      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:items-start">
        <aside className="hidden lg:block sticky top-16 py-6">
          <div className="flex min-h-[33rem] flex-col rounded-2xl border border-[var(--sf-border)] bg-[var(--sf-card)] px-4 py-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-t4)]">Carga guiada</p>
            <StepIndicator
              steps={steps}
              currentStepIndex={currentStep}
              onStepClick={(idx) => setCurrentStep(idx)}
              orientation="vertical"
              className="mt-5 flex-1 justify-between"
            />
          </div>
        </aside>

        <main className="min-w-0 max-w-4xl space-y-8 lg:py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-[var(--sf-t1)] tracking-tight">Cargar Datos</h1>
          <p className="text-base text-[var(--sf-t3)] mt-1">
            Te mostramos qué vendedor creció, qué cliente se enfrió y qué producto hay que atender — en 2 minutos.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { if (hasAnythingToClear) setShowLimpiarConfirm(true) }}
            disabled={!hasAnythingToClear}
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium transition-colors',
              hasAnythingToClear
                ? 'text-[var(--sf-t4)] hover:text-red-500 cursor-pointer'
                : 'text-[var(--sf-t5,#94a3b8)] opacity-50 cursor-not-allowed'
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar
          </button>
        </div>
      </div>

      {/* [P1 — fix Ω.1.0] Banner de re-entrada: el usuario volvió a /cargar
          y ya tiene datos en store. Le damos acción explícita para ir al
          dashboard o reemplazar. Sin esto, Ω.1.0 reseteaba silenciosamente
          y atrapaba al usuario. */}
      {existingSales.length > 0 && currentStep === 0 && step.status === 'loaded' && !processingStep && (
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-300/50 bg-emerald-50/50 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white border border-emerald-300/50 flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--sf-t1)]">Ya tenés datos cargados</p>
              <p className="text-xs text-[var(--sf-t3)] mt-0.5">
                {existingSales.length.toLocaleString()} {existingSales.length === 1 ? 'venta' : 'ventas'}
                {existingMetas.length > 0 ? ' · metas' : ''}
                {existingInventory.length > 0 ? ' · inventario' : ''}
                {dataSource === 'demo' ? ' (demo)' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLimpiarIntent('reemplazar')}
              className="rounded-lg border border-[var(--sf-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--sf-t2)] hover:bg-[var(--sf-hover)] transition-colors"
            >
              Reemplazar datos
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              Ir a Estado Comercial →
            </button>
          </div>
        </section>
      )}

      {/* [Ω.1.4] Banner demo: solo en estado verdaderamente pristine.
          Antes mostraba con dataSource !== 'demo', lo que lo dejaba visible
          después de cargar un archivo real — ruido. */}
      {step.id === 'ventas' && dataSource === 'none' && step.status === 'pending' && !step.file && (
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--sf-green-border)] bg-[var(--sf-green-bg)] px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/70 border border-[var(--sf-green-border)] flex items-center justify-center shrink-0">
              <span className="text-[var(--sf-green)] text-sm">✣</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--sf-t1)]">¿Primera vez? Probá con datos demo</p>
              <p className="text-xs text-[var(--sf-t3)] mt-0.5">50,012 registros · 3 vendedores · 6 meses de historial</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLoadDemo}
            className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            Cargar demo
          </button>
        </section>
      )}

      <div className="flex justify-center overflow-x-auto pb-1 lg:hidden">
        <StepIndicator
          steps={steps}
          currentStepIndex={currentStep}
          onStepClick={(idx) => setCurrentStep(idx)}
        />
      </div>

      <div className="space-y-5">
        <section className="rounded-2xl border border-[var(--sf-border)] bg-[var(--sf-card)] p-6 space-y-4">
          {/* [G2] Resumen compacto de requisitos visible ANTES de subir.
              Solo en estado vacío (pending sin archivo) y solo en ventas:
              metas/inventario tienen requisitos distintos y la sección
              detallada de abajo ya cubre el caso. */}
          {step.id === 'ventas' && step.status === 'pending' && !step.file && processingStep === null && (
            <div className="rounded-lg bg-[var(--sf-inset)] border border-[var(--sf-border-subtle)] px-3.5 py-2.5">
              <p className="text-xs leading-relaxed text-[var(--sf-t3)]">
                <span className="font-semibold text-[var(--sf-t2)]">Requerido:</span> fecha + unidades o venta neta.{' '}
                <span className="font-semibold text-[var(--sf-t2)]">Opcional:</span> vendedor, cliente, producto, categoría, canal.
              </p>
            </div>
          )}
          <FileDropzone
            step={step}
            onFileSelect={(file) => handleFileSelect(currentStep, file)}
            onSkip={!step.required ? () => handleSkip(currentStep) : undefined}
            isProcessing={processingStep === currentStep}
            progressPercent={processingStep === currentStep ? parseProgress : 0}
            progressDetail={processingStep === currentStep ? parseDetail : ''}
            // [G1] Plantilla cerca del dropzone. onLoadDemo NO se pasa porque
            // el banner superior ya cubre demo de forma prominente — duplicar
            // sería ruido. La sección detallada de abajo conserva su botón
            // "Descargar plantilla" como referencia.
            onDownloadTemplate={step.id === 'ventas' ? downloadTemplate : undefined}
          />
        </section>

        <section className="rounded-2xl border border-[var(--sf-border)] bg-[var(--sf-card)] p-6">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sf-t4)]">Paso {currentStep + 1} de {steps.length}</span>
          </div>
          <div className="mt-1">
            <h2 className="text-xl font-semibold text-[var(--sf-t1)]">{step.label}</h2>
            {!step.required && (
              <span
                className="ml-2 align-middle px-1.5 py-0.5 rounded text-[9px] font-bold text-[var(--sf-t4)] uppercase tracking-wide cursor-help"
                style={{ background: 'var(--sf-inset)' }}
                title={
                  step.id === 'metas'
                    ? 'Sin metas no podemos evaluar cumplimiento ni proyectar resultados contra objetivo.'
                    : step.id === 'inventario'
                    ? 'Sin inventario no detectamos riesgos de ruptura ni exceso de stock.'
                    : 'Este paso es opcional.'
                }
              >opcional</span>
            )}
          </div>
          <p className="text-sm text-[var(--sf-t4)] mt-1">{step.description}</p>

          {/* [Ω.1.3] Aviso de mapeo automático: solo relevante antes de cargar.
              Una vez status='loaded' o 'error' el archivo ya pasó por el mapeo
              y la nota es ruido. */}
          {step.status !== 'loaded' && step.status !== 'error' && (
            <div className="mt-5 rounded-xl border border-amber-300/70 bg-amber-50/70 px-3.5 py-3">
              <p className="text-xs leading-relaxed text-amber-800">
                <span className="font-semibold">Mapeamos tus columnas automáticamente.</span>{' '}
                No importa cómo se llamen: buscamos fecha, métricas de venta y dimensiones para agrupar.
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-5">
            {(step.id === 'ventas' ? [
              {
                number: 1,
                tone: 'amber',
                title: 'Fecha',
                tag: 'Requerido',
                copy: 'Cuándo ocurrió la venta. Aceptamos nombres comunes en español e inglés.',
                chips: ['fecha'],
              },
              {
                number: 2,
                tone: 'sky',
                title: 'Cantidad vendida',
                tag: 'Al menos uno',
                copy: 'Pueden ser unidades, dinero, o ambos. Mejor si es ambos.',
                chips: ['# unidades', '$ venta_neta'],
              },
              {
                number: 3,
                tone: 'neutral',
                title: 'Dimensiones',
                tag: 'Mejoran el análisis',
                copy: 'Cada columna extra activa un análisis más profundo.',
                chips: [
                  'vendedor',
                  'cliente',
                  'producto',
                  'categoria',
                  'subcategoria',
                  'canal',
                  'departamento',
                  'supervisor',
                  'proveedor',
                  'codigo_producto',
                  'codigo_cliente',
                  'costo_unitario',
                ],
              },
            ] : step.id === 'metas' ? [
              {
                number: 1,
                tone: 'amber',
                title: 'Período',
                tag: 'Requerido',
                copy: 'El mes o período al que pertenece la meta.',
                chips: ['mes_periodo'],
              },
              {
                number: 2,
                tone: 'amber',
                title: 'Meta',
                tag: 'Requerido',
                copy: 'El objetivo que querés comparar contra ventas reales.',
                chips: ['meta'],
              },
              {
                number: 3,
                tone: 'neutral',
                title: 'Dimensiones',
                tag: 'Al menos una',
                copy: 'Define si la meta aplica a vendedor, cliente, producto o categoría.',
                chips: ['vendedor', 'cliente', 'producto', 'categoria', 'subcategoria', 'canal', 'departamento', 'supervisor'],
              },
            ] : [
              {
                number: 1,
                tone: 'amber',
                title: 'Producto',
                tag: 'Requerido',
                copy: 'El producto o código que conecta inventario con ventas.',
                chips: ['producto'],
              },
              {
                number: 2,
                tone: 'amber',
                title: 'Unidades en stock',
                tag: 'Requerido',
                copy: 'Cantidad disponible para estimar riesgo de ruptura.',
                chips: ['unidades'],
              },
              {
                number: 3,
                tone: 'neutral',
                title: 'Clasificación',
                tag: 'Opcional',
                copy: 'Categoría, proveedor o código ayudan a segmentar el riesgo.',
                chips: ['categoria', 'subcategoria', 'proveedor', 'codigo_producto'],
              },
            ]).map((item, index, arr) => (
              <div key={item.title} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-4">
                {index < arr.length - 1 && (
                  <div className="absolute left-4 top-9 bottom-[-1.25rem] w-px bg-[var(--sf-border-subtle)]" />
                )}
                <div className={cn(
                  'relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-[var(--sf-card)] border',
                  item.tone === 'amber' ? 'border-amber-400 text-amber-600'
                    : item.tone === 'sky' ? 'border-sky-400 text-sky-700'
                    : 'border-emerald-500 text-emerald-700'
                )}>
                  {item.number}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <h3 className="text-sm font-semibold uppercase text-[var(--sf-t1)]">{item.title}</h3>
                    <span className={cn(
                      'text-[11px] font-semibold uppercase',
                      item.tone === 'amber' ? 'text-amber-600'
                        : item.tone === 'sky' ? 'text-sky-700'
                        : 'text-[var(--sf-t4)]'
                    )}>· {item.tag}</span>
                  </div>
                  <p className="text-xs text-[var(--sf-t4)] mt-1">{item.copy}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.chips.map((chip) => (
                      <span
                        key={chip}
                        className={cn(
                          'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-mono',
                          item.tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : item.tone === 'sky' ? 'border-sky-200 bg-sky-50 text-sky-700'
                            : 'border-slate-200 bg-slate-100 text-slate-700'
                        )}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--sf-border)] bg-[var(--sf-card)] p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sf-t4)]">Ejemplo de formato</p>
              <p className="text-xs text-[var(--sf-t4)] mt-0.5">Los encabezados pueden estar en cualquier idioma.</p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="shrink-0 rounded-lg border border-[var(--sf-border)] px-3 py-2 text-xs font-semibold text-[var(--sf-t2)] hover:bg-[var(--sf-hover)] transition-colors"
            >
              Descargar plantilla
            </button>
          </div>
          <TablaEjemplo
            headers={step.id === 'ventas' ? VENTAS_HEADERS : step.id === 'metas' ? METAS_HEADERS : INVENTARIO_HEADERS}
            rows={step.id === 'ventas' ? VENTAS_ROWS : step.id === 'metas' ? METAS_ROWS : INVENTARIO_ROWS}
          />
        </section>

        {/* Filas descartadas (post-upload) */}
        {step.status === 'loaded' && discardedRowsMap[step.id]?.length > 0 && (() => {
          const discarded = discardedRowsMap[step.id]
          return (
            <div className="rounded-lg border border-amber-400/30 bg-amber-50/50">
              <button
                onClick={() => setShowDiscarded(prev => !prev)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-amber-600">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Se omitieron {discarded.length} {discarded.length === 1 ? 'fila' : 'filas'} — ver detalle
                </span>
                <span className="text-xs text-amber-500/60">{showDiscarded ? '\u25B2 Ocultar' : '\u25BC Ver'}</span>
              </button>
              {showDiscarded && (
                <div className="px-3.5 pb-3 space-y-1.5 border-t border-amber-400/20 pt-2.5">
                  {discarded.map((row) => (
                    <div key={row.rowNumber} className="flex gap-2.5 text-xs">
                      <span className="shrink-0 text-amber-500/60 font-mono w-12 text-right">fila {row.rowNumber}</span>
                      <span className="text-[var(--sf-t3)] leading-snug">{row.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* Warnings del parser (ej: COSTO_SIN_PRODUCTO) */}
        {step.status === 'loaded' && warningsMap[step.id]?.length > 0 && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-50/60 px-3.5 py-2.5 space-y-1.5">
            {warningsMap[step.id].map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{w.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Columnas no reconocidas (informativo) */}
        {step.status === 'loaded' && ignoredColumnsMap[step.id]?.length > 0 && (
          <div className="rounded-lg border border-blue-400/30 bg-blue-50/50">
            <button
              onClick={() => setShowIgnoredColumns(prev => ({ ...prev, [step.id]: !prev[step.id] }))}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-blue-600">
                <Info className="w-4 h-4 shrink-0" />
                Se detectaron {ignoredColumnsMap[step.id].length} {ignoredColumnsMap[step.id].length === 1 ? 'columna' : 'columnas'} no reconocidas — ver detalle
              </span>
              <span className="text-xs text-blue-500/60">
                {showIgnoredColumns[step.id] ? '\u25B2 Ocultar' : '\u25BC Ver'}
              </span>
            </button>
            {showIgnoredColumns[step.id] && (
              <div className="px-3.5 pb-3 border-t border-blue-400/20 pt-2.5">
                <p className="text-xs text-[var(--sf-t3)] mb-2">
                  Estas columnas se detectaron en el archivo pero no corresponden a ningún campo reconocido. Se conservarán como metadato pero no participarán en el análisis actual.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ignoredColumnsMap[step.id].map((col) => (
                    <span key={col} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono bg-blue-100/60 text-blue-700 border border-blue-300/40">
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* [P2] Convención de fecha asumida.
            Diferenciamos dos casos:
            - ambiguous=true: el parser no tuvo evidencia (todos los pares ≤12 o >12). Tono ámbar.
            - ambiguous=false: hay evidencia (algún componente >12) pero igual avisamos para que el
              usuario verifique. Tono azul informativo.
            Antes solo se mostraba en el caso ambiguous=true → caso E4 (12/13/2026 → MDY) pasaba
            sin warning. */}
        {step.status === 'loaded' && dateAmbiguityMap[step.id] && (() => {
          const da = dateAmbiguityMap[step.id]
          const formatLabel = da.convention === 'dmy' ? 'DD/MM/YYYY' : da.convention === 'mdy' ? 'MM/DD/YYYY' : da.convention.toUpperCase()
          const tone = da.ambiguous ? 'amber' : 'blue'
          const headline = da.ambiguous
            ? `Formato de fecha ambiguo — asumimos ${formatLabel}`
            : `Detectamos formato ${formatLabel} — confirmá que es correcto`
          return (
            <div className={cn(
              'rounded-lg border px-3.5 py-2.5',
              tone === 'amber' ? 'border-amber-400/40 bg-amber-50/60' : 'border-blue-400/30 bg-blue-50/50'
            )}>
              <span className={cn(
                'flex items-center gap-2 text-sm font-medium',
                tone === 'amber' ? 'text-amber-700' : 'text-blue-600'
              )}>
                <Info className="w-4 h-4 shrink-0" />
                {headline}
              </span>
              <p className="text-xs text-[var(--sf-t3)] mt-1.5">
                {da.evidence}. Si es incorrecto, convierte las fechas a formato YYYY-MM-DD en el archivo.
              </p>
            </div>
          )
        })()}

        {/* Error detallado */}
        {step.status === 'error' && step.parseError && (
          <div className="rounded-lg border border-red-300/50 bg-red-50/50 p-3.5">
            <div className="flex items-start gap-2.5">
              {step.parseError.code === 'INVALID_DATES' ? (
                <span className="text-base shrink-0 leading-none mt-0.5">{'\u{1F4C5}'}</span>
              ) : step.parseError.code === 'FILE_PROTECTED_OR_CORRUPT' ? (
                <span className="text-base shrink-0 leading-none mt-0.5">{'\u{1F512}'}</span>
              ) : step.parseError.code === 'ENCODING_ISSUE' ? (
                <span className="text-base shrink-0 leading-none mt-0.5">{'\u{1F524}'}</span>
              ) : step.parseError.code === 'FILE_TOO_LARGE' ? (
                <span className="text-base shrink-0 leading-none mt-0.5">{'\u{1F4E6}'}</span>
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 min-w-0 flex-1">
                <p className="text-sm font-medium text-red-600">
                  {step.parseError.code === 'MULTIPLE_SHEETS'         ? 'Múltiples pestañas detectadas'
                  : step.parseError.code === 'NO_VALID_COLUMNS'       ? 'No se reconocieron las columnas'
                  : step.parseError.code === 'MISSING_REQUIRED'       ? 'Faltan columnas obligatorias'
                  : step.parseError.code === 'FORMAT_NOT_SUPPORTED'   ? 'Formato de archivo no compatible'
                  : step.parseError.code === 'EMPTY_FILE'             ? 'El archivo no tiene datos procesables'
                  : step.parseError.code === 'INVALID_DATES'          ? 'Formato de fecha no reconocido'
                  : step.parseError.code === 'FILE_PROTECTED_OR_CORRUPT' ? 'Archivo protegido o corrupto'
                  : step.parseError.code === 'ENCODING_ISSUE'         ? 'Problema de codificación de texto'
                  : step.parseError.code === 'FILE_TOO_LARGE'         ? `Archivo muy pesado (${step.parseError.sizeMB}MB > ${step.parseError.limitMB}MB)`
                  :                                                     'Error al leer el archivo'}
                </p>
                <p className="text-xs text-[var(--sf-t3)] leading-relaxed">{step.parseError.message}</p>
                {step.parseError.code === 'MULTIPLE_SHEETS' && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {step.parseError.sheets.map(s => (
                      <span key={s} className="text-xs px-2 py-0.5 rounded-full text-[var(--sf-t2)]" style={{ background: 'var(--sf-inset)' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                {step.parseError.code === 'MISSING_REQUIRED' && (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap gap-1.5">
                      {step.parseError.missing.map(c => (
                        <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                          {'\u2717'} {c}
                        </span>
                      ))}
                    </div>
                    {/* [P5] Sugerencias accionables: nombres aceptados por can\u00f3nico */}
                    {step.parseError.suggestions && step.parseError.suggestions.length > 0 && (
                      <div className="pt-2 space-y-1.5">
                        {step.parseError.suggestions.map((s) => (
                          <div key={s.missingKey} className="text-xs text-[var(--sf-t3)]">
                            <span className="font-medium text-[var(--sf-t2)]">Para <code className="px-1 py-0.5 rounded bg-red-100/60 text-red-700">{s.missingKey}</code> aceptamos:</span>{' '}
                            <span className="font-mono text-[var(--sf-t3)]">{s.acceptedAliases.slice(0, 6).join(', ')}{s.acceptedAliases.length > 6 ? '\u2026' : ''}</span>
                            {s.candidateHeaders.length > 0 && (
                              <div className="mt-0.5 text-[0.6875rem] text-[var(--sf-t4)]">
                                Detectamos en tu archivo:{' '}
                                {s.candidateHeaders.map((h, i) => (
                                  <span key={h}>
                                    {i > 0 && ', '}
                                    <code className="px-1 py-0.5 rounded bg-amber-100/40 text-amber-700">{h}</code>
                                  </span>
                                ))}
                                . Ren\u00f3mbralas o ajusta el archivo.
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {step.parseError.code === 'INVALID_DATES' && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[0.6875rem] text-[var(--sf-t4)]">Fechas encontradas en el archivo:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {step.parseError.sample.map((s, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {step.parseError.code === 'ENCODING_ISSUE' && step.parseError.sample.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[0.6875rem] text-[var(--sf-t4)]">Columnas con caracteres incorrectos:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {step.parseError.sample.map((s, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 font-medium">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Banner CTA — ventas cargado */}
        {/* [primera-impresion] Banner único de éxito post-upload.
            Reemplaza la triple confirmación previa: ahora archivo + filas + columnas
            viven en un solo bloque, no en 3 lugares distintos de la pantalla. */}
        {step.id === 'ventas' && step.status === 'loaded' && step.parsedData && (
          <div className="flex items-start gap-3 px-4 py-3.5 rounded-lg bg-[var(--sf-green-bg)] border border-[var(--sf-green-border)]">
            <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-600">
                Archivo listo — {step.parsedData.length.toLocaleString()} {step.parsedData.length === 1 ? 'registro cargado' : 'registros cargados'}
                {detectedCols[step.id] && (
                  <span className="font-normal text-[var(--sf-t3)]"> · {detectedCols[step.id].length} columnas detectadas</span>
                )}
              </p>
              <p className="text-xs text-[var(--sf-t3)] mt-0.5">
                Usa Siguiente para agregar metas o inventario opcional antes de analizar.
              </p>
            </div>
          </div>
        )}

        {/* Resumen post-upload (steps no-ventas: solo conteo de columnas) */}
        {step.id !== 'ventas' && step.status === 'loaded' && detectedCols[step.id] && (
          <p className="text-[0.6875rem] text-[var(--sf-t4)] pt-1 border-t border-[var(--sf-border)]">
            {detectedCols[step.id].length} columnas detectadas · {step.file?.name}
          </p>
        )}

        {/* [Datos insuficientes] Warning si <30 días distintos en ventas */}
        {step.id === 'ventas' && step.status === 'loaded' && ventasInsuficientes && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-50/60 px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Tu archivo cubre {ventasInsuficientes.diasDistintos} {ventasInsuficientes.diasDistintos === 1 ? 'día' : 'días'} de ventas
            </span>
            <p className="text-xs text-[var(--sf-t3)] mt-1.5">
              Con menos de 30 días de historial el análisis puede no detectar tendencias, estacionalidad ni comparar contra el mismo período del mes/año anterior. Podés continuar — los KPIs básicos van a funcionar.
            </p>
          </div>
        )}

        {/* [P3] Cross-validation metas ↔ ventas */}
        {step.id === 'metas' && step.status === 'loaded' && metasOrfanas && metasOrfanas.length > 0 && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-50/60 px-3.5 py-2.5 space-y-1.5">
            <span className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Algunas metas no coinciden con tus ventas
            </span>
            <div className="space-y-1">
              {metasOrfanas.map((o) => (
                <p key={o.dimension} className="text-xs text-[var(--sf-t3)] leading-relaxed">
                  <span className="font-medium text-[var(--sf-t2)]">{o.count} {o.dimension}{o.count === 1 ? '' : 's'}</span>
                  {' '}en metas no aparecen en ventas: <span className="font-mono text-[var(--sf-t3)]">{o.examples.join(', ')}{o.count > o.examples.length ? '…' : ''}</span>
                </p>
              ))}
            </div>
            <p className="text-[0.6875rem] text-[var(--sf-t4)] pt-0.5">
              Esas metas se cargarán igual pero no van a poder compararse contra ventas reales.
            </p>
          </div>
        )}

        {/* [P3] Cross-validation inventario ↔ ventas */}
        {step.id === 'inventario' && step.status === 'loaded' && inventarioOrfano && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-50/60 px-3.5 py-2.5 space-y-1.5">
            <span className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Algunos productos del inventario no aparecen en ventas
            </span>
            <div className="space-y-1">
              {inventarioOrfano.map((o) => (
                <p key={o.dimension} className="text-xs text-[var(--sf-t3)] leading-relaxed">
                  <span className="font-medium text-[var(--sf-t2)]">{o.count} {o.dimension === 'codigo_producto' ? 'código' : 'producto'}{o.count === 1 ? '' : 's'}</span>
                  {' '}sin ventas: <span className="font-mono text-[var(--sf-t3)]">{o.examples.join(', ')}{o.count > o.examples.length ? '…' : ''}</span>
                </p>
              ))}
            </div>
            <p className="text-[0.6875rem] text-[var(--sf-t4)] pt-0.5">
              Probablemente sean SKUs nuevos o discontinuados. No van a generar alertas de ruptura porque no hay venta histórica.
            </p>
          </div>
        )}

        {/* [P4] Panel "Mapeo detectado": header original → campo interno */}
        {step.status === 'loaded' && mappingMap[step.id] && Object.keys(mappingMap[step.id]).length > 0 && (
          <div className="rounded-lg border border-[var(--sf-border-subtle)] bg-[var(--sf-inset)]">
            <button
              onClick={() => setShowMapping(prev => ({ ...prev, [step.id]: !prev[step.id] }))}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--sf-t2)]">
                <Info className="w-4 h-4 shrink-0 text-[var(--sf-t3)]" />
                Mapeo detectado — {Object.keys(mappingMap[step.id]).length} {Object.keys(mappingMap[step.id]).length === 1 ? 'columna' : 'columnas'}
              </span>
              <span className="text-xs text-[var(--sf-t4)]">{showMapping[step.id] ? '▲ Ocultar' : '▼ Ver'}</span>
            </button>
            {showMapping[step.id] && (
              <div className="px-3.5 pb-3 pt-1 border-t border-[var(--sf-border-subtle)]">
                <p className="text-[0.6875rem] text-[var(--sf-t4)] mb-2">Cómo interpretamos los headers de tu archivo:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {Object.entries(mappingMap[step.id]).map(([canonical, original]) => (
                    <div key={canonical} className="flex items-center gap-2 text-xs">
                      <code className="px-1.5 py-0.5 rounded bg-amber-100/40 text-amber-700 font-mono">{original}</code>
                      <span className="text-[var(--sf-t4)]">→</span>
                      <code className="px-1.5 py-0.5 rounded bg-emerald-100/50 text-emerald-700 font-mono">{canonical}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vista previa post-upload */}
        {step.parsedData && step.parsedData.length > 0 && step.status === 'loaded' && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sf-t4)]">
              Vista previa — {step.parsedData.length.toLocaleString()} {step.parsedData.length === 1 ? 'registro' : 'registros'}
            </p>
            <DataPreview data={step.parsedData} maxRows={5} />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 pt-1 border-t border-[var(--sf-border-subtle)]">
        <button
          onClick={() => setCurrentStep((c) => c - 1)}
          disabled={currentStep === 0}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
            currentStep === 0
              ? 'opacity-30 cursor-not-allowed text-[var(--sf-t4)]'
              : 'border border-[var(--sf-border)] hover:bg-[var(--sf-hover)] text-[var(--sf-t2)]'
          )}
          style={currentStep > 0 ? { background: 'var(--sf-card)' } : undefined}
        >
          <ChevronLeft className="w-4 h-4" />
          Anterior
        </button>

        <p className="text-center text-xs text-[var(--sf-t4)] min-w-0">
          Paso {currentStep + 1} de {steps.length} · {wizardStatusCopy}
        </p>

        <div className="flex items-center gap-3">
          {isLastStep ? (
            <button
              onClick={handleAnalyze}
              disabled={!allRequiredDone()}
              className={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all',
                allRequiredDone()
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-[var(--sf-inset)] text-[var(--sf-t4)] cursor-not-allowed'
              )}
            >
              Analizar ventas
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => setCurrentStep((c) => c + 1)}
                disabled={!canGoNext()}
                aria-disabled={!canGoNext()}
                title={!canGoNext()
                  ? (step.status === 'error'
                      ? 'El archivo tiene errores. Sub\u00ed uno v\u00e1lido o intentalo con otro antes de continuar.'
                      : step.required
                        ? 'Sub\u00ed un archivo o carg\u00e1 la demo para continuar.'
                        : 'Sub\u00ed un archivo o presion\u00e1 Omitir este paso (es opcional).')
                  : undefined
                }
                className={cn(
                  'flex items-center gap-2 rounded-xl text-sm font-semibold transition-all duration-300',
                  canGoNext()
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white py-3 px-8'
                    : 'text-[var(--sf-t4)] cursor-not-allowed px-6 py-2.5 border border-[var(--sf-border)]'
                )}
                style={!canGoNext() ? { background: 'var(--sf-card)' } : undefined}
              >
                {canGoNext()
                  ? `Siguiente: ${steps[currentStep + 1]?.label ?? 'Continuar'} \u2192`
                  : <><span>Siguiente</span><ChevronRight className="w-4 h-4" /></>}
              </button>
              {canGoNext() && steps[currentStep + 1] && !steps[currentStep + 1].required && (
                <p className="text-[11px] text-[var(--sf-t4)]">Paso {currentStep + 2} es opcional, puedes saltar</p>
              )}
            </div>
          )}
        </div>
      </div>
        </main>
      </div>

      {/* [E10.c] Modal: confirmar sobreescritura. Copy enumera todos los
          datasets que efectivamente van a reemplazarse, no solo metas. */}
      {showMetasConfirm && (() => {
        const reemplazables: string[] = []
        if (steps[0].parsedData && steps[0].parsedData.length > 0) reemplazables.push('ventas')
        if (steps[1].parsedData && steps[1].parsedData.length > 0) reemplazables.push('metas')
        if (steps[2].parsedData && steps[2].parsedData.length > 0) reemplazables.push('inventario')
        const lista = reemplazables.length > 1
          ? reemplazables.slice(0, -1).join(', ') + ' e ' + reemplazables[reemplazables.length - 1]
          : reemplazables[0] ?? 'datos'
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowMetasConfirm(false)}>
          <div className="rounded-xl p-6 shadow-2xl mx-4" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--sf-t1)' }}>Ya tienes datos cargados.</p>
            <p className="text-sm mb-5" style={{ color: 'var(--sf-t3)' }}>
              Vas a reemplazar {lista}. ¿Continuar?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowMetasConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer"
                style={{ color: 'var(--sf-t3)' }}
              >Cancelar</button>
              <button
                onClick={() => { setShowMetasConfirm(false); doAnalyze() }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >Sí, reemplazar</button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* [primera-impresion + E10.b + A1] Modal: confirmar Limpiar/Reemplazar.
          Copy se adapta a:
          - intent del disparador (limpiar vs reemplazar): el banner de re-entrada
            dispara "reemplazar" → la copia debe hablar de reemplazo, no descarte.
          - estado: si solo hay archivos en error (nada cargado realmente), no
            decimos "perder lo cargado" porque sería confuso. */}
      {showLimpiarConfirm && (() => {
        const hasLoaded = steps.some((s) => s.status === 'loaded')
        const onlyError = !hasLoaded && steps.some((s) => s.status === 'error' || s.file !== undefined)
        const isReplace = limpiarIntent === 'reemplazar'

        const title = isReplace
          ? '¿Reemplazar datos cargados?'
          : hasLoaded ? '¿Descartar lo cargado?' : onlyError ? '¿Quitar este archivo?' : '¿Limpiar el wizard?'
        const body = isReplace
          ? 'Vas a borrar los datos actuales para subir un archivo distinto. Esta acción no se puede deshacer.'
          : hasLoaded
          ? 'Vas a perder los archivos y los pasos completados de este wizard. Esta acción no se puede deshacer.'
          : onlyError
          ? 'Solo vas a quitar el archivo del wizard. No hay datos cargados que se pierdan.'
          : 'Vas a reiniciar el wizard a su estado inicial.'
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowLimpiarConfirm(false)}>
          <div className="rounded-xl p-6 shadow-2xl mx-4" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--sf-t1)' }}>{title}</p>
            <p className="text-sm mb-5" style={{ color: 'var(--sf-t3)' }}>
              {body}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowLimpiarConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer"
                style={{ color: 'var(--sf-t3)' }}
              >Cancelar</button>
              <button
                onClick={() => { setShowLimpiarConfirm(false); handleLimpiar() }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >{isReplace ? 'Sí, reemplazar' : hasLoaded ? 'Sí, descartar' : onlyError ? 'Sí, quitar' : 'Sí, limpiar'}</button>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}

