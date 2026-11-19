import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ResponsiveContainer, LineChart, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine,
} from 'recharts'
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Tooltip as MapTip } from 'react-leaflet'
import ZM_PUEBLA from '../data/puebla-zm.json'
import 'leaflet/dist/leaflet.css'
import { fraccionHOCl, pKa, colorPH, GRADIENTE_INDICADOR } from '../lib/chem.js'
import { UMBRAL_MIN, UMBRAL_MAX, NOM_MIN, NOM_MAX, PIN_OPERADOR, COLONIAS, adcDesdePH, voltDesdeADC, phDesdeADC } from '../config.js'
import { describirClima } from '../hooks/useClima.js'
import { desbloquearAudio, sonidoInicio, sonidoFin } from '../lib/sound.js'
import * as I from './Iconos.jsx'

function useAncho(ref) {
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}

// ——— Héroe: pH + curva de eficacia del cloro ———
function CurvaCloro({ ph, umbral, temp }) {
  const ref = useRef(null)
  const W = useAncho(ref)
  const H = W < 520 ? 230 : 290
  const m = { l: 44, r: 16, t: 18, b: 34 }
  const x0 = 4.5, x1 = 9.5
  const X = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r)
  const Y = (f) => m.t + (1 - f) * (H - m.t - m.b)
  const puntos = []
  for (let v = x0; v <= x1 + 1e-9; v += 0.05) puntos.push(`${X(v).toFixed(1)},${Y(fraccionHOCl(v, temp)).toFixed(1)}`)
  const f = fraccionHOCl(ph, temp)
  const fu = fraccionHOCl(umbral, temp)
  const px = X(Math.min(x1, Math.max(x0, ph)))
  const py = Y(f)
  const etiquetaIzq = px > W - 150
  return (
    <div ref={ref} className="curva">
      <svg width={W} height={H} role="img" aria-label={`Curva de eficacia del cloro. Con pH ${ph.toFixed(2)} el ${Math.round(f * 100)} % del cloro libre está como ácido hipocloroso.`}>
        <rect x={X(NOM_MIN)} y={m.t} width={X(NOM_MAX) - X(NOM_MIN)} height={H - m.t - m.b} className="curva-nom" />
        <text x={X(NOM_MIN) + 6} y={H - m.b - 8} className="curva-txt">Rango NOM-127</text>
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={m.l} x2={W - m.r} y1={Y(g)} y2={Y(g)} className="curva-grid" />
            <text x={m.l - 8} y={Y(g) + 4} textAnchor="end" className="curva-eje">{g * 100}%</text>
          </g>
        ))}
        {[5, 6, 7, 8, 9].map((v) => (
          <text key={v} x={X(v)} y={H - 10} textAnchor="middle" className="curva-eje">pH {v}</text>
        ))}
        <polyline points={puntos.join(' ')} className="curva-linea" />
        <line x1={X(umbral)} x2={X(umbral)} y1={m.t} y2={H - m.b} className="curva-umbral" />
        <text x={X(umbral) - 6} y={Y(fu) - 10} textAnchor="end" className="curva-txt">Umbral {umbral.toFixed(2)}</text>
        <circle cx={px} cy={py} r="14" className="curva-halo" />
        <circle cx={px} cy={py} r="7" className="curva-punto" />
        <text x={etiquetaIzq ? px - 14 : px + 14} y={py - 12} textAnchor={etiquetaIzq ? 'end' : 'start'} className="curva-ahora">
          Ahora · {Math.round(f * 100)} % activo
        </text>
      </svg>
    </div>
  )
}

function Heroe({ t, clima }) {
  const temp = clima.suelo.s54
  const f = fraccionHOCl(t.ph, temp)
  const fu = fraccionHOCl(t.umbral, temp)
  const c = colorPH(t.ph)
  const pos = (Math.min(14, Math.max(0, t.ph)) / 14) * 100
  const mensaje = f >= 0.6 ? 'trabaja bien' : f >= 0.35 ? 'rinde a medias' : 'casi no desinfecta'
  return (
    <section className="heroe-tec" aria-labelledby="h-tec">
      <div className="heroe-tec-in">
        <div className="heroe-tec-texto">
          <p className="sobre">Nodo Centro Histórico · Puebla</p>
          <h1 id="h-tec">El cloro {mensaje}: {Math.round(f * 100)} % está listo para desinfectar.</h1>
          <p className="heroe-sub">
            Mientras más bajo el pH, más cloro queda en su forma activa (ácido hipocloroso). Si AquaPhy baja el pH a {t.umbral.toFixed(2)}, subiría a {Math.round(fu * 100)} %.
          </p>
          <p className="heroe-nota">Calculado a {temp.toFixed(1)} °C, la temperatura del suelo a 54 cm donde corren las tuberías (pKa {pKa(temp).toFixed(2)}).</p>
          <div className="lectura">
            <div className="lectura-num" style={{ '--c': c.hex }}>
              <span className="lectura-et">pH</span>
              <strong>{t.ph.toFixed(2)}</strong>
              <span className="lectura-color"><i style={{ background: c.hex }} />{c.nombre}</span>
            </div>
            <div className="indicador" aria-hidden="true">
              <div className="indicador-barra" style={{ background: GRADIENTE_INDICADOR }} />
              <div className="indicador-flecha" style={{ left: `${pos}%` }} />
              <div className="indicador-escala"><span>0 ácido</span><span>7</span><span>14 alcalino</span></div>
            </div>
          </div>
        </div>
        <CurvaCloro ph={t.ph} umbral={t.umbral} temp={temp} />
      </div>
    </section>
  )
}

