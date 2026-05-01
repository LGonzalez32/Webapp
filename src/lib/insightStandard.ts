// src/lib/insightStandard.ts
// INSIGHT ENGINE STANDARD v2.0
import type { VendorAnalysis } from '../types'
import type { DiagnosticBlock, DiagnosticBlockChain } from '../types/diagnostic-types'
// 37 reglas en 9 grupos (32 mejoradas + 5 nuevas A-E)
// Activas hoy: formatearImpacto, sustituirJerga, contieneJerga, esConclusionValida
// Conectada al pipeline — todo insight pasa por validarInsight(), validarProporcionalidad(), validarBalance(), detectarRedundancia(), validarCoherenciaTemporal() y sanitizarNarrativa()

/**
 * [PR-FIX.1] Garantiza que la cadena termine en puntuación oracional antes de
 * concatenar texto adicional. Previene narrativas rotas tipo
 *   "...año anterior Contexto: también aumentó..."  →
 *   "...año anterior. Contexto: también aumentó..."
 *
 * Reglas:
 *  - Si ya termina en `.`, `!`, `?` o `)` (trimmed), devuelve la cadena sin cambios.
 *  - Si termina en cualquier otra cosa (letra, dígito, `,`, etc.), apende `.`.
 *  - Strings vacías o no-strings pasan intactas (no-op seguro).
 * Función pura.
 */
export function ensureSentenceEnd(s: string): string {
  if (!s || typeof s !== 'string') return s
  const trimmed = s.replace(/\s+$/, '')
  if (trimmed.length === 0) return trimmed
  if (/[.!?)]$/.test(trimmed)) return trimmed
  return trimmed + '.'
}

export interface AccionConcreta {
  texto: string;
  entidadesInvolucradas: string[];
  respaldoNumerico: string;
  ejecutableEn: 'inmediato' | 'esta_semana' | 'este_mes';
}

export type PrioridadInsight = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';

// ═══════════════════════════════════════
// GRUPO 1: Clasificación y Priorización
// ═══════════════════════════════════════

export function calcularPercentiles(valores: number[]): {
  p5: number; p10: number; p20: number; p50: number;
  p75: number; p80: number; p90: number; p95: number;
} {
  const sorted = [...valores].filter(v => v > 0).sort((a, b) => a - b);
  const p = (pct: number) => sorted[Math.floor(sorted.length * pct / 100)] || 0;
  return { p5: p(5), p10: p(10), p20: p(20), p50: p(50), p75: p(75), p80: p(80), p90: p(90), p95: p(95) };
}

export function determinarMaxPrioridad(percentileRank: number): PrioridadInsight {
  if (percentileRank >= 95) return 'CRITICA';
  if (percentileRank >= 80) return 'ALTA';
  if (percentileRank >= 50) return 'MEDIA';
  return 'BAJA';
}

// NUEVA C — ajusta prioridad al tamaño real del impacto vs el negocio total
export function validarProporcionalidad(
  impactoAbsoluto: number,
  ventaTotalNegocio: number,
  prioridadActual: PrioridadInsight
): { proporcional: boolean; prioridadSugerida: PrioridadInsight; porcentajeImpacto: number } {
  if (ventaTotalNegocio === 0) return { proporcional: true, prioridadSugerida: prioridadActual, porcentajeImpacto: 0 };
  const porcentajeImpacto = (impactoAbsoluto / ventaTotalNegocio) * 100;
  let prioridadSugerida = prioridadActual;
  if (porcentajeImpacto < 0.5 && prioridadActual === 'CRITICA') prioridadSugerida = 'ALTA';
  else if (porcentajeImpacto < 0.1 && prioridadActual === 'ALTA') prioridadSugerida = 'MEDIA';
  else if (porcentajeImpacto < 0.05 && prioridadActual === 'MEDIA') prioridadSugerida = 'BAJA';
  return { proporcional: prioridadActual === prioridadSugerida, prioridadSugerida, porcentajeImpacto };
}

// ═══════════════════════════════════════
// GRUPO 2: Filtros de Ruido
// ═══════════════════════════════════════

export function pasaFiltroRuido(
  transacciones: number,
  valorAcumulado: number,
  percentil10Clientes: number,
  medianaTxGlobal: number
): boolean {
  const pisoTx = Math.max(3, Math.floor(medianaTxGlobal * 0.05));
  if (transacciones < pisoTx && valorAcumulado < percentil10Clientes) return false;
  return true;
}

// NUEVA B — encuentra candidatos que dicen lo mismo sobre la misma entidad
export function detectarRedundancia(
  candidatos: Array<{ vendedor?: string; cliente?: string; producto?: string; tipo?: string; descripcion?: string }>
): Array<{ mantener: typeof candidatos[0]; descartar: typeof candidatos[0]; razon: string }> {
  const stopwords = new Set(['de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'con', 'por', 'su', 'un', 'una', 'que', 'es', 'se', 'del']);
  const palabrasClave = (texto = '') =>
    texto.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopwords.has(w));

  const grupos = new Map<string, typeof candidatos>();
  candidatos.forEach(c => {
    const k = c.vendedor || c.cliente || c.producto || 'global';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(c);
  });
  const pares: Array<{ mantener: typeof candidatos[0]; descartar: typeof candidatos[0]; razon: string }> = [];
  grupos.forEach(grupo => {
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        const [a, b] = [grupo[i], grupo[j]];
        if (a.tipo === b.tipo) {
          pares.push({ mantener: a, descartar: b, razon: `Mismo tipo "${a.tipo}" para la misma entidad` });
          continue;
        }
        const palsA = new Set(palabrasClave(a.descripcion));
        const palsB = palabrasClave(b.descripcion);
        const comunes = palsB.filter(p => palsA.has(p)).length;
        const totalUnicas = new Set([...palsA, ...palsB]).size;
        if (totalUnicas > 0 && comunes / totalUnicas > 0.6) {
          pares.push({ mantener: a, descartar: b, razon: `Descripciones con ${Math.round(comunes / totalUnicas * 100)}% de palabras compartidas` });
        }
      }
    }
  });
  return pares;
}

// ═══════════════════════════════════════
// GRUPO 3: Análisis de Clientes
// ═══════════════════════════════════════

// Acepta períodos mensuales o trimestrales. Mínimo 4 períodos; si hay menos → fallback conservador.
export function calcularChurnBaseline(
  clientesActivosPorPeriodo: { periodo: string; clientes: Set<string> }[]
): { tasaPromedio: number; desviacionEstandar: number } {
  if (clientesActivosPorPeriodo.length < 4) return { tasaPromedio: 0.10, desviacionEstandar: 0.05 };
  const n = clientesActivosPorPeriodo.length;
  const tasas: number[] = [];
  const pesos: number[] = [];
  for (let i = 1; i < n; i++) {
    const prev = clientesActivosPorPeriodo[i - 1].clientes;
    const cur  = clientesActivosPorPeriodo[i].clientes;
    const perdidos = [...prev].filter(c => !cur.has(c)).length;
    tasas.push(prev.size > 0 ? perdidos / prev.size : 0);
    pesos.push(i); // peso lineal: período más reciente = mayor peso
  }
  const sumPesos = pesos.reduce((s, p) => s + p, 0);
  const avg = tasas.reduce((s, t, i) => s + t * pesos[i], 0) / sumPesos;
  const variance = tasas.reduce((s, t, i) => s + pesos[i] * Math.pow(t - avg, 2), 0) / sumPesos;
  return { tasaPromedio: avg, desviacionEstandar: Math.sqrt(variance) };
}

export function esChurnSignificativo(
  valorCliente: number,
  p75Clientes: number,
  churnActual: number,
  churnBaseline: { tasaPromedio: number; desviacionEstandar: number },
  esUnicoEnSegmento = false,
  tendenciaCliente = 0
): boolean {
  if (esUnicoEnSegmento) return true;
  if (tendenciaCliente < -20) return true;
  if (valorCliente >= p75Clientes) return true;
  if (churnActual > churnBaseline.tasaPromedio + churnBaseline.desviacionEstandar) return true;
  return false;
}

export interface ContextoCompleto {
  frecuenciaCompra: number | null;
  distribucionIntraMes: { early: number; mid: number; late: number } | null;
  estacionalidad: Map<number, number> | null;
  patronCanal: string | null;
  volumenRelativoSegmento: number | null;
  mesesHistoricos: number;
  metaVendedor: { metaMes: number; cumplimiento: number; gap: number } | null;
  saludVendedorAsignado?: 'critico' | 'riesgo' | 'estable' | 'bueno' | null;
  productosEnDesabasto?: number;
  zonaCrecimiento?: number; // variación % del departamento del cliente
}

export function evaluarDormidoConContexto(
  diasSinCompra: number,
  contexto: ContextoCompleto,
  valorCliente?: number,
  p75Clientes?: number
): { esDormidoReal: boolean; razon: string; reactivacionPrioritaria: boolean } {
  if (contexto.mesesHistoricos < 3) {
    return { esDormidoReal: false, razon: 'Historial insuficiente para determinar patrón', reactivacionPrioritaria: false };
  }

  if (contexto.distribucionIntraMes) {
    const { early, mid, late } = contexto.distribucionIntraMes;
    const total = early + mid + late;
    if (total > 0 && (mid + late) / total > 0.7 && diasSinCompra < (contexto.frecuenciaCompra || 30) * 1.5) {
      return { esDormidoReal: false, razon: 'Patrón histórico indica compra predominante en segunda quincena', reactivacionPrioritaria: false };
    }
  }

  if (contexto.frecuenciaCompra && diasSinCompra < contexto.frecuenciaCompra * 1.3) {
    return { esDormidoReal: false, razon: 'Dentro del rango normal de frecuencia de compra', reactivacionPrioritaria: false };
  }

  // Cruces adicionales: vendedor, supply, zona
  if (contexto.saludVendedorAsignado === 'critico' || contexto.saludVendedorAsignado === 'riesgo') {
    return { esDormidoReal: true, razon: 'El vendedor asignado está en riesgo — probable falta de atención', reactivacionPrioritaria: true };
  }
  if ((contexto.productosEnDesabasto ?? 0) > 0) {
    return { esDormidoReal: false, razon: `${contexto.productosEnDesabasto} productos que compraba están en desabasto — problema de supply`, reactivacionPrioritaria: false };
  }
  if ((contexto.zonaCrecimiento ?? 0) < -15) {
    return { esDormidoReal: true, razon: 'Zona en caída generalizada', reactivacionPrioritaria: false };
  }

  let reactivacionPrioritaria = false;
  if (contexto.metaVendedor?.cumplimiento < 80 && valorCliente != null && p75Clientes != null && valorCliente >= p75Clientes) {
    reactivacionPrioritaria = true;
  }
  return { esDormidoReal: true, razon: 'Supera frecuencia esperada con margen', reactivacionPrioritaria };
}

export function evaluarPenetracion(
  productosCliente: number,
  totalProductosDisponibles: number,
  promedioProductosPorCliente: number
): { penetracion: number; fragil: boolean; oportunidad: boolean; porDebajoDelPromedio: boolean; diferenciaVsPromedio: number } {
  const penetracion = totalProductosDisponibles > 0 ? productosCliente / totalProductosDisponibles : 0;
  return {
    penetracion,
    fragil: penetracion < 0.15,
    oportunidad: penetracion < 0.35,
    porDebajoDelPromedio: productosCliente < promedioProductosPorCliente,
    diferenciaVsPromedio: productosCliente - promedioProductosPorCliente,
  };
}

// ═══════════════════════════════════════
// GRUPO 4: Análisis de Productos
// ═══════════════════════════════════════

export function calcularPareto(entidades: { nombre: string; valor: number }[]): string[] {
  const sorted = [...entidades].sort((a, b) => b.valor - a.valor);
  const total = sorted.reduce((s, e) => s + e.valor, 0);
  let acum = 0;
  const pareto: string[] = [];
  for (const e of sorted) { acum += e.valor; pareto.push(e.nombre); if (acum >= total * 0.80) break; }
  return pareto;
}
export function esEntidadPareto(nombre: string, paretoList: string[]): boolean { return paretoList.includes(nombre); }

export function detectarFamiliasProducto(productos: string[]): Map<string, string[]> {
  const families = new Map<string, string[]>();
  productos.forEach(nombre => {
    const normalizado = nombre
      .replace(/\d+\s*(g|kg|ml|l|oz|lb|und|pz|pk)\b/gi, '') // medidas con unidad
      .replace(/\d+[xX]\d+/g, '')                              // formatos "2x1", "3x500"
      .replace(/\b(PROMO|BONIF|MARINAR|ESPECIAL|COMBO)\b/gi, '') // sufijos promo
      .replace(/\d+/g, '')                                     // números sueltos restantes
      .replace(/\s+/g, ' ')
      .trim();
    const palabras = normalizado.split(' ').filter(p => p.length > 1);
    const clave = palabras.slice(0, 3).join(' ').toUpperCase();
    if (clave.length >= 5) {
      if (!families.has(clave)) families.set(clave, []);
      families.get(clave)!.push(nombre);
    }
  });
  const resultado = new Map<string, string[]>();
  families.forEach((prods, key) => { if (prods.length > 1) resultado.set(key, prods); });
  return resultado;
}


export function esVariantePromocional(nombre: string): boolean {
  return /\(\+\d+%\)|PROMO|MARINAR|BONIF/i.test(nombre);
}

export function calcularCoOcurrencia(
  clientProductMap: Map<string, Set<string> | Map<string, unknown>>
): Map<string, Map<string, number>> {
  const coMatrix = new Map<string, Map<string, number>>();
  clientProductMap.forEach(productos => {
    const prods = productos instanceof Map ? [...productos.keys()] : [...(productos as Set<string>)];
    for (let i = 0; i < prods.length; i++) {
      for (let j = i + 1; j < prods.length; j++) {
        const [a, b] = [prods[i], prods[j]];
        if (!coMatrix.has(a)) coMatrix.set(a, new Map());
        if (!coMatrix.has(b)) coMatrix.set(b, new Map());
        coMatrix.get(a)!.set(b, (coMatrix.get(a)!.get(b) || 0) + 1);
        coMatrix.get(b)!.set(a, (coMatrix.get(b)!.get(a) || 0) + 1);
      }
    }
  });
  return coMatrix;
}

export function detectarCoDeclive(
  productosEnDeclive: string[],
  coMatrix: Map<string, Map<string, number>>,
  totalClientes: Map<string, number>,
  productoDeptMap: Map<string, string>
): string[][] {
  const grupos: string[][] = [];
  const asignado = new Set<string>();
  for (const prod of productosEnDeclive) {
    if (asignado.has(prod)) continue;
    const grupo = [prod];
    asignado.add(prod);
    for (const otro of productosEnDeclive) {
      if (asignado.has(otro)) continue;
      const coCount = coMatrix.get(prod)?.get(otro) || 0;
      const proporcion = coCount / (totalClientes.get(prod) || 1);
      if (proporcion > 0.15) {
        const mismoDepto = productoDeptMap.get(prod) === productoDeptMap.get(otro);
        if (mismoDepto || coCount > 2) { // conexión causal: mismo depto O más de 2 clientes compartidos
          grupo.push(otro);
          asignado.add(otro);
        }
      }
    }
    if (grupo.length >= 2) grupos.push(grupo);
  }
  return grupos;
}

// ═══════════════════════════════════════
// GRUPO 5: Análisis Cruzado
// ═══════════════════════════════════════

export const CRUCES_DISPONIBLES = {
  vendedor: {
    directos: ['ytd_neto', 'variacion_ytd', 'riesgo', 'clientes_activos', 'ticket_promedio', 'promedio_3m', 'canal_principal', 'txCount', 'dias_activo', 'productos_unicos'],
    conVentas: ['desglose_por_cliente_$', 'desglose_por_producto', 'desglose_por_canal', 'desglose_por_departamento', 'tendencia_mensual', 'ritmo_diario', 'tasa_devolucion', 'ratio_bonificacion', 'concentracion_clientes'],
    conOtrasTablas: ['dormidos_asignados', 'inventario_productos_top', 'salud_clientes', 'meta_mes', 'cumplimiento_meta'],
  },
  cliente: {
    directos: ['venta_actual', 'venta_anterior', 'variacion', 'peso', 'meses_activo', 'productos_unicos', 'transacciones', 'señal_riesgo', 'frecuencia_compra'],
    conVentas: ['mix_producto_yoy', 'historial_vendedor', 'canal', 'departamento', 'patron_frecuencia', 'historial_devoluciones', 'ratio_bonificacion', 'evolucion_ticket'],
    conOtrasTablas: ['inventario_productos_top', 'salud_vendedor', 'tendencia_departamento'],
  },
  producto: {
    directos: ['venta_actual', 'venta_anterior', 'variacion', 'clientes_activos', 'vendedores', 'categoria'],
    conVentas: ['desglose_cliente_yoy', 'por_departamento', 'por_canal', 'tendencia_mensual', 'canasta_co_compra', 'variantes_familia'],
    conOtrasTablas: ['stock_actual', 'velocidad_venta', 'cobertura_meses', 'rendimiento_vendedores'],
  },
} as const;

