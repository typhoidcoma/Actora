import { useFrame } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import * as THREE from 'three/webgpu'
import { useAgent } from '@actora/stores/agent'

/** Plutchik's wheel, as the light behind her. */
const MOOD_COLORS: Record<string, string> = {
  joy: '#ffd166',
  trust: '#7ed98b',
  fear: '#3fa37a',
  surprise: '#5ad1e6',
  sadness: '#5b7cfa',
  disgust: '#a86ad8',
  anger: '#ff5d5d',
  anticipation: '#ff9f43',
}
const NEUTRAL = '#8f86ff'

export function Environment() {
  const [rim, setRim] = useState<THREE.PointLight | null>(null)
  const target = useMemo(() => new THREE.Color(), [])

  useFrame((_, dt) => {
    if (!rim) return
    const { mood, phase } = useAgent.getState()
    const k = 1 - Math.exp(-dt * 2)
    target.set(MOOD_COLORS[String(mood?.emotion ?? '').toLowerCase()] ?? NEUTRAL)
    rim.color.lerp(target, k)
    const want = phase === 'offline' ? 4 : mood?.intensity === 'high' ? 30 : 18
    rim.intensity += (want - rim.intensity) * k
  })

  return (
    <>
      <color attach="background" args={['#0d0e1a']} />
      <fog attach="fog" args={['#0d0e1a', 6, 14]} />
      <hemisphereLight args={['#c9c6ff', '#1b1a2e', 1.1]} />
      <directionalLight
        position={[2.5, 4, 3]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={3}
        shadow-camera-bottom={-1}
      />
      <pointLight ref={setRim} position={[0, 1.6, -1.2]} intensity={18} distance={6} color={NEUTRAL} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color="#15162a" roughness={0.9} />
      </mesh>
    </>
  )
}
