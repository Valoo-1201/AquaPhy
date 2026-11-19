// Sonidos sintetizados con Web Audio, espejo del buzzer XN44:
// inicio = 1 tono largo, fin = 3 tonos cortos, dosificando = gotitas.
let ctx = null
let silencio = false

export function setSilencio(v) { silencio = v }
export function getSilencio() { return silencio }

export function desbloquearAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
  } catch { /* sin audio */ }
}

function tono(freq, inicio, dur, tipo = 'sine', vol = 0.18, freqFin) {
  if (!ctx || silencio) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = tipo
  o.frequency.setValueAtTime(freq, ctx.currentTime + inicio)
  if (freqFin) o.frequency.exponentialRampToValueAtTime(freqFin, ctx.currentTime + inicio + dur)
  g.gain.setValueAtTime(0, ctx.currentTime + inicio)
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + inicio + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + dur)
  o.connect(g).connect(ctx.destination)
  o.start(ctx.currentTime + inicio)
  o.stop(ctx.currentTime + inicio + dur + 0.05)
}

export const sonidoInicio = () => tono(880, 0, 0.65, 'triangle')
export const sonidoFin = () => [0, 0.22, 0.44].forEach((d) => tono(660, d, 0.12, 'triangle'))
export const sonidoGota = () => tono(1300 + Math.random() * 500, 0, 0.09, 'sine', 0.08, 500)
export const sonidoAlerta = () => [0, 0.3].forEach((d) => tono(440, d, 0.25, 'square', 0.08))
export const sonidoRisa = () => [0, 0.09, 0.18].forEach((d, i) => tono(900 + i * 180, d, 0.08, 'sine', 0.1, 1200 + i * 200))