// ——— Consola de mando ———
function Teclado({ onOk, onCancel }) {
  const [v, setV] = useState('')
  const [err, setErr] = useState(false)
  const enviar = (x) => {
    if (x === PIN_OPERADOR) onOk()
    else { setErr(true); setV('') }
  }
  useEffect(() => {
    const k = (e) => {
      if (/^\d$/.test(e.key)) setV((s) => { const n = (s + e.key).slice(0, 4); if (n.length === 4) setTimeout(() => enviar(n)); return n })
      if (e.key === 'Backspace') setV((s) => s.slice(0, -1))
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  const pulsar = (d) => {
    setErr(false)
    const n = (v + d).slice(0, 4)
    setV(n)
    if (n.length === 4) setTimeout(() => enviar(n), 120)
  }
  return (
    <div className="teclado" role="dialog" aria-label="PIN de operador">
      <p>{err ? 'PIN incorrecto. Intenta de nuevo.' : 'PIN de operador'}</p>
      <div className={`teclado-pts ${err ? 'error' : ''}`} aria-live="polite">
        {[0, 1, 2, 3].map((i) => <i key={i} className={i < v.length ? 'on' : ''} />)}
      </div>
      <div className="teclado-grid">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <button key={d} onClick={() => pulsar(String(d))}>{d}</button>)}
        <button onClick={onCancel} className="tecla-sec">Cancelar</button>
        <button onClick={() => pulsar('0')}>0</button>
        <button onClick={() => setV((s) => s.slice(0, -1))} className="tecla-sec" aria-label="Borrar">⌫</button>
      </div>
      <small>PIN de demostración: 1234</small>
    </div>
  )
}

function Consola({ a }) {
  const { t } = a
  const [abierto, setAbierto] = useState(false)
  const [pidiendo, setPidiendo] = useState(false)
  const [tapa, setTapa] = useState(false)
  const [umbral, setUmbral] = useState(t.umbral)
  const tocando = useRef(false)
  useEffect(() => { if (!tocando.current) setUmbral(t.umbral) }, [t.umbral])
  const activo = t.estado === 1 || t.estado === 2
  const bloqueadoPH = t.ph <= t.umbral + 0.03
  const pct = ((umbral - UMBRAL_MIN) / (UMBRAL_MAX - UMBRAL_MIN)) * 100

  return (
    <article className="panel consola" aria-labelledby="h-consola">
      <header className="panel-cab">
        <h2 id="h-consola">Consola de mando</h2>
        <button className={`candado ${abierto ? 'abierto' : ''}`} onClick={() => (abierto ? setAbierto(false) : setPidiendo(true))}>
          {abierto ? <I.CandadoAbierto /> : <I.Candado />}
          {abierto ? 'Bloquear' : 'Desbloquear'}
        </button>
      </header>
      {pidiendo && <Teclado onOk={() => { setAbierto(true); setPidiendo(false) }} onCancel={() => setPidiendo(false)} />}

      <div className="estado-fila">
        <span className={`chip estado-${t.estado}`}>{a.estadoTexto}</span>
        {activo && <span className="dato-sec">Pulso {t.pulso} ms</span>}
      </div>

      <label className="umbral" htmlFor="umbral">
        <span>Umbral de apagado</span>
        <output htmlFor="umbral">pH {umbral.toFixed(2)}</output>
      </label>
      <input
        id="umbral" type="range" min={UMBRAL_MIN} max={UMBRAL_MAX} step="0.05" value={umbral}
        disabled={!abierto || activo}
        style={{ '--p': `${pct}%` }}
        onPointerDown={() => (tocando.current = true)}
        onChange={(e) => { const v = Number(e.target.value); setUmbral(v); a.fijarUmbral(v) }}
        onPointerUp={() => { tocando.current = false; a.confirmarUmbral(umbral) }}
        onKeyUp={() => a.confirmarUmbral(umbral)}
      />
      <div className="umbral-escala"><span>4.50</span><span>El reto pide 4.5 – 7.0</span><span>7.00</span></div>

      {activo ? (
        <button className="btn btn-sec" onClick={a.detener}>Detener ciclo</button>
      ) : (
        <button
          className="btn btn-pri"
          disabled={!abierto || t.paro}
          onClick={() => { desbloquearAudio(); a.dosificar() }}
          aria-describedby="nota-dosis"
        >
          <I.Rayo /> Dosificar ácido
        </button>
      )}
      <p id="nota-dosis" className="nota">
        {!abierto ? 'Desbloquea con el PIN para operar.' : bloqueadoPH ? 'El pH ya está en el umbral: la dosificación se bloqueará.' : `Faltan ${(t.ph - t.umbral).toFixed(2)} unidades de pH para el umbral.`}
      </p>

      <div className={`paro ${t.paro ? 'activo' : ''}`}>
        {t.paro ? (
          <button className="paro-btn liberado" onClick={() => a.paro(false)} disabled={!abierto}>Liberar paro de emergencia</button>
        ) : (
          <>
            <button className="paro-btn" onClick={() => { desbloquearAudio(); a.paro(true); setTapa(false) }} tabIndex={tapa ? 0 : -1} aria-hidden={!tapa}>
              <I.Alto /> Paro de emergencia
            </button>
            <button className={`paro-tapa ${tapa ? 'arriba' : ''}`} onClick={() => setTapa((x) => !x)} aria-expanded={tapa}>
              {tapa ? 'Bajar cubierta' : 'Levantar cubierta de seguridad'}
            </button>
          </>
        )}
      </div>
    </article>
  )
}

// ——— Hardware ———
function Hardware({ t }) {
  const temp = t.tempPlaca
  const nivelT = temp > 50 ? 'rojo' : temp > 40 ? 'amarillo' : 'verde'
  const altoT = Math.min(100, Math.max(5, ((temp - 15) / 50) * 100))
  const bat = Math.round(Math.min(100, Math.max(0, ((t.voltaje - 11.4) / (13.4 - 11.4)) * 100)))
  return (
    <article className="panel hardware" aria-labelledby="h-hw">
      <header className="panel-cab"><h2 id="h-hw">Estado del nodo</h2></header>
      <div className="hw-grid">
        <div className="termo">
          <div className={`termo-tubo ${nivelT}`}>
            <div className="termo-liquido" style={{ height: `${altoT}%` }} />
            {[20, 40, 50].map((g) => <span key={g} className="termo-marca" style={{ bottom: `${((g - 15) / 50) * 100}%` }}>{g}°</span>)}
          </div>
          <div className="termo-bulbo" />
          <div>
            <span className="dato-et">Placa ESP32</span>
            <strong className="dato">{temp.toFixed(1)} °C</strong>
            <span className={`chip t-${nivelT}`}>{nivelT === 'verde' ? 'Normal' : nivelT === 'amarillo' ? 'Tibia' : 'Caliente'}</span>
          </div>
        </div>
        <dl className="hw-datos">
          <div>
            <dt>Batería · panel solar</dt>
            <dd><strong className="dato">{bat} %</strong> <span className="dato-sec">{t.voltaje.toFixed(2)} V</span></dd>
            <div className="barra"><i style={{ width: `${bat}%` }} /></div>
          </div>
          <div>
            <dt>Ácido dosificado hoy</dt>
            <dd><strong className="dato">{t.acido.toFixed(1)} mL</strong> <span className="dato-sec">de 100 mL</span></dd>
            <div className="barra acido"><i style={{ width: `${Math.min(100, t.acido)}%` }} /></div>
          </div>
          <div>
            <dt>Último pulso</dt>
            <dd><strong className="dato">{t.pulso} ms</strong> <span className="dato-sec">≈ {(t.pulso * 0.033).toFixed(1)} mL</span></dd>
          </div>
        </dl>
      </div>
    </article>
  )
}

// ——— Gráficas ———
const fmtHora = (ms) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })

