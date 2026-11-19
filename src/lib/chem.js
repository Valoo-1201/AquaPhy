// Química del cloro y escala del indicador universal.

// pKa del ácido hipocloroso en función de la temperatura (Morris, 1966).
export function pKa(tempC = 20) {
  const T = tempC + 273.15
  return 3000 / T - 10.0686 + 0.0253 * T
}

// Fracción del cloro libre que está como HOCl (la forma que desinfecta).
export function fraccionHOCl(ph, tempC = 20) {
  return 1 / (1 + 10 ** (ph - pKa(tempC)))
}

// Escala del indicador universal según la tabla del reto (MICROSIDE).
// Mismos colores que COLORES[] en el firmware. Índice = pH redondeado.
export const INDICADOR = [
  ['Rojo', '#d7191c'], ['Rojo', '#e8281f'], ['Rojo', '#f03c25'],
  ['Rojo naranja', '#f46a1f'], ['Naranja', '#f7941d'], ['Amarillo naranja', '#fbb117'],
  ['Amarillo', '#ffe01b'], ['Verde', '#3db54a'], ['Verde azulado', '#1ba39c'],
  ['Azul', '#1e88e5'], ['Azul oscuro', '#1a4fa0'], ['Índigo', '#3f2d9c'],
  ['Violeta', '#6a2c91'], ['Violeta', '#7b2a8c'], ['Violeta oscuro', '#4b1a5e'],
]

export function clasificacion(ph) {
  const i = Math.max(0, Math.min(14, Math.round(ph)))
  if (i <= 2) return 'Ácido fuerte'
  if (i <= 4) return 'Ácido'
  if (i <= 6) return 'Ácido débil'
  if (i === 7) return 'Neutro'
  if (i <= 9) return 'Alcalino débil'
  if (i <= 11) return 'Alcalino'
  return 'Alcalino fuerte'
}

export function colorPH(ph) {
  const i = Math.max(0, Math.min(14, Math.round(ph)))
  return { i, nombre: INDICADOR[i][0], hex: INDICADOR[i][1] }
}

// Sonda del reto: lineal y decreciente. pH 0 → ADC 892 (2.877 V); pH 14 → ADC 130 (0.419 V).
// ADC de 10 bits con referencia de 3.3 V.
export const ADC_PH0 = 892
export const CUENTAS_POR_PH = (892 - 130) / 14 // ≈ 54.4
export const phAADC = (ph) => Math.round(ADC_PH0 - ph * CUENTAS_POR_PH)
export const adcAVolt = (adc) => (adc * 3.3) / 1023

export const GRADIENTE_INDICADOR = `linear-gradient(90deg, ${INDICADOR.map(([, c], i) => `${c} ${(i / 14) * 100}%`).join(', ')})`

// Estado ciudadano a partir de la telemetría.
export function estadoCiudadano(t) {
  if (t.tempPlaca > 55) return 'calor'
  if (t.paro) return 'alto'
  if (t.estado === 1 || t.estado === 2) return 'mezclando'
  if (t.ph < 6.5 || t.ph > 8.5) return 'alto'
  if (t.ph > 7.6) return 'atento'
  return 'feliz'
}

export const MENSAJES = {
  feliz: { tono: 'ok', titulo: 'Tu agua está limpia y protegida', texto: 'El pH está en zona segura y el cloro trabaja a buen ritmo.' },
  atento: { tono: 'aviso', titulo: 'Agua potable, cloro a medias', texto: 'El pH está algo alto: el cloro desinfecta menos. AquaPhy puede ajustarlo.' },
  mezclando: { tono: 'aviso', titulo: '¡Llegó agua! Estamos regulando la calidad', texto: 'Espera un momento antes de usarla para beber o cocinar.' },
  alto: { tono: 'alerta', titulo: 'No uses el agua todavía', texto: 'El sistema está ajustando la calidad para tu seguridad.' },
  calor: { tono: 'alerta', titulo: 'El equipo está tomando un respiro por calor', texto: 'La dosificación se pausó hasta que la placa se enfríe.' },
}
