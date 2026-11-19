import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PINS, ESTADOS, TEMP_LIMITE, NOM_MIN, NOM_MAX, leerConfigBlynk, guardarConfigBlynk } from '../config.js'
import { blynkGet, blynkSet, blynkOnline } from '../lib/blynk.js'
import { Simulador } from '../lib/sim.js'
import { sonidoInicio, sonidoFin, sonidoGota, sonidoAlerta } from '../lib/sound.js'

const hora = (d = new Date()) =>
  d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })

// Historial de 24 h de referencia, con dos cortes de tandeo (sin agua = sin lectura).
function historial24h() {
  const ahora = Date.now()
  const paso = 15 * 60 * 1000
  const cortes = [
    [ahora - 19 * 3600e3, ahora - 14.5 * 3600e3],
    [ahora - 7 * 3600e3, ahora - 4.5 * 3600e3],
  ]
  const puntos = []
  for (let t = ahora - 24 * 3600e3; t <= ahora; t += paso) {
    const enCorte = cortes.some(([a, b]) => t >= a && t <= b)
    const trasCorte = cortes.map(([, b]) => t - b).filter((d) => d > 0 && d < 2 * 3600e3)[0]
    let ph = 7.18 + 0.1 * Math.sin(t / 5.1e6) + 0.04 * Math.sin(t / 1.3e6)
    if (trasCorte !== undefined) ph += 0.6 * Math.exp(-trasCorte / 2.4e6) // agua nueva llega alcalina
    puntos.push({ t, ph: enCorte ? null : +ph.toFixed(3) })
  }
  return { puntos, cortes }
}

const INICIAL = { ph: 7.3, umbral: 6.8, estado: 0, bomba: 0, paro: 0, tempPlaca: 38, acido: 0, pulso: 0, voltaje: 12.3 }