function Grafica24h({ historia, modo }) {
  const { puntos, cortes } = historia
  return (
    <article className="panel h24" aria-labelledby="h-24">
      <header className="panel-cab">
        <h2 id="h-24">Últimas 24 horas y cortes de tandeo</h2>
        <span className="leyenda"><i className="l-ph" />pH <i className="l-corte" />Sin agua en la red <i className="l-nom" />NOM-127</span>
      </header>
      <div className="grafica alta">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={puntos} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <defs>
              <pattern id="rayas" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--corte-fondo)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--corte-raya)" strokeWidth="2" />
              </pattern>
            </defs>
            <CartesianGrid stroke="var(--rejilla)" vertical={false} />
            <ReferenceArea y1={NOM_MIN} y2={NOM_MAX} fill="var(--ok)" fillOpacity={0.09} />
            {cortes.map(([a, b], i) => <ReferenceArea key={i} x1={a} x2={b} fill="url(#rayas)" />)}
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtHora} stroke="var(--tinta-2)" fontSize={12} minTickGap={40} />
            <YAxis domain={[6, 9]} ticks={[6, 7, 8, 9]} stroke="var(--tinta-2)" fontSize={12} />
            <Tooltip formatter={(v) => [v == null ? 'sin agua' : Number(v).toFixed(2), 'pH']} labelFormatter={fmtHora} contentStyle={{ background: 'var(--superficie)', border: '1px solid var(--linea)', borderRadius: 10 }} />
            <Line type="monotone" dataKey="ph" stroke="var(--cobalto-vivo)" strokeWidth={2.2} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="nota">Tras cada corte el agua llega más alcalina y el cloro pierde fuerza. {modo === 'demo' ? 'Historial de demostración.' : 'Historial de referencia; la serie en vivo viene de Blynk.'}</p>
    </article>
  )
}

