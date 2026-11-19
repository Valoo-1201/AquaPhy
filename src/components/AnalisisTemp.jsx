// Análisis pH × temperatura. Todo se CALCULA con ecuaciones publicadas
// (ver src/data/fuentes.js): no hay datos inventados en este panel.
import { fraccionHOCl, pKa } from '../lib/chem.js'

const PH0 = 6.0, PH1 = 9.0, DPH = 0.1
const T0 = 10, T1 = 30, DT = 1

// Escala secuencial: poco HOCl (naranja) → mucho HOCl (azul).
function colorFraccion(f) {
  const a = [224, 122, 31], b = [37, 99, 235]
  const m = a.map((x, i) => Math.round(x + (b[i] - x) * f))
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`
}

const pendienteNernst = (tempC) => 0.19841 * (tempC + 273.15) // mV por unidad de pH

export default function AnalisisTemp({ ph, umbral, clima }) {
  const W = 620, H = 300
  const m = { l: 48, r: 12, t: 12, b: 40 }
  const nx = Math.round((PH1 - PH0) / DPH) + 1
  const ny = Math.round((T1 - T0) / DT) + 1
  const cw = (W - m.l - m.r) / nx
  const ch = (H - m.t - m.b) / ny
  const X = (v) => m.l + ((v - PH0) / DPH) * cw
  const Y = (tc) => H - m.b - ((tc - T0) / DT + 1) * ch

  const tSuelo = clima.suelo.s54
  const tAire = clima.temp
  const celdas = []
  for (let j = 0; j < ny; j++) {
    const tc = T0 + j * DT
    for (let i = 0; i < nx; i++) {
      const v = PH0 + i * DPH
      celdas.push(<rect key={`${i}-${j}`} x={X(v)} y={Y(tc)} width={cw + 0.5} height={ch + 0.5} fill={colorFraccion(fraccionHOCl(v, tc))} />)
    }
  }
  const phC = Math.min(PH1, Math.max(PH0, ph))
  const tC = Math.min(T1, Math.max(T0, tSuelo))
  const cx = X(phC) + cw / 2
  const cy = Y(tC) + ch / 2

  const filas = [
    ['Suelo a 54 cm (aprox. tubería)', tSuelo],
    ['Aire', tAire],
    ['Referencia 25 °C', 25],
  ]

  return (
    <article className="panel analisis" aria-labelledby="h-analisis">
      <header className="panel-cab">
        <h2 id="h-analisis">pH × temperatura: ¿cuánto cloro sí desinfecta?</h2>
        <span className="chip chip-calc">Calculado · ecuación de Morris (1966)</span>
      </header>
      <div className="analisis-cont">
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
            aria-label={`Mapa de calor del porcentaje de cloro activo según pH y temperatura. Punto actual: pH ${ph.toFixed(2)} a ${tSuelo.toFixed(1)} °C, ${Math.round(fraccionHOCl(ph, tSuelo) * 100)} %.`}>
            {celdas}
            <line x1={X(6.5)} x2={X(6.5)} y1={m.t} y2={H - m.b} className="an-nom" />
            <line x1={X(8.5)} x2={X(8.5)} y1={m.t} y2={H - m.b} className="an-nom" />
            <line x1={X(Math.max(PH0, umbral)) + cw / 2} x2={X(Math.max(PH0, umbral)) + cw / 2} y1={m.t} y2={H - m.b} className="an-umbral" />
            <circle cx={cx} cy={cy} r="9" className="an-punto" />
            {[6, 6.5, 7, 7.5, 8, 8.5, 9].map((v) => (
              <text key={v} x={X(v) + cw / 2} y={H - m.b + 16} textAnchor="middle" className="curva-eje">{v}</text>
            ))}
            <text x={(W + m.l) / 2} y={H - 6} textAnchor="middle" className="curva-eje">pH</text>
            {[10, 15, 20, 25, 30].map((tc) => (
              <text key={tc} x={m.l - 8} y={Y(tc) + ch / 2 + 4} textAnchor="end" className="curva-eje">{tc}°</text>
            ))}
          </svg>
          <div className="an-leyenda">
            <span>0 % HOCl</span><i /><span>100 % HOCl</span>
            <span className="an-ley-nom">Líneas blancas: rango NOM-127 · Línea amarilla: umbral · Punto: ahora</span>
          </div>
        </div>
        <div className="an-datos">
          <table>
            <thead><tr><th>Temperatura</th><th>pKa</th><th>HOCl a pH {ph.toFixed(2)}</th><th>HOCl a umbral {umbral.toFixed(2)}</th></tr></thead>
            <tbody>
              {filas.map(([n, tc]) => (
                <tr key={n}>
                  <td>{n}<br /><span className="dato-sec">{tc.toFixed(1)} °C</span></td>
                  <td>{pKa(tc).toFixed(2)}</td>
                  <td><strong>{Math.round(fraccionHOCl(ph, tc) * 100)} %</strong></td>
                  <td>{Math.round(fraccionHOCl(umbral, tc) * 100)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="an-claves">
            <li><strong>Cómo leerlo:</strong> el color indica qué porcentaje del cloro libre está como ácido hipocloroso (HOCl), la forma que desinfecta. A la derecha (pH alto) predomina el hipoclorito (OCl⁻), mucho más débil.</li>
            <li><strong>Efecto de la temperatura:</strong> al subir la temperatura el pKa baja; a igual pH queda un poco menos de HOCl. El pH pesa mucho más que la temperatura.</li>
            <li><strong>El calor también gasta el cloro:</strong> la velocidad con que el cloro se consume en el agua aumenta con la temperatura (García-Ávila et al., 2020).</li>
            <li><strong>Sensor:</strong> la pendiente del electrodo cambia con la temperatura: {pendienteNernst(tSuelo).toFixed(1)} mV/pH a {tSuelo.toFixed(1)} °C contra 59.2 mV/pH a 25 °C. Nuestra calibración se hizo a una sola temperatura; la compensación es una mejora futura.</li>
          </ul>
          <p className="fuente">La temperatura del suelo a 54 cm (Open-Meteo) es una aproximación de la temperatura del agua en tuberías enterradas, no una medición directa.</p>
        </div>
      </div>
    </article>
  )
}
