// src/lib/insightStandard.ts

// ============================================================
// INSIGHT ENGINE STANDARD v1.1
// 26 reglas: 4 filtros (F) + 6 calidad (C) + 9 estructurales (E) + 5 lenguaje (L) + 2 integración (I)
// Fuente de verdad para generación y validación de insights.
// Ningún insight se emite sin pasar TODAS las validaciones.
// ============================================================

// --- TIPOS ---

export interface AccionConcreta {
  texto: string;
  entidadesInvolucradas: string[]; // nombres de clientes/vendedores/productos mencionados
  respaldoNumerico: string;        // el dato que justifica esta acción
  ejecutableEn: 'inmediato' | 'esta_semana' | 'este_mes';
}

export interface InsightCandidate {
  entityType: 'vendedor' | 'cliente' | 'producto' | 'departamento' | 'canal';
  entityId: string;
  entityName: string;
  rawValue: number;                          // valor absoluto en $ o unidades
  percentileRank: number;                    // 0-100, calculado dinámicamente
  crossedTables: string[];                   // tablas cruzadas para generar este insight
  profundidadCruce: number;                  // NUEVO v1.1 — = crossedTables.length
  causaIdentificada: boolean;
  contrastePortafolio: string | null;        // NUEVO v1.1 (C4) — peso relativo dentro del portafolio
  comparacionTipo: 'YTD' | 'MTD' | 'historico';
  accion: AccionConcreta;                    // CAMBIADO v1.1 (L4/C6) — antes string
  señalesConvergentes: number;               // cuántas señales independientes apuntan a la misma conclusión
  impactoAbsoluto: number;                   // en $ o unidades
  hasVentaNeta: boolean;                     // true si el dataset tiene venta_neta
  narrativaCompleta: string;                 // NUEVO v1.1 (L3) — narrativa de flujo único, autocontenida
  conclusion: string;                        // NUEVO v1.1 (L2) — interpretación, no repetición
  esAccionable: boolean;                     // NUEVO v1.1 (F1 v1.1)
  metaContext: { metaMes: number; cumplimiento: number; gap: number; proyeccion: number } | null; // NUEVO v1.1 (I2)
  inventarioContext: { stockActual: number; mesesCobertura: number; sinStock: boolean; sobrestock: boolean } | null; // NUEVO v1.1 (I1)
}

export type PrioridadInsight = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';

export interface InsightStandardConfig {
  // Calculados dinámicamente desde la data
  percentiles: {
    vendedor: { p5: number; p20: number; p50: number; p80: number; p95: number };
    cliente: { p5: number; p10: number; p20: number; p50: number; p75: number; p90: number; p95: number };
    producto: { p5: number; p20: number; p50: number; p80: number; p95: number };
  };
  churnBaseline: {
    tasaTrimestral: number;         // clientes perdidos / activos del período anterior
    desviacionEstandar: number;
  };
  paretoEntities: {
    vendedores80: string[];   // vendedores que componen 80% del volumen
    clientes80: string[];
    productos80: string[];
  };
  diaDelMes: number;
  pctMesTipico: number;        // qué % del mes se ha completado típicamente a este día
  varianzaPctMes: number;      // varianza histórica de ese %
  productFamilies: Map<string, string[]>; // familia → productos
}

// --- PARTE 1: FILTROS DE ENTRADA ---

// F1: Umbral dinámico de relevancia
// No se hardcodean valores. Se calculan percentiles de la distribución real.
// Top 5% → CRITICA elegible
// Top 5-20% → ALTA elegible
// Top 20-50% → MEDIA elegible
// Bottom 50% → solo BAJA, y únicamente si cruce excepcional