export function evaluarIndicadorAnticipado(señales: {
  cambioBaseClientes: number;
  cambioRevenue: number;
  tendenciaMensual3m: number[];
  inventarioMesesCobertura: number | null;
  saludVendedor: string | null;
  contextoHistoricoJustificacion?: string;
}): { esAnticipado: boolean; riesgo: number; scoreTotal: number; scorePosible: number; señalesActivadas: string[]; confianza: number } {
  const scorePosible = 7.5;
  let scoreTotal = 0;
  const señalesActivadas: string[] = [];

  if (señales.cambioBaseClientes < -10) { scoreTotal += 2; señalesActivadas.push('Base de clientes cayó más del 10%'); }
  if (señales.cambioRevenue < -5) { scoreTotal += 2; señalesActivadas.push('Ingresos cayeron más del 5%'); }
  if (señales.tendenciaMensual3m.length >= 3 &&
      señales.tendenciaMensual3m.every((v, i) => i === 0 || v <= señales.tendenciaMensual3m[i - 1])) {
    scoreTotal += 1; señalesActivadas.push('Tendencia mensual declinante 3 meses consecutivos');
  }
  if (señales.inventarioMesesCobertura !== null && señales.inventarioMesesCobertura > 6) {
    scoreTotal += 1; señalesActivadas.push('Inventario con más de 6 meses de cobertura');
  }
  if (señales.saludVendedor === 'critico' || señales.saludVendedor === 'riesgo') {
    scoreTotal += 1.5; señalesActivadas.push('Vendedor en estado crítico o de riesgo');
  }

  const riesgo = scoreTotal / scorePosible;
  return { esAnticipado: riesgo >= 0.4, riesgo, scoreTotal, scorePosible, señalesActivadas, confianza: riesgo };
}

// [Z.6 F1 — heterogeneity]
// R121: un grupo es heterogéneo si el mayor impactoUSD supera al mediano por factor >= 3x
export function analizarHeterogeneidad(items: Array<{ impactoUSD?: number }>): {
  esHeterogeneo: boolean;
  maxImpacto: number;
  medianaImpacto: number;
  ratio: number;
} {
  const impactos = items
    .map(i => Math.abs(i.impactoUSD ?? 0))
    .filter(v => v > 0)
    .sort((a, b) => b - a);

  if (impactos.length < 2) {
    return { esHeterogeneo: false, maxImpacto: impactos[0] ?? 0, medianaImpacto: 0, ratio: 1 };
  }

  const max = impactos[0];
  const mid = Math.floor(impactos.length / 2);
  const mediana = impactos.length % 2 === 0
    ? (impactos[mid - 1] + impactos[mid]) / 2
    : impactos[mid];

  const ratio = mediana > 0 ? max / mediana : Infinity;
  return {
    esHeterogeneo: ratio >= 3 && max >= 1000,
    maxImpacto: max,
    medianaImpacto: mediana,
    ratio,
  };
}

export function detectarCascadas(
  candidatos: Array<{ entityType?: string; entityId?: string; prioridad?: string }>
): Map<string, { insights: typeof candidatos; severidad: 'alta' | 'media' | 'baja' }> {
  const entityMentions = new Map<string, typeof candidatos>();
  candidatos.forEach(c => {
    const key = `${c.entityType || 'x'}-${c.entityId || 'x'}`;
    if (!entityMentions.has(key)) entityMentions.set(key, []);
    entityMentions.get(key)!.push(c);
  });
  const cascadas = new Map<string, { insights: typeof candidatos; severidad: 'alta' | 'media' | 'baja' }>();
  entityMentions.forEach((grupo, key) => {
    if (grupo.length >= 2) {
      const prios = grupo.map(g => g.prioridad || 'BAJA');
      const severidad: 'alta' | 'media' | 'baja' =
        prios.includes('CRITICA') ? 'alta' : prios.includes('ALTA') ? 'media' : 'baja';
      cascadas.set(key, { insights: grupo, severidad });
    }
  });
  return cascadas;
}

// ═══════════════════════════════════════
// GRUPO 6: Validación Temporal
// ═══════════════════════════════════════

export function validarComparacionTemporal(
  tipo: 'YTD' | 'MTD' | 'historico',
  diaDelMes: number,
  _fechaRef: Date
): { valido: boolean; confianza: 'alta' | 'media' | 'temprana' | 'muy_temprana' } {
  if (tipo === 'YTD' || tipo === 'historico') return { valido: true, confianza: 'alta' };
  if (tipo === 'MTD') {
    if (diaDelMes >= 24) return { valido: true, confianza: 'alta' };
    if (diaDelMes >= 16) return { valido: true, confianza: 'media' };
    if (diaDelMes >= 8)  return { valido: true, confianza: 'temprana' };
    return { valido: true, confianza: 'muy_temprana' };
  }
  return { valido: false, confianza: 'muy_temprana' };
}

export function calcularConfianzaTemporal(
  _diaDelMes: number,
  historialPctPorDia: number[]
): { pctTipico: number; varianza: number; confiable: boolean; coeficienteVariacion: number; tipoNegocio: 'estable' | 'moderado' | 'volatil' } {
  if (historialPctPorDia.length === 0) return { pctTipico: 0, varianza: 0, confiable: false, coeficienteVariacion: 1, tipoNegocio: 'volatil' };
  const avg = historialPctPorDia.reduce((s, v) => s + v, 0) / historialPctPorDia.length;
  const std = Math.sqrt(historialPctPorDia.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / historialPctPorDia.length);
  const CV = avg > 0 ? std / avg : 1;
  const tipoNegocio: 'estable' | 'moderado' | 'volatil' = CV < 0.2 ? 'estable' : CV < 0.4 ? 'moderado' : 'volatil';
  return { pctTipico: avg, varianza: std, confiable: CV < 0.3, coeficienteVariacion: CV, tipoNegocio };
}

// NUEVA D — verifica que el lenguaje use certezas solo cuando el mes está avanzado
export function validarCoherenciaTemporal(texto: string, diaDelMes: number, diasEnMes: number): { coherente: boolean; progreso: number; problema: string | null } {
  const progreso = diaDelMes / diasEnMes;
  if (progreso < 0.25 && /\bcerrará\b|\bno llegará\b|\bsuperará\b/i.test(texto)) return { coherente: false, progreso, problema: 'certeza_prematura' };
  return { coherente: true, progreso, problema: null };
}

// ═══════════════════════════════════════
// GRUPO 7: Calidad de Contenido
// ═══════════════════════════════════════

export function validarAccionConcreta(accion: AccionConcreta): boolean {
  if (!accion?.texto?.trim()) return false;
  if (!accion.entidadesInvolucradas?.length) return false;
  const verbosGenericos = ['dar seguimiento', 'monitorear', 'revisar situación', 'evaluar', 'tener en cuenta', 'considerar'];
  if (verbosGenericos.some(v => accion.texto.toLowerCase().startsWith(v))) return false;
  // Respaldo numérico: explícito en el campo O al menos un número en el texto de la acción
  if (!accion.respaldoNumerico?.trim() && !/\d+/.test(accion.texto)) return false;
  return true;
}

export const TERMINOS_PROHIBIDOS_EN_OUTPUT: string[] = [
  'pareto', 'percentil', 'co-declive', 'mix-shift', 'penetración de catálogo',
  'señal temprana', 'cascada', 'co-ocurrencia', 'baseline', 'churn',
  'threshold', 'pipeline', 'funnel', 'KPI', 'YoY', 'MTD', 'YTD', 'SKU', 'GAP', 'run rate', 'forecast',
];

const SUSTITUCIONES_JERGA: Array<[RegExp, string]> = [
  [/\b80\/20\b/gi, 'principales'],
  [/\bpareto\b/gi, 'de mayor volumen'],
  [/\bpercentiles?\b/gi, 'rango'],
  [/\bchurn\b/gi, 'pérdida de clientes'],
  [/\bmix[- ]shift\b/gi, 'cambio en la composición de compra'],
  [/\bpenetración de catálogo\b/gi, 'variedad de productos comprados'],
  [/\bbaseline\b/gi, 'comportamiento habitual'],
  [/\bseñal temprana\b/gi, 'tendencia inicial'],
  [/\bcascadas?\b/gi, 'efecto dominó'],
  [/\bco[- ]declive\b/gi, 'caída simultánea'],
  [/\bco[- ]ocurrencia\b/gi, 'compra conjunta'],
  [/\bthreshold\b/gi, 'umbral'],
  [/\bpipeline\b/gi, 'flujo'],
  [/\bfunnel\b/gi, 'embudo'],
  [/\bKPI\b/g, 'indicador'],
  [/\bYoY\b/gi, 'vs año anterior'],
  [/\bMTD\b/gi, 'en lo que va del mes'],
  [/\bYTD\b/gi, 'en el acumulado del año'],
  [/\bSKUs?\b/gi, 'productos'],
  [/\bGAP\b/gi, 'brecha'],
  [/\brun rate\b/gi, 'ritmo actual'],
  [/\bforecast\b/gi, 'proyección'],
];

export function sustituirJerga(texto: string): string {
  let resultado = texto;
  for (const [regex, sustituto] of SUSTITUCIONES_JERGA) {
    resultado = resultado.replace(regex, sustituto);
  }
  return resultado.replace(/\s{2,}/g, ' ').trim();
}