// ——— Resumen en 4 cifras ———
function Resumen({ a, clima }) {
  const { t } = a
  const f = Math.round(fraccionHOCl(t.ph, clima.suelo.s54) * 100)
  const ult = a.ciclos[a.ciclos.length - 1]
  const enNorma = t.ph >= NOM_MIN && t.ph <= NOM_MAX
  const tonoPH = enNorma ? (t.ph <= 7.6 ? 'ok' : 'aviso') : 'alerta'
  const bombaTxt = t.paro ? 'Paro de emergencia' : t.bomba ? 'Encendida' : t.estado === 2 ? 'En pausa, mezclando' : 'Apagada'
  const items = [
    { et: 'pH del agua', v: t.ph.toFixed(2), tono: tonoPH, sub: enNorma ? 'Dentro de la norma (6.5 a 8.5)' : 'Fuera de la norma (6.5 a 8.5)' },
    { et: 'Cloro que desinfecta', v: `${f} %`, tono: f >= 60 ? 'ok' : f >= 35 ? 'aviso' : 'alerta', sub: f >= 60 ? 'Desinfecta bien' : 'Bajar el pH lo hace rendir más' },
    { et: 'Bomba de ácido', v: bombaTxt, tono: t.paro ? 'alerta' : t.bomba ? 'aviso' : 'neutro', sub: `${a.estadoTexto} · umbral pH ${t.umbral.toFixed(2)}`, texto: true },
    { et: 'Precisión del último ciclo', v: ult ? `${ult.error >= 0 ? '+' : ''}${ult.error.toFixed(2)}` : '—', tono: !ult ? 'neutro' : ult.error < 0 ? 'alerta' : ult.error <= 0.05 ? 'ok' : 'aviso', sub: ult ? (ult.error < 0 ? 'Se pasó del umbral' : 'pH sobre el umbral, sin pasarse') : 'Aún no hay ciclos' },
  ]
  return (
    <section className="resumen" aria-label="Resumen">
      {items.map((x) => (
        <div key={x.et} className={`resumen-item r-${x.tono}`}>
          <span className="resumen-et"><i />{x.et}</span>
          <strong className={x.texto ? 'resumen-texto' : ''}>{x.v}</strong>
          <span className="resumen-sub">{x.sub}</span>
        </div>
      ))}
    </section>
  )
}

// ——— Ciclo de dosificación + pH en vivo ———
const PASOS = [
  { n: 'Reposo', d: 'Espera la orden desde Blynk o esta consola.' },
  { n: 'Dosificando', d: 'La bomba se enciende un pulso corto, calculado.' },
  { n: 'Estabilizando', d: 'Bomba apagada 3 s: el ácido se mezcla y se vuelve a medir.' },
  { n: 'Umbral alcanzado', d: 'Se apagó sola, sin pasarse del umbral.' },
]

