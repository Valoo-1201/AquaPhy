// Configuración central de AquaPhy.
// Los pines virtuales deben coincidir con los Datastreams de tu plantilla en Blynk
// y con el firmware (firmware/AquaPhy_ESP32.ino).

export const PUEBLA = { lat: 19.0414, lng: -98.2063, nombre: 'Puebla, Pue.' }

export const PINS = {
  ph: 'V0',        // double 0–14   (lectura filtrada)
  umbral: 'V1',    // double 4.5–7  (umbral de apagado)
  dosificar: 'V2', // int 0–2       (1 = iniciar ciclo, 2 = detener)
  estado: 'V3',    // int 0–4       (ver ESTADOS)
  bomba: 'V4',     // int 0/1       (relé de la bomba)
  tempPlaca: 'V5', // double °C     (sensor interno ESP32)
  color: 'V6',     // string #RRGGBB (indicador universal)
  paro: 'V7',      // int 0/1       (paro de emergencia)
  acido: 'V8',     // double mL     (ácido dosificado hoy)
  voltaje: 'V9',   // double V      (alimentación / panel solar)
  pulso: 'V10',    // int ms        (último pulso aplicado)
  phCrudo: 'V11',  // double        (lectura sin filtrar, para ver el ruido)
  adc: 'V12',      // int 0–1023    (cuentas del ADC de 10 bits)
}

export const ESTADOS = ['Reposo', 'Dosificando', 'Estabilizando', 'Umbral alcanzado', 'Paro de emergencia']

export const UMBRAL_MIN = 4.5
export const UMBRAL_MAX = 7.0
export const NOM_MIN = 6.5 // NOM-127-SSA1-2021
export const NOM_MAX = 8.5
export const TEMP_LIMITE = 55
export const PIN_OPERADOR = '1234'
export const CAUDAL_ML_POR_MS = 0.033 // bomba de diafragma ~33 mL/s

const LS_KEY = 'aquaphy.blynk'

export function leerConfigBlynk() {
  const env = {
    server: import.meta.env.VITE_BLYNK_SERVER || 'blynk.cloud',
    token: import.meta.env.VITE_BLYNK_TOKEN || '',
  }
  try {
    const guardado = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (guardado && guardado.token) return guardado
  } catch { /* sin almacenamiento */ }
  return env
}

export function guardarConfigBlynk(cfg) {
  try {
    if (cfg) localStorage.setItem(LS_KEY, JSON.stringify(cfg))
    else localStorage.removeItem(LS_KEY)
  } catch { /* sin almacenamiento */ }
}

// Colonias del municipio de Puebla. Los horarios de tandeo son SIMULADOS
// para la demostración; sustitúyelos por los del organismo operador.
export const COLONIAS = [
  { id: 'centro', nombre: 'Centro Histórico', lat: 19.0436, lng: -98.1981, real: true, dias: [1, 3, 5], hora: 6, horas: 8 },
  { id: 'sanmanuel', nombre: 'San Manuel', lat: 19.0225, lng: -98.1935, dias: [2, 4, 6], hora: 5, horas: 6 },
  { id: 'lapaz', nombre: 'La Paz', lat: 19.0545, lng: -98.2265, dias: [1, 4], hora: 7, horas: 6 },
  { id: 'castillotla', nombre: 'Lomas de Castillotla', lat: 18.9935, lng: -98.2105, dias: [0, 3], hora: 4, horas: 5 },
  { id: 'amalucan', nombre: 'Amalucan', lat: 19.0655, lng: -98.1525, dias: [2, 5], hora: 6, horas: 5 },
  { id: 'campeche', nombre: 'San Baltazar Campeche', lat: 19.0185, lng: -98.2095, dias: [0, 2, 4], hora: 5, horas: 7 },
]

// Conversión oficial del reto (ADC 10 bits, Vref 3.3 V, pendiente negativa):
// pH 7 → 1.648 V → 511 cuentas ; pH 4 → 2.175 V → 674 cuentas
export const adcDesdePH = (ph) => Math.max(0, Math.min(1023, Math.round(892 - 54.4 * ph)))
export const voltDesdeADC = (adc) => (adc * 3.3) / 1023
export const phDesdeADC = (adc) => (892 - adc) / 54.4