export function useAquaPhy() {
  const [cfg, setCfg] = useState(leerConfigBlynk)
  const [modo, setModo] = useState(() => (leerConfigBlynk().token ? 'blynk' : 'demo'))
  const [t, setT] = useState(INICIAL)
  const [enLinea, setEnLinea] = useState(true)
  const [ultimaLectura, setUltimaLectura] = useState(new Date())
  const [vivo, setVivo] = useState([])
  const [eventos, setEventos] = useState(() => [
    { id: 1, hora: '08:20 a.m.', texto: 'Mantenimiento de sonda completado', nodo: 'Centro Histórico', tipo: 'info' },
    { id: 2, hora: '09:58 a.m.', texto: 'Batería al 18 % en nodo Amalucan', nodo: 'Amalucan', tipo: 'aviso' },
    { id: 3, hora: '10:30 a.m.', texto: 'Tandeo iniciado en sector San Manuel', nodo: 'San Manuel', tipo: 'info' },
  ])
  const [avisos, setAvisos] = useState([])
  const [modal, setModal] = useState(null)
  const [midiendoHasta, setMidiendoHasta] = useState(0)
  const [reportes, setReportes] = useState(14)
  const [error, setError] = useState('')
  const sim = useRef(null)
  const previo = useRef(INICIAL)
  const tRef = useRef(INICIAL)
  const historia = useMemo(historial24h, [])

  const registrar = useCallback((texto, tipo = 'info', nodo = 'Centro Histórico') => {
    setEventos((e) => [{ id: Date.now() + Math.random(), hora: hora(), texto, nodo, tipo }, ...e].slice(0, 60))
  }, [])

  const avisar = useCallback((texto, tipo = 'info') => {
    const id = Date.now() + Math.random()
    setAvisos((a) => [...a, { id, texto, tipo }].slice(-4))
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4200)
  }, [])

  // Bucle de datos: simulador local o sondeo a Blynk.
  useEffect(() => {
    if (modo === 'demo') {
      if (!sim.current) sim.current = new Simulador()
      setEnLinea(true)
      setError('')
      const id = setInterval(() => {
        sim.current.tick()
        setT(sim.current.lectura())
        setUltimaLectura(new Date())
      }, 200)
      return () => clearInterval(id)
    }
    let vivoFlag = true
    const pins = [PINS.ph, PINS.umbral, PINS.estado, PINS.bomba, PINS.paro, PINS.tempPlaca, PINS.acido, PINS.pulso, PINS.voltaje]
    const leer = async () => {
      try {
        const d = await blynkGet(cfg, pins)
        if (!vivoFlag) return
        const n = (k, def = 0) => (d[k] === undefined || d[k] === '' ? def : Number(d[k]))
        setT({
          ph: n(PINS.ph, 7), umbral: n(PINS.umbral, 6.8), estado: n(PINS.estado), bomba: n(PINS.bomba),
          paro: n(PINS.paro), tempPlaca: n(PINS.tempPlaca, 35), acido: n(PINS.acido), pulso: n(PINS.pulso), voltaje: n(PINS.voltaje, 12),
        })
        setUltimaLectura(new Date())
        setError('')
      } catch (e) {
        if (vivoFlag) setError(e.message || 'Sin respuesta de Blynk')
      }
    }
    const conexion = async () => {
      try { const ok = await blynkOnline(cfg); if (vivoFlag) setEnLinea(ok) } catch { if (vivoFlag) setEnLinea(false) }
    }
    leer(); conexion()
    const a = setInterval(leer, 1500)
    const b = setInterval(conexion, 10000)
    return () => { vivoFlag = false; clearInterval(a); clearInterval(b) }
  }, [modo, cfg])

  useEffect(() => { tRef.current = t }, [t])

  // Serie viva: un punto por segundo.
  useEffect(() => {
    const id = setInterval(() => {
      setVivo((v) => [...v, { s: Date.now(), ph: +tRef.current.ph.toFixed(3), umbral: tRef.current.umbral }].slice(-90))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Gotitas mientras la bomba está encendida.
  useEffect(() => {
    if (!t.bomba) return
    sonidoGota()
    const id = setInterval(sonidoGota, 260)
    return () => clearInterval(id)
  }, [t.bomba])

  // Transiciones → sonidos, avisos y bitácora.
  useEffect(() => {
    const p = previo.current
    const activo = (e) => e === 1 || e === 2
    if (!activo(p.estado) && t.estado === 1) {
      sonidoInicio()
      avisar(`Dosificando ácido · pulso de ${t.pulso} ms`, 'dosis')
      registrar(`Dosificación iniciada hacia pH ${t.umbral.toFixed(2)}`, 'dosis')
    }
    if (activo(p.estado) && t.estado === 3) {
      sonidoFin()
      avisar(`Umbral alcanzado: pH ${t.ph.toFixed(2)}`, 'ok')
      registrar(`Umbral alcanzado (pH ${t.ph.toFixed(2)}), bomba detenida`, 'ok')
    }
    if (activo(p.estado) && t.estado === 0) {
      sonidoFin()
      registrar('Ciclo de dosificación detenido', 'aviso')
    }
    if (p.estado !== 4 && t.estado === 4) {
      sonidoAlerta()
      registrar('Paro de emergencia activado', 'alerta')
    }
    if (p.tempPlaca <= TEMP_LIMITE && t.tempPlaca > TEMP_LIMITE) {
      sonidoAlerta()
      setModal({ tipo: 'calor' })
      registrar(`Temperatura de placa alta (${t.tempPlaca.toFixed(1)} °C)`, 'alerta')
    }
    const fuera = (x) => x < NOM_MIN || x > NOM_MAX
    if (!fuera(p.ph) && fuera(t.ph)) registrar(`pH fuera de la NOM-127 (${t.ph.toFixed(2)})`, 'alerta')
    previo.current = t
  }, [t, avisar, registrar])

  // ——— Acciones ———
  const dosificar = useCallback(async () => {
    const actual = tRef.current
    if (actual.paro) return avisar('Libera el paro de emergencia antes de dosificar.', 'alerta')
    if (actual.tempPlaca > TEMP_LIMITE) return setModal({ tipo: 'calor' })
    if (actual.estado === 1 || actual.estado === 2) return avisar('Ya hay un ciclo en curso.', 'info')
    if (actual.ph <= actual.umbral + 0.03) {
      registrar('Dosificación bloqueada: pH ya en el umbral', 'aviso')
      return setModal({ tipo: 'bloqueo', ph: actual.ph, umbral: actual.umbral })
    }
    if (modo === 'demo') sim.current.iniciar(actual.umbral)
    else {
      try { await blynkSet(cfg, PINS.dosificar, 1) } catch (e) { avisar(e.message, 'alerta') }
    }
  }, [modo, cfg, avisar, registrar])

  const fijarUmbral = useCallback(async (v) => {
    setT((x) => ({ ...x, umbral: v }))
    if (modo === 'demo') { if (sim.current) sim.current.umbral = v }
    else {
      try { await blynkSet(cfg, PINS.umbral, v.toFixed(2)) } catch (e) { avisar(e.message, 'alerta') }
    }
  }, [modo, cfg, avisar])

  const confirmarUmbral = useCallback((v) => registrar(`Umbral ajustado a pH ${v.toFixed(2)}`, 'info'), [registrar])

  const paro = useCallback(async (on) => {
    if (modo === 'demo') sim.current.setParo(on)
    else {
      try { await blynkSet(cfg, PINS.paro, on ? 1 : 0) } catch (e) { avisar(e.message, 'alerta') }
    }
    if (!on) registrar('Paro de emergencia liberado', 'info')
  }, [modo, cfg, avisar, registrar])

  const detener = useCallback(async () => {
    if (modo === 'demo') sim.current.detener()
    else { try { await blynkSet(cfg, PINS.dosificar, 2) } catch (e) { avisar(e.message, 'alerta') } }
  }, [modo, cfg, avisar])

  const reportarAgua = useCallback((colonia) => {
    setReportes((r) => r + 1)
    setMidiendoHasta(Date.now() + 7000)
    if (modo === 'demo') sim.current.llegaAgua()
    registrar(`Vecino reportó llegada de agua en ${colonia}`, 'info', colonia)
    avisar('Gracias. Estamos midiendo el pH del agua nueva.', 'ok')
  }, [modo, registrar, avisar])

  const simularCalor = useCallback((on) => { if (sim.current) sim.current.calor = on }, [])

  const conectarBlynk = useCallback((nuevo) => {
    guardarConfigBlynk(nuevo)
    setCfg(nuevo)
    setModo(nuevo ? 'blynk' : 'demo')
    registrar(nuevo ? `Conectado a Blynk (${nuevo.server})` : 'Modo demostración activado', 'info')
  }, [registrar])

  return {
    t, modo, cfg, enLinea, error, ultimaLectura, vivo, historia, eventos, avisos, modal, setModal,
    reportes, midiendo: Date.now() < midiendoHasta, estadoTexto: ESTADOS[t.estado] ?? '—',
    dosificar, detener, fijarUmbral, confirmarUmbral, paro, reportarAgua, simularCalor, conectarBlynk,
  }
}
