// Simulador del nodo ESP32. Replica la máquina de estados del firmware
// (REPOSO → DOSIFICANDO → ESTABILIZANDO → … → FINALIZADO) y su control
// adaptativo de pulsos, para presentar sin hardware conectado.
import { CAUDAL_ML_POR_MS } from '../config.js'

const ESTABILIZACION_MS = 2500
const PULSO_MIN_MS = 50 // el relé conmuta en ~50 ms
const PULSO_MAX_MS = 800
const BANDA = 0.03 // tolerancia sobre el umbral para dar por terminado
const SEGURIDAD = 0.8 // dosifica solo el 80 % de lo calculado para no pasarse

export class Simulador {
  constructor() {
    this.ph = 7.3
    this.umbral = 6.8
    this.estado = 0
    this.bomba = 0
    this.paro = 0
    this.tempPlaca = 38.5
    this.acido = 0
    this.pulso = 0
    this.voltaje = 12.4
    this.kReal = 0.0004 // pH por ms de bomba (proceso "real")
    this.kEst = 0.0003 // estimación que el control va corrigiendo
    this.inicio = 0
    this.phAntes = this.ph
    this.calor = false
    this.ultimo = performance.now()
  }

  iniciar(umbral) {
    if (this.paro) return { ok: false, motivo: 'paro' }
    if (this.tempPlaca > 55) return { ok: false, motivo: 'calor' }
    if (this.estado === 1 || this.estado === 2) return { ok: false, motivo: 'activo' }
    if (this.ph <= umbral + BANDA) return { ok: false, motivo: 'umbral' }
    this.umbral = umbral
    this.#abrir(performance.now())
    return { ok: true }
  }

  #abrir(ahora) {
    const calculado = ((this.ph - this.umbral) / this.kEst) * SEGURIDAD
    this.pulso = Math.round(Math.min(PULSO_MAX_MS, Math.max(PULSO_MIN_MS, calculado)))
    this.phAntes = this.ph
    this.inicio = ahora
    this.estado = 1
    this.bomba = 1
  }

  detener() {
    this.estado = 0
    this.bomba = 0
  }

  setParo(on) {
    this.paro = on ? 1 : 0
    this.bomba = 0
    this.estado = on ? 4 : 0
  }

  llegaAgua() {
    if (this.estado === 1 || this.estado === 2) return
    this.ph = 7.75 + Math.random() * 0.25
    this.estado = 0
  }

  tick() {
    const ahora = performance.now()
    const dt = Math.min(500, ahora - this.ultimo)
    this.ultimo = ahora
    const t = ahora - this.inicio

    if (this.estado === 1) {
      const variacion = 0.9 + Math.random() * 0.2
      this.ph = Math.max(4.0, this.ph - this.kReal * variacion * dt)
      this.acido += CAUDAL_ML_POR_MS * dt
      if (this.ph <= this.umbral) {
        this.estado = 3
        this.bomba = 0
      } else if (t >= this.pulso) {
        this.bomba = 0
        this.estado = 2
        this.inicio = ahora
      }
    } else if (this.estado === 2 && t >= ESTABILIZACION_MS) {
      const medido = (this.phAntes - this.ph) / this.pulso
      if (medido > 0) this.kEst = Math.min(0.002, Math.max(0.00005, 0.5 * this.kEst + 0.5 * medido))
      if (this.ph - this.umbral <= BANDA) this.estado = 3
      else this.#abrir(ahora)
    }

    // Temperatura de la placa: tiende a un objetivo.
    const objetivo = this.calor ? 59 : 38 + (this.bomba ? 4 : 0) + Math.sin(ahora / 20000)
    this.tempPlaca += (objetivo - this.tempPlaca) * Math.min(1, dt / 4000)
    if (this.tempPlaca > 55 && (this.estado === 1 || this.estado === 2)) this.detener()

    // Panel solar: más voltaje a mediodía.
    const h = new Date().getHours() + new Date().getMinutes() / 60
    this.voltaje = 11.9 + 1.5 * Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)) + (Math.random() - 0.5) * 0.02
  }

  lectura() {
    return {
      ph: this.ph + (Math.random() - 0.5) * 0.012,
      umbral: this.umbral,
      estado: this.estado,
      bomba: this.bomba,
      paro: this.paro,
      tempPlaca: this.tempPlaca,
      acido: this.acido,
      pulso: this.pulso,
      voltaje: this.voltaje,
    }
  }
}
