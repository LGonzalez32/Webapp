import { useState, useEffect, useMemo } from 'react'
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
import { FileDown, Trash2, ChevronRight, ChevronLeft, ShieldOff, Check, Plus, AlertTriangle, X, Lock } from 'lucide-react'
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
    description: 'Las columnas Fecha, Vendedor y Unidades son obligatorias. Producto, cliente, canal y categoría son opcionales.',
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
  { col: 'canal',            req: false },
  { col: 'categoria',        req: false },
  { col: 'departamento',     req: false },
  { col: 'supervisor',       req: false },
  { col: 'codigo_producto',  req: false },
  { col: 'codigo_cliente',   req: false },
]
const VENTAS_ROWS = [
  ['2026-03-01','ANA MARIA LOPEZ','24','SUPER SELECTOS S.A.','ACEITE CORONA 1L','142.80','RUTEO','ALIMENTOS','CENTRAL','CARLOS HERNANDEZ','ACE-001','CLI-0234'],
  ['2026-03-01','CARLOS MENDOZA','15','COMERCIAL NORTE','DETERGENTE ARIEL 2KG','89.25','MAYOREO','LIMPIEZA','NORTE','MARIA SANTOS','DET-002','CLI-0891'],
  ['2026-03-02','ANA MARIA LOPEZ','8','TIENDA LA UNION','ACEITE CORONA 1L','47.60','RUTEO','ALIMENTOS','CENTRAL','CARLOS HERNANDEZ','ACE-001','CLI-0156'],
  ['2026-03-03','ROBERTO CHAVEZ','31','SUPER SELECTOS S.A.','SHAMPOO PANTENE 400ML','198.40','MODERNO','CUIDADO PERSONAL','SUR','PEDRO MOLINA','SHA-003','CLI-0234'],
  ['2026-03-04','MARIA GONZALEZ','19','MERCADO CENTRAL','DETERGENTE ARIEL 2KG','113.05','RUTEO','LIMPIEZA','CENTRAL','CARLOS HERNANDEZ','DET-002','CLI-0445'],
  ['2026-03-05','CARLOS MENDOZA','42','COMERCIAL NORTE','ACEITE CORONA 1L','249.90','MAYOREO','ALIMENTOS','NORTE','MARIA SANTOS','ACE-001','CLI-0891'],
  ['2026-03-06','ROBERTO CHAVEZ','7','TIENDA EL SOL','SHAMPOO PANTENE 400ML','44.80','RUTEO','CUIDADO PERSONAL','SUR','PEDRO MOLINA','SHA-003','CLI-0778'],
  ['2026-03-07','ANA MARIA LOPEZ','28','SUPER SELECTOS S.A.','DETERGENTE ARIEL 2KG','166.60','MODERNO','LIMPIEZA','CENTRAL','CARLOS HERNANDEZ','DET-002','CLI-0234'],
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

// ── Validación de columnas ───────────────────────────────────────────────────

const REQUIRED_COLS: Record<string, string[]> = {
  ventas:     ['fecha', 'vendedor', 'unidades'],
  metas:      ['mes_periodo', 'vendedor', 'meta'],
  inventario: ['producto', 'unidades'],
}

const OPTIONAL_COLS: Record<string, string[]> = {
  ventas:     ['cliente', 'producto', 'venta_neta', 'canal', 'categoria', 'departamento', 'supervisor', 'codigo_producto', 'codigo_cliente'],
  metas:      ['canal'],
  inventario: ['categoria', 'proveedor'],
}

const COL_FEATURES: Record<string, string> = {
  cliente:          'Análisis de clientes dormidos',
  producto:         'Rotación de inventario',
  venta_neta:       'Proyecciones en $',
  canal:            'Análisis por canal',
  categoria:        'Análisis por categoría',
  departamento:     'Mapa de calor geográfico',
  supervisor:       'Análisis por zona',
  codigo_producto:  'Cruce de inventario',
  codigo_cliente:   'Identificación única de clientes',
  proveedor:        'Análisis por proveedor',
}


// ── Tabla de ejemplo ──────────────────────────────────────────────────────────

function TablaEjemplo({ headers, rows }: { headers: { col: string; req: boolean }[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto mt-3 rounded-lg border border-[var(--sf-border)]">
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
        <span className="text-emerald-500">*</span> Requerido — las demás columnas son opcionales y activan funciones adicionales.
      </p>
    </div>
  )
}

export default function UploadPage() {
  const { setSales, setMetas, setInventory, setIsProcessed, setSelectedPeriod, setDataSource, resetAll, configuracion, setConfiguracion, dataSource, metas: existingMetas } = useAppStore()
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
  const [showExample, setShowExample] = useState(false)
  const [discardedRowsMap, setDiscardedRowsMap] = useState<Record<string, DiscardedRow[]>>({})
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showMetasConfirm, setShowMetasConfirm] = useState(false)

  const currentStepStatus = steps[currentStep]?.status
  useEffect(() => {
    setShowExample(false)
    setShowDiscarded(false)
  }, [currentStep, currentStepStatus])

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

  const handleFileSelect = async (idx: number, file: File) => {
    setProcessingStep(idx)
    setParseProgress(0)
    setParseDetail('Iniciando...')
    updateStep(idx, { file, status: 'pending', parsedData: undefined, parseError: undefined })

    const onProgress = (percent: number, detail: string) => {
      setParseProgress(percent)
      setParseDetail(detail)
    }

    const stepId = steps[idx].id
    try {
      if (stepId === 'ventas') {
        const r = await parseSalesFileInWorker(file, onProgress)
        if (parseErr(r)) { updateStep(idx, { status: 'error', parseError: r.error }); return }
        setDetectedCols(prev => ({ ...prev, [stepId]: r.columns }))
        if (r.discardedRows?.length) setDiscardedRowsMap(prev => ({ ...prev, [stepId]: r.discardedRows! }))
        updateStep(idx, { parsedData: r.data, status: 'loaded', parseError: undefined })
      } else if (stepId === 'metas') {
        const r = await parseMetasFileInWorker(file, onProgress)
        if (parseErr(r)) { updateStep(idx, { status: 'error', parseError: r.error }); return }
        setDetectedCols(prev => ({ ...prev, [stepId]: r.columns }))
        if (r.discardedRows?.length) setDiscardedRowsMap(prev => ({ ...prev, [stepId]: r.discardedRows! }))
        updateStep(idx, { parsedData: r.data, status: 'loaded', parseError: undefined })
      } else {
        const r = await parseInventoryFileInWorker(file, onProgress)
        if (parseErr(r)) { updateStep(idx, { status: 'error', parseError: r.error }); return }
        setDetectedCols(prev => ({ ...prev, [stepId]: r.columns }))
        if (r.discardedRows?.length) setDiscardedRowsMap(prev => ({ ...prev, [stepId]: r.discardedRows! }))
        updateStep(idx, { parsedData: r.data, status: 'loaded', parseError: undefined })
      }
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
      subtitle: `Procesando ${salesData.length.toLocaleString()} registros de ventas`,
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
      setLoading({ title: '\u00A1Listo!', subtitle: 'Redirigiendo al dashboard', progress: 100 })
      setTimeout(() => {
        setLoading(null)
        navigate('/dashboard')
      }, 400)
    }, 600)
  }

  const handleLimpiar = async () => {
    resetAll()
    clearDatasets().catch(() => {})
    setSteps(INITIAL_STEPS)
    setCurrentStep(0)
    setStorageFiles(null)
    setDetectedCols({})
    setDiscardedRowsMap({})
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
            className="text-2xl font-bold text-[var(--sf-t1)] mb-1 opacity-0"
            style={{ animation: 'fadeInUp 0.3s ease 0.1s forwards' }}
          >
            {totalRegistros.toLocaleString()} registros cargados
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
          <h1 className="text-3xl font-bold text-[var(--sf-t1)] tracking-tight">Cargar Datos</h1>
          <p className="text-[var(--sf-t3)] mt-1">Sube tus ventas y activa el análisis de riesgo comercial.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleLimpiar}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--sf-t4)] hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar
          </button>
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-[var(--sf-green)] text-[var(--sf-green)] text-sm font-semibold hover:bg-[var(--sf-green-bg)] transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Descargar plantilla
          </button>
        </div>
      </div>

      {/* Demo banner */}
      <div className="flex items-center gap-4 p-5 rounded-xl" style={{ background: 'linear-gradient(135deg, var(--sf-green-bg) 0%, rgba(16,185,129,0.05) 100%)', border: '1px solid var(--sf-green-border)' }}>
        <span className="text-2xl shrink-0">🚀</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--sf-t1)' }}>
            {dataSource === 'demo' ? 'Ya tienes datos demo cargados' : '¿Primera vez? Prueba con datos demo'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--sf-t3)' }}>
            {dataSource === 'demo'
              ? 'Sube tus propios datos para ver tu análisis real.'
              : '93,013 registros · 8 vendedores · 18 meses de historial'}
          </p>
        </div>
        {dataSource !== 'demo' && (
          <button
            onClick={handleLoadDemo}
            className="shrink-0 px-4 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors"
          >
            Cargar demo
          </button>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex justify-center">
        <StepIndicator
          steps={steps}
          currentStepIndex={currentStep}
          onStepClick={(idx) => setCurrentStep(idx)}
        />
      </div>

      {/* Step card */}
      <div className="rounded-2xl p-8 space-y-6" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--sf-t4)]">
              Paso {currentStep + 1} de {steps.length}
            </span>
            {!step.required && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-[var(--sf-t4)] uppercase tracking-wider" style={{ background: 'var(--sf-inset)' }}>opcional</span>
            )}
          </div>
          <h2 className="text-xl font-bold text-[var(--sf-t1)]">{step.label}</h2>

          <div className="flex flex-col gap-4 mt-4">
            {/* Obligatorias */}
            <div>
              <p className="text-xs font-semibold text-[var(--sf-green)] mb-2 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                OBLIGATORIAS
              </p>
              <div className="flex flex-wrap gap-2">
                {REQUIRED_COLS[step.id]?.map(col => {
                  const hasData = step.status === 'loaded' && !!detectedCols[step.id]
                  const found = hasData ? detectedCols[step.id].includes(col) : null
                  return (
                    <span key={col} className={cn(
                      'inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-all',
                      hasData
                        ? found
                          ? 'bg-[var(--sf-green-bg)] text-emerald-600 border-[var(--sf-green-border)]'
                          : 'bg-red-50 text-red-600 border-red-200'
                        : 'bg-[var(--sf-green-bg)] text-[var(--sf-green)] border-[var(--sf-green-border)]'
                    )}>
                      {hasData && (found
                        ? <Check className="w-3.5 h-3.5 shrink-0" />
                        : <X className="w-3.5 h-3.5 shrink-0" />
                      )}
                      {col}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Opcionales */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-semibold text-[var(--sf-t3)] flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  OPCIONALES
                </p>
                {step.status === 'loaded' && detectedCols[step.id] && (
                  <span className="text-xs text-[var(--sf-t4)]">
                    — {OPTIONAL_COLS[step.id]?.filter(c => detectedCols[step.id].includes(c)).length ?? 0} de {OPTIONAL_COLS[step.id]?.length ?? 0} detectadas
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--sf-t4)] mb-3">
                Mientras más columnas subas, más profundo es el análisis
              </p>
              <div className="flex flex-wrap gap-2">
                {OPTIONAL_COLS[step.id]?.map(col => {
                  const hasData = step.status === 'loaded' && !!detectedCols[step.id]
                  const found = hasData ? detectedCols[step.id].includes(col) : null
                  return (
                    <span key={col} className={cn(
                      'group relative inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border cursor-default transition-all',
                      hasData
                        ? found
                          ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                          : 'text-[var(--sf-t4)] border-[var(--sf-border)]'
                        : 'text-[var(--sf-t2)] border-[var(--sf-border)] hover:bg-[var(--sf-elevated)] hover:border-[var(--sf-border-active)]'
                    )} style={!hasData ? { background: 'var(--sf-inset)' } : hasData && !found ? { background: 'var(--sf-inset)' } : undefined}>
                      {hasData && found && <Check className="w-3 h-3 shrink-0" />}
                      {hasData && !found && <Plus className="w-3 h-3 shrink-0 opacity-40" />}
                      {col}
                      {/* Tooltip */}
                      {COL_FEATURES[col] && (
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg bg-[var(--sf-t1)] text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                          Activa: {COL_FEATURES[col]}
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--sf-t1)]" />
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Resumen cuando cargado */}
            {step.status === 'loaded' && detectedCols[step.id] && (
              <p className="text-[0.6875rem] text-[var(--sf-t4)] pt-1 border-t border-[var(--sf-border)]">
                {detectedCols[step.id].length} columnas en total · {step.file?.name}
              </p>
            )}
          </div>
        </div>

        {/* Example table (collapsible) */}
        <div>
          <button
            onClick={() => setShowExample(prev => !prev)}
            className="flex items-center justify-between w-full text-left px-3.5 py-2.5 rounded-xl border border-[var(--sf-border)] hover:border-[var(--sf-green-border)] hover:bg-[var(--sf-green-bg)] transition-all cursor-pointer group"
            style={{ background: 'var(--sf-elevated)' }}
          >
            <p className="text-xs font-semibold text-[var(--sf-t3)] uppercase tracking-widest group-hover:text-[var(--sf-green)] transition-colors">
              Ejemplo de formato
            </p>
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--sf-green)] group-hover:text-[var(--sf-green)] transition-colors">
              {showExample ? '\u25B2 Ocultar ejemplo' : '\u25BC Ver ejemplo'}
            </span>
          </button>
          {showExample && (
            <>
              <TablaEjemplo
                headers={step.id === 'ventas' ? VENTAS_HEADERS : step.id === 'metas' ? METAS_HEADERS : INVENTARIO_HEADERS}
                rows={step.id === 'ventas' ? VENTAS_ROWS : step.id === 'metas' ? METAS_ROWS : INVENTARIO_ROWS}
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-[var(--sf-t4)]">Usa esta plantilla como guía para preparar tu archivo</p>
                <button
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-[var(--sf-green)] text-[var(--sf-green)] text-sm font-semibold hover:bg-[var(--sf-green-bg)] transition-colors cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  Descargar plantilla
                </button>
              </div>
            </>
          )}
        </div>

        {/* Drop zone */}
        <FileDropzone
          step={step}
          onFileSelect={(file) => handleFileSelect(currentStep, file)}
          onSkip={!step.required ? () => handleSkip(currentStep) : undefined}
          isProcessing={processingStep === currentStep}
          progressPercent={processingStep === currentStep ? parseProgress : 0}
          progressDetail={processingStep === currentStep ? parseDetail : ''}
        />

        {/* Filas descartadas */}
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
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {step.parseError.missing.map(c => (
                      <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                        {'\u2717'} {c}
                      </span>
                    ))}
                  </div>
                )}

                {step.parseError.code === 'INVALID_DATES' && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[0.6875rem] text-[var(--sf-t4)]">Fechas encontradas en el archivo:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {step.parseError.sample.map((s, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {step.parseError.code === 'ENCODING_ISSUE' && step.parseError.sample.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[0.6875rem] text-[var(--sf-t4)]">Columnas con caracteres incorrectos:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {step.parseError.sample.map((s, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Banner CTA — ventas cargado */}
        {step.id === 'ventas' && step.status === 'loaded' && step.parsedData && (
          <div className="flex items-center justify-between gap-4 px-4 py-3.5 rounded-lg bg-[var(--sf-green-bg)] border border-[var(--sf-green-border)]">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-600">
                {'\u2713'} Archivo listo — {step.parsedData.length.toLocaleString()} registros cargados
              </p>
              <p className="text-xs text-[var(--sf-t3)] mt-0.5">
                Puedes continuar ahora o agregar metas e inventario para activar más análisis.
              </p>
            </div>
            <button
              onClick={() => setCurrentStep(c => c + 1)}
              className="shrink-0 px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors whitespace-nowrap"
            >
              Continuar →
            </button>
          </div>
        )}

        {/* Vista previa de datos */}
        {step.parsedData && step.parsedData.length > 0 && step.status === 'loaded' && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sf-t4)]">
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

      {/* Modal: confirmar sobreescritura de metas */}
      {showMetasConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowMetasConfirm(false)}>
          <div className="rounded-xl p-6 shadow-2xl mx-4" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', maxWidth: 384 }} onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--sf-t1)' }}>Ya tienes metas configuradas.</p>
            <p className="text-sm mb-5" style={{ color: 'var(--sf-t3)' }}>¿Reemplazar todo?</p>
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
      )}
    </div>
  )
}
