import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { sonidoRisa, desbloquearAudio } from '../lib/sound.js'

// Perfil de gota: x = sin(t)·sin(t/2)^m , y = cos(t)  (t: π → 0, de la base a la punta)
const ANCHO = 1.22
const M = 1.0
function radio(t) { return ANCHO * Math.sin(t) * Math.pow(Math.sin(t / 2), M) }
function radioEnY(y) { return radio(Math.acos(Math.max(-1, Math.min(1, y)))) }

function useGeometriaGota() {
  return useMemo(() => {
    const pts = []
    const n = 90
    for (let i = 0; i <= n; i++) {
      const t = Math.PI - (i / n) * Math.PI
      pts.push(new THREE.Vector2(Math.max(0.0001, radio(t)), Math.cos(t)))
    }
    return new THREE.LatheGeometry(pts, 128)
  }, [])
}

const COLOR_CUERPO = { feliz: '#22b8d8', atento: '#3aa6e0', mezclando: '#26b5c9', alto: '#4a8fe0', calor: '#ff8a6a' }

// Coloca algo sobre la superficie frontal de la gota.
function enSuperficie(x, y, hundir = 0.02) {
  const r = radioEnY(y)
  return [x, y, Math.sqrt(Math.max(0, r * r - x * x)) - hundir]
}

function Ojo({ x, y, feliz, parpadeo }) {
  const pos = enSuperficie(x, y, 0.035)
  if (feliz) {
    return (
      <mesh position={pos} rotation={[0, x * 0.35, 0]}>
        <torusGeometry args={[0.1, 0.026, 12, 28, Math.PI]} />
        <meshStandardMaterial color="#0d1b3d" roughness={0.3} />
      </mesh>
    )
  }
  return (
    <group position={pos} rotation={[0, x * 0.35, 0]} scale={[1, parpadeo, 1]}>
      <mesh scale={[0.085, 0.115, 0.05]}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshPhysicalMaterial color="#0d1b3d" roughness={0.15} clearcoat={1} />
      </mesh>
      <mesh position={[0.025, 0.04, 0.045]} scale={0.026}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color="white" />
      </mesh>
    </group>
  )
}

function Boca({ animo }) {
  const pos = enSuperficie(0, -0.5, 0.03)
  if (animo === 'calor') {
    return (
      <mesh position={pos}>
        <torusGeometry args={[0.06, 0.022, 10, 24]} />
        <meshStandardMaterial color="#0d1b3d" />
      </mesh>
    )
  }
  if (animo === 'alto') {
    return (
      <mesh position={pos} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.02, 0.14, 6, 12]} />
        <meshStandardMaterial color="#0d1b3d" />
      </mesh>
    )
  }
  const r = animo === 'feliz' ? 0.13 : 0.09
  return (
    <mesh position={[pos[0], pos[1] + r * 0.6, pos[2]]} rotation={[0, 0, Math.PI]}>
      <torusGeometry args={[r, 0.024, 12, 28, Math.PI]} />
      <meshStandardMaterial color="#0d1b3d" roughness={0.3} />
    </mesh>
  )
}

function Cejas({ animo }) {
  if (animo !== 'alto' && animo !== 'calor' && animo !== 'atento') return null
  const inc = animo === 'calor' ? -0.35 : 0.35
  return [-1, 1].map((s) => {
    if (animo === 'atento' && s < 0) return null
    return (
      <mesh key={s} position={enSuperficie(0.33 * s, -0.04, 0.02)} rotation={[0, 0.35 * s, inc * s]}>
        <capsuleGeometry args={[0.018, 0.12, 6, 10]} />
        <meshStandardMaterial color="#0d1b3d" />
      </mesh>
    )
  })
}

function Chapetes({ animo }) {
  const op = animo === 'calor' ? 0.9 : 0.7
  return [-1, 1].map((s) => (
    <mesh key={s} position={enSuperficie(0.52 * s, -0.42, 0.005)} rotation={[0, 0.55 * s, 0]}>
      <circleGeometry args={[0.09, 24]} />
      <meshBasicMaterial color="#ff5c8a" transparent opacity={op} depthWrite={false} toneMapped={false} />
    </mesh>
  ))
}

function Casco() {
  return (
    <group position={[0, 0.42, 0]} rotation={[-0.08, 0, 0.08]}>
      <mesh>
        <sphereGeometry args={[0.62, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#f2b705" roughness={0.35} clearcoat={0.6} />
      </mesh>
      <mesh position={[0, 0.02, 0.12]}>
        <cylinderGeometry args={[0.78, 0.8, 0.05, 48]} />
        <meshPhysicalMaterial color="#e3a800" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.12, 0.2, 0.9]} />
        <meshPhysicalMaterial color="#f2b705" roughness={0.35} />
      </mesh>
    </group>
  )
}

function SenalAlto() {
  const textura = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')
    g.fillStyle = '#d7263d'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = 'white'
    g.font = 'bold 88px Sora, Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('ALTO', 128, 136)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  return (
    <group position={[1.15, 0.05, 0.25]} rotation={[0, -0.35, -0.12]}>
      <mesh position={[0, -0.55, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.1, 10]} />
        <meshStandardMaterial color="#9aa3b5" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, Math.PI / 8]}>
        <cylinderGeometry args={[0.36, 0.36, 0.04, 8]} />
        <meshStandardMaterial color="#f4f4f4" />
      </mesh>
      <mesh position={[0, 0, 0.022]} rotation={[0, 0, Math.PI / 8]}>
        <circleGeometry args={[0.33, 8]} />
        <meshBasicMaterial map={textura} />
      </mesh>
    </group>
  )
}