export function calcularPercentiles(valores: number[]): { p5: number; p10: number; p20: number; p50: number; p75: number; p80: number; p90: number; p95: number } {
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

// F2: Filtro de ruido base
// Entidades sin actividad comercial real no entran al motor.
// Clientes con ≤3 transacciones Y valor bajo percentil 10 → excluidos siempre.

export function pasaFiltroRuido(
  transacciones: number,
  valorAcumulado: number,
  percentil10Clientes: number
): boolean {
  if (transacciones <= 3 && valorAcumulado < percentil10Clientes) return false;
  return true;
}

// F3: Tasa de rotación natural
// Se calcula trimestralmente. Un churn individual no es insight a menos que:
// - Valor del cliente > percentil 75
// - Tasa de churn actual > histórica + 1 desviación estándar
// - Segmento específico tiene churn desproporcionado

export function calcularChurnBaseline(
  clientesActivosPorTrimestre: { trimestre: string; clientes: Set<string> }[]
): { tasaPromedio: number; desviacionEstandar: number } {
  const tasas: number[] = [];
  for (let i = 1; i < clientesActivosPorTrimestre.length; i++) {
    const prev = clientesActivosPorTrimestre[i - 1].clientes;
    const cur = clientesActivosPorTrimestre[i].clientes;
    const perdidos = [...prev].filter(c => !cur.has(c)).length;
    tasas.push(perdidos / prev.size);
  }
  if (tasas.length === 0) return { tasaPromedio: 0, desviacionEstandar: 0 };
  const avg = tasas.reduce((s, t) => s + t, 0) / tasas.length;
  const variance = tasas.reduce((s, t) => s + Math.pow(t - avg, 2), 0) / tasas.length;
  return { tasaPromedio: avg, desviacionEstandar: Math.sqrt(variance) };
}

export function esChurnSignificativo(
  valorCliente: number,
  p75Clientes: number,
  churnActual: number,
  churnBaseline: { tasaPromedio: number; desviacionEstandar: number }
): boolean {
  if (valorCliente >= p75Clientes) return true;
  if (churnActual > churnBaseline.tasaPromedio + churnBaseline.desviacionEstandar) return true;
  return false;
}

// F4: Priorización Pareto
// Identifica entidades que componen el 80% del volumen.

export function calcularPareto(
  entidades: { nombre: string; valor: number }[]
): string[] {
  const sorted = [...entidades].sort((a, b) => b.valor - a.valor);
  const total = sorted.reduce((s, e) => s + e.valor, 0);
  let acumulado = 0;
  const pareto: string[] = [];
  for (const e of sorted) {
    acumulado += e.valor;
    pareto.push(e.nombre);
    if (acumulado >= total * 0.80) break;
  }
  return pareto;
}

export function esEntidadPareto(nombre: string, paretoList: string[]): boolean {
  return paretoList.includes(nombre);
}

// --- PARTE 2: REQUISITOS DE CALIDAD ---

// C1: Máximo cruce de datos disponibles
// Mapa de cruces posibles por tipo de entidad.
// El motor debe intentar TODOS antes de generar el insight.

export const CRUCES_DISPONIBLES = {
  vendedor: {
    directos: ['ytd_neto', 'variacion_ytd', 'riesgo', 'clientes_activos', 'ticket_promedio', 'promedio_3m', 'canal_principal'],
    conVentas: ['desglose_por_cliente_$', 'desglose_por_producto', 'desglose_por_canal', 'desglose_por_departamento', 'tendencia_mensual', 'ritmo_diario', 'tasa_devolucion', 'ratio_bonificacion'],
    conOtrasTablas: ['dormidos_asignados', 'inventario_productos_top', 'salud_clientes', 'meta_mes', 'cumplimiento_meta']
  },
  cliente: {
    directos: ['venta_actual', 'venta_anterior', 'variacion', 'peso', 'meses_activo', 'productos_unicos', 'transacciones', 'señal_riesgo', 'frecuencia_compra'],
    conVentas: ['mix_producto_yoy', 'historial_vendedor', 'canal', 'departamento', 'patron_frecuencia', 'historial_devoluciones', 'ratio_bonificacion', 'evolucion_ticket'],
    conOtrasTablas: ['inventario_productos_top', 'salud_vendedor', 'tendencia_departamento']
  },
  producto: {
    directos: ['venta_actual', 'venta_anterior', 'variacion', 'clientes_activos', 'vendedores'],
    conVentas: ['desglose_cliente_yoy', 'por_departamento', 'por_canal', 'tendencia_mensual', 'canasta_co_compra', 'variantes_familia'],
    conOtrasTablas: ['stock_actual', 'velocidad_venta', 'cobertura_meses', 'rendimiento_vendedores']
  }
} as const;

// C2: Cuantificación
// Si hay venta_neta → $. Si solo unidades → unidades. Porcentaje acompaña, nunca lidera.

export function formatearImpacto(valor: number, hasVentaNeta: boolean): string {
  if (hasVentaNeta) {
    if (Math.abs(valor) >= 1_000_000) return `$${(valor / 1_000_000).toFixed(1)}M`;
    if (Math.abs(valor) >= 1_000) return `$${(valor / 1_000).toFixed(1)}k`;
    return `$${Math.round(valor)}`;
  }
  return `${valor.toLocaleString('es')} uds`;
}

// C3: "Por qué me debería importar" — validado por la existencia de impactoAbsoluto + contexto de cruce
// C4: Causa identificable + contraste con portafolio (v1.1)
// C5: Comparación temporal válida

export function validarComparacionTemporal(
  tipo: 'YTD' | 'MTD' | 'historico',
  diaDelMes: number,
  _fechaRef: Date
): { valido: boolean; confianza: 'alta' | 'media' | 'señal_temprana' } {
  if (tipo === 'YTD') return { valido: true, confianza: 'alta' };
  if (tipo === 'historico') return { valido: true, confianza: 'alta' };
  if (tipo === 'MTD') {
    return { valido: true, confianza: diaDelMes >= 15 ? 'media' : 'señal_temprana' };
  }
  return { valido: false, confianza: 'señal_temprana' };
}

// C6 v1.1: Acción concreta — debe tener entidades involucradas y respaldo numérico

export function validarAccionConcreta(accion: AccionConcreta): boolean {
  if (!accion) return false;
  if (!accion.texto || accion.texto.trim() === '') return false;
  if (!accion.entidadesInvolucradas || accion.entidadesInvolucradas.length === 0) return false;
  if (!accion.respaldoNumerico || accion.respaldoNumerico.trim() === '') return false;
  return true;
}

// --- PARTE 3: REGLAS ESTRUCTURALES ---

// E1: Anti-contradicción
// Una entidad tiene un solo insight activo.
// Si hay múltiples candidatos para la misma entidad, se fusionan.

export function resolverContradiccion(
  candidatos: InsightCandidate[]
): InsightCandidate[] {
  const porEntidad = new Map<string, InsightCandidate[]>();
  candidatos.forEach(c => {
    const key = `${c.entityType}-${c.entityId}`;
    if (!porEntidad.has(key)) porEntidad.set(key, []);
    porEntidad.get(key)!.push(c);
  });

  const resultado: InsightCandidate[] = [];
  porEntidad.forEach((grupo) => {
    if (grupo.length === 1) {
      resultado.push(grupo[0]);
    } else {
      const mejor = grupo.reduce((a, b) =>
        Math.abs(a.impactoAbsoluto) > Math.abs(b.impactoAbsoluto) ? a : b
      );
      mejor.señalesConvergentes = grupo.length;
      mejor.crossedTables = [...new Set(grupo.flatMap(g => g.crossedTables))];
      mejor.profundidadCruce = mejor.crossedTables.length;
      resultado.push(mejor);
    }
  });
  return resultado;
}

// E2: Señal balanceada
// Por cada 3-4 insights negativos, al menos 1 positivo.

export function validarBalance(insights: { esPositivo: boolean }[]): {
  balanceado: boolean;
  positivosFaltantes: number;
} {
  const negativos = insights.filter(i => !i.esPositivo).length;
  const positivos = insights.filter(i => i.esPositivo).length;
  const positivosNecesarios = Math.ceil(negativos / 4);
  return {
    balanceado: positivos >= positivosNecesarios,
    positivosFaltantes: Math.max(0, positivosNecesarios - positivos)
  };
}

// E3: Confianza temporal

export function calcularConfianzaTemporal(
  _diaDelMes: number,
  historialPctPorDia: number[],
): { pctTipico: number; varianza: number; confiable: boolean } {
  if (historialPctPorDia.length === 0) {
    return { pctTipico: 0, varianza: 0, confiable: false };
  }
  const avg = historialPctPorDia.reduce((s, v) => s + v, 0) / historialPctPorDia.length;
  const variance = historialPctPorDia.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / historialPctPorDia.length;
  return {
    pctTipico: avg,
    varianza: Math.sqrt(variance),
    confiable: avg >= 40
  };
}

// E4 v1.1: Contexto completo antes de cualquier afirmación
// ContextoCompleto ahora incluye metaVendedor para priorización cruzada.

export interface ContextoCompleto {
  frecuenciaCompra: number | null;
  distribucionIntraMes: { early: number; mid: number; late: number } | null;
  estacionalidad: Map<number, number> | null;
  patronCanal: string | null;
  volumenRelativoSegmento: number | null;
  mesesHistoricos: number;
  metaVendedor: { metaMes: number; cumplimiento: number; gap: number } | null; // NUEVO v1.1
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
    if (total > 0) {
      const pctLate = (mid + late) / total;
      if (pctLate > 0.7 && diasSinCompra < (contexto.frecuenciaCompra || 30) * 1.5) {
        return { esDormidoReal: false, razon: 'Patrón histórico indica compra predominante en segunda quincena', reactivacionPrioritaria: false };
      }
    }
  }

  if (contexto.frecuenciaCompra && diasSinCompra < contexto.frecuenciaCompra * 1.3) {
    return { esDormidoReal: false, razon: 'Dentro del rango normal de frecuencia de compra', reactivacionPrioritaria: false };
  }

  // E4 v1.1: si el vendedor está lejos de meta y este cliente tiene valor alto → reactivación prioritaria
  let reactivacionPrioritaria = false;
  if (
    contexto.metaVendedor &&
    contexto.metaVendedor.cumplimiento < 80 &&
    valorCliente != null &&
    p75Clientes != null &&
    valorCliente >= p75Clientes
  ) {
    reactivacionPrioritaria = true;
  }

  return { esDormidoReal: true, razon: 'Supera frecuencia esperada con margen', reactivacionPrioritaria };
}