function CicloVivo({ a }) {
  const { t, vivo } = a
  const ahora = vivo.length ? vivo[vivo.length - 1].s : Date.now()
  const datos = vivo.map((p) => ({ x: Math.round((p.s - ahora) / 1000), ph: p.ph, crudo: p.crudo, bomba: p.bomba }))
  const tramos = []
  datos.forEach((d, i) => {
    if (d.bomba && (i === 0 || !datos[i - 1].bomba)) tramos.push([d.x, d.x])
    if (d.bomba && tramos.length) tramos[tramos.length - 1][1] = d.x
  })
  const vals = datos.flatMap((d) => [d.ph, d.crudo]).filter((v) => Number.isFinite(v)).concat(t.umbral)
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 0.1) * 10) / 10)
  const hi = Math.min(14, Math.ceil((Math.max(...vals) + 0.1) * 10) / 10)
  const c = a.cicloActual
  const progreso = c ? Math.max(0, Math.min(1, (c.phInicio - t.ph) / Math.max(0.01, c.phInicio - c.umbral))) : t.estado === 3 ? 1 : 0
  const paso = t.estado === 4 ? -1 : t.estado
  return (
    <article className="panel ciclo" aria-labelledby="h-ciclo">
      <header className="panel-cab">
        <h2 id="h-ciclo">Ciclo de dosificación en vivo</h2>
        <span className="leyenda"><i className="l-ph" />pH filtrado <i className="l-crudo" />Lectura cruda <i className="l-bomba" />Bomba encendida</span>
      </header>
      {t.estado === 4 && <p className="banda-paro"><I.Alto /> Paro de emergencia activo: la bomba no puede encenderse.</p>}
      <ol className="pasos">
        {PASOS.map((p, i) => (
          <li key={p.n} className={i === paso ? 'actual' : i < paso ? 'hecho' : ''} aria-current={i === paso ? 'step' : undefined}>
            <span className="paso-n">{i + 1}</span>
            <div><strong>{p.n}</strong><small>{p.d}</small></div>
          </li>
        ))}
      </ol>
      <div className="progreso" aria-label="Avance hacia el umbral">
        <div className="progreso-txt">
          <span>{c ? `De pH ${c.phInicio.toFixed(2)} hacia ${c.umbral.toFixed(2)}` : 'Sin ciclo en curso'}</span>
          <strong>{Math.round(progreso * 100)} %{c ? ` · pulso ${c.pulsos}` : ''}</strong>
        </div>
        <div className="barra gruesa"><i style={{ width: `${progreso * 100}%` }} /></div>
      </div>
      <div className="grafica">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--rejilla)" vertical={false} />
            {tramos.map(([x1, x2], i) => <ReferenceArea key={i} x1={x1 - 0.5} x2={x2 + 0.5} fill="var(--amarillo)" fillOpacity={0.28} />)}
            <ReferenceLine y={t.umbral} stroke="var(--alerta)" strokeDasharray="6 4" strokeWidth={2}
              label={{ value: `Umbral ${t.umbral.toFixed(2)}`, fill: 'var(--alerta)', fontSize: 12, position: 'insideTopRight' }} />
            <XAxis dataKey="x" type="number" domain={[-90, 0]} ticks={[-90, -60, -30, 0]} tickFormatter={(v) => (v === 0 ? 'ahora' : `${v} s`)} stroke="var(--tinta-2)" fontSize={12} />
            <YAxis domain={[lo, hi]} tickFormatter={(v) => v.toFixed(1)} stroke="var(--tinta-2)" fontSize={12} allowDataOverflow />
            <Tooltip formatter={(v, n) => [Number(v).toFixed(3), n === 'ph' ? 'pH filtrado' : 'pH crudo']} labelFormatter={(v) => `${v} s`} contentStyle={{ background: 'var(--superficie)', border: '1px solid var(--linea)', borderRadius: 10 }} />
            <Line type="monotone" dataKey="crudo" stroke="var(--tinta-2)" strokeOpacity={0.45} strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="ph" stroke="var(--cobalto-vivo)" strokeWidth={3} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="nota">La línea gris es la sonda sin filtrar; la azul, la que usa el control. Las franjas amarillas son los pulsos de bomba: cada vez más cortos al acercarse al umbral.</p>
    </article>
  )
}

