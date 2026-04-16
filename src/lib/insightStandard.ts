// src/lib/insightStandard.ts
// INSIGHT ENGINE STANDARD v2.0
// 37 reglas en 9 grupos (32 mejoradas + 5 nuevas A-E)
// Activas hoy: formatearImpacto, sustituirJerga, contieneJerga, esConclusionValida
// Conectada al pipeline — todo insight pasa por validarInsight(), validarProporcionalidad(), validarBalance(), detectarRedundancia(), validarCoherenciaTemporal() y sanitizarNarrativa()

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
