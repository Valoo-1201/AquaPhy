// Reglas de cloración usadas en AquaPhy. Cada constante cita su fuente (ver src/data/fuentes.js).

// OMS: cloro libre residual ≥ 0.5 mg/L después de al menos 30 min de contacto a pH < 8.0.
export const OMS_CLORO_MIN = 0.5
// NOM-127-SSA1-2021: cloro residual libre de 0.2 a 1.5 mg/L.
export const NOM_CLORO_MIN = 0.2
export const NOM_CLORO_MAX = 1.5

// Tiempo de contacto mínimo: 30 min si pH < 8; 60 min si pH ≥ 8 (OMS / MSF, cloración por lotes).
export const tiempoContactoMin = (ph) => (ph < 8 ? 30 : 60)

// Secretaría de Salud (tabla de desinfección): cloro comercial (hipoclorito de sodio al 6 %)
// 100 mL por cada 1 000 L en condiciones normales; 150 mL si el agua es de dudosa calidad.
export const ML_CLORO_POR_LITRO = { normal: 0.1, dudosa: 0.15 }
// Hipoclorito de calcio: 1 pastilla de 7 g por cada 3 000 L, 30 min de espera.
export const LITROS_POR_PASTILLA = 3000

// Constante de decaimiento del cloro en el agua: valor promedio reportado 0.15 h⁻¹
// (García-Ávila et al., 2020). Varía con la temperatura y la calidad del agua: es un modelo de referencia.
export const KB_REF_POR_HORA = 0.15

// Blanqueador al 6 %: aproximadamente 60 mg de cloro por mL (6 g por 100 mL).
export const MG_CLORO_POR_ML = 60

export function fraccionPastilla(litros) {
  const x = litros / LITROS_POR_PASTILLA
  const cuartos = Math.max(1, Math.round(x * 4))
  const enteras = Math.floor(cuartos / 4)
  const resto = cuartos % 4
  const frac = ['', '¼', '½', '¾'][resto]
  if (!enteras) return `${frac} de pastilla`
  return `${enteras}${frac ? ` ${frac}` : ''} pastilla${enteras > 1 || frac ? 's' : ''}`
}