// ——— Sonda: ADC → voltaje → pH ———
function Sonda({ a }) {
  const { t, vivo } = a
  const adc = Math.round(t.adc ?? adcDesdePH(t.ph))
  const v = voltDesdeADC(adc)
  const ult = vivo.slice(-30)
  // Ruido = dispersión alrededor de la tendencia, no la caída del pH.
  const rms = (xs) => (xs.length ? Math.sqrt(xs.reduce((acc, x) => acc + x * x, 0) / xs.length) : 0)
  const ruidoCrudo = rms(ult.filter((p) => Number.isFinite(p.crudo)).map((p) => p.crudo - p.ph))
  const ruidoFiltrado = rms(ult.slice(1, -1).map((p, i) => p.ph - (ult[i].ph + ult[i + 2].ph) / 2))
  const W = 300, H = 150, m = { l: 36, r: 10, t: 10, b: 26 }
  const X = (ph) => m.l + (ph / 14) * (W - m.l - m.r)
  const Y = (volt) => m.t + (1 - (volt - 0.3) / (3.0 - 0.3)) * (H - m.t - m.b)
  const phCalc = phDesdeADC(adc)
  return (
    <article className="panel sonda" aria-labelledby="h-sonda">
      <header className="panel-cab"><h2 id="h-sonda">De la sonda al pH</h2></header>
      <div className="sonda-cadena">
        <div><span>ADC 10 bits</span><strong>{adc}</strong></div>
        <I.Flecha />
        <div><span>Voltaje</span><strong>{v.toFixed(3)} V</strong></div>
        <I.Flecha />
        <div><span>pH</span><strong>{phCalc.toFixed(2)}</strong></div>
      </div>
      <p className="formula">pH = (892 − ADC) ÷ 54.4</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="sonda-svg" role="img" aria-label="Relación lineal decreciente entre pH y voltaje de la sonda">
        {[0, 7, 14].map((p) => <text key={p} x={X(p)} y={H - 8} textAnchor={p === 0 ? 'start' : p === 14 ? 'end' : 'middle'} className="eje">pH {p}</text>)}
        {[0.5, 1.5, 2.5].map((vv) => (
          <g key={vv}><line x1={m.l} x2={W - m.r} y1={Y(vv)} y2={Y(vv)} className="rej" /><text x={m.l - 6} y={Y(vv) + 4} textAnchor="end" className="eje">{vv} V</text></g>
        ))}
        <line x1={X(0)} y1={Y(2.877)} x2={X(14)} y2={Y(0.419)} className="recta" />
        <line x1={X(phCalc)} x2={X(phCalc)} y1={Y(v)} y2={H - m.b} className="guia" />
        <circle cx={X(Math.max(0, Math.min(14, phCalc)))} cy={Y(v)} r="6" className="punto-sonda" />
      </svg>
      <dl className="ruido">
        <div><dt>Ruido sin filtro</dt><dd>± {ruidoCrudo.toFixed(3)}</dd></div>
        <div><dt>Ruido filtrado</dt><dd>± {ruidoFiltrado.toFixed(3)}</dd></div>
      </dl>
      <p className="nota">Pendiente negativa: más ácido, más voltaje. El firmware descarta los extremos de 15 muestras y suaviza con un promedio exponencial.</p>
    </article>
  )
}

// ——— Precisión: historial de ciclos ———
function Precision({ ciclos, modo }) {
  const validos = ciclos.filter((c) => c.resultado === 'Umbral alcanzado')
  const prom = validos.length ? validos.reduce((s, c) => s + Math.abs(c.error), 0) / validos.length : null
  const tono = (e) => (e < 0 ? 'mal' : e <= 0.05 ? 'bien' : 'regular')
  return (
    <article className="panel precision" aria-labelledby="h-prec">
      <header className="panel-cab"><h2 id="h-prec">Precisión del control</h2></header>
      <p className="prec-cifra"><strong>{prom == null ? '—' : `${prom.toFixed(3)}`}</strong> pH de diferencia promedio con el umbral</p>
      <p className="nota">El reto premia quedar lo más cerca del umbral sin pasarse. Verde: a 0.05 o menos. Rojo: se pasó.</p>
      <div className="tabla-cont corta">
        <table>
          <thead><tr><th>Hora</th><th>pH inicio → final</th><th>Error</th></tr></thead>
          <tbody>
            {[...ciclos].reverse().map((c) => (
              <tr key={c.id}>
                <td className="hora">{c.hora}</td>
                <td className="nw">{c.phInicio.toFixed(2)} → {c.phFinal.toFixed(2)}<small className="sub-celda">{c.pulsos} pulsos · {c.ml.toFixed(1)} mL</small></td>
                <td><span className={`err e-${tono(c.error)}`}>{c.error >= 0 ? '+' : ''}{c.error.toFixed(3)}</span></td>
              </tr>
            ))}
            {!ciclos.length && <tr><td colSpan="3" className="vacio">Inicia una dosificación para medir la precisión.</td></tr>}
          </tbody>
        </table>
      </div>
      {modo === 'demo' && ciclos.some((c) => c.demo) && <p className="fuente">Los dos primeros ciclos son de demostración.</p>}
    </article>
  )
}