// E5: Detección de sustitución y familias de producto

export function detectarFamiliasProducto(productos: string[]): Map<string, string[]> {
  const families = new Map<string, string[]>();

  productos.forEach(nombre => {
    const normalizado = nombre
      .replace(/\d+[xX]\d+/g, '')
      .replace(/\(\+\d+%\)/g, '')
      .replace(/\d+\s*(GR|GRS|KG|OZ|ML|LT)\b/gi, '')
      .replace(/\s*(SS|WM|PROMO\w*)\b/gi, '')
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
  families.forEach((prods, key) => {
    if (prods.length > 1) resultado.set(key, prods);
  });

  return resultado;
}

export function esVariantePromocional(nombre: string): boolean {
  return /\(\+\d+%\)|PROMO|MARINAR|BONIF/i.test(nombre);
}

// E6: Consolidación de cascada

export function detectarCascadas(
  candidatos: InsightCandidate[]
): Map<string, InsightCandidate[]> {
  const entityMentions = new Map<string, InsightCandidate[]>();

  candidatos.forEach(c => {
    const key = `${c.entityType}-${c.entityId}`;
    if (!entityMentions.has(key)) entityMentions.set(key, []);
    entityMentions.get(key)!.push(c);
  });

  const cascadas = new Map<string, InsightCandidate[]>();
  entityMentions.forEach((grupo, key) => {
    if (grupo.length >= 3) cascadas.set(key, grupo);
  });

  return cascadas;
}

// E7: Agrupación dinámica de co-declive

export function calcularCoOcurrencia(
  canastas: Map<string, Set<string>>
): Map<string, Map<string, number>> {
  const coMatrix = new Map<string, Map<string, number>>();

  canastas.forEach(basket => {
    const prods = [...basket];
    for (let i = 0; i < prods.length; i++) {
      for (let j = i + 1; j < prods.length; j++) {
        const a = prods[i], b = prods[j];
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
  totalCanastas: Map<string, number>
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
      const totalProd = totalCanastas.get(prod) || 1;
      const proporcion = coCount / totalProd;

      if (proporcion > 0.15) {
        grupo.push(otro);
        asignado.add(otro);
      }
    }

    if (grupo.length >= 2) grupos.push(grupo);
  }

  return grupos;
}

// E8 v1.1: Indicador anticipado (múltiples señales convergentes + justificación histórica)

export function evaluarIndicadorAnticipado(señales: {
  cambioBaseClientes: number;
  cambioRevenue: number;
  tendenciaMensual3m: number[];
  inventarioMesesCobertura: number | null;
  saludVendedor: string | null;
  contextoHistoricoJustificacion: string; // NUEVO v1.1 — por qué esta señal es diferente al ruido normal
}): { esAnticipado: boolean; confianza: number; señalesConvergentes: number; justificacion: string } | null {
  // E8 v1.1: si no hay justificación histórica, no emitir
  if (!señales.contextoHistoricoJustificacion || señales.contextoHistoricoJustificacion.trim() === '') {
    return null;
  }

  let señalesNegativas = 0;

  if (señales.cambioBaseClientes < -10) señalesNegativas++;
  if (señales.cambioRevenue < -5) señalesNegativas++;
  if (señales.tendenciaMensual3m.length >= 3) {
    const declining = señales.tendenciaMensual3m.every((v, i) =>
      i === 0 || v <= señales.tendenciaMensual3m[i - 1]
    );
    if (declining) señalesNegativas++;
  }
  if (señales.inventarioMesesCobertura !== null && señales.inventarioMesesCobertura > 6) señalesNegativas++;
  if (señales.saludVendedor === 'critico' || señales.saludVendedor === 'riesgo') señalesNegativas++;

  // E8 v1.1: requiere mínimo 3 señales convergentes
  return {
    esAnticipado: señalesNegativas >= 3,
    confianza: señalesNegativas / 5,
    señalesConvergentes: señalesNegativas,
    justificacion: señales.contextoHistoricoJustificacion
  };
}

// E9 v1.1: Penetración de catálogo

export function evaluarPenetracion(
  productosCliente: number,
  productosDisponiblesSegmento: number,
  valorCliente: number,
  p90Clientes: number,
  historicoPenetracion: number | null,
  mesesHistorico: number,        // NUEVO v1.1
  promedioSegmento: number       // NUEVO v1.1 — penetración promedio del segmento (0-1)
): { fragil: boolean; oportunidad: boolean; seContrajo: boolean; pordebajoDelSegmento: boolean } | null {
  // E9 v1.1: requiere historial mínimo
  if (mesesHistorico < 6) return null;

  if (valorCliente < p90Clientes) return null; // solo top 10%

  const penetracion = productosDisponiblesSegmento > 0
    ? productosCliente / productosDisponiblesSegmento
    : 0;

  const seContrajo = historicoPenetracion !== null && penetracion < historicoPenetracion * 0.85;
  const pordebajoDelSegmento = penetracion < promedioSegmento;

  // Solo emitir "baja penetración" si está debajo del promedio de su segmento
  if (!pordebajoDelSegmento && !seContrajo) return null;

  return {
    fragil: penetracion < 0.20,
    oportunidad: penetracion < 0.40,
    seContrajo,
    pordebajoDelSegmento
  };
}

// --- PARTE 4: REGLAS DE LENGUAJE (v1.1) ---

// L1: CERO JERGA TÉCNICA en el output al usuario

export const TERMINOS_PROHIBIDOS_EN_OUTPUT: string[] = [
  'pareto',
  'percentil',
  'co-declive',
  'mix-shift',
  'penetración de catálogo',
  'señal temprana',
  'cascada',
  'co-ocurrencia',
  'baseline',
  'churn',
  'threshold',
  'pipeline',
  'funnel',
  'KPI'
];

const SUSTITUCIONES_JERGA: Array<[RegExp, string]> = [
  [/\b80\/20\b/gi, 'principales'],
  [/\bpareto\b/gi, 'de mayor volumen'],
  [/\bpercentiles?\b/gi, 'rango'],
  [/\bchurn\b/gi, 'pérdida de clientes'],
  [/\bmix[- ]shift\b/gi, 'cambio en la composición de compra'],
  [/\bpenetración de catálogo\b/gi, 'variedad de productos comprados'],
  [/\bbaseline\b/gi, 'comportamiento habitual'],
  [/\bseñal temprana\b/gi, ''], // si es señal temprana, va en confianza, no en texto
  [/\bcascadas?\b/gi, 'efecto dominó'],
  [/\bco[- ]declive\b/gi, 'caída simultánea'],
  [/\bco[- ]ocurrencia\b/gi, 'compra conjunta'],
  [/\bthreshold\b/gi, 'umbral'],
  [/\bpipeline\b/gi, 'flujo'],
  [/\bfunnel\b/gi, 'embudo'],
  [/\bKPI\b/g, 'indicador'],
];

export function sustituirJerga(texto: string): string {
  let resultado = texto;
  for (const [regex, sustituto] of SUSTITUCIONES_JERGA) {
    resultado = resultado.replace(regex, sustituto);
  }
  // Limpiar dobles espacios resultantes de sustituciones por cadena vacía
  return resultado.replace(/\s{2,}/g, ' ').trim();
}

export function contieneJerga(texto: string): { tieneJerga: boolean; terminosEncontrados: string[] } {
  const encontrados: string[] = [];
  const lower = texto.toLowerCase();
  for (const termino of TERMINOS_PROHIBIDOS_EN_OUTPUT) {
    // Buscar como palabra independiente cuando es posible
    const regex = new RegExp(`\\b${termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) encontrados.push(termino);
  }
  return { tieneJerga: encontrados.length > 0, terminosEncontrados: encontrados };
}

// L2: Conclusión obligatoria — interpretación, no repetición

const CONCLUSIONES_GENERICAS = [
  'requiere atención',
  'es importante',
  'hay que revisar',
  'debe analizarse',
  'es relevante',
  'se debe monitorear',
];

export function esConclusionValida(conclusion: string): boolean {
  if (!conclusion || conclusion.trim().length < 10) return false;
  const lower = conclusion.toLowerCase().trim();
  for (const generica of CONCLUSIONES_GENERICAS) {
    if (lower === generica || lower.startsWith(generica + '.') || lower === generica + '.') return false;
  }
  return true;
}

// L3: Autocontenido — narrativaCompleta debe existir y tener contenido sustancial
// L4: Acciones concretas derivadas de data — validado por validarAccionConcreta
// L5: Aterrizar — filosófico, implícito en L1-L4

// --- PARTE 5: REGLAS DE INTEGRACIÓN (v1.1) ---

// I1: INVENTARIO OBLIGATORIO

export function evaluarIntegracionInventario(
  producto: string,
  inventory: Array<{ producto: string; categoria: string; unidades: number }>,
  ventasMensualesPromedio: number
): { stockActual: number; mesesCobertura: number; sinStock: boolean; sobrestock: boolean } | null {
  if (!inventory || inventory.length === 0) return null;
  const item = inventory.find(i => i.producto === producto);
  if (!item) return null;

  const stockActual = item.unidades;
  const mesesCobertura = ventasMensualesPromedio > 0
    ? stockActual / ventasMensualesPromedio
    : (stockActual === 0 ? 0 : Number.POSITIVE_INFINITY);

  return {
    stockActual,
    mesesCobertura,
    sinStock: stockActual === 0,
    sobrestock: mesesCobertura > 6,
  };
}

// I2: METAS OBLIGATORIAS

export function evaluarIntegracionMetas(
  vendedor: string,
  metas: Array<{ mes: number; anio: number; vendedor: string; meta: number; meta_uds: number; meta_usd: number; tipo_meta: string }>,
  fechaRef: Date,
  ventaActualMes: number
): { metaMes: number; cumplimiento: number; gap: number; proyeccion: number; tipoMeta: string } | null {
  if (!metas || metas.length === 0) return null;

  const mes = fechaRef.getMonth() + 1; // Store usa 1-12, getMonth() devuelve 0-11
  const anio = fechaRef.getFullYear();

  const meta = metas.find(m => m.vendedor === vendedor && m.anio === anio && m.mes === mes);
  if (!meta) return null;

  const tipoMeta = meta.tipo_meta || 'uds';
  const metaMes = tipoMeta === 'usd' ? meta.meta_usd : meta.meta_uds || meta.meta;
  if (!metaMes || metaMes <= 0) return null;

  const cumplimiento = (ventaActualMes / metaMes) * 100;
  const gap = metaMes - ventaActualMes;

  const diaDelMes = calcularDiaDelMes(fechaRef);
  const diasEnMes = calcularDiasEnMes(fechaRef);
  const proyeccion = diaDelMes > 0 ? (ventaActualMes / diaDelMes) * diasEnMes : 0;

  return { metaMes, cumplimiento, gap, proyeccion, tipoMeta };
}

// --- AUXILIARES DE FECHA ---

export function calcularDiasEnMes(fecha: Date): number {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
}

export function calcularDiaDelMes(fecha: Date): number {
  return fecha.getDate();
}

// --- VALIDACIÓN FINAL v1.1 ---
// Un insight candidato debe pasar TODAS estas validaciones en orden.

export function validarInsight(
  candidato: InsightCandidate,
  config: InsightStandardConfig
): { aprobado: boolean; razon?: string; maxPrioridad: PrioridadInsight; warnings: string[] } {
  const warnings: string[] = [];

  // F1: Umbral dinámico
  let maxPrio = determinarMaxPrioridad(candidato.percentileRank);

  // C1 v1.1: Cruce de tablas mínimo y completitud
  if (candidato.crossedTables.length < 2) {
    return { aprobado: false, razon: 'Insuficiente cruce de tablas (mínimo 2)', maxPrioridad: maxPrio, warnings };
  }
  if (maxPrio === 'CRITICA' && candidato.crossedTables.length < 3) {
    maxPrio = 'ALTA';
  }
  if (maxPrio === 'ALTA' && candidato.crossedTables.length < 2) {
    maxPrio = 'MEDIA';
  }

  // Completitud de cruces vs disponibles para la entidad
  const crucesPosiblesEntidad = (() => {
    const m = CRUCES_DISPONIBLES as unknown as Record<string, { directos: readonly string[]; conVentas: readonly string[]; conOtrasTablas: readonly string[] }>;
    const c = m[candidato.entityType];
    if (!c) return 0;
    return c.directos.length + c.conVentas.length + c.conOtrasTablas.length;
  })();
  if (crucesPosiblesEntidad > 0) {
    const ratioCruces = candidato.crossedTables.length / crucesPosiblesEntidad;
    if (ratioCruces < 0.35 && (maxPrio === 'CRITICA' || maxPrio === 'ALTA')) {
      maxPrio = 'MEDIA';
      warnings.push('Cruces insuficientes vs disponibles — prioridad limitada a MEDIA');
    }
  }

  // C2: Cuantificación
  if (candidato.impactoAbsoluto === 0) {
    return { aprobado: false, razon: 'Sin impacto cuantificado', maxPrioridad: maxPrio, warnings };
  }

  // C4 v1.1: Causa identificada + contraste con portafolio para CRITICA/ALTA
  if (!candidato.causaIdentificada) {
    return { aprobado: false, razon: 'Sin causa identificable en los datos', maxPrioridad: maxPrio, warnings };
  }
  if ((maxPrio === 'CRITICA' || maxPrio === 'ALTA') && (!candidato.contrastePortafolio || candidato.contrastePortafolio.trim() === '')) {
    maxPrio = 'MEDIA';
    warnings.push('Sin contraste de portafolio — prioridad bajada a MEDIA');
  }

  // C5: Comparación temporal válida
  const temporal = validarComparacionTemporal(
    candidato.comparacionTipo,
    config.diaDelMes,
    new Date()
  );
  if (!temporal.valido) {
    return { aprobado: false, razon: 'Comparación temporal inválida', maxPrioridad: maxPrio, warnings };
  }
  if (temporal.confianza === 'señal_temprana' && (maxPrio === 'CRITICA' || maxPrio === 'ALTA')) {
    maxPrio = 'MEDIA';
  }

  // C6 v1.1: Acción concreta con entidades + respaldo numérico
  if (!validarAccionConcreta(candidato.accion)) {
    return { aprobado: false, razon: 'Acción no concreta (falta texto, entidades o respaldo numérico)', maxPrioridad: maxPrio, warnings };
  }

  // L1: Sin jerga técnica en narrativa, conclusión, ni texto de acción
  const camposTexto = [
    candidato.narrativaCompleta,
    candidato.conclusion,
    candidato.accion.texto,
    candidato.contrastePortafolio || '',
  ].join(' \n ');
  const jergaCheck = contieneJerga(camposTexto);
  if (jergaCheck.tieneJerga) {
    return {
      aprobado: false,
      razon: `Contiene jerga técnica prohibida: ${jergaCheck.terminosEncontrados.join(', ')}`,
      maxPrioridad: maxPrio,
      warnings,
    };
  }

  // L2: Conclusión no vacía y no genérica
  if (!esConclusionValida(candidato.conclusion)) {
    return { aprobado: false, razon: 'Conclusión vacía o genérica (debe interpretar, no repetir)', maxPrioridad: maxPrio, warnings };
  }

  // L3: NarrativaCompleta no vacía
  if (!candidato.narrativaCompleta || candidato.narrativaCompleta.trim().length === 0) {
    return { aprobado: false, razon: 'Sin narrativa completa autocontenida', maxPrioridad: maxPrio, warnings };
  }

  // I1: Warning si producto sin cruce de inventario disponible
  if (candidato.entityType === 'producto' && candidato.inventarioContext === null) {
    warnings.push('Producto sin cruce de inventario verificado');
  }

  // I2: Warning si vendedor sin cruce de meta disponible
  if (candidato.entityType === 'vendedor' && candidato.metaContext === null) {
    warnings.push('Vendedor sin cruce de meta verificado');
  }

  // F1 v1.1 — INFORMATIVO = REDUCIDO (paso FINAL)
  if (!candidato.esAccionable && (maxPrio === 'CRITICA' || maxPrio === 'ALTA')) {
    maxPrio = 'MEDIA';
    warnings.push('No accionable — prioridad limitada a MEDIA');
  }

  return { aprobado: true, maxPrioridad: maxPrio, warnings };
}

// --- FORMATO ---

export const FORMATO = {
  moneda: (valor: number, hasVentaNeta: boolean): string => formatearImpacto(valor, hasVentaNeta),
  porcentaje: (valor: number): string => `${Math.round(valor)}%`,
  numero: (valor: number): string => valor.toLocaleString('es'),
} as const;
