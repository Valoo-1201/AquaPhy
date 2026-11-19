// "El problema": historia animada del tandeo en 4 pasos. Las cifras vienen de src/data/fuentes.js
// y los porcentajes de cloro activo se calculan con la ecuación de Morris (src/lib/chem.js).
import { useEffect, useState } from 'react'
import { fraccionHOCl } from '../lib/chem.js'

export default function Problema({ temp = 20 }) {
  const [paso, setPaso] = useState(0)
  const [pausa, setPausa] = useState(false)
  useEffect(() => {
    if (pausa) return
    const id = setInterval(() => setPaso((p) => (p + 1) % 4), 5000)
    return () => clearInterval(id)
  }, [pausa])

  const ph = [7.2, 7.2, 8.3, 7.0][paso]
  const f = Math.round(fraccionHOCl(ph, temp) * 100)
  const PASOS = [
    { t: '1 · Llega agua de la red', d: 'El agua sale tratada y con cloro. Se guarda en tinacos y cisternas porque no llega todo el día.' },
    { t: '2 · Corte por tandeo', d: 'La red se queda sin agua horas o días. En marzo de 2026, 64 colonias de Puebla pasaron 36 horas sin servicio.' },
    { t: '3 · El agua se estanca', d: 'Guardada, el cloro se consume con el tiempo y más rápido con calor. Si además el pH es alto, la mayor parte del cloro queda en su forma débil y desinfecta poco.' },
    { t: '4 · AquaPhy corrige el pH', d: 'El nodo mide el pH y dosifica ácido hasta el umbral: el cloro vuelve a su forma activa y el agua guardada queda protegida.' },
  ]
  const p = PASOS[paso]
  return (
    <section className="panel problema" aria-labelledby="h-problema" onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}>
      <header className="panel-cab">
        <h2 id="h-problema">El problema que resolvemos</h2>
        <div className="prob-puntos" role="tablist" aria-label="Pasos">
          {PASOS.map((x, i) => <button key={x.t} role="tab" aria-selected={i === paso} aria-label={x.t} className={i === paso ? 'on' : ''} onClick={() => { setPaso(i); setPausa(true) }} />)}
        </div>
      </header>
      <div className="prob-cont">
        <svg viewBox="0 0 520 260" className={`prob-escena p${paso}`} role="img" aria-label={`${p.t}. pH ${ph}, ${f} % del cloro activo.`}>
          <defs>
            <clipPath id="tanqueProb"><rect x="330" y="44" width="140" height="176" rx="24" /></clipPath>
            <linearGradient id="aguaProb" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#5cc8f0" /><stop offset="1" stopColor="#1d3e9e" />
            </linearGradient>
          </defs>
          <path d="M30 200 H300 Q314 200 314 186 V176 H340" className="pe-tubo" />
          <path d="M30 200 H300 Q314 200 314 186 V176 H340" className="pe-tubo-agua" />
          <rect x="378" y="16" width="44" height="14" rx="5" className="tinaco-tapa" />
          <rect x="356" y="28" width="88" height="18" rx="9" className="tinaco-tapa" />
          <rect x="330" y="44" width="140" height="176" rx="24" className="tinaco-cuerpo" />
          <g clipPath="url(#tanqueProb)">
            <g className="pe-nivel">
              <rect x="330" y="84" width="140" height="180" fill="url(#aguaProb)" />
              <rect x="330" y="84" width="140" height="180" className="pe-tinte" />
              <path className="ola" d="M290 84 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 v20 h-240z" fill="#8fdcf7" opacity="0.7" />
            </g>
            {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={352 + ((i * 37) % 100)} cy={130 + ((i * 23) % 70)} r="4" className="pe-bacteria" style={{ transitionDelay: `${i * 50}ms` }} />)}
            <rect x="342" y="54" width="9" height="150" rx="4.5" fill="white" opacity="0.35" />
          </g>
          <g className="pe-reloj"><circle cx="160" cy="130" r="26" /><path d="M160 114 V130 L172 138" /></g>
          <g className="pe-nodo">
            <rect x="478" y="96" width="34" height="26" rx="7" />
            <text x="495" y="113" textAnchor="middle">pH</text>
          </g>
          <g className="pe-ph"><rect x="20" y="20" width="160" height="62" rx="16" /><text x="36" y="46">pH {ph.toFixed(1)}</text><text x="36" y="68" className="pe-sub">Cloro activo {f} %</text></g>
        </svg>
        <div className="prob-texto" aria-live="polite">
          <h3>{p.t}</h3>
          <p>{p.d}</p>
          <div className="prob-cifras">
            <div><strong>81 %</strong><span>de las viviendas de Puebla guarda agua en tinaco o cisterna (INEGI 2020)</span></div>
            <div><strong>×{(fraccionHOCl(7, temp) / fraccionHOCl(8.3, temp)).toFixed(1)}</strong><span>más cloro activo a pH 7.0 que a pH 8.3 (ecuación de Morris)</span></div>
          </div>
        </div>
      </div>
    </section>
  )
}