export function contieneJerga(texto: string): { tieneJerga: boolean; terminosEncontrados: string[] } {
  const encontrados: string[] = [];
  for (const termino of TERMINOS_PROHIBIDOS_EN_OUTPUT) {
    const regex = new RegExp(`\\b${termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(texto)) encontrados.push(termino);
  }
  return { tieneJerga: encontrados.length > 0, terminosEncontrados: encontrados };
}

const CONCLUSIONES_GENERICAS = [
  'requiere atención', 'es importante', 'hay que revisar', 'debe analizarse', 'es relevante',
  'se debe monitorear', 'tomar en cuenta', 'prestar atención', 'considerar opciones',
  'evaluar la situación', 'dar seguimiento', 'tener en cuenta', 'no perder de vista', 'mantenerse alerta',
];

export function esConclusionValida(conclusion: string): boolean {
  if (!conclusion || conclusion.trim().length < 10) return false;
  const lower = conclusion.toLowerCase().trim();
  return !CONCLUSIONES_GENERICAS.some(g => lower.includes(g));
}

// NUEVA A — corrige tiempo verbal y concordancia de género/número en textos generados
export function sanitizarNarrativa(texto: string, contexto: { diaDelMes: number; diasEnMes: number }): string {
  let t = texto;
  if (contexto.diaDelMes < contexto.diasEnMes * 0.9) {
    t = t
      .replace(/\bcerró el mes con\b/g, 'lleva en el mes')
      .replace(/\bcerró\b/g, 'lleva')
      .replace(/\bel mes fue\b/g, 'el mes va siendo')
      .replace(/\bterminó\b/g, 'va')
      .replace(/\bresultó\b/g, 'va resultando');
  }
  // Concordancia singular/plural manejada en cada generador — no aplicar regex global
  // (el regex /(\w+s)/ matchea nombres propios como "Snacks" y rompe la concordancia)
  return t;
}

// NUEVA E — detecta si el texto repite valores que ya muestran las KPI cards
export function limitarRepeticionKPI(
  texto: string,
  kpiValues: { ventaYTD?: number; variacionYTD?: number; proyeccionMes?: number; cumplimientoMeta?: number }
): { tieneRepeticiones: boolean; valoresRepetidos: string[] } {
  const valoresRepetidos: string[] = [];
  const fmtNum = (n: number) => [
    `$${(n / 1_000_000).toFixed(1)}M`, `$${(n / 1_000).toFixed(1)}k`,
    `$${Math.round(n)}`, n.toLocaleString('es'),
  ];
  if (kpiValues.ventaYTD != null && fmtNum(kpiValues.ventaYTD).some(f => texto.includes(f))) {
    valoresRepetidos.push(`ventaYTD(${kpiValues.ventaYTD})`);
  }
  if (kpiValues.variacionYTD != null) {
    const pct = `${kpiValues.variacionYTD > 0 ? '+' : ''}${kpiValues.variacionYTD.toFixed(1)}%`;
    if (texto.includes(pct)) valoresRepetidos.push(`variacionYTD(${pct})`);
  }
  return { tieneRepeticiones: valoresRepetidos.length > 0, valoresRepetidos };
}

// ═══════════════════════════════════════
// GRUPO 8: Integración de Datos
// ═══════════════════════════════════════

export function formatearImpacto(valor: number, hasVentaNeta: boolean, simboloMoneda = '$'): string {
  if (hasVentaNeta) {
    if (Math.abs(valor) >= 1_000_000) return `${simboloMoneda}${(valor / 1_000_000).toFixed(1)}M`;
    if (Math.abs(valor) >= 1_000)     return `${simboloMoneda}${(valor / 1_000).toFixed(1)}k`;
    return `${simboloMoneda}${Math.round(valor)}`;
  }
  return `${valor.toLocaleString('es')} uds`;
}

export function evaluarIntegracionInventario(
  producto: string,
  inventory: Array<{ producto: string; categoria: string; unidades: number }>,
  ventasMensualesPromedio: number
): { stockActual: number; mesesCobertura: number; sinStock: boolean; sobrestock: boolean } | null {
  if (!inventory?.length) return null;
  const item = inventory.find(i => i.producto === producto);
  if (!item) return null;
  const stockActual = item.unidades;
  const mesesCobertura = ventasMensualesPromedio > 0
    ? stockActual / ventasMensualesPromedio
    : stockActual === 0 ? 0 : Number.POSITIVE_INFINITY;
  return { stockActual, mesesCobertura, sinStock: stockActual === 0, sobrestock: mesesCobertura > 6 };
}

export function evaluarIntegracionMetas(
  vendedor: string,
  metas: Array<{ mes: number; anio: number; vendedor: string; meta: number; meta_uds: number; meta_usd: number; tipo_meta: string }>,
  fechaRef: Date,
  ventaActualMes: number,
  ventaUltimos7Dias = 0
): { metaMes: number; cumplimiento: number; gap: number; proyeccion: number; proyeccionReciente: number; tipoMeta: string } | null {
  if (!metas?.length) return null;
  const mes = fechaRef.getMonth() + 1;
  const anio = fechaRef.getFullYear();
  const meta = metas.find(m => m.vendedor === vendedor && m.anio === anio && m.mes === mes);
  if (!meta) return null;
  const tipoMeta = meta.tipo_meta || 'uds';
  const metaMes = tipoMeta === 'usd' ? meta.meta_usd : (meta.meta_uds || meta.meta);
  if (!metaMes || metaMes <= 0) return null;
  const cumplimiento = (ventaActualMes / metaMes) * 100;
  const gap = metaMes - ventaActualMes;
  const dia = calcularDiaDelMes(fechaRef);
  const diasMes = calcularDiasEnMes(fechaRef);
  const proyeccion = dia > 0 ? (ventaActualMes / dia) * diasMes : 0;
  const proyeccionReciente = ventaUltimos7Dias > 0 ? (ventaUltimos7Dias / 7) * diasMes : 0;
  return { metaMes, cumplimiento, gap, proyeccion, proyeccionReciente, tipoMeta };
}

export function calcularDiasEnMes(fecha: Date): number {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
}

export function calcularDiaDelMes(fecha: Date): number {
  return fecha.getDate();
}

export const FORMATO = {
  moneda: (valor: number, hasVentaNeta: boolean): string => formatearImpacto(valor, hasVentaNeta),
  porcentaje: (valor: number): string => `${Math.round(valor)}%`,
  numero: (valor: number): string => valor.toLocaleString('es'),
} as const;

// ═══════════════════════════════════════
// GRUPO 9: Pipeline
// ═══════════════════════════════════════

export function resolverContradiccion(
  candidatos: Array<{
    entityType?: string; entityId?: string;
    __impactoAbs?: number;
    titulo?: string; descripcion?: string;
    señalesConvergentes?: number;
    cruces?: string[]; __crucesCount?: number;
    contextoAdicional?: string[];
  }>
): typeof candidatos {
  const porEntidad = new Map<string, typeof candidatos>();
  candidatos.forEach(c => {
    const key = `${c.entityType || 'x'}-${c.entityId || 'x'}`;
    if (!porEntidad.has(key)) porEntidad.set(key, []);
    porEntidad.get(key)!.push(c);
  });
  const resultado: typeof candidatos = [];
  porEntidad.forEach(grupo => {
    if (grupo.length === 1) { resultado.push(grupo[0]); return; }
    const mejor = grupo.reduce((a, b) => Math.abs(a.__impactoAbs || 0) > Math.abs(b.__impactoAbs || 0) ? a : b);
    mejor.señalesConvergentes = grupo.length;
    mejor.cruces = [...new Set(grupo.flatMap(g => g.cruces || []))];
    mejor.__crucesCount = mejor.cruces.length;
    mejor.contextoAdicional = grupo.filter(g => g !== mejor).map(g => g.titulo || (g.descripcion || '').substring(0, 80));
    resultado.push(mejor);
  });
  return resultado;
}

export function validarBalance(
  insights: { esPositivo: boolean }[]
): { balanceado: boolean; positivosFaltantes: number; sugerencia?: 'cap_negativos' } {
  const negativos = insights.filter(i => !i.esPositivo).length;
  const positivos = insights.filter(i => i.esPositivo).length;
  if (positivos === 0) return { balanceado: false, positivosFaltantes: 0, sugerencia: 'cap_negativos' };
  const positivosNecesarios = Math.ceil(negativos / 4);
  return { balanceado: positivos >= positivosNecesarios, positivosFaltantes: Math.max(0, positivosNecesarios - positivos) };
}

// Disponible para conectar al pipeline; aún no se llama desde insightEngine.ts
export function validarInsight(
  candidato: {
    cruces?: string[]; __crucesCount?: number;
    __impactoAbs?: number; __esPositivo?: boolean;
    descripcion?: string; conclusion?: string;
    accion?: AccionConcreta;
    contrastePortafolio?: string | null;
    __esAccionable?: boolean;
    entityType?: string; entityId?: string;
    metaContext?: unknown; inventarioContext?: unknown;
  },
  config: {
    percentileRank?: number;
    comparacionTipo?: 'YTD' | 'MTD' | 'historico';
    diaDelMes: number;
  }
): { aprobado: boolean; razon?: string; maxPrioridad: PrioridadInsight; warnings: string[] } {
  const warnings: string[] = [];
  const cruceCount = candidato.cruces?.length ?? candidato.__crucesCount ?? 0;
  let maxPrio = determinarMaxPrioridad(config.percentileRank ?? 50);

  // C1: Cruce mínimo de tablas
  if (cruceCount < 2) return { aprobado: false, razon: 'Insuficiente cruce de tablas (mínimo 2)', maxPrioridad: maxPrio, warnings };
  if (maxPrio === 'CRITICA' && cruceCount < 3) maxPrio = 'ALTA';

  // Completitud de cruces vs disponibles
  // Solo aplica a insights de vendedor o producto — insights cruzados/hallazgos/departamento usan null → skip
  const et = (candidato.entityType?.includes('producto') || candidato.entityId?.startsWith('producto-'))
    ? 'producto'
    : (candidato.entityType?.includes('vendedor') || candidato.entityType === 'riesgo_meta' || candidato.entityType === 'riesgo_vendedor')
      ? 'vendedor'
      : null;
  const m = CRUCES_DISPONIBLES as unknown as Record<string, { directos: readonly string[]; conVentas: readonly string[]; conOtrasTablas: readonly string[] }>;
  const c = et ? m[et] : null;
  if (c) {
    const posibles = c.directos.length + c.conVentas.length + c.conOtrasTablas.length;
    if (posibles > 0 && cruceCount / posibles < 0.35 && (maxPrio === 'CRITICA' || maxPrio === 'ALTA')) {
      maxPrio = 'MEDIA';
      warnings.push('Cruces insuficientes vs disponibles — prioridad limitada a MEDIA');
    }
  }

  // C2: Cuantificación
  if (candidato.__impactoAbs == null || (candidato.__impactoAbs === 0 && !candidato.__esPositivo)) return { aprobado: false, razon: 'Sin impacto cuantificado', maxPrioridad: maxPrio, warnings };

  // C4: Descripción como proxy de causa (mín. 30 chars en lugar del campo causaIdentificada)
  if (!candidato.descripcion || candidato.descripcion.trim().length < 30) {
    return { aprobado: false, razon: 'Descripción insuficiente (mínimo 30 caracteres)', maxPrioridad: maxPrio, warnings };
  }
  if ((maxPrio === 'CRITICA' || maxPrio === 'ALTA') && !candidato.contrastePortafolio?.trim()) {
    maxPrio = 'MEDIA';
    warnings.push('Sin contraste de portafolio — prioridad bajada a MEDIA');
  }

  // C5: Comparación temporal
  const temporal = validarComparacionTemporal(config.comparacionTipo ?? 'YTD', config.diaDelMes, new Date());
  if (!temporal.valido) return { aprobado: false, razon: 'Comparación temporal inválida', maxPrioridad: maxPrio, warnings };
  if (temporal.confianza === 'muy_temprana' && (maxPrio === 'CRITICA' || maxPrio === 'ALTA')) maxPrio = 'MEDIA';

  // C6: Acción concreta
  if (candidato.accion && !validarAccionConcreta(candidato.accion)) {
    return { aprobado: false, razon: 'Acción no concreta (falta texto, entidades o respaldo numérico)', maxPrioridad: maxPrio, warnings };
  }

  // L1: Sin jerga técnica
  const camposTexto = [candidato.descripcion, candidato.conclusion || '', candidato.accion?.texto || '', candidato.contrastePortafolio || ''].join('\n');
  const jerga = contieneJerga(camposTexto);
  if (jerga.tieneJerga) {
    return { aprobado: false, razon: `Contiene jerga técnica prohibida: ${jerga.terminosEncontrados.join(', ')}`, maxPrioridad: maxPrio, warnings };
  }

  // L2: Conclusión válida
  if (candidato.conclusion && !esConclusionValida(candidato.conclusion)) {
    return { aprobado: false, razon: 'Conclusión vacía o genérica (debe interpretar, no repetir)', maxPrioridad: maxPrio, warnings };
  }

  // L3: Descripción como narrativa (ya verificada en C4)

  // I1/I2: Warnings de integración
  if (et === 'producto' && candidato.inventarioContext === null) warnings.push('Producto sin cruce de inventario verificado');
  if (et === 'vendedor' && candidato.metaContext === null) warnings.push('Vendedor sin cruce de meta verificado');

  // F1 final: accionable
  if (candidato.__esAccionable === false && (maxPrio === 'CRITICA' || maxPrio === 'ALTA')) {
    maxPrio = 'MEDIA';
    warnings.push('No accionable — prioridad limitada a MEDIA');
  }

  return { aprobado: true, maxPrioridad: maxPrio, warnings };
}

// ═══════════════════════════════════════════════════════════════
// GRUPO YoY (Fase 5A): Ventanas temporales con control de estacionalidad
// ═══════════════════════════════════════════════════════════════
// Ver docs/MANIFIESTO-MOTOR-INSIGHTS.md v1.3 — secciones 5, 7, 10.
// Toda comparación de crecimiento es Year-over-Year: período actual vs
// mismo período del año anterior. Prohibido mes-a-mes como comparación.

export const COMPARACIONES_PERMITIDAS = {
  YOY_MTD:     'yoy_mtd',     // MTD actual vs mismo MTD año anterior
  YOY_YTD:     'yoy_ytd',     // YTD actual vs mismo YTD año anterior
  TREND_MOVIL: 'trend_movil', // trayectoria sobre 3+ meses (no compara 2 puntos)
} as const;

export type ComparacionTipo = typeof COMPARACIONES_PERMITIDAS[keyof typeof COMPARACIONES_PERMITIDAS];

function parseFechaFlexible(f: string | Date): Date {
  return f instanceof Date ? f : new Date(f);
}

/** MTD actual: [día 1 del mes, hoy inclusive]. */
export function getRangoMTD(fechaRefISO: string | Date): { desde: Date; hasta: Date } {
  const hoy = parseFechaFlexible(fechaRefISO);
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
  return { desde, hasta };
}

/** MTD comparable YoY: mismo período del mes en el año anterior, recortado a día equivalente.
 *  Maneja años bisiestos: si hoy es 29 feb y el año anterior no es bisiesto, recorta al 28. */
export function getRangoMTDComparableYoY(fechaRefISO: string | Date): { desde: Date; hasta: Date } {
  const hoy = parseFechaFlexible(fechaRefISO);
  const yearAnt = hoy.getFullYear() - 1;
  const mes = hoy.getMonth();
  const diasEnMesAnt = new Date(yearAnt, mes + 1, 0).getDate();
  const diaComparable = Math.min(hoy.getDate(), diasEnMesAnt);
  const desde = new Date(yearAnt, mes, 1);
  const hasta = new Date(yearAnt, mes, diaComparable, 23, 59, 59);
  return { desde, hasta };
}

/** YTD actual: [1 ene año actual, hoy inclusive]. */
export function getRangoYTD(fechaRefISO: string | Date): { desde: Date; hasta: Date } {
  const hoy = parseFechaFlexible(fechaRefISO);
  const desde = new Date(hoy.getFullYear(), 0, 1);
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
  return { desde, hasta };
}

/** YTD comparable YoY: [1 ene año anterior, mismo día equivalente del año anterior]. */
export function getRangoYTDComparableYoY(fechaRefISO: string | Date): { desde: Date; hasta: Date } {
  const hoy = parseFechaFlexible(fechaRefISO);
  const yearAnt = hoy.getFullYear() - 1;
  const mes = hoy.getMonth();
  const diasEnMesAnt = new Date(yearAnt, mes + 1, 0).getDate();
  const diaComparable = Math.min(hoy.getDate(), diasEnMesAnt);
  const desde = new Date(yearAnt, 0, 1);
  const hasta = new Date(yearAnt, mes, diaComparable, 23, 59, 59);
  return { desde, hasta };
}

/** Filtra registros por rango de fechas [desde, hasta] inclusivo. */
export function filtrarPorRango<T extends { fecha: string | Date }>(
  data: T[],
  rango: { desde: Date; hasta: Date },
): T[] {
  return data.filter(r => {
    const f = parseFechaFlexible(r.fecha);
    return f >= rango.desde && f <= rango.hasta;
  });
}

/** ¿Hay al menos 1 transacción en el rango MTD YoY comparable? */
export function tieneDatosYoY<T extends { fecha: string | Date }>(
  data: T[],
  fechaRefISO: string | Date,
): boolean {
  const rango = getRangoMTDComparableYoY(fechaRefISO);
  return filtrarPorRango(data, rango).length > 0;
}

/** Cuenta meses únicos (year-month) con al menos un registro. */
export function mesesDisponiblesConData<T extends { fecha: string | Date }>(
  data: T[],
): number {
  const meses = new Set<string>();
  for (const r of data) {
    const f = parseFechaFlexible(r.fecha);
    meses.add(`${f.getFullYear()}-${f.getMonth()}`);
  }
  return meses.size;
}

/**
 * V16 (Fase 5A): detecta referencias temporales prohibidas por P4 del manifiesto.
 * Candado anti-regresión de la regla 48: bullets con "mes anterior", "mes pasado",
 * "período anterior" o "respecto al mes" deben descartarse y reemplazarse por
 * referencia YoY ("mismo período del año anterior") o por tendencia móvil.
 */
export function tieneReferenciaTemporalProhibida(texto: string): boolean {
  const patrones = [
    /\bmes anterior\b/i,
    /\bmes pasado\b/i,
    /\bper[ií]odo anterior\b/i,
    /\brespecto al mes\b/i,
    /\bel mes previo\b/i,
    /\bmes previo\b/i,
  ];
  return patrones.some(p => p.test(texto));
}

// ═══════════════════════════════════════════════════════════════
// GRUPO DORMIDOS (Fase 5B): Umbral configurable por usuario
// ═══════════════════════════════════════════════════════════════
// Ver docs/MANIFIESTO-MOTOR-INSIGHTS.md v1.4 — P6 y sección 18.
// Los dormidos compiten con cualquier otro insight por ranking de impacto.
// El umbral de "días sin comprar = dormido" lo fija el usuario (default 45,
// rango 15–180) vía input en ClientesPage, persistido en localStorage.

export const DIAS_DORMIDO_DEFAULT = 45;
export const DIAS_DORMIDO_MIN     = 15;
export const DIAS_DORMIDO_MAX     = 180;
export const LOCAL_STORAGE_KEY_DIAS_DORMIDO = 'salesflow.dias_dormido';

/** Lee el umbral de días-dormido del usuario desde localStorage.
 *  Si no hay override, retorna DEFAULT con flag esDefault=true. */
export function getDiasDormidoUsuario(): { valor: number; esDefault: boolean } {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { valor: DIAS_DORMIDO_DEFAULT, esDefault: true };
  }
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY_DIAS_DORMIDO);
  if (raw === null) return { valor: DIAS_DORMIDO_DEFAULT, esDefault: true };
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < DIAS_DORMIDO_MIN || n > DIAS_DORMIDO_MAX) {
    return { valor: DIAS_DORMIDO_DEFAULT, esDefault: true };
  }
  return { valor: n, esDefault: false };
}

export type ClasificacionDormido = {
  esDormido: boolean;
  diasSinComprar: number;
  frecuenciaHistoricaDias: number | null;
  impactoVentaHistorica: number;
};

/** Clasifica un cliente como dormido o no, basándose en su historial
 *  de ventas y el umbral configurable. La frecuencia histórica se
 *  calcula como media de intervalos entre compras consecutivas. */
export function clasificarDormido(
  ventasHistoricasCliente: Array<{ fecha: Date; monto: number }>,
  diasUmbral: number,
  hoy: Date,
): ClasificacionDormido {
  if (ventasHistoricasCliente.length === 0) {
    return { esDormido: false, diasSinComprar: 0, frecuenciaHistoricaDias: null, impactoVentaHistorica: 0 };
  }
  const ordenadasAsc = [...ventasHistoricasCliente].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const ultima = ordenadasAsc[ordenadasAsc.length - 1].fecha;
  const diasSinComprar = Math.floor((hoy.getTime() - ultima.getTime()) / 86400000);
  let frecuenciaHistoricaDias: number | null = null;
  if (ordenadasAsc.length >= 2) {
    const diffs: number[] = [];
    for (let i = 1; i < ordenadasAsc.length; i++) {
      const d = (ordenadasAsc[i].fecha.getTime() - ordenadasAsc[i - 1].fecha.getTime()) / 86400000;
      if (d > 0) diffs.push(d);
    }
    if (diffs.length > 0) frecuenciaHistoricaDias = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }
  const impactoVentaHistorica = ventasHistoricasCliente.reduce((acc, v) => acc + v.monto, 0);
  return {
    esDormido: diasSinComprar >= diasUmbral,
    diasSinComprar,
    frecuenciaHistoricaDias,
    impactoVentaHistorica,
  };
}

// ═══════════════════════════════════════
// GRUPO 9: Filtros de calidad del ranking
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// GRUPO 10: Accionabilidad (PR-2)
// ═══════════════════════════════════════

// [PR-2] Contexto pre-calculado una sola vez en candidatesToDiagnosticBlocks antes del loop.
export interface ContextoInsights {
  vendorAnalysis: VendorAnalysis[]
  diasRestantesMes: number  // [0, diasTotalesMes] — para urgencia temporal en PR-3
}

// [PR-2] Calcula impacto recuperable para bloques vendor-* (legacy engine).
// Los bloques ie-* reciben su recuperable inline durante la construcción del bloque.
// Retorna null/null para cualquier tipo no reconocido (degradación limpia).
export function calcularImpactoRecuperable(
  insight: DiagnosticBlock,
  contexto: ContextoInsights,
): { monto: number | null; pct: number | null } {
  if (!insight.id.startsWith('vendor-')) return { monto: null, pct: null }

  const vendedorNombre = insight.id.slice('vendor-'.length)
  const va = contexto.vendorAnalysis.find(v => v.vendedor === vendedorNombre)
  if (!va) return { monto: null, pct: null }

  const promedio3m = va.promedio_3m ?? null
  if (promedio3m == null) return { monto: null, pct: null }

  const monto = Math.max(0, promedio3m - va.ventas_periodo)
  if (monto <= 0) return { monto: null, pct: null }  // vendedor no estancado

  const base = typeof insight.impactoUSD === 'number' && insight.impactoUSD > 0
    ? insight.impactoUSD : null
  const pct = base != null ? Math.min(1.2, monto / base) : null

  return { monto, pct }
}

// ═══════════════════════════════════════
// GRUPO 11: Urgencia temporal + Priority score (PR-3)
// ═══════════════════════════════════════

// [PR-3] Escalones discretos de urgencia. Exportado para tests.
export const URGENCIA_TABLA = [
  { diasMax: 7,   score: 1.0 },
  { diasMax: 30,  score: 0.7 },
  { diasMax: 90,  score: 0.4 },
  { diasMax: 180, score: 0.2 },
] as const

// [PR-3] Retorna urgencia en [0, 1] a partir de la ventana temporal más específica disponible.
// Si no hay ningún dato → 0.1 (sin dato).
export function calcularUrgenciaTemporal(
  input: { ventanaDias?: number; fechaLimite?: Date; diasCobertura?: number },
): number {
  // Prioridad: diasCobertura > ventanaDias derivado de fechaLimite > ventanaDias directo
  let dias: number | undefined
  if (typeof input.diasCobertura === 'number') {
    dias = input.diasCobertura
  } else if (input.fechaLimite instanceof Date) {
    dias = Math.max(0, Math.ceil((input.fechaLimite.getTime() - Date.now()) / 86_400_000))
  } else if (typeof input.ventanaDias === 'number') {
    dias = input.ventanaDias
  }
  if (dias == null) return 0.1
  dias = Math.max(0, dias)
  for (const escala of URGENCIA_TABLA) {
    if (dias <= escala.diasMax) return escala.score
  }
  return 0.1  // > 180 días o sin dato
}

// [PR-3] Priority score = recuperable × urgencia. 0 si cualquiera es null.
export function calcularPriorityScore(
  insight: Pick<DiagnosticBlock, 'impacto_recuperable' | 'urgencia_temporal'>,
): number {
  if (insight.impacto_recuperable == null) return 0
  if (insight.urgencia_temporal   == null) return 0
  return insight.impacto_recuperable * insight.urgencia_temporal
}

// ═══════════════════════════════════════
// GRUPO 12: Agrupación ligera pre-chaining (PR-5)
// ═══════════════════════════════════════

// [PR-5] Mapas de pluralización y verbos de grupo para el headline del padre.
const _PLURAL: Readonly<Record<string, string>> = {
  vendedor: 'vendedores', cliente: 'clientes', producto: 'productos',
  categoria: 'categorías', canal: 'canales', departamento: 'departamentos',
}
const _VERBO: Readonly<Record<string, string>> = {
  'vendor|neg':           'estancados',
  'change|neg':           'en caída',
  'change|pos':           'con crecimiento',
  'contribution|neg':     'con menor contribución',
  'contribution|pos':     'con mayor contribución',
  'trend|neg':            'con tendencia bajista',
  'trend|pos':            'con tendencia al alza',
  'cliente_dormido|neg':  'dormidos',
  'meta_gap|neg':         'lejos de meta',
}
const _SEV_PESO: Readonly<Record<string, number>> = {
  critical: 4, warning: 3, info: 2, positive: 1,
}

function _extractTipoDim(b: DiagnosticBlock): { tipo: string; dimension: string } | null {
  // [PR-M4d/M4c] Outliers y seasonality NUNCA entran a group-* — quedan como
  // cards individuales en el ranking. Ver docs/PR-M4b-audit.md §3.b y §4.2.
  // Razón: el mecanismo group-* hace suma aritmética de impactoUSD (L1087-1088),
  // lo que convierte un bucket de detectores cross-engine en un artefacto
  // estadístico sin semántica operativa. La señal individual del detector
  // (z-score, seasonal_strength) se preserva mejor mostrando cada candidato
  // como bloque independiente.
  if (b.id.includes('-outlier-')     || b.id.startsWith('xe-outlier-'))     return null
  if (b.id.includes('-seasonality-') || b.id.startsWith('xe-seasonality-')) return null
  if (b.id.startsWith('vendor-')) return { tipo: 'vendor', dimension: 'vendedor' }
  const m = b.id.match(/^ie-([^-]+)-(.+?)-\d+$/)
  if (m) return { tipo: m[2], dimension: m[1] }
  return null
}

function _getDir(b: DiagnosticBlock): 'neg' | 'pos' | 'info' {
  // [Z.13.V-2] Inspeccionar block.direccion ANTES de severity. Caso runtime:
  // María Castillo (sobrecumpl 163%) y Roberto Cruz (sobrecumpl 207%) tienen
  // severity 'info' (post Z.13.V-1) pero direccion='positivo' o el candidate
  // tiene direction='up'. Sin esta lectura, se agruparían con un Carlos
  // (direction='down') sólo porque ambos tenían severity 'info' o
  // similar — produciendo "X vendedores estancados" mezclando ganadores
  // y perdedores.
  if (b.direccion === 'positivo') return 'pos'
  if (b.direccion === 'recuperable') return 'neg'
  if (b.severity === 'positive') return 'pos'
  if (b.severity === 'critical' || b.severity === 'warning') return 'neg'
  return 'info'
}

// [PR-5] Colapsa bloques redundantes en un padre agregado.
// Retorna pool completo: padres + hijos marcados con parent_id.
// El ranking downstream debe filtrar bloques con parent_id != null.
export function agruparInsightsRedundantes(pool: DiagnosticBlock[]): DiagnosticBlock[] {
  // Clave = tipo|dimension|direction|periodo
  const buckets = new Map<string, DiagnosticBlock[]>()
  for (const b of pool) {
    const td = _extractTipoDim(b)
    if (!td) continue
    const dir    = _getDir(b)
    const period = b.metadataBadges?.[1] ?? 'Mes actual'
    const key    = `${td.tipo}|${td.dimension}|${dir}|${period}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(b)
  }

  const grouped = new Set<string>()
  const parents: DiagnosticBlock[] = []
  const childrenWithParent: DiagnosticBlock[] = []

  for (const [key, members] of buckets) {
    if (members.length < 2) continue  // no agrupar singletons

    const [tipo, dimension, dir] = key.split('|')
    const N      = members.length
    const plural = _PLURAL[dimension] ?? `${dimension}s`
    const verbo  = _VERBO[`${tipo}|${dir}`] ?? 'con alerta'

    // Worst severity
    const worstSev = members.reduce<string>(
      (w, b) => (_SEV_PESO[b.severity] ?? 0) > (_SEV_PESO[w] ?? 0) ? b.severity : w,
      members[0].severity,
    ) as DiagnosticBlock['severity']

    // [PR-0.1] Impacto USD: suma solo de miembros monetarios (no_monetary=false).
    // Los non_monetary no deben sumarse al totalImpact del header aunque tengan impactoUSD.
    const impactoUSD = members.reduce((s, b) =>
      s + (!b.non_monetary && typeof b.impactoUSD === 'number' ? b.impactoUSD : 0), 0)

    // [PR-2.1c] Recuperable: suma parcial de miembros con direccion='recuperable'.
    // (Incluye miembros sin direccion declarada como fallback monetario.)
    const recSum = members.reduce((s, b) => {
      if (b.non_monetary) return s
      if (b.direccion && b.direccion !== 'recuperable') return s
      return s + (b.impacto_recuperable ?? 0)
    }, 0)
    const recMonto = recSum > 0 ? recSum : null
    // [PR-2.1c] Dirección del grupo: recuperable si algún hijo es recuperable;
    //   si no, positivo si todos son positivo; si no, neutral.
    const _hasRec = members.some(b => b.direccion === 'recuperable')
    const _allPos = members.every(b => b.direccion === 'positivo')
    const _parentDireccion: 'recuperable' | 'positivo' | 'neutral' =
      _hasRec ? 'recuperable' : _allPos ? 'positivo' : 'neutral'

    // Urgencia: max de hijos (ya calculada en validScored.map())
    const urgMax = members.reduce(
      (mx, b) => Math.max(mx, b.urgencia_temporal ?? 0), 0)
    const urgencia = urgMax > 0 ? urgMax : null

    const priorityScore = recMonto != null && urgencia != null
      ? recMonto * urgencia : 0

    // Hash determinístico del grupo
    const hashSrc = members.map(b => b.id).sort().join('|')
    let h = 0
    for (const ch of hashSrc) h = (h * 31 + ch.charCodeAt(0)) & 0x7fffffff
    const parentId = `group-${tipo}-${h.toString(36)}`

    const parent: DiagnosticBlock = {
      id:           parentId,
      severity:     worstSev,
      headline:     `${N} ${plural} ${verbo}`,
      summaryShort: `${N} ${plural} ${verbo} este período — impacto combinado.`,
      sections: [{
        label: 'Contexto',
        type:  'bullet',
        items: members.map(b => b.headline ?? b.id),
      }],
      links:        members.flatMap(b => b.links  ?? []),
      insightIds:   members.flatMap(b => b.insightIds ?? []),
      impactoTotal: null,
      impactoLabel: null,
      impactoUSD,
      metadataBadges:          members[0].metadataBadges,
      non_monetary:            members.every(b => b.non_monetary === true),
      impacto_recuperable:     recMonto,
      impacto_recuperable_pct: null,
      urgencia_temporal:       urgencia,
      priority_score:          priorityScore,
      parent_id:               null,
      chain:                   null,
      direccion:               _parentDireccion,   // [PR-2.1c]
      _dimension:              dimension,          // [PR-6.1b]
    }

    parents.push(parent)
    for (const b of members) {
      grouped.add(b.id)
      childrenWithParent.push({ ...b, parent_id: parentId })
    }
  }

  // Ungrouped blocks pasan sin cambios
  const ungrouped = pool.filter(b => !grouped.has(b.id))

  if (import.meta.env.DEV && parents.length > 0) {
    // [PR-5] audit log vive en el caller (insight-engine.ts)
    void parents
  }

  return [...ungrouped, ...parents, ...childrenWithParent]
}

// ═══════════════════════════════════════
// GRUPO 13: Insight chaining (PR-6)
// ═══════════════════════════════════════

// [PR-6] Dimension hierarchy from most general to most specific.
export const JERARQUIA_INSIGHTS = [
  'meta', 'vendedor', 'zona', 'canal', 'cliente', 'categoria', 'producto',
] as const

// [PR-6.1b] Mapeo explícito prefijo → dimensión canónica.
// Prioridad: b._dimension (poblado por el engine) > match por prefijo.
// [PR-D1] 'departamento' / 'region' → 'zona' (sinónimos operacionales en el dominio).
//   La normalización se aplica tanto al _dimension explícito como al parseo por prefijo.
//   No mutamos el campo original — solo devolvemos el nivel jerárquico canónico.
const ZONA_ALIASES = new Set(['departamento', 'region', 'zona'])

export function dimensionDeBlock(b: DiagnosticBlock): string {
  if (b._dimension) return ZONA_ALIASES.has(b._dimension) ? 'zona' : b._dimension
  const id = b.id
  if (id.startsWith('vendor-') || id.startsWith('group-vendor-') || id.startsWith('ie-vendedor-')) return 'vendedor'
  if (id.startsWith('ie-cliente-') || id.startsWith('group-trend-')) return 'cliente'
  if (id.startsWith('ie-categoria-')) return 'categoria'
  if (id.startsWith('ie-producto-') || id.startsWith('productos')) return 'producto'
  if (id.startsWith('ie-meta-') || id.includes('meta_gap')) return 'meta'
  // [PR-D1] departamento/region tratados como zona
  if (id.startsWith('ie-departamento-') || id.startsWith('ie-zona-') || id.startsWith('ie-region-')) return 'zona'
  if (id.startsWith('ie-')) {
    const raw = id.split('-')[1] ?? ''
    return ZONA_ALIASES.has(raw) ? 'zona' : raw
  }
  return ''
}

function _nivelInsight(b: DiagnosticBlock): number {
  return (JERARQUIA_INSIGHTS as readonly string[]).indexOf(dimensionDeBlock(b))
}

// [PR-6.1b] Normalización canónica para comparar entidades (member ↔ pertenencia):
// trim + lowercase + remover diacríticos. Misma función en ambos lados.
export function normalizeEntity(s: string | null | undefined): string {
  if (!s) return ''
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// [PR-FIX.3-D] Contador module-level de rejects por sign mismatch — reseteado
// al inicio de construirInsightChains y expuesto vía getChainSignMismatchCount.
let _chainSignMismatchCount = 0
export function getChainSignMismatchCount(): number {
  return _chainSignMismatchCount
}

// [PR-6] Returns true if b causally explains a: deeper level, same direction,
// b._member belongs to a._member in the pertenencia index, and b has ≥10% of a's recuperable.
export function sonInsightsRelacionables(
  a: DiagnosticBlock,
  b: DiagnosticBlock,
  pertenencia: Map<string, Set<string>>,
): boolean {
  // [PR-M4c'] Seasonality es contextual/informativa, no forma cadenas causales.
  // Causa: PR-M4c runtime mostró chains 1→5 por seasonality vinculando productos
  // a través de _member sin semántica causal. Exclusión quirúrgica (más defensiva
  // que "neutral genérica" porque stock_excess, también neutral, sí puede chainear).
  if (a.id.includes('-seasonality-') || b.id.includes('-seasonality-')) return false
  if (a.id.startsWith('xe-seasonality-') || b.id.startsWith('xe-seasonality-')) return false
  // [PR-FIX.3-D] Evitar chains entre direcciones opuestas (recuperable ↔ positivo).
  // Un insight negativo no puede ser causado por uno positivo y viceversa. `neutral`
  // y dirección ausente son permisivos (preservan el comportamiento previo).
  const signsConflict = (
    (a.direccion === 'recuperable' && b.direccion === 'positivo') ||
    (a.direccion === 'positivo'    && b.direccion === 'recuperable')
  )
  if (signsConflict) {
    _chainSignMismatchCount++
    return false
  }
  const isNeg = (x: DiagnosticBlock) => x.severity === 'critical' || x.severity === 'warning'
  if (isNeg(a) !== isNeg(b)) return false
  const nivelA = _nivelInsight(a)
  const nivelB = _nivelInsight(b)
  if (nivelA < 0 || nivelB < 0 || nivelB <= nivelA) return false
  // [PR-6.1b] normalización aplicada simétricamente en ambos lados
  const memberA = normalizeEntity(a._member)
  const memberB = normalizeEntity(b._member)
  if (!memberA || !memberB) return false
  const parentSet = pertenencia.get(memberB)
  if (!parentSet?.has(memberA)) return false
  const recA = a.impacto_recuperable ?? 0
  const recB = b.impacto_recuperable ?? 0
  if (recB < recA * 0.1) return false
  return true
}

// [PR-6] DFS causal chain builder. Max depth 4, max width 3 per node.
// Only chains with ≥1 child nodo are returned.
export function construirInsightChains(
  insights: DiagnosticBlock[],
  pertenencia: Map<string, Set<string>>,
): DiagnosticBlockChain[] {
  const MAX_DEPTH = 4
  const MAX_WIDTH = 3
  // [PR-FIX.3-D] resetear contador de sign mismatch por invocación
  _chainSignMismatchCount = 0

  const roots = insights.filter(b => b.parent_id == null)

  function dfs(node: DiagnosticBlock, visited: Set<string>, depth: number): DiagnosticBlock[] {
    if (depth >= MAX_DEPTH) return []
    const children = insights
      .filter(b => !visited.has(b.id) && sonInsightsRelacionables(node, b, pertenencia))
      .slice(0, MAX_WIDTH)
    const nodos: DiagnosticBlock[] = []
    for (const child of children) {
      visited.add(child.id)
      nodos.push(child, ...dfs(child, visited, depth + 1))
    }
    return nodos
  }

  const chains: DiagnosticBlockChain[] = []
  for (const root of roots) {
    const visited = new Set<string>([root.id])
    const nodos = dfs(root, visited, 0)
    if (nodos.length > 0) {
      chains.push({ root_insight_id: root.id, nodos })
    }
  }
  return chains
}

// ═══════════════════════════════════════
// GRUPO 14: Blacklist de acciones genéricas (PR-4)
// ═══════════════════════════════════════

// [PR-4] Verbos de acción considerados demasiado genéricos para mostrar cuando hay
// un recuperable concreto. Comparar contra accion.verbo (case-sensitive).
export const ACCIONES_GENERICAS_BLACKLIST: readonly string[] = [
  'Reunirse',
  'Llamar',
  'Revisar inventario',
  'Contactar',
  'Revisar plan',
  'Mencionar en junta',
  'Acción',    // fallback del T1.5b — genérico por definición
  // [PR-D3] patrones residuales observados en DOM
  'Revisar inventario de',
  'Definir promoción o ajuste',
  'Revisar el plan',
] as const

// ═══════════════════════════════════════
// GRUPO 16: Diversity pass (PR-M7c)
// ═══════════════════════════════════════
//
// ADITIVO sobre el ranker final. Garantiza que el top-N no quede ≥85% dominado
// por una sola métrica cuando existen candidatos descartados de métricas
// alternativas con score competitivo. Respeta ALWAYS_PROTECTED_CAPS y candidatos
// CRITICA (proxy del "$10k critical" mencionado en el spec, evaluable a nivel
// de candidato sin necesidad de computar impactoUSD downstream).

export const DIVERSITY_DOMINANCE_THRESHOLD = 0.85
export const MAX_DIVERSITY_SLOTS           = 3
export const DIVERSITY_MIN_SCORE_RATIO     = 0.35

export const NON_DOMINANT_METRICS: ReadonlySet<string> = new Set([
  'num_transacciones',
  'frecuencia_compra',
  'num_clientes_activos',
  'ticket_promedio',
  'precio_unitario',
  'cumplimiento_meta',
  'unidades',
])

// Tipos protegidos (espejo de ALWAYS_PROTECTED_CAPS en insight-engine.ts).
// No se duplica la fuente: el spec marca estos 3 como intocables por diversity.
const DIVERSITY_PROTECTED_TYPES: ReadonlySet<string> = new Set([
  'stock_risk', 'product_dead', 'migration',
])

export interface DiversityCandidateLike {
  metricId:      string
  insightTypeId: string
  member:        string
  score:         number
  severity:      'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'
}

export interface DiversityInjection {
  metric:             string
  insightType:        string
  score:              number
  displaced_block_id: string
}

export interface DiversityAudit {
  dominant_metric:    string
  dominant_ratio:     number
  triggered:          boolean
  slots_injected:     number
  injected_details:   DiversityInjection[]
  median_score_top:   number
}

/** Frecuencia por metricId; devuelve métrica dominante y su ratio sobre total. */
export function computeDominantMetric(
  blocks: DiversityCandidateLike[],
): { metric: string; ratio: number } {
  if (blocks.length === 0) return { metric: '', ratio: 0 }
  const count = new Map<string, number>()
  for (const b of blocks) count.set(b.metricId, (count.get(b.metricId) ?? 0) + 1)
  let winner = ''
  let max    = 0
  for (const [m, n] of count) {
    if (n > max) { max = n; winner = m }
  }
  return { metric: winner, ratio: max / blocks.length }
}

/** Mediana del score (sin mutar el array). */
function _medianScore(blocks: DiversityCandidateLike[]): number {
  if (blocks.length === 0) return 0
  const sorted = blocks.map(b => b.score).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * [PR-M7c] Diversity pass ADITIVO. Muta `ranked` in-place reemplazando hasta
 * MAX_DIVERSITY_SLOTS candidatos del grupo dominante por candidatos descartados
 * de métricas no-dominantes con score competitivo. No-op si dominante < 85% o
 * no hay candidates en `discarded` que cumplan el umbral mínimo.
 *
 * Reglas:
 *  - Solo dispara si dominant.ratio ≥ DIVERSITY_DOMINANCE_THRESHOLD.
 *  - Candidato no-dominante debe estar en NON_DOMINANT_METRICS y tener
 *    score ≥ medianScore(ranked) * DIVERSITY_MIN_SCORE_RATIO.
 *  - Desplaza del ranked el candidato del grupo dominante con menor score que
 *    NO sea CRITICA y NO pertenezca a DIVERSITY_PROTECTED_TYPES.
 *  - Si no hay candidato desplazable → no inyecta (early break).
 *
 * El identificador `displaced_block_id` se resuelve vía `buildBlockId(c)` si se
 * provee; en su defecto se compone "${dimension?}-${insightType}-${member}".
 */
export function applyDiversityPass<T extends DiversityCandidateLike>(
  ranked: T[],
  discarded: T[],
  audit: DiversityAudit,
  buildBlockId?: (c: T) => string,
): T[] {
  const { metric: dominant, ratio } = computeDominantMetric(ranked)
  audit.dominant_metric  = dominant
  audit.dominant_ratio   = ratio
  audit.median_score_top = _medianScore(ranked)
  audit.triggered        = false
  audit.slots_injected   = 0
  audit.injected_details = []

  if (ratio < DIVERSITY_DOMINANCE_THRESHOLD) return ranked
  if (!dominant) return ranked

  const scoreGate   = audit.median_score_top * DIVERSITY_MIN_SCORE_RATIO
  const pool = discarded
    .filter(c =>
      c.metricId !== dominant &&
      NON_DOMINANT_METRICS.has(c.metricId) &&
      c.score >= scoreGate,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DIVERSITY_SLOTS)

  if (pool.length === 0) return ranked

  const _bid = buildBlockId ?? ((c: T) => `${c.insightTypeId}-${c.member || ''}`)

  for (const injectee of pool) {
    // Encontrar el candidato desplazable del grupo dominante con menor score.
    let victimIdx   = -1
    let victimScore = Infinity
    for (let i = 0; i < ranked.length; i++) {
      const v = ranked[i]
      if (v.metricId !== dominant) continue
      if (v.severity === 'CRITICA') continue
      if (DIVERSITY_PROTECTED_TYPES.has(v.insightTypeId)) continue
      if (v.score < victimScore) { victimScore = v.score; victimIdx = i }
    }
    if (victimIdx === -1) break
    const displaced = ranked[victimIdx]
    ranked.splice(victimIdx, 1, injectee)
    audit.injected_details.push({
      metric:             injectee.metricId,
      insightType:        injectee.insightTypeId,
      score:              Math.round(injectee.score * 1000) / 1000,
      displaced_block_id: _bid(displaced),
    })
    audit.slots_injected++
    audit.triggered = true
  }

  return ranked
}

// ═══════════════════════════════════════
// GRUPO 17: Score normalization por métrica (PR-M7e)
// ═══════════════════════════════════════
//
// Iguala la escala de score entre métricas antes del ranker regular. Sin esta
// normalización, los builders venta (impacto monetario relativo) devuelven
// scores típicamente ≥0.85 mientras builders no-monetary (z-score/4) rara vez
// superan 0.75, haciendo estructuralmente imposible que sobrevivan al cap.
//
// Aplica min-max por metricId sobre un pool (generalmente _regularCands en
// insight-engine.ts). Preserva el score original en `score_raw`. El ranker
// consume el `score` (reescrito) pero auditoría conserva el valor previo.

export interface NormalizableCandidate {
  metricId:         string
  score:            number
  score_raw?:       number
  score_normalized?: number
}

export interface NormalizationGroupStat {
  metric:     string
  population: number
  min_raw:    number
  max_raw:    number
  normalized: boolean
}

export interface NormalizationAudit {
  metric_groups:          NormalizationGroupStat[]
  candidates_normalized:  number
  candidates_passthrough: number
}

/**
 * [PR-M7e] Normaliza score por metricId sobre el array entregado. Mutación
 * in-place (mismo array, mismas referencias). Population < 3 → passthrough
 * (score queda como estaba, normalized=false). min===max → passthrough con
 * score=0.5 evitando NaN.
 */
export function applyScoreNormalizationByMetric<T extends NormalizableCandidate>(
  candidates: T[],
  audit: NormalizationAudit,
): T[] {
  if (!candidates || candidates.length === 0) return candidates
  const byMetric = new Map<string, T[]>()
  for (const c of candidates) {
    const arr = byMetric.get(c.metricId) ?? []
    arr.push(c)
    byMetric.set(c.metricId, arr)
  }

  for (const [metric, group] of byMetric) {
    let minRaw = Infinity
    let maxRaw = -Infinity
    for (const c of group) {
      if (c.score < minRaw) minRaw = c.score
      if (c.score > maxRaw) maxRaw = c.score
    }
    const population = group.length

    if (population < 3) {
      // Passthrough: no hay base estadística.
      for (const c of group) {
        c.score_raw        = c.score
        c.score_normalized = c.score
      }
      audit.metric_groups.push({
        metric, population, min_raw: minRaw, max_raw: maxRaw, normalized: false,
      })
      audit.candidates_passthrough += population
      continue
    }

    if (maxRaw === minRaw) {
      // Distribución colapsada — asignar score neutral 0.5.
      for (const c of group) {
        c.score_raw        = c.score
        c.score_normalized = 0.5
        c.score            = 0.5
      }
      audit.metric_groups.push({
        metric, population, min_raw: minRaw, max_raw: maxRaw, normalized: false,
      })
      audit.candidates_passthrough += population
      continue
    }

    const range = maxRaw - minRaw
    for (const c of group) {
      const norm = (c.score - minRaw) / range
      c.score_raw        = c.score
      c.score_normalized = norm
      c.score            = norm
    }
    audit.metric_groups.push({
      metric, population, min_raw: minRaw, max_raw: maxRaw, normalized: true,
    })
    audit.candidates_normalized += population
  }

  return candidates
}

// ═══════════════════════════════════════
// GRUPO 15: Cross-metric narrative enrichment (PR-M6.A)
// ═══════════════════════════════════════
//
// Aprovecha candidates del pool pre-ranking para enriquecer el POR QUÉ IMPORTA
// de cards seleccionadas — MISMA entidad, MISMA dirección de signo, OTRAS
// métricas. Función pura: sin efectos, sin throws, degradación silenciosa.
// Wireup en insight-engine.ts (runInsightEngine, tras construir selected[]).

export interface CrossMetricInsightLike {
  metricId:      string
  dimensionId:   string
  insightTypeId: string
  member:        string
  detail:        Record<string, unknown>
}

const CROSS_METRIC_ELIGIBLE_TYPES: ReadonlySet<string> = new Set([
  'trend', 'change', 'contribution',
])

const CROSS_METRIC_LABEL_MAP: Record<string, string> = {
  venta:                'venta',
  unidades:             'unidades',
  ticket_promedio:      'ticket promedio',
  precio_unitario:      'precio unitario',
  num_transacciones:    'número de transacciones',
  num_clientes_activos: 'clientes activos',
  cumplimiento_meta:    'cumplimiento de meta',
  frecuencia_compra:    'frecuencia de compra',
}

// Deriva dirección del insight a partir del detail del detector.
function crossMetricGetSign(ins: CrossMetricInsightLike): 'up' | 'down' | null {
  const d = ins.detail ?? {}
  if (ins.insightTypeId === 'trend') {
    const dir = (d as { direction?: string }).direction
    if (dir === 'up') return 'up'
    if (dir === 'down') return 'down'
    return null
  }
  if (ins.insightTypeId === 'change') {
    const pct = (d as { pctChange?: number }).pctChange
    if (typeof pct !== 'number' || !isFinite(pct) || pct === 0) return null
    return pct > 0 ? 'up' : 'down'
  }
  if (ins.insightTypeId === 'contribution') {
    const tc = (d as { totalChange?: number }).totalChange
    if (typeof tc !== 'number' || !isFinite(tc) || tc === 0) return null
    return tc > 0 ? 'up' : 'down'
  }
  return null
}

// Magnitud % firmada (trend/change) o aporte monetario (contribution). Usada
// para ordenar snippets (|valor| DESC) y para formatear el delta.
function crossMetricGetPctChange(ins: CrossMetricInsightLike): number | null {
  const d = ins.detail ?? {}
  if (ins.insightTypeId === 'trend') {
    const pct = (d as { pctChange?: number }).pctChange
    if (typeof pct !== 'number' || !isFinite(pct)) return null
    // trend.pctChange viene como fracción (0.15); normalizar a %
    return pct * 100
  }
  if (ins.insightTypeId === 'change') {
    const pct = (d as { pctChange?: number }).pctChange
    if (typeof pct !== 'number' || !isFinite(pct)) return null
    return pct
  }
  if (ins.insightTypeId === 'contribution') {
    const d2 = d as { memberValue?: number; memberPrevValue?: number; contributionPct?: number }
    if (typeof d2.memberValue === 'number' && typeof d2.memberPrevValue === 'number' && d2.memberPrevValue > 0) {
      return ((d2.memberValue - d2.memberPrevValue) / d2.memberPrevValue) * 100
    }
    if (typeof d2.contributionPct === 'number' && isFinite(d2.contributionPct)) return d2.contributionPct
    return null
  }
  return null
}

// Texto del delta listo para snippet ("+15.0%", "$8 adicionales", etc.)
function crossMetricFormatDelta(ins: CrossMetricInsightLike): string {
  const pct = crossMetricGetPctChange(ins)
  if (pct === null) return ''
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

// Verbo concordante con el signo. Preserva invariantes de género/número simples.
function crossMetricVerb(sign: 'up' | 'down', metricId: string): string {
  // cumplimiento_meta/precio_unitario/ticket_promedio/frecuencia_compra → singular
  const subida = metricId === 'unidades' || metricId === 'num_clientes_activos' || metricId === 'num_transacciones'
    ? (sign === 'up' ? 'aumentaron' : 'disminuyeron')
    : (sign === 'up' ? 'aumentó' : 'disminuyó')
  return subida
}

/**
 * [PR-M6.A] Enriquece el POR QUÉ IMPORTA de una card con contexto cruzado
 * de OTRAS métricas para la MISMA entidad y MISMA dirección de signo.
 *
 * Reglas:
 *  - Solo para tipos trend/change/contribution (narrativa comparable).
 *  - Entidad = (dimensionId, member) — match exacto.
 *  - Dirección de signo consistente (no mezclar crecimiento con caída).
 *  - Métricas distintas a la del insight origen.
 *  - Máximo 2 snippets, ordenados por |pctChange| DESC.
 *  - Si no hay candidates, contextSnippets = [] (degradación silenciosa).
 *
 * Función pura — NO muta insight ni candidatePool.
 */
export function enrichInsightWithCrossMetricContext(
  insight: CrossMetricInsightLike,
  candidatePool: CrossMetricInsightLike[],
  /** [PR-M6.A.1] Diagnóstico opcional — log por card para auditar pool vs entity match. */
  opts?: { diagnose?: boolean; cardId?: string },
): { contextSnippets: string[] } {
  try {
    if (!insight || !insight.member) return { contextSnippets: [] }
    if (!CROSS_METRIC_ELIGIBLE_TYPES.has(insight.insightTypeId)) {
      if (opts?.diagnose) console.debug('[PR-M6a-diag]', {
        card_id: opts.cardId, skip_reason: 'type_not_eligible',
        card_entity: { dim: insight.dimensionId, value: insight.member },
        insight_type: insight.insightTypeId,
      })
      return { contextSnippets: [] }
    }
    const sign = crossMetricGetSign(insight)
    if (!sign) {
      if (opts?.diagnose) console.debug('[PR-M6a-diag]', {
        card_id: opts.cardId, skip_reason: 'no_sign',
        card_entity: { dim: insight.dimensionId, value: insight.member },
      })
      return { contextSnippets: [] }
    }

    // [PR-M6.A.1] diag: contar matches incrementales
    const _matchesByEntity = opts?.diagnose
      ? candidatePool.filter(c => c.dimensionId === insight.dimensionId && c.member === insight.member).length
      : 0
    const _matchesByEntityOtherMetric = opts?.diagnose
      ? candidatePool.filter(c =>
          c.dimensionId === insight.dimensionId &&
          c.member === insight.member &&
          c.metricId !== insight.metricId,
        ).length
      : 0

    const related = candidatePool.filter(c =>
      c.dimensionId === insight.dimensionId &&
      c.member      === insight.member &&
      c.metricId    !== insight.metricId &&
      CROSS_METRIC_ELIGIBLE_TYPES.has(c.insightTypeId) &&
      crossMetricGetSign(c) === sign,
    )

    if (opts?.diagnose) {
      const byMetric: Record<string, number> = {}
      for (const r of related) byMetric[r.metricId] = (byMetric[r.metricId] ?? 0) + 1
      console.debug('[PR-M6a-diag]', {
        card_id:              opts.cardId,
        card_entity:          { dim: insight.dimensionId, value: insight.member },
        card_metric:          insight.metricId,
        card_sign:            sign,
        pool_size:            candidatePool.length,
        matches_by_entity:    _matchesByEntity,
        matches_by_entity_other_metric: _matchesByEntityOtherMetric,
        matches_after_type_and_sign:    related.length,
        matches_by_metric:    byMetric,
      })
    }

    if (related.length === 0) return { contextSnippets: [] }

    // Dedup por métrica: quedarse con el de mayor magnitud por métrica distinta.
    const byMetric = new Map<string, CrossMetricInsightLike>()
    for (const r of related) {
      const curMag = Math.abs(crossMetricGetPctChange(r) ?? 0)
      const prev   = byMetric.get(r.metricId)
      const prevMag = prev ? Math.abs(crossMetricGetPctChange(prev) ?? 0) : -Infinity
      if (curMag > prevMag) byMetric.set(r.metricId, r)
    }

    const sorted = [...byMetric.values()].sort((a, b) =>
      Math.abs(crossMetricGetPctChange(b) ?? 0) - Math.abs(crossMetricGetPctChange(a) ?? 0),
    )

    // [PR-M6.A.2] Dedup por delta casi idéntico (|Δ_A − Δ_B| < 2pp) y mismo signo.
    // Caso real: num_transacciones y frecuencia_compra comparten denominador → deltas
    // matemáticamente iguales. Preservar solo el de mayor magnitud (ya está primero
    // por el sort) y descartar duplicados redundantes para el usuario.
    const NEAR_DUP_THRESHOLD_PP = 2
    const deduped: CrossMetricInsightLike[] = []
    for (const r of sorted) {
      const rPct = crossMetricGetPctChange(r) ?? 0
      const isNearDup = deduped.some(d => {
        const dPct = crossMetricGetPctChange(d) ?? 0
        return Math.sign(dPct) === Math.sign(rPct)
          && Math.abs(dPct - rPct) < NEAR_DUP_THRESHOLD_PP
      })
      if (!isNearDup) deduped.push(r)
    }

    const snippets: string[] = []
    for (const r of deduped.slice(0, 2)) {
      const label = CROSS_METRIC_LABEL_MAP[r.metricId] ?? r.metricId
      const delta = crossMetricFormatDelta(r)
      if (!delta) continue
      const verbo = crossMetricVerb(sign, r.metricId)
      snippets.push(`${verbo} su ${label} (${delta})`)
    }
    return { contextSnippets: snippets }
  } catch {
    return { contextSnippets: [] }
  }
}

// ═══════════════════════════════════════
// GRUPO Z.9.2: Impacto económico + dirección por tipo de insight
// R135: cada tipo define su propia fórmula. Prohibido fallback genérico.
// R136: impacto_recuperable = valor concentrado en entidades hoja identificables.
//       NO es proyección, NO es promesa comercial, NO es probabilidad de recuperación.
// R138: cuando impacto_valor está en USD, coincide con DiagnosticBlock.impactoUSD.
// ═══════════════════════════════════════

// Minimal interface para evitar dependencia circular con insight-engine.ts.
// InsightCandidate satisface este tipo estructuralmente (TypeScript duck typing).
export interface InsightImpactoInput {
  insightTypeId: string
  metricId: string
  dimensionId: string
  detail: Record<string, unknown>
}

export type ImpactoUsdSource =
  | 'gap_meta'
  | 'recuperable'
  | 'cross_varAbs'
  | 'detail_monto'
  | 'detail_magnitud'
  | 'detail_totalCaida'
  | 'cross_delta_yoy'
  | 'non_monetary'
  | 'unavailable'

// Context mínimo requerido por las funciones de Z.9.2.
export interface ContextoImpactoZ9 {
  tipoMetaActivo: 'uds' | 'usd'
}

// ─── calcularImpactoValor ─────────────────────────────────────────────────────
// R135: tabla canónica por tipo (§30 del manifiesto).
// USD si hay venta_neta (R56); unidades si no. Tamaño OBSERVADO, no proyección.
// null cuando el insumo no está disponible en detail. Nunca aproximar.
export function calcularImpactoValor(
  c: InsightImpactoInput,
  _ctx?: ContextoImpactoZ9,
): number | null {
  const d = c.detail
  const n = (key: string): number | null => {
    const v = d[key]
    return typeof v === 'number' && isFinite(v) ? v : null
  }
  const mult = (qtyKey: string, priceKey = 'precio_unitario'): number | null => {
    const qty = n(qtyKey)
    const price = n(priceKey)
    return qty != null && price != null ? qty * price : null
  }
  switch (c.insightTypeId) {
    case 'change': {
      const cur  = n('current'); const prev = n('previous')
      return (cur != null && prev != null) ? cur - prev : null
    }
    case 'trend': {
      const end = n('historyEnd'); const start = n('historyStart')
      return (end != null && start != null) ? end - start : null
    }
    case 'contribution': {
      return n('memberChange')
    }
    case 'dominance': return null   // detail no expone valor individual
    case 'correlation': return null
    case 'meta_gap': return null    // gap en % sin meta USD disponible en detail
    case 'stock_risk': {
      return n('impactoTotal') ?? mult('unidades')      // suma ventaYTD o proxy stock x precio
    }
    case 'stock_excess': {
      return n('totalCapital') ?? mult('unidades_excedente') // suma ventaYTD o proxy excedente x precio
    }
    case 'migration': {
      return n('magnitud')          // delta del producto que ganó participación
    }
    case 'co_decline': {
      return n('impactoTotal')      // suma de deltas del cluster de declive
    }
    case 'product_dead': {
      return n('totalPrev')         // venta histórica de productos muertos
    }
    case 'cliente_dormido': {
      return n('impactoVentaHistorica') ?? n('valor_yoy_usd')  // ventana YoY (R53)
    }
    case 'cliente_perdido': {
      return n('impactoVentaHistorica') ?? n('valor_yoy_usd')  // misma fuente que cliente_dormido (Sprint 5)
    }
    case 'change_point': {
      // (meanPost - meanPre) × monthsPost — diferencia de régimen × períodos afectados
      const post = n('meanPost'); const pre = n('meanPre'); const mp = n('monthsPost')
      return (post != null && pre != null && mp != null) ? (post - pre) * mp : null
    }
    case 'steady_share': {
      // shareDelta × totalEmpresa no disponible en detail → null
      return null
    }
    case 'outlier': {
      // [Z.12.C-2.5] El detector emite `detail.valor` (no 'value') y
      // `detail.impact` = |value - mean| pre-computado. Cuando is_monetary
      // = true, impact es USD directo. Antes leíamos 'value' (inexistente)
      // y devolvíamos null → caía a 'unavailable' en el resolver → Z.11
      // suprimía con sin-usd. Caso emblemático: María Castillo (outlier
      // venta_usd post-Z.12.V-4 con threshold adaptativo) era invisible.
      const imp = n('impact')
      if (imp != null && imp !== 0) return Math.abs(imp)
      // Fallback al cálculo pre-V (por si algún detector futuro emite
      // value+mean sin impact pre-computado).
      const val = n('value') ?? n('valor')
      const mean = n('mean')
      return (val != null && mean != null) ? val - mean : null
    }
    case 'seasonality': {
      // [Z.9.6] Usar detail.impact cuando is_monetary = true
      const imp = d['impact']
      const isMonetary = d['is_monetary']
      if (isMonetary === true && typeof imp === 'number' && isFinite(imp) && imp !== 0) {
        return Math.abs(imp)
      }
      return null
    }
    case 'meta_gap_temporal': {
      // Suma de gaps (metaVal - vendido) en serieTail donde cumplPct < 100
      type TailItem = { cumplPct: number; vendido: number; metaVal: number }
      const tail = d['serieTail'] as TailItem[] | undefined
      if (!Array.isArray(tail) || tail.length === 0) return null
      const gap = tail.reduce((s, p) => {
        if (typeof p.cumplPct !== 'number' || p.cumplPct >= 100) return s
        const mv = typeof p.metaVal === 'number' ? p.metaVal : 0
        const vv = typeof p.vendido === 'number' ? p.vendido : 0
        return s + Math.max(0, mv - vv)
      }, 0)
      return gap > 0 ? gap : null
    }
    default: return null
  }
}

// ─── calcularImpactoPct ───────────────────────────────────────────────────────
// % sobre baseline explícito por tipo. null si denominador ambiguo.
export function calcularImpactoPct(
  c: InsightImpactoInput,
  _ctx?: ContextoImpactoZ9,
): number | null {
  const d = c.detail
  const n = (key: string): number | null => {
    const v = d[key]; return typeof v === 'number' && isFinite(v) ? v : null
  }
  switch (c.insightTypeId) {
    case 'change': return n('pctChange')
    case 'trend':  return n('pctChange')   // R54: literal (last-first)/first
    case 'contribution': {
      const cp = n('contributionPct')
      return cp != null ? Math.abs(cp) : null
    }
    case 'change_point': return n('pctChange')
    case 'steady_share': {
      const shift = n('shift')
      return shift != null ? shift * 100 : null   // pp
    }
    case 'outlier': {
      const val = n('value'); const mean = n('mean')
      if (val != null && mean != null && mean !== 0) return ((val - mean) / mean) * 100
      return null
    }
    case 'migration': return n('ratio')            // ganancia/caída ratio
    default: return null
  }
}

// ─── calcularImpactoGapMeta ───────────────────────────────────────────────────
// Solo con metas y cruce claro. null en todos los demás casos.
export function calcularImpactoGapMeta(
  c: InsightImpactoInput,
  _ctx?: ContextoImpactoZ9,
): number | null {
  if (c.insightTypeId !== 'meta_gap' && c.insightTypeId !== 'meta_gap_temporal') return null
  if (c.insightTypeId === 'meta_gap_temporal') {
    return calcularImpactoValor(c, _ctx)   // reusar la fórmula ya definida
  }
  // [Z.11.2] meta_gap del builder meta_gap_combo (insight-engine.ts:6271+) trae
  // detail.gap (numérico, en tipoMeta units) + detail.ventaUsd (componente USD).
  // - Modo USD: gap ya está en USD → magnitud absoluta.
  // - Modo UDS: ventaUsd es el anchor monetario más estable (mismo criterio que
  //   el builder inline en insight-engine.ts:6305-6307; usar gap × (ventaUsd /
  //   ventaActual) introduce división frágil cuando ventaActual≈0).
  // Antes (Z.11.0) devolvia null, lo que hacía que la cadena del resolver cayera
  // a metricId='cumplimiento_meta' en NON_MONETARY_METRIC_IDS → 'non_monetary'.
  // Esto mataba 3 candidatos meta_gap por categoría/vendor en Z.11 con
  // 'sin-usd|cross-pobre(1)' aunque eran señales reales con gap monetario.
  const detail = c.detail
  const tipo = typeof detail.tipoMetaActivo === 'string' ? detail.tipoMetaActivo : null
  const gap = typeof detail.gap === 'number' && Number.isFinite(detail.gap) ? detail.gap : null
  const ventaUsd = typeof detail.ventaUsd === 'number' && Number.isFinite(detail.ventaUsd) ? detail.ventaUsd : null
  if (tipo === 'usd' && gap != null && gap !== 0) return Math.abs(gap)
  if (ventaUsd != null && ventaUsd > 0) return ventaUsd
  return null
}

// ─── calcularImpactoRecuperableCandidato ──────────────────────────────────────
// NOTA SEMÁNTICA (R136):
// "impacto_recuperable" = valor concentrado en el bloque identificable de entidades
// (clientes / productos / vendedores) que explican la mayor parte del problema.
// NO es proyección, NO es promesa comercial, NO es probabilidad de recuperación.
// El render que lo consuma DEBE acompañar la cifra con la entidad que la explica.
// Nombre distinto a calcularImpactoRecuperable (DiagnosticBlock) para evitar colisión.
export function calcularImpactoRecuperableCandidato(
  c: InsightImpactoInput,
): number | null {
  const d = c.detail
  const n = (key: string): number | null => {
    const v = d[key]; return typeof v === 'number' && isFinite(v) ? v : null
  }
  switch (c.insightTypeId) {
    // Para tipos que ya son entidades hoja: impacto_recuperable = impacto_valor
    case 'change':
    case 'trend':
    case 'contribution':
    case 'migration':
    case 'cliente_dormido':
    case 'cliente_perdido':
    case 'change_point':
    case 'outlier':
      return calcularImpactoValor(c)
    // Para agregados: valor del item principal (la entidad hoja más pesada)
    case 'stock_risk': {
      type Item = { ventaYTD: number }
      const items = d['items'] as Item[] | undefined
      if (Array.isArray(items) && items.length > 0 && typeof items[0].ventaYTD === 'number')
        return items[0].ventaYTD
      return calcularImpactoValor(c)
    }
    case 'stock_excess': {
      type TopItem = { ventaYTD: number }
      const top = d['top'] as TopItem[] | undefined
      if (Array.isArray(top) && top.length > 0 && typeof top[0].ventaYTD === 'number')
        return top[0].ventaYTD
      return calcularImpactoValor(c)
    }
    case 'co_decline': {
      return n('impactoTotal')
    }
    case 'product_dead': {
      type Item = { prevNet: number }
      const items = d['items'] as Item[] | undefined
      if (Array.isArray(items) && items.length > 0 && typeof items[0].prevNet === 'number')
        return items[0].prevNet
      return null
    }
    case 'meta_gap_temporal': return calcularImpactoValor(c)
    default: return null
  }
}

// ─── calcularDirection ────────────────────────────────────────────────────────
// R137: direction = dato estadístico. Siempre poblado (nunca undefined).
// Distinto a DiagnosticBlock.direccion (framing narrativo) — el mapeo no es 1:1.
export function calcularDirection(
  c: InsightImpactoInput,
): "up" | "down" | "neutral" {
  const d = c.detail
  const rawDir = d['direction'] as string | undefined
  // Tipos donde direction ya vive en detail
  if (rawDir === 'up' || rawDir === 'down') return rawDir
  switch (c.insightTypeId) {
    case 'change': {
      const prev = d['previous'] as number | undefined
      const cur  = d['current']  as number | undefined
      if (typeof cur === 'number' && typeof prev === 'number') return cur >= prev ? 'up' : 'down'
      return 'neutral'
    }
    case 'trend': {
      const pc = d['pctChange'] as number | undefined
      if (typeof pc === 'number') return pc >= 0 ? 'up' : 'down'
      return 'neutral'
    }
    case 'contribution': {
      const mc = d['memberChange'] as number | undefined
      if (typeof mc === 'number') return mc >= 0 ? 'up' : 'down'
      return 'neutral'
    }
    case 'dominance':     return 'neutral'
    case 'correlation':   return 'neutral'
    // [Z.13.V-4] meta_gap NO es siempre 'down'. Post-Z.11.2 el builder
    // emite también sobrecumplimiento (cumplPct > 100). El builder setea
    // c.direction='up' o 'down' top-level, pero `hydratarCandidatoZ9`
    // llama a `calcularDirection(c)` y sobreescribe — pre-Z.13.V-4 esta
    // función devolvía 'down' fijo, corrompiendo el direction de
    // candidatos sobrecumpl (María Castillo 163%, Roberto Cruz 216%
    // terminaban con direction='down' aunque el builder los marcó 'up').
    // Esto rompía agrupación direction-aware (V-2): bucket 'estancados'
    // mezclaba sobrecumpls con subcumpls.
    case 'meta_gap':
    case 'meta_gap_temporal': {
      const cumplPct = d['cumplPct']
      if (typeof cumplPct === 'number' && Number.isFinite(cumplPct)) {
        return cumplPct >= 100 ? 'up' : 'down'
      }
      return 'down'  // fallback: sin cumplPct, asumimos sub-meta (caso histórico)
    }
    case 'stock_risk':    return 'down'
    case 'stock_excess':  return 'neutral'
    case 'migration': {
      const mag = d['magnitud'] as number | undefined
      if (typeof mag === 'number') return mag >= 0 ? 'up' : 'down'
      return 'neutral'
    }
    case 'co_decline':    return 'down'
    case 'product_dead':  return 'down'
    case 'cliente_dormido': return 'down'
    case 'cliente_perdido': return 'down'
    case 'change_point': {
      const post = d['meanPost'] as number | undefined
      const pre  = d['meanPre']  as number | undefined
      if (typeof post === 'number' && typeof pre === 'number') return post >= pre ? 'up' : 'down'
      return 'neutral'
    }
    case 'steady_share': {
      const shift = d['shift'] as number | undefined
      if (typeof shift === 'number') return shift >= 0 ? 'up' : 'down'
      return 'neutral'
    }
    case 'outlier': {
      const zSign = d['zSign'] as string | undefined
      if (zSign === 'up' || zSign === 'down') return zSign
      const val  = d['value'] as number | undefined
      const mean = d['mean']  as number | undefined
      if (typeof val === 'number' && typeof mean === 'number') return val >= mean ? 'up' : 'down'
      return 'neutral'
    }
    case 'seasonality': {
      // [Z.9.6] Leer direccion real del detail en lugar de fijar 'neutral'
      const raw = d['direccion']
      if (raw === 'up' || raw === 'down') return raw
      return 'neutral'
    }
    case 'meta_gap_temporal':  return 'down'
    default:                   return 'neutral'
  }
}

// ─── calcularTimeScopeZ9 ─────────────────────────────────────────────────────
// Alcance temporal real del insight — informa el ranker ejecutivo de Z.9.4.
export function calcularTimeScopeZ9(
  c: InsightImpactoInput,
): "mtd" | "ytd" | "rolling" | "monthly" | "seasonal" | "unknown" {
  switch (c.insightTypeId) {
    case 'change':          return 'mtd'
    case 'contribution':    return 'mtd'
    case 'meta_gap':        return 'mtd'
    case 'dominance':       return 'mtd'
    case 'trend':           return 'rolling'
    case 'correlation':     return 'unknown'
    case 'seasonality':     return 'seasonal'  // [Z.9.6] era 'unknown'
    case 'stock_risk':      return 'rolling'
    case 'stock_excess':    return 'rolling'
    case 'cliente_dormido': return 'rolling'
    case 'cliente_perdido': return 'rolling'
    case 'migration':       return 'ytd'
    case 'co_decline':      return 'ytd'
    case 'product_dead':    return 'ytd'
    case 'change_point':    return 'rolling'
    case 'steady_share':    return 'rolling'
    case 'outlier':         return 'monthly'
    case 'meta_gap_temporal': return 'monthly'
    default:                return 'unknown'
  }
}

// ─── calcularRenderPriorityScore ─────────────────────────────────────────────
// [R143] Score determinístico del ranker ejecutivo.
// Insumo: campos ya calculados (severity, impacto_valor, direction, time_scope, score).
// Rango de salida: [0, 5] aprox. No exponer el número en UI.
const _SEV_W:   Record<string, number> = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAJA: 1 }
const _SCOPE_W: Record<string, number> = { ytd: 4, mtd: 3, rolling: 2, monthly: 1, unknown: 0 }

export function calcularRenderPriorityScore(c: InsightImpactoInput & {
  severity?:      string
  impacto_valor?: number | null
  direction?:     string
  time_scope?:    string
  score?:         number
}): number {
  const sevW       = _SEV_W[c.severity ?? '']   ?? 1
  const scopeW     = _SCOPE_W[c.time_scope ?? ''] ?? 0
  const iv         = c.impacto_valor
  const impactNorm = iv != null && isFinite(iv) ? Math.min(1, Math.abs(iv) / 50_000) : 0
  const rawScore   = typeof c.score === 'number' && isFinite(c.score) ? c.score : 0
  const dirMult    = c.direction === 'down' ? 1.2 : c.direction === 'up' ? 0.9 : 1.0
  return (sevW * 0.4 + scopeW * 0.2 + impactNorm * 0.3 + rawScore * 0.1) * dirMult
}

// ─── buildSupportingEvidence ─────────────────────────────────────────────────
// [Z.9.5] Evidencia trazable por tipo de insight.
// Extrae frases cortas con cifras desde c.detail. Nunca usa c.description
// para evitar colisión Jaccard con primaryCause en buildExecutiveProblems.
// Devuelve [] cuando no hay keys esperadas — degradación silenciosa.
// Solo cubre tipos activos en el pipeline Z.9 con detail shape confirmado.
export function buildSupportingEvidence(c: InsightImpactoInput): string[] {
  const d = (c.detail || {}) as Record<string, unknown>
  const num = (k: string): number | null => {
    const v = d[k]
    return typeof v === 'number' && isFinite(v) ? v : null
  }
  const str = (k: string): string | null => {
    const v = d[k]
    return typeof v === 'string' && v.length > 0 ? v : null
  }
  const fmt0   = (n: number) => Math.round(n).toLocaleString('en-US')
  const fmt1   = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
  const fmtPct = (n: number) => (n >= 0 ? '+' : '') + fmt1(n) + '%'
  const fmtUSD = (n: number) => '$' + fmt0(n)
  const member = str('member') || str('clienteNombre') || ''

  const out: string[] = []

  switch (c.insightTypeId) {
    case 'change_point': {
      const pre = num('meanPre'), post = num('meanPost'),
            pct = num('pctChange'), mPost = num('monthsPost')
      if (pre !== null && post !== null && mPost !== null && member) {
        out.push(`Cambio de régimen en ${member}: ${fmt0(pre)} → ${fmt0(post)} sostenido ${mPost} meses`)
      }
      if (pct !== null) out.push(`Variación ${fmtPct(pct)} vs régimen previo`)
      break
    }
    case 'steady_share': {
      const pre = num('meanPre'), post = num('meanPost'),
            shiftPP = num('shiftPP'), stable = num('monthsStable'), postM = num('monthsPost')
      if (pre !== null && post !== null && member) {
        out.push(`${member}: participación ${fmt1(pre)}% → ${fmt1(post)}%`)
      }
      if (shiftPP !== null && stable !== null) {
        out.push(`Desplazamiento ${fmtPct(shiftPP)} pp tras ${stable} meses estables`)
      }
      if (postM !== null && postM > 0) out.push(`Nivel nuevo sostenido ${postM} meses`)
      break
    }
    case 'correlation': {
      const r = num('r'), n = num('n')
      const a = str('metricA'), b = str('metricB')
      if (r !== null && a && b && member) {
        const nTxt = n !== null ? ` (n=${fmt0(n)})` : ''
        out.push(`${member}: correlación ${a}↔${b} r=${fmt1(r)}${nTxt}`)
      }
      break
    }
    case 'meta_gap_temporal': {
      const cumpl = num('cumplActual'), impUSD = num('impactoUSD'),
            months = num('monthsDeclining'), lastYm = str('lastYmLabel')
      if (cumpl !== null && member) {
        const asPct = cumpl > 1 ? cumpl : cumpl * 100
        out.push(`${member}: cumplimiento ${fmt1(asPct)}% ${lastYm ? 'al ' + lastYm : ''}`.trim())
      }
      if (months !== null && months > 0) out.push(`Patrón descendente sostenido ${months} meses`)
      if (impUSD !== null && impUSD > 0) out.push(`Gap acumulado ${fmtUSD(impUSD)}`)
      break
    }
    case 'outlier':
    case 'multi_metric_outlier': {
      const v = num('value'), mean = num('mean'),
            z = num('zScore') ?? num('absZ')
      if (v !== null && mean !== null && member) {
        out.push(`${member}: ${fmt0(v)} vs media del grupo ${fmt0(mean)}`)
      }
      if (z !== null) out.push(`Desvío z=${fmt1(Math.abs(z))}`)
      break
    }
    case 'cliente_dormido': {
      // Sprint 5 fix: campo canónico es 'diasSinComprar' (lo que escriben los builders y
      // lee el render). El typo 'diasSinCompra' antes silenciaba el bullet más fuerte.
      const dias = num('diasSinComprar'), umbral = num('umbralDiasDormido'),
            imp = num('impactoVentaHistorica'), frec = num('frecuenciaHistoricaDias')
      const nombre = str('clienteNombre') || member
      if (dias !== null && nombre) {
        const umbralTxt = umbral !== null ? ` (umbral ${fmt0(umbral)})` : ''
        out.push(`${nombre}: sin compras hace ${fmt0(dias)} días${umbralTxt}`)
      }
      if (imp !== null && imp > 0) out.push(`Impacto histórico ${fmtUSD(imp)}`)
      if (frec !== null && frec > 0) out.push(`Cadencia habitual cada ${fmt0(frec)} días`)
      break
    }
    case 'cliente_perdido': {
      const dias = num('diasSinComprar'),
            imp = num('impactoVentaHistorica'), frec = num('frecuenciaHistoricaDias')
      const nombre = str('clienteNombre') || member
      if (dias !== null && nombre) {
        out.push(`${nombre}: sin compras hace ${fmt0(dias)} días`)
      }
      if (frec !== null && frec > 0) {
        const ratio = dias && frec ? dias / frec : 0
        out.push(`Cadencia habitual cada ${fmt0(frec)} días${ratio >= 3 ? ` (${ratio.toFixed(1)}× lo normal)` : ''}`)
      }
      if (imp !== null && imp > 0) out.push(`Aportaba ${fmtUSD(imp)} históricamente`)
      break
    }
    case 'stock_risk': {
      const impactoTotal = num('impactoTotal')
      const top = str('topProduct') || member
      const items = Array.isArray(d['items']) ? d['items'] as Array<Record<string, unknown>> : []
      const topItem = items[0]
      if (topItem && typeof topItem === 'object') {
        const s  = typeof topItem['stock'] === 'number' ? topItem['stock'] as number : null
        const dc = typeof topItem['diasCobertura'] === 'number' ? topItem['diasCobertura'] as number : null
        const m  = typeof topItem['member'] === 'string' ? topItem['member'] as string : top
        if (s !== null && dc !== null) {
          out.push(`${m}: ${fmt0(s)} uds de stock para ${fmt0(dc)} días de cobertura`)
        }
      }
      if (items.length > 1) out.push(`${fmt0(items.length)} productos en riesgo de quiebre`)
      if (impactoTotal !== null && impactoTotal > 0) {
        out.push(`Venta YTD combinada en riesgo: ${fmtUSD(impactoTotal)}`)
      }
      break
    }
    case 'product_dead': {
      const totalPrev    = num('totalPrev')
      const totalStock   = num('totalStock')
      const productCount = num('productCount')
      const items = Array.isArray(d['items']) ? d['items'] as Array<Record<string, unknown>> : []
      if (productCount !== null && productCount > 0) {
        const names = items
          .map(it => typeof it['member'] === 'string' ? it['member'] as string : null)
          .filter((x): x is string => !!x)
          .slice(0, 3)
        if (names.length > 0) {
          out.push(`${fmt0(productCount)} productos sin venta reciente: ${names.join(', ')}`)
        }
      }
      if (totalPrev !== null && totalPrev > 0) out.push(`Venta histórica combinada: ${fmtUSD(totalPrev)}`)
      if (totalStock !== null && totalStock > 0) out.push(`Inventario remanente: ${fmt0(totalStock)} unidades`)
      break
    }
    case 'migration': {
      const declining  = str('declining')
      const rising     = str('rising')
      const grupo      = str('grupo')
      const magnitud   = num('magnitud')
      const totalCaida = num('totalCaida')
      if (declining && rising) {
        const gTxt = grupo && grupo !== 'Sin categoría' ? ` en ${grupo}` : ''
        out.push(`Desplazamiento${gTxt}: ${declining} → ${rising}`)
      }
      if (magnitud !== null && magnitud !== 0) out.push(`Magnitud del traslado: ${fmtUSD(Math.abs(magnitud))}`)
      if (totalCaida !== null && totalCaida > 0 && totalCaida !== magnitud) {
        out.push(`Caída total del grupo perdedor: ${fmtUSD(totalCaida)}`)
      }
      break
    }
    case 'contribution': {
      const pct           = num('contributionPct')
      const memberChange  = num('memberChange')
      const totalChange   = num('totalChange')
      const memberValue   = num('memberValue')
      const memberPrevVal = num('memberPrevValue')
      if (pct !== null && member) out.push(`${member} aporta ${fmt1(pct)}% del cambio total del grupo`)
      if (memberPrevVal !== null && memberValue !== null && member) {
        out.push(`${member}: ${fmt0(memberPrevVal)} → ${fmt0(memberValue)}`)
      }
      if (memberChange !== null && totalChange !== null && totalChange !== 0) {
        const sM = memberChange >= 0 ? '+' : ''
        const sT = totalChange  >= 0 ? '+' : ''
        out.push(`Δ individual ${sM}${fmt0(memberChange)} vs Δ total del grupo ${sT}${fmt0(totalChange)}`)
      }
      break
    }
    case 'change': {
      const cur  = num('current')
      const prev = num('previous')
      const pct  = num('pctChange')
      const cmp  = str('comparison')
      if (cur !== null && prev !== null && member) out.push(`${member}: ${fmt0(cur)} vs ${fmt0(prev)}`)
      if (pct !== null) {
        const base = cmp === 'yoy_mtd' ? ' vs mismo período año anterior' : ''
        out.push(`Variación ${fmtPct(pct)}${base}`)
      }
      break
    }
    case 'trend': {
      const dirStr = str('direction')
      const months = num('months')
      const pct    = num('pctChange')
      const hStart = num('historyStart')
      const hEnd   = num('historyEnd')
      if (hStart !== null && hEnd !== null && months !== null && member) {
        out.push(`${member}: ${fmt0(hStart)} → ${fmt0(hEnd)} en ${fmt0(months)} meses`)
      }
      if (pct !== null) {
        const asPct = Math.abs(pct) < 10 ? pct * 100 : pct
        const dirLbl = dirStr === 'down' ? 'descendente' : 'ascendente'
        out.push(`Pendiente sostenida ${dirLbl} ${fmtPct(asPct)}`)
      }
      break
    }
    case 'seasonality': {
      const mesPico  = num('mes_pico')
      const idxPico  = num('index_pico')
      const mesValle = num('mes_valle')
      const idxValle = num('index_valle')
      const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
      const pkName = mesPico  !== null && mesPico  >= 1 && mesPico  <= 12 ? meses[mesPico  - 1] : null
      const vlName = mesValle !== null && mesValle >= 1 && mesValle <= 12 ? meses[mesValle - 1] : null
      if (pkName && idxPico !== null && member) {
        out.push(`${member}: pico estacional en ${pkName} (${fmt1(idxPico)}× el promedio)`)
      }
      if (vlName && idxValle !== null) out.push(`Valle en ${vlName} (${fmt1(idxValle)}× el promedio)`)
      break
    }
    default:
      break
  }

  const seen = new Set<string>()
  return out
    .filter(s => typeof s === 'string' && s.length > 0 && s.length <= 140)
    .filter(s => (seen.has(s) ? false : (seen.add(s), true)))
    .slice(0, 3)
}

// ─── hydratarCandidatoZ9 ─────────────────────────────────────────────────────
// Hidratar in-place todos los campos Z.9.2 en un candidato.
// Llamado desde runInsightEngine después de la dedup pass.
// Todos los campos son opcionales en InsightCandidate (R134).
export function hydratarCandidatoZ9<T extends InsightImpactoInput & {
  impacto_valor?:         number | null
  impacto_pct?:           number | null
  impacto_gap_meta?:      number | null
  impacto_recuperable?:   number | null
  direction?:             "up" | "down" | "neutral"
  time_scope?:            "mtd" | "ytd" | "rolling" | "monthly" | "seasonal" | "unknown"
  entity_path?:           string[]
  render_priority_score?: number
  supporting_evidence?:   string[]
  severity?:              string
  score?:                 number
}>(c: T, ctx?: ContextoImpactoZ9): void {
  c.impacto_valor       = calcularImpactoValor(c, ctx)
  c.impacto_pct         = calcularImpactoPct(c, ctx)
  c.impacto_gap_meta    = calcularImpactoGapMeta(c, ctx)
  c.impacto_recuperable = calcularImpactoRecuperableCandidato(c)
  c.direction           = calcularDirection(c)
  c.time_scope          = calcularTimeScopeZ9(c)
  // R143: render_priority_score — calculado después de direction y time_scope
  c.render_priority_score = calcularRenderPriorityScore(c)
  // [Z.9.5] evidencia trazable — solo si no viene ya poblada
  if (!c.supporting_evidence || c.supporting_evidence.length === 0) {
    c.supporting_evidence = buildSupportingEvidence(c)
  }
  // entity_path básico si no viene poblado (Z.9.3 refinará con cruces reales)
  if (!c.entity_path || c.entity_path.length === 0) {
    let member = (c.detail['member'] as string | undefined) ?? ''

    // [Z.9.6] migration: la entidad protagonista es el declining (quien pierde valor)
    if (!member && c.insightTypeId === 'migration') {
      const declining = (c.detail['declining'] as string | undefined) ?? ''
      if (declining) {
        member = declining
        ;(c as unknown as { member?: string }).member = declining
      }
    }

    c.entity_path = member ? [c.dimensionId, member] : [c.dimensionId]
  }

  // [Z.9.7 Gap 2] Inicialización defensiva — los campos se populan
  // en buildInsightChains cuando el candidato se conecta a un padre/hijo.
  // Si el candidato queda fuera de toda chain, quedan como [] (no undefined).
  const cAny = c as unknown as { parent_entity_keys?: string[]; child_entity_keys?: string[] }
  if (!Array.isArray(cAny.parent_entity_keys)) cAny.parent_entity_keys = []
  if (!Array.isArray(cAny.child_entity_keys)) cAny.child_entity_keys = []
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── Materialidad ejecutiva (R148) ─────────────────────────────────────────
//
// Umbral mínimo para que un hallazgo califique como "ejecutivo".
// Ratio = |totalImpactUSD| / denominador; denominador preferido: salesLYSamePeriod.
// Si no hay LY disponible el motor degrada a salesCurrentPeriod o salesYTDCurrent
// y marca degraded=true en MaterialityContext.

/** Piso de materialidad: impacto ≥2% del denominador para ser ejecutivo. */
export const MATERIALITY_FLOOR_EXECUTIVE   = 0.02   // 2%

/** Umbral de materialidad alta: impacto ≥10% del denominador. */
export const MATERIALITY_HIGH              = 0.10   // 10%

/** Umbral de materialidad crítica: impacto ≥20% del denominador. */
export const MATERIALITY_CRITICAL          = 0.20   // 20%

/** Cantidad máxima de cards ejecutivas que llegan al render.
 *  Aplicado después del filtro de materialidad. */
export const EXECUTIVE_TOP_N               = 4

/** Score mínimo del candidato raíz para marcar el hallazgo como anomalía estadística.
 *  Permite que un insight sub-material llegue al ejecutivo si su desvío es alto. */
export const STATISTICAL_ANOMALY_THRESHOLD = 0.85

/** Cuando true, statistical_anomaly por sí sola NO califica para el panel ejecutivo.
 *  Requiere acompañarse de material_magnitude o chain_depth.
 *  Razón: un hallazgo estadísticamente raro pero económicamente irrelevante es
 *  curiosidad analítica, no decisión ejecutiva. */
export const STATISTICAL_ANOMALY_REQUIRES_COMPANION = true

// [PR-0] Entidades cuyo nombre no es canónico y no deben aparecer en el ranking.
// Comparación case-sensitive; usar .some(e => headline.includes(e)).
export const ENTIDADES_NO_CANONICAS: readonly string[] = [
  'Sin categoría',
  'sin categoría',
  'Sin asignar',
  'sin asignar',
  'Sin clasificar',
  'sin clasificar',
  'Sin nombre',
  'sin nombre',
  'N/A',
  'n/a',
] as const

// ─── Fase 6A — gate canónico pass/fail ────────────────────────────────────────
// Movido desde insight-engine.ts:filtrarConEstandar (bloque Z.12).
// Sin cambio funcional. La mutación `_z122_relaxed` y el push a `_Z12_suppressed`
// (telemetría DEV) siguen viviendo en filtrarConEstandar — esta función es pura.
//
// crossCount se recibe pre-computado para no introducir dependencia circular
// hacia _z11ContarCrossConcreto en insight-engine.ts.

/**
 * Forma estructural mínima de un candidato para el gate canónico.
 * `InsightCandidate` (insight-engine.ts) la satisface por duck typing —
 * importarlo desde acá causaría dependencia circular.
 */
export interface InsightGateCandidate {
  insightTypeId: string
  member:        string
  title?:        string
  description?:  string
  accion?:       { texto?: string } | string | null
  detail?:       Record<string, unknown>
  impacto_usd_normalizado?: number | null
  impacto_usd_source?: string | null
  // [Fase 7.5-B] Campos requeridos por la excepción contribution-up.
  // Aditivos: si están ausentes la excepción no aplica (fail-safe).
  direction?:    'up' | 'down' | 'neutral'
  score?:        number
  severity?:     'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'
  // [Sprint D / Visibility] metricId habilita Pareto-skip para candidatos
  // no-monetarios. Si está en NON_MONETARY_METRIC_IDS, r2 (Pareto) se
  // skipea — la lista Pareto USD no aplica a métricas count/ratio.
  metricId?: string
}

export interface InsightGateContext {
  /** Venta total del negocio en el período. Usado como denominador de materialidad. */
  ventaTotalNegocio: number
  /** Lista de entidades Pareto (80/20) calculada por el orquestador. */
  paretoList: string[]
  /** Cuenta de evidencia cruzada concreta del candidato. Pre-computado por el orquestador. */
  crossCount: number
}

export type InsightGateRuleId =
  | 'materiality'
  | 'pareto'
  | 'monetaryCoherence'
  | 'narrativeCoherence'

export interface InsightGateDecision {
  passes: boolean
  /** Razón sintética del fallo o del modo relajado. Útil para telemetría DEV. */
  reason?: string
  mode: 'strict' | 'relaxed' | 'fail'
  rules: {
    materiality:        boolean
    pareto:             boolean
    monetaryCoherence:  boolean
    narrativeCoherence: boolean
  }
  /**
   * [Fase 7.2] Lista de reglas que fallaron, en orden estable
   * (materiality, pareto, monetaryCoherence, narrativeCoherence).
   * Vacía si `passes === true`. Aditiva — `passes/mode/rules/reason` no cambian.
   */
  failedRules: InsightGateRuleId[]
}

// [Z.12] Tipos cuyo emisor garantiza estructura suficiente para pasar el gate
// con menos del 1% de impacto USD (ver bi-nivel en evaluateInsightCandidate).
const Z12_ROOT_STRONG_TYPES: ReadonlySet<string> = new Set([
  'meta_gap_temporal',
  'product_dead',
  'migration',
  // [Sprint C / Visibility] Tipos nuevos con narrativa rica (cross_context
  // populado con N dims). Cuando crossCount ≥ 2 reciben free pass r1+r2+r3
  // — la narrativa multi-dim los hace valiosos aunque su impacto USD sea
  // <2% del negocio (caso típico de slices granulares en cross_delta) o
  // su source no esté en USD whitelist (caso ocasional).
  'cliente_perdido',
  'cliente_dormido',
  'stock_risk',
  'stock_excess',
  'meta_gap',         // emitido por meta_gap_combo (Phase C ingesta)
  'cross_delta',      // auto-combo dim×dim×... con cross_context completo
])

// [Z.11.3] Tipos terminales por construcción: la entidad protagonista es la
// señal completa, sin dimensiones cruzables (cliente perdido = el cliente
// mismo). Para estos, el gate root-strong NO requiere crossCount >= 2
// porque cross=0 es el valor esperado, no una deficiencia narrativa.
//
// Antes de Z.11.3: cliente_dormido López ($1633, 4% del negocio) y
// cliente_perdido Tienda El Progreso ($819, 2%) morían en Z.12 por r2 (Pareto)
// + r4 (narrative) porque cross=0 bloqueaba el rescate root-strong, aunque
// USD era materialmente significativo y la narrativa interna era concreta.
const Z12_TERMINAL_TYPES: ReadonlySet<string> = new Set([
  'cliente_perdido',
  'cliente_dormido',
])

// [Z.12] Sources de impacto_usd_normalizado considerados monetariamente coherentes.
// `non_monetary` y `unavailable` quedan fuera por diseño.
const Z12_VALID_USD_SOURCES: ReadonlySet<string> = new Set([
  'gap_meta',
  'cross_varAbs',
  'recuperable',
  'detail_monto',
  'detail_magnitud',
  'detail_totalCaida',
  'cross_delta_yoy',
])

// [Sprint D / Visibility] Métricas cuya señal NO es monetaria (count, ratio,
// pct sin volumen). Para estas, r2 Pareto USD no aplica — la lista Pareto
// USD no representa "lo que importa" cuando la métrica es count o ratio.
// [Z.11.5] Fuente única exportada. Antes existía una copia en
// insight-engine.ts (mismo nombre) que divergía: faltaban skus_activos y
// margen_pct. La copia se eliminó; el motor importa esta misma constante.
export const NON_MONETARY_METRIC_IDS: ReadonlySet<string> = new Set([
  'num_transacciones',
  'ticket_promedio',
  'cumplimiento_meta',
  'pct_participacion',
  'num_clientes_activos',
  'precio_unitario',
  'frecuencia_compra',
  'ventas_por_cliente',
  'skus_activos',     // [Sprint D] count de SKUs activos por miembro
  'margen_pct',       // [Sprint D] ratio, no USD absoluto
])

export function resolveImpactoUsd(
  c: InsightImpactoInput & {
    impacto_gap_meta?: number | null
    impacto_recuperable?: number | null
  },
): { usd: number | null; source: ImpactoUsdSource } {
  const finiteNonZero = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v !== 0 ? Math.abs(v) : null
  const detail = c.detail ?? {}
  const crossContext = detail.cross_context as Record<string, unknown> | undefined

  const gapMeta = finiteNonZero(c.impacto_gap_meta)
  if (gapMeta != null) return { usd: gapMeta, source: 'gap_meta' }

  const crossVarAbs = finiteNonZero(crossContext?.varAbs)
  if (crossVarAbs != null) return { usd: crossVarAbs, source: 'cross_varAbs' }

  const recuperable = finiteNonZero(c.impacto_recuperable)
  if (recuperable != null && !NON_MONETARY_METRIC_IDS.has(c.metricId)) {
    return { usd: recuperable, source: 'recuperable' }
  }

  const typedImpact = finiteNonZero(calcularImpactoValor(c))
  if (typedImpact != null) {
    return {
      usd: typedImpact,
      source: c.insightTypeId === 'cliente_dormido' || c.insightTypeId === 'cliente_perdido'
        ? 'recuperable'
        : 'detail_monto',
    }
  }

  const monto = finiteNonZero(detail.monto)
  if (monto != null) return { usd: monto, source: 'detail_monto' }

  const magnitud = finiteNonZero(detail.magnitud)
  if (magnitud != null) return { usd: magnitud, source: 'detail_magnitud' }

  const totalCaida = finiteNonZero(detail.totalCaida)
  if (totalCaida != null) return { usd: totalCaida, source: 'detail_totalCaida' }

  if (NON_MONETARY_METRIC_IDS.has(c.metricId)) {
    return { usd: null, source: 'non_monetary' }
  }

  return { usd: null, source: 'unavailable' }
}

// [Z.11/Z.12] Frases que indican narrativa genérica — invalidan coherencia.
const Z12_GENERIC_ACTION_RE =
  /identificar\s+qu[eé]\s+cambi[oó]|comparar\s+con\s+el\s+per[ií]odo|aislar\s+la\s+causa|validar\s+patr[oó]n\s+detectado|monitorear\s+tendencia|revisar\s+el\s+comportamiento/i
const Z12_GENERIC_DESC_RE =
  /sugiere\s+mejora|podr[ií]a\s+indicar|posible\s+oportunidad|parece\s+haber/i

/**
 * Evaluación canónica pass/fail de un candidato bajo Z.12.
 *
 * Cuatro reglas en AND con puerta relajada (Z.12.2) cuando título+descripción
 * son concretos y r1+r2+r3 están en verde — entonces se acepta acción vacía.
 *
 * Excepciones por diseño (root-strong + cross ≥ 2):
 *   - tipos en Z12_ROOT_STRONG_TYPES con crossCount ≥ 2 pasan r1/r2/r3 con menor impacto.
 *
 * Pura — no muta candidato ni contexto.
 */
export function evaluateInsightCandidate(
  c: InsightGateCandidate,
  ctx: InsightGateContext,
): InsightGateDecision {
  const usdAbs = Math.abs(Number(c.impacto_usd_normalizado) || 0)
  const ventaTotal = ctx.ventaTotalNegocio > 0 ? ctx.ventaTotalNegocio : 1
  const floorAbsAlto = ventaTotal * MATERIALITY_FLOOR_EXECUTIVE             // 2%
  const floorAbsBajo = ventaTotal * (MATERIALITY_FLOOR_EXECUTIVE / 2)       // 1%

  // [Z.11.3] Tipos terminales (cliente_perdido/cliente_dormido) saltan el
  // requisito cross>=2 porque son single-entity por construcción. Otros tipos
  // root-strong siguen requiriendo cross>=2 para activar el rescue.
  const isRootStrong =
    Z12_ROOT_STRONG_TYPES.has(c.insightTypeId) && (
      ctx.crossCount >= 2 ||
      Z12_TERMINAL_TYPES.has(c.insightTypeId)
    )
  const esParetoReal = !!c.member && esEntidadPareto(c.member, ctx.paretoList)

  // Regla 1 — materialidad bi-nivel
  //   ≥ 2% del negocio: pasa directo.
  //   1–2%: pasa si además es Pareto real o root-strong.
  //   < 1%: solo pasa si es root-strong.
  const materiality =
    usdAbs >= floorAbsAlto ||
    (usdAbs >= floorAbsBajo && (esParetoReal || isRootStrong)) ||
    isRootStrong

  // Regla 2 — Pareto real del negocio. Si paretoList vacía, no bloqueamos.
  // [Sprint D / D2.a] Pareto-skip para candidatos no-monetarios: si la
  // métrica del candidato es count/ratio (NON_MONETARY_METRIC_IDS) o
  // su source es marcado 'non_monetary' por el builder, r2 no aplica
  // — la lista Pareto se computa desde venta USD y no representa "lo que
  // importa" para señales no-monetarias. Sin esto, skus_activos /
  // frecuencia_compra sobre miembros no-Pareto-USD morían por r2 sin
  // razón semántica.
  const isNonMonetary =
    c.impacto_usd_source === 'non_monetary' ||
    (typeof c.metricId === 'string' && NON_MONETARY_METRIC_IDS.has(c.metricId))
  // [Z.11.1] Rescue por materialidad alta: candidatos con USD ≥ 10% del
  // negocio pasan Pareto sin importar lista top ni cross. Magnitud
  // absoluta es razón ejecutiva suficiente. Caso emblemático: stock_risk
  // aislado (cross=0) con $6 665 = 16% del negocio moría aquí solo por
  // no estar en la lista Pareto top USD.
  const highMateriality = usdAbs >= ventaTotal * MATERIALITY_HIGH
  const pareto =
    esParetoReal ||
    isRootStrong ||
    ctx.paretoList.length === 0 ||
    isNonMonetary ||
    highMateriality

  // Regla 3 — coherencia monetaria (USD presente y source válido) o root-strong.
  const hasUsd =
    c.impacto_usd_normalizado != null && Number(c.impacto_usd_normalizado) !== 0
  const validSource =
    !!c.impacto_usd_source && Z12_VALID_USD_SOURCES.has(c.impacto_usd_source)
  const monetaryCoherence = (hasUsd && validSource) || isRootStrong

  // Regla 4 — coherencia narrativa.
  //   estricto: título + descripción + acción concretos.
  //   relajado: r1+r2+r3 verdes + título + descripción concretos → acepta acción vacía.
  //   "+ Profundizar" en UI genera la acción manualmente cuando entra por relajado.
  const tituloOk =
    typeof c.title === 'string' && c.title.trim().length >= 6
  const descOk =
    typeof c.description === 'string' &&
    c.description.trim().length >= 20 &&
    esConclusionValida(c.description) &&
    !Z12_GENERIC_DESC_RE.test(c.description)
  const accionTxt = (
    typeof c.accion === 'object' && c.accion !== null
      ? (c.accion as { texto?: string }).texto ?? ''
      : typeof c.accion === 'string'
        ? c.accion
        : ''
  ).toString()
  const accionOk = accionTxt.trim().length >= 10 && !Z12_GENERIC_ACTION_RE.test(accionTxt)

  // [Fase 7.5-B] Excepción contribution+: rescata r2 (pareto) cuando un
  // crecimiento positivo, material, de alta confianza y narrativa concreta
  // falla solo por no ser entidad Pareto del pool. No relaja Pareto
  // globalmente — la excepción es estrecha por construcción.
  // Criterios (todos requeridos):
  //   - insightTypeId === 'contribution'
  //   - direction === 'up'
  //   - score ≥ 0.95
  //   - severity ∈ {ALTA, CRITICA}
  //   - usd / ventaTotalNegocio ≥ 1%
  //   - impacto_usd_source válido (mismas que r3)
  //   - tituloOk + descOk (la narrativa básica debe ser concreta)
  //   - accion puede ser null — entra por modo relaxed
  const usdShareForException =
    ctx.ventaTotalNegocio > 0 ? Math.abs(Number(c.impacto_usd_normalizado) || 0) / ctx.ventaTotalNegocio : 0
  const _meetsContributionUpException =
    !pareto && // sólo aplica si la única que falla es r2
    materiality && monetaryCoherence &&
    tituloOk && descOk &&
    c.insightTypeId === 'contribution' &&
    c.direction === 'up' &&
    typeof c.score === 'number' && c.score >= 0.95 &&
    (c.severity === 'ALTA' || c.severity === 'CRITICA') &&
    usdShareForException >= 0.01

  const paretoEffective = pareto || _meetsContributionUpException

  const strictNarrative = tituloOk && descOk && accionOk
  const relaxedNarrative =
    materiality && paretoEffective && monetaryCoherence &&
    tituloOk && descOk &&
    !accionOk // sólo activa relaxed cuando accion falla

  const narrativeCoherence = strictNarrative || relaxedNarrative

  const passes = materiality && paretoEffective && monetaryCoherence && narrativeCoherence
  const mode: InsightGateDecision['mode'] =
    !passes ? 'fail' : (strictNarrative ? 'strict' : 'relaxed')

  let reason: string | undefined
  // [Fase 7.2] failedRules en orden estable. Refleja resultado EFECTIVO post-excepción
  // (si la excepción rescató pareto, no aparece en failedRules).
  // [Fase 7.5-B] rules.pareto sigue exponiendo el valor RAW para observabilidad.
  const failedRules: InsightGateRuleId[] = []
  if (!materiality)        failedRules.push('materiality')
  if (!paretoEffective)    failedRules.push('pareto')
  if (!monetaryCoherence)  failedRules.push('monetaryCoherence')
  if (!narrativeCoherence) failedRules.push('narrativeCoherence')

  if (!passes) {
    reason = `failed:${failedRules.join(',')}`
  } else if (_meetsContributionUpException) {
    reason = 'relaxed:exception_contribution_up'
  } else if (mode === 'relaxed') {
    reason = 'relaxed:accion_vacia'
  }

  return {
    passes,
    reason,
    mode,
    rules: { materiality, pareto, monetaryCoherence, narrativeCoherence },
    failedRules,
  }
}

/** Shorthand de `evaluateInsightCandidate(c, ctx).passes`. */
export function shouldInsightPass(
  c: InsightGateCandidate,
  ctx: InsightGateContext,
): boolean {
  return evaluateInsightCandidate(c, ctx).passes
}