function Sudor() {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.children.forEach((m, i) => {
      const f = (clock.elapsedTime * 0.6 + i * 0.5) % 1
      m.position.y = 0.35 - f * 0.7
      m.material.opacity = 1 - f
    })
  })
  return (
    <group ref={ref}>
      {[[-0.62, 0.62], [0.7, 0.55]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.3, z]} scale={[0.06, 0.09, 0.06]}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshPhysicalMaterial color="#bfefff" transparent roughness={0.05} clearcoat={1} />
        </mesh>
      ))}
    </group>
  )
}

function Brazo({ lado, animo }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    let z = lado * 0.9
    if (animo === 'feliz' && lado > 0) z = 2.3 + Math.sin(t * 7) * 0.35 // saluda
    if (animo === 'mezclando') z = lado * (1.1 + Math.sin(t * 9 + lado) * 0.25)
    if (animo === 'alto' && lado > 0) z = 1.6
    if (animo === 'calor') z = lado * (1.8 + Math.sin(t * 14) * 0.2) // se abanica
    ref.current.rotation.z = THREE.MathUtils.lerp(ref.current.rotation.z, z, 0.15)
  })
  return (
    <group position={[lado * (radioEnY(-0.42) - 0.04), -0.42, 0.05]} ref={ref}>
      <mesh position={[0, -0.2, 0]}>
        <capsuleGeometry args={[0.075, 0.26, 8, 16]} />
        <meshPhysicalMaterial color="#1ba3c4" roughness={0.15} clearcoat={1} />
      </mesh>
    </group>
  )
}

function Gota({ animo, reducido }) {
  const grupo = useRef()
  const cuerpo = useRef()
  const malla = useRef()
  const geo = useGeometriaGota()
  const [parpadeo, setParpadeo] = useState(1)
  const salto = useRef(0)
  const color = useMemo(() => new THREE.Color(COLOR_CUERPO[animo] || COLOR_CUERPO.feliz), [animo])

  useFrame(({ clock, pointer }, dt) => {
    const t = clock.elapsedTime
    const g = grupo.current
    if (!g) return
    const vel = reducido ? 0.2 : 1
    // seguir el puntero
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, pointer.x * 0.55, 0.06)
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -pointer.y * 0.18, 0.06)
    // respiración / temblor
    const amp = animo === 'mezclando' ? 0.05 : 0.025
    const f = animo === 'mezclando' ? 6 : 2
    let sy = 1 + Math.sin(t * f * vel) * amp
    let y = Math.sin(t * 1.4 * vel) * 0.06
    if (animo === 'alto') g.rotation.z = Math.sin(t * 18) * 0.015 * vel
    else g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, 0, 0.1)
    // salto al hacer clic
    if (salto.current > 0) {
      salto.current = Math.max(0, salto.current - dt * 1.6)
      const p = 1 - salto.current
      y += Math.sin(p * Math.PI) * 0.55
      sy *= 1 + Math.sin(p * Math.PI * 2) * 0.12
    }
    g.position.y = y
    cuerpo.current.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy))
    if (malla.current) malla.current.material.color.lerp(color, 0.06)
    // parpadeo
    const ciclo = (t * vel) % 4.2
    setParpadeo((p) => {
      const n = ciclo > 4.05 ? 0.1 : 1
      return p === n ? p : n
    })
  })

  return (
    <group
      ref={grupo}
      onClick={(e) => { e.stopPropagation(); desbloquearAudio(); salto.current = 1; sonidoRisa() }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <group ref={cuerpo}>
        <mesh ref={malla} geometry={geo} castShadow>
          <meshPhysicalMaterial
            color={COLOR_CUERPO.feliz}
            roughness={0.06}
            metalness={0}
            clearcoat={1}
            clearcoatRoughness={0.04}
            iridescence={0.35}
            iridescenceIOR={1.3}
            sheen={0.4}
            sheenColor="#bff7ff"
          />
        </mesh>
        {/* brillo especular pintado */}
        <mesh position={enSuperficie(-0.42, 0.05, -0.012)} rotation={[0, -0.5, 0.5]} scale={[0.09, 0.2, 1]}>
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial color="white" transparent opacity={0.5} depthWrite={false} />
        </mesh>
        <Ojo x={-0.27} y={-0.2} feliz={animo === 'feliz'} parpadeo={parpadeo} />
        <Ojo x={0.27} y={-0.2} feliz={animo === 'feliz'} parpadeo={parpadeo} />
        <Cejas animo={animo} />
        <Boca animo={animo} />
        <Chapetes animo={animo} />
        {animo === 'mezclando' && <Casco />}
        {animo === 'calor' && <Sudor />}
      </group>
      <Brazo lado={-1} animo={animo} />
      <Brazo lado={1} animo={animo} />
      {animo === 'alto' && <SenalAlto />}
    </group>
  )
}

export default function Gota3D({ animo = 'feliz' }) {
  const reducido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return (
    <Canvas
      className="gota3d"
      dpr={[1, 2]}
      camera={{ position: [0, 0.15, 4.6], fov: 36 }}
      gl={{ antialias: true, alpha: true }}
      aria-label={`Tali, la gota de AquaPhy, estado: ${animo}`}
      role="img"
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <directionalLight position={[-4, 1, -2]} intensity={0.8} color="#9fd8ff" />
      <Gota animo={animo} reducido={reducido} />
      <ContactShadows position={[0, -1.12, 0]} opacity={0.35} scale={4} blur={2.6} far={2} color="#0b2a6b" />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} position={[0, 3, 4]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#a8e8ff" position={[-5, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer form="ring" intensity={2} color="#f2b705" position={[4, -1, 2]} scale={1.5} />
        <Lightformer form="rect" intensity={1} color="#1d3e9e" position={[0, -3, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
      </Environment>
    </Canvas>
  )
}
