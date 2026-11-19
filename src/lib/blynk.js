// Cliente mínimo de la HTTP API de Blynk.Cloud
// https://docs.blynk.io/en/blynk.cloud/https-api-overview
// Nota: el token viaja en la URL y queda visible en el navegador.

const base = (cfg) => `https://${cfg.server.replace(/^https?:\/\//, '').replace(/\/$/, '')}/external/api`

export async function blynkGet(cfg, pins) {
  const qs = pins.map(encodeURIComponent).join('&')
  const r = await fetch(`${base(cfg)}/get?token=${encodeURIComponent(cfg.token)}&${qs}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Blynk respondió ${r.status}`)
  return r.json()
}

export async function blynkSet(cfg, pin, value) {
  const r = await fetch(`${base(cfg)}/update?token=${encodeURIComponent(cfg.token)}&${pin}=${encodeURIComponent(value)}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`No se pudo escribir ${pin} (${r.status})`)
}

export async function blynkOnline(cfg) {
  const r = await fetch(`${base(cfg)}/isHardwareConnected?token=${encodeURIComponent(cfg.token)}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Blynk respondió ${r.status}`)
  return (await r.text()).trim() === 'true'
}