// ——— Lo que pide el reto ———
function Reto({ a }) {
  const { t } = a
  const c = colorPH(t.ph)
  const ult = a.ciclos[a.ciclos.length - 1]
  const lista = [
    { r: 'Convertir la salida analógica de la sonda a pH', e: `ADC ${Math.round(t.adc ?? adcDesdePH(t.ph))} → pH ${t.ph.toFixed(2)}` },
    { r: 'Filtrar el ruido eléctrico', e: 'Mediana recortada de 15 muestras + promedio exponencial' },
    { r: 'Umbral de apagado ajustable de pH 7 a 4.5', e: `Umbral actual ${t.umbral.toFixed(2)} (Blynk V1)` },
    { r: 'Encender la bomba a distancia', e: 'Botón en Blynk y en esta consola (V2)' },
    { r: 'Bloquear si el pH ya está en el umbral', e: t.ph <= t.umbral + 0.03 ? 'Bloqueo activo ahora' : `Se bloquea a pH ≤ ${t.umbral.toFixed(2)}` },
    { r: 'Calcular el tiempo de bomba sin pasarse', e: 'Pulsos de 50 a 800 ms que aprenden la respuesta del agua' },
    { r: 'Apagado automático en el umbral', e: ult ? `Último ciclo: ${ult.error >= 0 ? '+' : ''}${ult.error.toFixed(3)} sobre el umbral` : 'Se registra al terminar cada ciclo' },
    { r: 'Dos sonidos distintos: inicio y fin', e: 'sonidos', sonidos: true },
    { r: 'Indicador de color universal', e: c.nombre, color: c.hex },
    { r: 'Tablero Blynk.Cloud web y móvil', e: a.modo === 'blynk' ? 'Conectado a Blynk.Cloud' : 'Listo; ahora en modo demo' },
  ]
  return (
    <article className="panel reto" aria-labelledby="h-reto">
      <header className="panel-cab">
        <h2 id="h-reto">Lo que pide el reto</h2>
        <span className="chip t-verde">{lista.length} de {lista.length}</span>
      </header>
      <ul className="reto-lista">
        {lista.map((x) => (
          <li key={x.r}>
            <span className="check" aria-hidden="true">✓</span>
            <div>
              <strong>{x.r}</strong>
              {x.sonidos ? (
                <span className="reto-son">
                  <button onClick={() => { desbloquearAudio(); sonidoInicio() }}>Probar inicio: 1 largo</button>
                  <button onClick={() => { desbloquearAudio(); sonidoFin() }}>Probar fin: 3 cortos</button>
                </span>
              ) : (
                <small>{x.color && <i className="muestra" style={{ background: x.color }} />}{x.e}</small>
              )}
            </div>
          </li>
        ))}
      </ul>
    </article>
  )
}

// ——— Clima ———
function Clima({ clima }) {
  const capas = [['Superficie', clima.suelo.s0], ['6 cm', clima.suelo.s6], ['18 cm', clima.suelo.s18], ['54 cm · tuberías', clima.suelo.s54]]
  const max = Math.max(...capas.map((c) => c[1])) + 2
  return (
    <article className="panel clima" aria-labelledby="h-clima">
      <header className="panel-cab">
        <h2 id="h-clima">Clima y suelo en Puebla</h2>
        <span className="dato-sec">{clima.real ? 'Open-Meteo, en vivo' : 'Valores de referencia sin conexión'}</span>
      </header>
      <div className="clima-top">
        <strong className="dato grande">{Math.round(clima.temp)}°</strong>
        <div>
          <p>{describirClima(clima.codigo)}</p>
          <p className="dato-sec">Humedad {clima.humedad} % · Viento {Math.round(clima.viento)} km/h · Lluvia {clima.probLluvia} %</p>
        </div>
      </div>
      <ul className="suelo" aria-label="Temperatura del suelo por profundidad">
        {capas.map(([n, v]) => (
          <li key={n}>
            <span>{n}</span>
            <div className="barra suelo-b"><i style={{ width: `${(v / max) * 100}%` }} /></div>
            <strong>{v.toFixed(1)} °C</strong>
          </li>
        ))}
      </ul>
      <p className="nota">El agua enterrada a 54 cm queda cerca de {clima.suelo.s54.toFixed(0)} °C. Más calor acelera la pérdida de cloro en tinacos y cisternas.</p>
    </article>
  )
}

// ——— Mapa ———
const LIMITES_PUEBLA = [[18.83, -98.30], [19.24, -98.01]]
const estiloMunicipio = (f) => f.properties.capital
  ? { color: '#1d3e9e', weight: 2.5, fillColor: '#2453d4', fillOpacity: 0.1 }
  : { color: '#6b7a99', weight: 1, dashArray: '4 4', fillColor: '#6b7a99', fillOpacity: 0.04 }

