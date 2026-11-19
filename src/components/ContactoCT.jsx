// Tiempo de contacto y valor CT (concentración × tiempo) para el operador.
import { useEffect, useState } from 'react'
import { fraccionHOCl } from '../lib/chem.js'
import { OMS_CLORO_MIN, tiempoContactoMin } from '../lib/cloro.js'

export default function ContactoCT({ a, temp }) {
  const { t, ciclos } = a
  const ultimoReal = [...ciclos].reverse().find((c) => !c.demo && c.resultado === 'Umbral alcanzado')
  const [inicio, setInicio] = useState(null)
  const [cloro, setCloro] = useState(1.0)
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(id) }, [])
  useEffect(() => { if (ultimoReal) setInicio(ultimoReal.id) }, [ultimoReal?.id])

  const min = inicio ? (ahora - inicio) / 60000 : 0
  const req = tiempoContactoMin(t.ph)
  const f = fraccionHOCl(t.ph, temp)
  const ct = cloro * min
  const ctActivo = cloro * f * min
  const checks = [
    { ok: cloro >= OMS_CLORO_MIN, t: `Cloro libre ≥ ${OMS_CLORO_MIN} mg/L` },
    { ok: min >= req, t: `Tiempo de contacto ≥ ${req} min ${t.ph >= 8 ? '(pH ≥ 8)' : '(pH < 8)'}` },
    { ok: t.ph < 8, t: 'pH menor a 8.0' },
  ]
  return (
    <article className="panel contacto" aria-labelledby="h-contacto">
      <header className="panel-cab">
        <h2 id="h-contacto">Tiempo de contacto y CT</h2>
        <span className={`chip ${checks.every((c) => c.ok) ? 't-verde' : 't-amarillo'}`}>{checks.every((c) => c.ok) ? 'Desinfección cumplida' : 'En proceso'}</span>
      </header>
      <div className="contacto-cont">
        <div className="ct-reloj">
          <span className="dato-et">Tiempo de contacto</span>
          <strong className="dato grande">{inicio ? `${Math.floor(min)}:${String(Math.floor((min % 1) * 60)).padStart(2, '0')}` : '—'}</strong>
          <span className="dato-sec">{inicio ? (ultimoReal && inicio === ultimoReal.id ? `desde el ciclo de las ${ultimoReal.hora}` : 'desde la cloración registrada') : 'sin cloración registrada'}</span>
          <div className="barra gruesa"><i style={{ width: `${Math.min(100, (min / req) * 100)}%` }} /></div>
          <button className="btn btn-sec" onClick={() => setInicio(Date.now())}>Registrar cloración ahora</button>
        </div>
        <div>
          <label className="umbral" htmlFor="cloro-op">
            <span>Cloro libre (medición DPD del operador)</span>
            <output htmlFor="cloro-op">{cloro.toFixed(1)} mg/L</output>
          </label>
          <input id="cloro-op" type="range" min="0" max="2" step="0.1" value={cloro} style={{ '--p': `${(cloro / 2) * 100}%` }} onChange={(e) => setCloro(Number(e.target.value))} />
          <dl className="ct-datos">
            <div><dt>CT total</dt><dd>{ct.toFixed(1)}</dd><small>mg·min/L = cloro × minutos</small></div>
            <div><dt>CT activo (HOCl)</dt><dd>{ctActivo.toFixed(1)}</dd><small>solo la fracción que desinfecta ({Math.round(f * 100)} %)</small></div>
          </dl>
          <ul className="ct-checks">
            {checks.map((c) => <li key={c.t} className={c.ok ? 'ok' : ''}><span aria-hidden="true">{c.ok ? '✓' : '·'}</span>{c.t}</li>)}
          </ul>
        </div>
      </div>
      <p className="nota">El tiempo de contacto es lo que el cloro debe permanecer en el agua antes de consumirla. La OMS pide ≥ 0.5 mg/L de cloro libre tras al menos 30 min a pH &lt; 8; con pH ≥ 8 se recomiendan 60 min. Por eso bajar el pH acorta la espera y aumenta el CT activo.</p>
      <p className="fuente"><span className="chip chip-sim">Entrada manual</span> El nodo no mide cloro: la concentración la captura el operador con su kit DPD (Agua de Puebla reporta 75 monitoreos diarios de cloro residual). El reloj sí es real.</p>
    </article>
  )
}
