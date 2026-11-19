// "Mi agua": estado del depósito de la casa y cloración automática (simulada) o manual (guiada).
import { useEffect, useRef, useState } from 'react'
import { fraccionHOCl } from '../lib/chem.js'
import {
  OMS_CLORO_MIN, NOM_CLORO_MIN, NOM_CLORO_MAX, tiempoContactoMin, ML_CLORO_POR_LITRO,
  KB_REF_POR_HORA, MG_CLORO_POR_ML, fraccionPastilla,
} from '../lib/cloro.js'

const DEPOSITOS = [
  { id: 't1100', nombre: 'Tinaco 1 100 L', litros: 1100 },
  { id: 't2500', nombre: 'Tinaco 2 500 L', litros: 2500 },
  { id: 'c5000', nombre: 'Cisterna 5 000 L', litros: 5000 },
]
const OBJETIVO = 1.0 // mg/L, dentro de NOM-127 (0.2–1.5)
const VELOCIDAD = 60 // 1 s real = 1 min simulado

const fmtMin = (m) => (m < 60 ? `${Math.floor(m)} min` : `${Math.floor(m / 60)} h ${Math.floor(m % 60)} min`)

export default function MiAgua({ t, temp }) {
  const [dep, setDep] = useState(DEPOSITOS[0])
  const [modo, setModo] = useState('auto')
  const [calidad, setCalidad] = useState('normal')
  const [sim, setSim] = useState({ c: 0.3, contacto: 0, dosis: [], reloj: 0 })
  const modoRef = useRef(modo)
  modoRef.current = modo
  const depRef = useRef(dep)
  depRef.current = dep

  useEffect(() => {
    const id = setInterval(() => {
      setSim((s) => {
        const dtMin = VELOCIDAD / 60 // minutos simulados por tick de 1 s
        let c = s.c * Math.exp(-(KB_REF_POR_HORA / 60) * dtMin)
        let contacto = s.contacto + dtMin
        let dosis = s.dosis
        if (modoRef.current === 'auto' && c < OMS_CLORO_MIN) {
          const ml = ((OBJETIVO - c) * depRef.current.litros) / MG_CLORO_POR_ML
          dosis = [{ id: Date.now(), reloj: s.reloj, ml, de: c }, ...dosis].slice(0, 5)
          c = OBJETIVO
          contacto = 0
        }
        return { c, contacto, dosis, reloj: s.reloj + dtMin }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const manualAgregada = () => setSim((s) => ({ ...s, c: Math.max(s.c, OBJETIVO), contacto: 0, dosis: [{ id: Date.now(), reloj: s.reloj, ml: null, de: s.c }, ...s.dosis].slice(0, 5) }))
  const llegaAgua = () => setSim((s) => ({ ...s, c: 0.15, contacto: 0 }))

  const req = tiempoContactoMin(t.ph)
  const f = fraccionHOCl(t.ph, temp)
  const okPH = t.ph >= 6.5 && t.ph <= 8.5
  const okCloro = sim.c >= OMS_CLORO_MIN
  const okTiempo = sim.contacto >= req
  const lista = okPH && okCloro && okTiempo
  const pasos = [
    { ok: okPH, t: 'pH dentro de norma', d: `pH ${t.ph.toFixed(2)} · ${Math.round(f * 100)} % del cloro activo` },
    { ok: okCloro, t: 'Cloro suficiente', d: `${sim.c.toFixed(2)} mg/L (mínimo OMS ${OMS_CLORO_MIN})` },
    { ok: okTiempo, t: 'Tiempo de contacto cumplido', d: `${fmtMin(Math.min(sim.contacto, 999))} de ${req} min${t.ph >= 8 ? ' (pH ≥ 8: el doble)' : ''}` },
  ]
  const nivelCloro = Math.min(1, sim.c / 2)
  const particulas = Math.round(sim.c * 8)
  const mlCloro = dep.litros * ML_CLORO_POR_LITRO[calidad]

  return (
    <section className="panel mi-agua" aria-labelledby="h-mi-agua">
      <header className="panel-cab">
        <h2 id="h-mi-agua">Mi agua</h2>
        <label className="colonia sel-dep">
          <span className="sr">Depósito</span>
          <select value={dep.id} onChange={(e) => setDep(DEPOSITOS.find((d) => d.id === e.target.value))}>
            {DEPOSITOS.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </label>
      </header>

      <div className="mi-agua-cont">
        <div className="mi-tanque">
          <svg viewBox="0 0 240 250" className="tinaco-svg" role="img" aria-label={`Depósito con ${sim.c.toFixed(2)} mg/L de cloro. ${lista ? 'Agua lista.' : 'Aún no está lista.'}`}>
            <defs>
              <clipPath id="tanqueMi"><rect x="40" y="34" width="160" height="196" rx="26" /></clipPath>
              <linearGradient id="aguaMi" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#5cc8f0" /><stop offset="1" stopColor="#1d3e9e" />
              </linearGradient>
            </defs>
            <rect x="94" y="6" width="52" height="16" rx="6" className="tinaco-tapa" />
            <rect x="70" y="20" width="100" height="18" rx="9" className="tinaco-tapa" />
            <rect x="40" y="34" width="160" height="196" rx="26" className="tinaco-cuerpo" />
            <g clipPath="url(#tanqueMi)">
              <rect x="40" y="70" width="160" height="200" fill="url(#aguaMi)" />
              <rect x="40" y="70" width="160" height="200" className={`mi-tinte ${lista ? 'ok' : 'espera'}`} />
              <path className="ola" d="M-40 70 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 v20 h-320z" fill="#8fdcf7" opacity="0.7" />
              {Array.from({ length: 12 }).map((_, i) => (
                <circle key={i} cx={62 + ((i * 41) % 120)} cy={110 + ((i * 29) % 100)} r="3" className="mi-cloro" style={{ opacity: i < particulas ? 0.9 : 0, transitionDelay: `${(i % 6) * 40}ms` }} />
              ))}
              <rect x="52" y="44" width="10" height="170" rx="5" fill="white" opacity="0.35" />
            </g>
            {sim.dosis[0] && <path key={sim.dosis[0].id} className="mi-gota" d="M120 40c0 0-7 9-7 14a7 7 0 0 0 14 0c0-5-7-14-7-14z" fill="#f2b705" />}
          </svg>
          <div className={`mi-veredicto ${lista ? 'ok' : 'espera'}`}>
            <strong>{lista ? 'Lista para usar' : 'Aún no la uses para beber'}</strong>
            <span>{lista ? 'pH, cloro y tiempo de contacto cumplen.' : 'Falta cumplir lo marcado abajo.'}</span>
          </div>
        </div>

        <div>
          <ol className="mi-pasos">
            {pasos.map((p) => (
              <li key={p.t} className={p.ok ? 'ok' : ''}><span aria-hidden="true">{p.ok ? '✓' : '·'}</span><div><strong>{p.t}</strong><small>{p.d}</small></div></li>
            ))}
          </ol>
          <div className="medidor-cloro" aria-label="Cloro libre estimado">
            <div className="mc-barra">
              <i className="mc-nom" style={{ left: `${(NOM_CLORO_MIN / 2) * 100}%`, width: `${((NOM_CLORO_MAX - NOM_CLORO_MIN) / 2) * 100}%` }} />
              <i className="mc-oms" style={{ left: `${(OMS_CLORO_MIN / 2) * 100}%` }} />
              <i className="mc-valor" style={{ left: `${nivelCloro * 100}%` }} />
            </div>
            <div className="mc-escala"><span>0</span><span>Franja: NOM-127 (0.2–1.5) · Línea: mínimo OMS 0.5</span><span>2 mg/L</span></div>
          </div>

          <div className="seg" role="tablist" aria-label="Modo de cloración">
            <button role="tab" aria-selected={modo === 'auto'} className={modo === 'auto' ? 'on' : ''} onClick={() => setModo('auto')}>Automático</button>
            <button role="tab" aria-selected={modo === 'manual'} className={modo === 'manual' ? 'on' : ''} onClick={() => setModo('manual')}>Manual</button>
          </div>

          {modo === 'auto' ? (
            <div className="mi-modo">
              <p>Un clorador conectado al nodo agrega cloro cuando baja de {OMS_CLORO_MIN} mg/L y lo sube a {OBJETIVO} mg/L. Después cuenta el tiempo de contacto.</p>
              <ul className="mi-log">
                {sim.dosis.length ? sim.dosis.map((d) => (
                  <li key={d.id}>Min {Math.round(d.reloj)} · {d.ml == null ? 'Cloración manual registrada' : `Agregó ${d.ml.toFixed(1)} mL de cloro comercial`} (estaba en {d.de.toFixed(2)} mg/L)</li>
                )) : <li>Esperando a que el cloro baje del mínimo…</li>}
              </ul>
            </div>
          ) : (
            <div className="mi-modo">
              <div className="seg chico">
                <button className={calidad === 'normal' ? 'on' : ''} onClick={() => setCalidad('normal')}>Agua clara</button>
                <button className={calidad === 'dudosa' ? 'on' : ''} onClick={() => setCalidad('dudosa')}>Dudosa calidad</button>
              </div>
              <p className="receta">Para tu {dep.nombre.toLowerCase()} agrega <strong>{Math.round(mlCloro)} mL de cloro comercial</strong> (hipoclorito de sodio al 6 %) <span className="o">o</span> <strong>aprox. {fraccionPastilla(dep.litros)}</strong> de hipoclorito de calcio de 7 g, en trocitos.</p>
              <p className="nota">Espera {req} minutos antes de usarla{t.ph >= 8 ? ': con pH alto el cloro tarda el doble' : ''}.</p>
              <button className="btn btn-pri" onClick={manualAgregada}>Ya lo agregué: iniciar tiempo de contacto</button>
            </div>
          )}
          <button className="btn btn-sec mi-llega" onClick={llegaAgua}>Simular: llegó agua nueva del tandeo</button>
        </div>
      </div>
      <p className="fuente"><span className="chip chip-sim">Simulado</span> El prototipo mide pH, no cloro: el cloro se estima con una constante de decaimiento de referencia de {KB_REF_POR_HORA} h⁻¹ (García-Ávila et al., 2020) y el reloj va 60 veces más rápido. Dosis manuales: Secretaría de Salud. Criterio de uso: OMS (≥ 0.5 mg/L tras 30 min a pH &lt; 8).</p>
    </section>
  )
}
