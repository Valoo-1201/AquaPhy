import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine,
} from 'recharts'
import { MapContainer, TileLayer, CircleMarker, Tooltip as MapTip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { fraccionHOCl, pKa, colorPH, GRADIENTE_INDICADOR } from '../lib/chem.js'
import { UMBRAL_MIN, UMBRAL_MAX, NOM_MIN, NOM_MAX, PIN_OPERADOR, COLONIAS, PUEBLA } from '../config.js'
import { describirClima } from '../hooks/useClima.js'
import { desbloquearAudio } from '../lib/sound.js'
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
          <h1 id="h-tec">Con el pH actual, el cloro {mensaje}: {Math.round(f * 100)} % está en su forma activa.</h1>
          <p className="heroe-sub">
            El cloro solo desinfecta como ácido hipocloroso (HOCl). Bajar el pH a {t.umbral.toFixed(2)} lo llevaría a {Math.round(fu * 100)} %.
            Calculado a {temp.toFixed(1)} °C, la temperatura del suelo a 54 cm, donde corren las tuberías (pKa {pKa(temp).toFixed(2)}).
          </p>
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

function GraficaViva({ vivo, umbral }) {
  const ahora = vivo.length ? vivo[vivo.length - 1].s : Date.now()
  const datos = vivo.map((p) => ({ x: Math.round((p.s - ahora) / 1000), ph: p.ph }))
  return (
    <article className="panel viva" aria-labelledby="h-viva">
      <header className="panel-cab">
        <h2 id="h-viva">pH en vivo</h2>
        <span className="dato-sec">Último minuto y medio, un punto por segundo</span>
      </header>
      <div className="grafica">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--rejilla)" vertical={false} />
            <ReferenceArea y1={NOM_MIN} y2={NOM_MAX} fill="var(--ok)" fillOpacity={0.09} />
            <ReferenceLine y={umbral} stroke="var(--amarillo)" strokeDasharray="5 4" label={{ value: `Umbral ${umbral.toFixed(2)}`, fill: 'var(--tinta-2)', fontSize: 12, position: 'insideBottomLeft' }} />
            <XAxis dataKey="x" type="number" domain={[-90, 0]} ticks={[-90, -60, -30, 0]} tickFormatter={(v) => (v === 0 ? 'ahora' : `${v} s`)} stroke="var(--tinta-2)" fontSize={12} />
            <YAxis domain={[4, 9]} ticks={[4, 5, 6, 7, 8, 9]} stroke="var(--tinta-2)" fontSize={12} />
            <Tooltip formatter={(v) => [Number(v).toFixed(3), 'pH']} labelFormatter={(v) => `${v} s`} contentStyle={{ background: 'var(--superficie)', border: '1px solid var(--linea)', borderRadius: 10 }} />
            <Line type="monotone" dataKey="ph" stroke="var(--cobalto-vivo)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  )
}

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
function Mapa({ t }) {
  const nodos = COLONIAS.map((c, i) => {
    const ph = c.real ? t.ph : [7.32, 7.81, 7.05, 8.62, 7.44][i - 1] ?? 7.3
    const color = ph < NOM_MIN || ph > NOM_MAX ? '#d7263d' : ph > 7.6 ? '#f2b705' : '#12a36f'
    return { ...c, ph, color }
  })
  return (
    <article className="panel mapa" aria-labelledby="h-mapa">
      <header className="panel-cab">
        <h2 id="h-mapa">Red de nodos en el municipio</h2>
        <span className="dato-sec">1 nodo real · 5 simulados</span>
      </header>
      <div className="mapa-cont">
        <MapContainer center={[PUEBLA.lat, PUEBLA.lng]} zoom={12} scrollWheelZoom={false} className="mapa-leaflet" attributionControl>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          />
          {nodos.map((n) => (
            <CircleMarker key={n.id} center={[n.lat, n.lng]} radius={n.real ? 13 : 9}
              pathOptions={{ color: 'white', weight: 3, fillColor: n.color, fillOpacity: 1 }}>
              <MapTip direction="top" offset={[0, -8]}>{n.nombre} · pH {n.ph.toFixed(2)}{n.real ? ' · ESP32 real' : ''}</MapTip>
            </CircleMarker>
          ))}
        </MapContainer>
        <ul className="mapa-lista">
          {nodos.map((n) => (
            <li key={n.id}><i style={{ background: n.color }} /><span>{n.nombre}{n.real && <em> · real</em>}</span><strong>{n.ph.toFixed(2)}</strong></li>
          ))}
        </ul>
      </div>
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
        <Consola a={a} />
        <GraficaViva vivo={a.vivo} umbral={a.t.umbral} />
        <Hardware t={a.t} />
        <Grafica24h historia={a.historia} modo={a.modo} />
        <Clima clima={clima} />
        <Mapa t={a.t} />
        <Inegi />
        <Bitacora eventos={a.eventos} />
      </div>
    </>
  )
}