function Mapa({ t }) {
  const nodos = COLONIAS.map((c, i) => {
    const ph = c.real ? t.ph : [7.32, 7.81, 7.05, 8.62, 7.44][i - 1] ?? 7.3
    const color = ph < NOM_MIN || ph > NOM_MAX ? '#d7263d' : ph > 7.6 ? '#f2b705' : '#12a36f'
    return { ...c, ph, color }
  })
  return (
    <article className="panel mapa" aria-labelledby="h-mapa">
      <header className="panel-cab">
        <h2 id="h-mapa">Mapa de nodos en Puebla</h2>
        <span className="leyenda"><i className="l-ok" />Seguro <i className="l-aviso" />pH alto <i className="l-mal" />Fuera de norma</span>
      </header>
      <div className="mapa-cont">
        <MapContainer bounds={LIMITES_PUEBLA} scrollWheelZoom={false} className="mapa-leaflet" attributionControl>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a> · Límites: INEGI'
          />
          <GeoJSON data={ZM_PUEBLA} style={estiloMunicipio}
            onEachFeature={(f, capa) => capa.bindTooltip(f.properties.capital ? 'Municipio de Puebla' : f.properties.nombre, { sticky: true })} />
          {nodos.map((n) => (
            <CircleMarker key={n.id} center={[n.lat, n.lng]} radius={n.real ? 12 : 8}
              pathOptions={{ color: 'white', weight: 3, fillColor: n.color, fillOpacity: 1 }}>
              <MapTip direction="top" offset={[0, -8]} permanent={n.real}>{n.real ? `ESP32 · pH ${n.ph.toFixed(2)}` : `${n.nombre} · pH ${n.ph.toFixed(2)}`}</MapTip>
            </CircleMarker>
          ))}
        </MapContainer>
        <ul className="mapa-lista">
          {nodos.map((n) => (
            <li key={n.id}><i style={{ background: n.color }} /><span>{n.nombre}{n.real && <em> · nodo real</em>}</span><strong>{n.ph.toFixed(2)}</strong></li>
          ))}
        </ul>
      </div>
      <p className="nota">Contorno azul: municipio de Puebla. Punteados: municipios vecinos de la zona metropolitana. El nodo del Centro Histórico es la ESP32 real; los otros cinco son simulados.</p>
    </article>
  )
}

// ——— INEGI ———
export const INEGI = {
  viviendas: 1713381, tinaco: 72.8, cisterna: 42.4, alguno: 81.3,
  cuautlancingo: { tinaco: 70.9, cisterna: 49.7 },
}

function Inegi() {
  const guardan = Math.round((INEGI.viviendas * INEGI.alguno) / 100)
  const filas = [
    ['Tinaco o cisterna', INEGI.alguno],
    ['Tinaco', INEGI.tinaco],
    ['Cisterna o aljibe', INEGI.cisterna],
  ]
  return (
    <article className="panel inegi" aria-labelledby="h-inegi">
      <header className="panel-cab"><h2 id="h-inegi">Agua guardada en casa</h2></header>
      <p className="inegi-cifra"><strong>{(guardan / 1e6).toFixed(2)} millones</strong> de viviendas en Puebla guardan agua en tinaco o cisterna.</p>
      <ul className="barras">
        {filas.map(([n, v]) => (
          <li key={n}><span>{n}</span><div className="barra inegi-b"><i style={{ width: `${v}%` }} /></div><strong>{v.toFixed(1)} %</strong></li>
        ))}
      </ul>
      <p className="nota">Cuautlancingo, en la zona metropolitana: tinaco {INEGI.cuautlancingo.tinaco} %, cisterna {INEGI.cuautlancingo.cisterna} %.</p>
      <p className="fuente">Fuente: INEGI, Censo de Población y Vivienda 2020. Estado de Puebla, 1 713 381 viviendas particulares habitadas. Total de viviendas que guardan agua: estimación.</p>
    </article>
  )
}

// ——— Bitácora ———
function Bitacora({ eventos }) {
  return (
    <article className="panel bitacora" aria-labelledby="h-bit">
      <header className="panel-cab">
        <h2 id="h-bit">Bitácora de eventos</h2>
        <span className="dato-sec">{eventos.length} registros</span>
      </header>
      <div className="tabla-cont">
        <table>
          <thead><tr><th>Hora</th><th>Evento</th><th>Nodo</th></tr></thead>
          <tbody>
            {eventos.map((e) => (
              <tr key={e.id}>
                <td className="hora">{e.hora}</td>
                <td><i className={`punto p-${e.tipo}`} />{e.texto}</td>
                <td className="dato-sec">{e.nodo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

export default function Tecnica({ a, clima }) {
  return (
    <>
      <Heroe t={a.t} clima={clima} />
      <div className="rejilla">
        <Resumen a={a} clima={clima} />
        <Consola a={a} />
        <CicloVivo a={a} />
        <Sonda a={a} />
        <Precision ciclos={a.ciclos} modo={a.modo} />
        <Hardware t={a.t} />
        <Reto a={a} />
        <Grafica24h historia={a.historia} modo={a.modo} />
        <Mapa t={a.t} />
        <Clima clima={clima} />
        <Inegi />
        <Bitacora eventos={a.eventos} />
      </div>
    </>
  )
}
