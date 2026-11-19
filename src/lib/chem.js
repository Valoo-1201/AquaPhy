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

// Mismos colores que el firmware (COLORES[] en el .ino), índice = pH redondeado.
export const INDICADOR = [
  ['Rojo', '#ff0000'], ['Rojo anaranjado', '#ff4500'], ['Naranja', '#ff8000'],
  ['Amarillo naranja', '#ffbe00'], ['Amarillo', '#ffe600'], ['Verde amarillento', '#96dc00'],
  ['Verde', '#00be00'], ['Verde', '#00be00'], ['Verde', '#00be00'],
  ['Verde azulado', '#00b98c'], ['Azul verdoso', '#009bbe'], ['Azul', '#005aeb'],
  ['Azul violáceo', '#433cd2'], ['Púrpura', '#7d2dbe'], ['Violeta', '#a02de1'],
]

export function colorPH(ph) {
  const i = Math.max(0, Math.min(14, Math.round(ph)))
  return { nombre: INDICADOR[i][0], hex: INDICADOR[i][1] }
}

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
