'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { SpeciesCanvas } from '@/components/SpeciesSwitch'

const overlayBtnStyle: React.CSSProperties = {
  padding: '14px 28px',
  fontFamily: "'Syne', sans-serif",
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: 2,
  textTransform: 'uppercase',
  background: 'rgba(181,71,10,0.35)',
  border: '1px solid rgba(255,180,80,0.3)',
  color: '#ffd4a0',
  cursor: 'pointer',
  transition: 'all 0.2s',
}

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const mounted = useRef(true)
  const rafRef = useRef<number>(0)
  const rendererRef = useRef<any>(null)
  const cleanupFns = useRef<(() => void)[]>([])
  const activeOverlayRef = useRef<string | null>(null)
  const joystickRef = useRef({ active: false, dx: 0, dy: 0 })
  const router = useRouter()

  const { data: session, status } = useSession()
  const isLoggedIn = !!session?.user

  const [triggerWorldEnter, setTriggerWorldEnter] = useState(false)
  const [promptLabel, setPromptLabel] = useState<string | null>(null)
  const [activeOverlay, setActiveOverlay] = useState<
    'about' | 'signin' | 'species' | 'leaderboard' | 'pets' | 'shrineChoice' | null
  >(null)
  const [cinematicDone, setCinematicDone] = useState(false)
  const [controlsHint, setControlsHint] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [joystick, setJoystick] = useState({ active: false, dx: 0, dy: 0 })

  useEffect(() => {
    if (!triggerWorldEnter || status === 'loading') return

    if (status === 'authenticated') {
      router.push('/world')
    }
    
    // Reset trigger after a tick to avoid cascading render warning
    const t = setTimeout(() => setTriggerWorldEnter(false), 0)
    return () => clearTimeout(t)
  }, [triggerWorldEnter, status, router])

  useEffect(() => { return () => { mounted.current = false } }, [])

  const openOverlay = useCallback((v: typeof activeOverlay) => {
    if (!mounted.current) return
    activeOverlayRef.current = v
    setActiveOverlay(v)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!canvasRef.current) return

    const loadScript = (src: string): Promise<void> =>
      new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
        const s = document.createElement('script')
        s.src = src; s.onload = () => resolve(); s.onerror = reject
        document.head.appendChild(s)
      })

    const init = async () => {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js')
      if (!mounted.current || !canvasRef.current) return

      const THREE = (window as any).THREE

      const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: false })
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.outputEncoding = THREE.sRGBEncoding
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.2
      rendererRef.current = renderer

      const scene = new THREE.Scene()
      scene.fog = new THREE.FogExp2(0xb8cce0, 0.018)
      scene.background = new THREE.Color(0x87b4d0)

      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120)
      camera.position.set(0, 7, 22)
      camera.lookAt(0, 2, 0)

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
      }
      window.addEventListener('resize', onResize)
      cleanupFns.current.push(() => window.removeEventListener('resize', onResize))

      // Lighting
      const sun = new THREE.DirectionalLight(0xffd4a0, 2.4)
      sun.position.set(20, 40, 10); sun.castShadow = true
      sun.shadow.mapSize.width = 2048; sun.shadow.mapSize.height = 2048
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 120
      sun.shadow.camera.left = -50; sun.shadow.camera.right = 50
      sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50
      sun.shadow.bias = -0.001; scene.add(sun)
      const fill = new THREE.DirectionalLight(0x9bb8d4, 0.7)
      fill.position.set(-20, 15, -10); scene.add(fill)
      const ambientLight = new THREE.AmbientLight(0xffe8c0, 0.55); scene.add(ambientLight)
      const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a6741, 0.45); scene.add(hemiLight)

      // Vox helper
      function vox(x: number, y: number, z: number, color: number | string, w = 1, h = 1, d = 1, castShadow = false, receiveShadow = false) {
        const mesh = new (window as any).THREE.Mesh(
          new (window as any).THREE.BoxGeometry(w, h, d),
          new (window as any).THREE.MeshLambertMaterial({ color: new (window as any).THREE.Color(color) })
        )
        mesh.position.set(x, y, z)
        mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow
        scene.add(mesh); return mesh
      }

      // Ground
      const groundGeo = new THREE.PlaneGeometry(80, 80, 40, 40)
      groundGeo.rotateX(-Math.PI / 2)
      const groundColors: number[] = []
      const groundPos = groundGeo.attributes.position
      for (let i = 0; i < groundPos.count; i++) {
        const gx = groundPos.getX(i), gz = groundPos.getZ(i)
        const n = Math.sin(gx * 2.3) * Math.cos(gz * 1.9)
        if (n > 0.2) groundColors.push(0.28, 0.54, 0.22)
        else if (n > -0.2) groundColors.push(0.32, 0.60, 0.26)
        else groundColors.push(0.26, 0.50, 0.20)
      }
      groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3))
      const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }))
      ground.receiveShadow = true; scene.add(ground)

      for (let gx = -30; gx < 30; gx++) vox(gx + 0.5, -0.3, -32, 0x8B6914, 1, 0.4, 1)

      // Path
      const pathPoints = [[0, 20], [0.5, 16], [0, 12], [-0.5, 8], [0, 4], [0.5, 0], [0, -4], [-0.5, -8], [0, -12], [0.5, -16], [0, -20]]
      const stoneColors = [0x9a9a9a, 0x8a8a8a, 0xaaaaaa, 0x888888]
      pathPoints.forEach(([px, pz]) => {
        for (let w = -1; w <= 1; w++) {
          vox(px + w, 0.06, pz, stoneColors[Math.floor(Math.random() * 4)], 1, 0.12, 1, false, true)
        }
      })

      // Torii
      const toriiBars: any[] = []
      function buildTorii(x: number, z: number) {
        const red = 0xcc3300, darkRed = 0x992200
        for (let py = 0; py < 5; py++) {
          vox(x - 1.8, py + 0.5, z, red, 1, 1, 0.35, true)
          vox(x + 1.8, py + 0.5, z, red, 1, 1, 0.35, true)
        }
        toriiBars.push(vox(x, 5.3, z, darkRed, 6, 0.45, 0.5, true))
        toriiBars.push(vox(x, 4.6, z, red, 5, 0.35, 0.45, true))
        vox(x - 1.8, 4.6, z, darkRed, 0.25, 0.8, 0.35)
        vox(x + 1.8, 4.6, z, darkRed, 0.25, 0.8, 0.35)
      }
      buildTorii(0, -7); buildTorii(0, -18)

      // Lanterns
      const lanternMats: any[] = []
      function buildLantern(x: number, z: number) {
        const stone = 0x888880
        vox(x, 0.2, z, stone, 0.85, 0.45, 0.85)
        vox(x, 0.65, z, stone, 0.45, 0.6, 0.45)
        vox(x, 1.1, z, stone, 0.45, 0.55, 0.45)
        const lMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xffcc66), emissive: new THREE.Color(0xffaa22), emissiveIntensity: 1.0 })
        const lMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), lMat)
        lMesh.position.set(x, 1.75, z); lMesh.castShadow = true; scene.add(lMesh)
        lanternMats.push(lMat)
        vox(x, 2.15, z, stone, 0.95, 0.2, 0.95)
        const pl = new THREE.PointLight(0xffaa22, 1.4, 8)
        pl.position.set(x, 1.8, z); scene.add(pl)
      }
      buildLantern(-2, 4); buildLantern(2, 0); buildLantern(-2, -4); buildLantern(2, -12)

      // Cherry trees
      function buildCherryTree(x: number, z: number, h: number) {
        const blossoms = [0xffb7c5, 0xff9eb5, 0xffc8d5, 0xff85a1]
        for (let ty = 0; ty < h; ty++) vox(x, ty + 0.5, z, 0x6b3f1e, 0.7, 1, 0.7, true)
        for (let bx = -3; bx <= 3; bx++) for (let by = -1; by <= 2; by++) for (let bz = -3; bz <= 3; bz++) {
          const dist = Math.sqrt(bx * bx + by * by * 1.5 + bz * bz)
          if (dist < 3.2 && Math.random() > dist * 0.15)
            vox(x + bx * 0.88, h + by * 0.88, z + bz * 0.88, blossoms[Math.floor(Math.random() * 4)], 0.85, 0.85, 0.85, true)
        }
      }
      buildCherryTree(-11, -5, 6); buildCherryTree(-15, -13, 5)
      buildCherryTree(12, -8, 4); buildCherryTree(-9, 8, 4)

      // Pond
      const POND_X = 9, POND_Z = -4
      for (let bx = -4; bx <= 4; bx++) for (let bz = -3; bz <= 3; bz++) {
        if (Math.abs(bx) === 4 || Math.abs(bz) === 3) vox(POND_X + bx, 0.08, POND_Z + bz, 0x7a7a7a, 1, 0.2, 1)
      }
      const waterGeo = new THREE.PlaneGeometry(7, 5); waterGeo.rotateX(-Math.PI / 2)
      const waterMat = new THREE.MeshLambertMaterial({ color: 0x3d8fa8, transparent: true, opacity: 0.82 })
      const waterMesh = new THREE.Mesh(waterGeo, waterMat)
      waterMesh.position.set(POND_X, 0.1, POND_Z); waterMesh.receiveShadow = true; scene.add(waterMesh)
        ;[[POND_X - 2, POND_Z + 1], [POND_X + 1, POND_Z - 1], [POND_X + 2, POND_Z + 2]].forEach(([lx, lz]) => vox(lx, 0.13, lz, 0x3a8a3a, 0.7, 0.06, 0.7))
      const koiData = Array.from({ length: 5 }, (_, i) => ({
        mesh: vox(POND_X, 0.12, POND_Z, [0xff6633, 0xff4400, 0xffaa44, 0xffffff, 0xff8800][i], 0.5, 0.15, 0.9),
        angle: (i / 5) * Math.PI * 2, radius: 1.5 + Math.random() * 1.5, speed: 0.004 + Math.random() * 0.003,
      }))

      // Shrine
      function buildShrine(x: number, z: number) {
        const wood = 0x6b4423, stone = 0x9a8a7a, roof = 0x2a1f14
        for (let s = 0; s < 3; s++) for (let sx = -(3 - s); sx <= (3 - s); sx++) for (let sz = -(2 - s); sz <= (2 - s); sz++)
          vox(x + sx, s * 0.45, z + sz + 3, stone, 1, 0.45, 1, false, true)
        for (let wx = -3; wx <= 3; wx++) for (let wy = 0; wy < 4; wy++) for (let wz = -2; wz <= 2; wz++) {
          const isWall = Math.abs(wx) === 3 || Math.abs(wz) === 2 || wy === 0
          if (!isWall) continue
          if (wx === 0 && wz === -2 && wy < 2) continue
          const isWindow = Math.abs(wx) === 2 && wz === -2 && wy === 1
          const m = vox(x + wx, 1.4 + wy, z + wz, isWindow ? 0xffcc66 : wood, 1, 1, 1, true)
          if (isWindow) { m.material.emissive = new THREE.Color(0xffaa22); m.material.emissiveIntensity = 1.2 }
        }
        for (let ry = 0; ry < 3; ry++) {
          const ext = ry
          for (let rx = -(3 + ext); rx <= (3 + ext); rx++) for (let rz = -(2 + ext); rz <= (2 + ext); rz++) {
            const isEdge = Math.abs(rx) === 3 + ext || Math.abs(rz) === 2 + ext
            if (!isEdge && ry > 0) continue
            vox(x + rx, 5.4 + ry * 0.5, z + rz, ry === 0 ? 0x3a2f1e : roof, 1, 0.4, 1, true)
          }
        }
        vox(x, 5.2, z - 2.5, 0x886600, 0.4, 0.6, 0.4)
      }
      buildShrine(0, -22)

      // ─── FOREST ZONE (X:18–32, Z:−20–5) ───────────────────────────────────
      function buildForestTree(x: number, z: number, h: number) {
        const lc = [0x2d4a1e, 0x1e3014, 0x3a5a28, 0x4a6a38]
        for (let ty = 0; ty < h; ty++) vox(x, ty + 0.5, z, 0x5a3a1a, 0.65, 1, 0.65, true)
        for (let fx = -2; fx <= 2; fx++) for (let fy = -1; fy <= 2; fy++) for (let fz = -2; fz <= 2; fz++) {
          const d = Math.sqrt(fx * fx + fy * fy * 1.2 + fz * fz)
          if (d < 2.4 && Math.random() > d * 0.18) vox(x + fx * 0.9, h + fy * 0.85, z + fz * 0.9, lc[Math.floor(Math.random() * 4)], 0.9, 0.9, 0.9)
        }
      }
      ;[[22, -2], [24, -9], [27, -5], [29, -14], [23, -17], [31, -9], [26, -20], [20, -12]].forEach(([x, z]) => buildForestTree(x, z, 4 + Math.floor(Math.random() * 3)))
        ;[[23, -10], [28, -18], [21, -5]].forEach(([x, z]) => { vox(x, 0.08, z, 0x7a6a4a, 0.7, 0.16, 0.7); vox(x, 0.35, z, 0xcc4422, 0.95, 0.28, 0.95) })
      for (let fz = -1; fz >= -20; fz -= 2) vox(19.5, 0.06, fz, 0x8a8a7a, 1, 0.12, 1, false, true)
      buildLantern(20, -5); buildLantern(20, -16)
      vox(26, 0.3, -24, 0x7a6a5a, 2.5, 0.5, 1.8); vox(26, 0.8, -24, 0x6a5a4a, 1.5, 0.3, 1.2)
      const forestAltarMat = new THREE.MeshLambertMaterial({ color: 0xff9944, emissive: new THREE.Color(0xff7722), emissiveIntensity: 1.5, transparent: true, opacity: 0.9 })
      const forestAltarFlame = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.25), forestAltarMat)
      forestAltarFlame.position.set(26, 1.15, -24); scene.add(forestAltarFlame)
      const forestAltarLight = new THREE.PointLight(0xff9944, 0.7, 7)
      forestAltarLight.position.set(26, 1.5, -24); scene.add(forestAltarLight)

      // ─── WATER STREAM (X:−16–−9, Z:12–25) ────────────────────────────────
      for (let sz = 12; sz <= 24; sz++) { vox(-14, -0.08, sz, 0x7a9070, 1, 0.18, 1, false, true); vox(-13, -0.08, sz, 0x6a8060, 1, 0.18, 1, false, true) }
      const streamGeo = new THREE.PlaneGeometry(1.8, 13); streamGeo.rotateX(-Math.PI / 2)
      const streamMat = new THREE.MeshLambertMaterial({ color: 0x4a9ab8, transparent: true, opacity: 0.72 })
      const streamMesh = new THREE.Mesh(streamGeo, streamMat)
      streamMesh.position.set(-13.4, 0.02, 18); scene.add(streamMesh)
        ;[-14.2, -13.5, -12.8].forEach(bx => vox(bx, 0.28, 18, 0x8B6914, 1, 0.2, 4, true))
        ;[-14.5, -12.5].forEach(bx => { vox(bx, 0.6, 16.5, 0x6b4423, 0.12, 0.55, 0.12); vox(bx, 0.6, 19.5, 0x6b4423, 0.12, 0.55, 0.12); vox(bx, 0.9, 18, 0x6b4423, 0.12, 0.08, 3) })
        ;[[-15.5, 14], [-12, 15.5], [-15.5, 22], [-12, 20.5]].forEach(([bx, bz]) => { vox(bx, 0.5, bz, 0x2a5820, 0.25, 1.1, 0.25); vox(bx, 1.2, bz, 0x3a6830, 0.75, 0.35, 0.75) })
      vox(-10, 0.4, 18, 0x7a5a20, 0.4, 2, 0.4, true); vox(-10, 1.4, 18, 0x8a6a30, 2, 0.3, 0.3); vox(-10, 1.4, 18, 0x8a6a30, 0.3, 0.3, 2)

      // ─── SPIRIT AREA (X:−14–−22, Z:−26–−38) ──────────────────────────────
      for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 4) {
        const sx = -18 + Math.cos(ang) * 5.5, sz = -32 + Math.sin(ang) * 4.5
        vox(sx, 0.25, sz, 0x5a4868, 0.75, 0.5, 0.75); vox(sx, 0.75, sz, 0x4a3858, 0.55, 0.7, 0.55); vox(sx, 1.45, sz, 0x3a2848, 0.4, 0.3, 0.4)
      }
      vox(-18, 0.2, -32, 0x2a1e38, 2.5, 0.35, 2.5)
        ;[[-20, -30], [-16, -30], [-18, -28], [-18, -34], [-22, -32], [-14, -32]].forEach(([sx, sz]) => vox(sx, 0.04, sz, 0x2a4a2a, 1.2, 0.08, 1.2))
      const WISP_COUNT = 8
      const wispGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28)
      const wispMat = new THREE.MeshLambertMaterial({ color: 0xaadeff, emissive: new THREE.Color(0x88bbff), emissiveIntensity: 2.0, transparent: true, opacity: 0.8 })
      const wispMesh = new THREE.InstancedMesh(wispGeo, wispMat, WISP_COUNT)
      scene.add(wispMesh)
      const wispData = Array.from({ length: WISP_COUNT }, (_, i) => ({ angle: (i / WISP_COUNT) * Math.PI * 2, radius: 2.5 + (i % 3) * 1.2, baseY: 1.6 + (i % 4) * 0.35, speed: 0.006 + (i % 3) * 0.003 }))
      const spiritAreaLight = new THREE.PointLight(0x88bbff, 0.5, 10)
      spiritAreaLight.position.set(-18, 2, -32); scene.add(spiritAreaLight)

      // Notice board
      vox(-7, 0.8, 3, 0x6b4423, 0.2, 1.6, 0.2, true); vox(-7, 1.8, 3, 0x8B6914, 1.4, 1.0, 0.15, true); vox(-7, 1.8, 3.08, 0xf0ddb0, 1.2, 0.85, 0.05)
      // Species board
      vox(9, 0.5, -1, 0x6b4423, 0.2, 1.0, 0.2, true); vox(9, 1.3, -1, 0x7a5c2a, 2.0, 1.3, 0.15, true)
        ;[0x7a8070, 0xc5c0b8, 0x8a6a3a, 0x3d4a33, 0x8a5a60].forEach((col, i) => vox(9 + (i - 2) * 0.4, 1.35, -1.1, col, 0.28, 0.28, 0.05))

      // Leaderboard stone
      const leaderStoneMesh = vox(0, 0, -24.5, 0x6a6a6a, 3.2, 0.01, 0.35, true)

      // Pet pen fence
      for (let fx = -12; fx <= -4; fx += 2) {
        vox(fx, 0.55, -4, 0x8B6914, 0.2, 1.1, 0.2); vox(fx, 0.55, -12, 0x8B6914, 0.2, 1.1, 0.2)
        if (fx < -4) {
          vox(fx + 1, 0.75, -4, 0x8B6914, 2, 0.15, 0.15); vox(fx + 1, 0.35, -4, 0x8B6914, 2, 0.15, 0.15)
          vox(fx + 1, 0.75, -12, 0x8B6914, 2, 0.15, 0.15); vox(fx + 1, 0.35, -12, 0x8B6914, 2, 0.15, 0.15)
        }
      }
      for (let fz = -12; fz <= -4; fz += 2) {
        vox(-12, 0.55, fz, 0x8B6914, 0.2, 1.1, 0.2); vox(-4, 0.55, fz, 0x8B6914, 0.2, 1.1, 0.2)
        if (fz < -4) {
          vox(-12, 0.75, fz + 1, 0x8B6914, 0.15, 0.15, 2); vox(-12, 0.35, fz + 1, 0x8B6914, 0.15, 0.15, 2)
          vox(-4, 0.75, fz + 1, 0x8B6914, 0.15, 0.15, 2); vox(-4, 0.35, fz + 1, 0x8B6914, 0.15, 0.15, 2)
        }
      }

      // Mountains
      function buildMountain(x: number, z: number, h: number, w: number) {
        const cols = [0x4a5a3a, 0x3a4a2a, 0x5a6a4a]
        for (let my = 0; my < h; my++) {
          const r = Math.floor((h - my) * (w / h))
          for (let mx = -r; mx <= r; mx++) for (let mz = -Math.floor(r * 0.5); mz <= Math.floor(r * 0.5); mz++) {
            if (Math.abs(mx) === r) vox(x + mx, my + 0.5, z + mz, cols[Math.floor(Math.random() * 3)])
          }
        }
        for (let s = 0; s < 3; s++) vox(x, h - s, z, s === 0 ? 0xffffff : 0xdddddd, (3 - s) * 2, 1, (3 - s) * 2)
      }
      buildMountain(-38, -50, 16, 10); buildMountain(35, -55, 20, 13); buildMountain(-22, -58, 12, 8)

      scene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 16, 8), new THREE.MeshBasicMaterial({ color: 0x7db8d4, side: THREE.BackSide })))

      // Petals (InstancedMesh)
      const PETAL_COUNT = 100
      const petalMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.04, 0.18), new THREE.MeshLambertMaterial({ color: 0xffb7c5 }), PETAL_COUNT)
      scene.add(petalMesh)
      const petalData = Array.from({ length: PETAL_COUNT }, () => ({
        x: (Math.random() - 0.5) * 40, y: Math.random() * 14 + 2, z: (Math.random() - 0.5) * 40,
        vy: -(0.007 + Math.random() * 0.01), vx: (Math.random() - 0.5) * 0.004, vz: (Math.random() - 0.5) * 0.004,
        rx: Math.random() * Math.PI, ry: Math.random() * Math.PI, rz: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.025,
      }))
      const dummy = new THREE.Object3D()

      // ─── RAIN SYSTEM ────────────────────────────────────────────────────────
      const isMobileDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const RAIN_COUNT = isMobileDevice ? 0 : 90
      const rainGeo = new THREE.BoxGeometry(0.04, 0.55, 0.04)
      const rainMat2 = new THREE.MeshLambertMaterial({ color: 0xaaccee, transparent: true, opacity: 0.3 })
      const rainMesh = RAIN_COUNT > 0 ? new THREE.InstancedMesh(rainGeo, rainMat2, RAIN_COUNT) : null
      if (rainMesh) { rainMesh.visible = false; scene.add(rainMesh) }
      const rainData = Array.from({ length: RAIN_COUNT }, () => ({ x: (Math.random() - 0.5) * 60, y: Math.random() * 20 + 4, z: (Math.random() - 0.5) * 60, vy: -(0.22 + Math.random() * 0.12), vx: (Math.random() - 0.5) * 0.015 }))
      const rainDummy = new THREE.Object3D()
      let rainActive = false, rainPhaseTimer = 0

      // ─── NPC CREATURES ──────────────────────────────────────────────────────
      function buildNPC(x: number, z: number, col: string): any {
        const g = new THREE.Group()
        const nb = (px: number, py: number, pz: number, w: number, h: number, d: number) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: new THREE.Color(col) }))
          m.position.set(px, py, pz); m.castShadow = true; g.add(m)
        }
        nb(0, 0.28, 0, 0.55, 0.42, 0.55); nb(0, 0.65, 0, 0.40, 0.38, 0.40)
        nb(-0.12, 0.63, -0.22, 0.08, 0.08, 0.02); nb(0.12, 0.63, -0.22, 0.08, 0.08, 0.02)
        g.position.set(x, 0.28, z); scene.add(g); return g
      }
      const npcData: Array<{ mesh: any, homeX: number, homeZ: number, angle: number, radius: number, speed: number, state: string, timer: number, walkPhase: number }> = [
        { mesh: buildNPC(17, -7, '#c4a8a0'), homeX: 17, homeZ: -7, angle: 0, radius: 3.5, speed: 0.007, state: 'wander', timer: 0, walkPhase: 0 },
        { mesh: buildNPC(-11, 21, '#a0c4a8'), homeX: -11, homeZ: 21, angle: 1.5, radius: 2.8, speed: 0.005, state: 'idle', timer: 2.5, walkPhase: 0 },
        { mesh: buildNPC(25, -12, '#a0a8c4'), homeX: 25, homeZ: -12, angle: 3.1, radius: 4.2, speed: 0.009, state: 'wander', timer: 0, walkPhase: 0 },
        { mesh: buildNPC(-17, -30, '#c4c0a0'), homeX: -17, homeZ: -30, angle: 0.8, radius: 2.5, speed: 0.006, state: 'idle', timer: 1.8, walkPhase: 0 },
      ]
      cleanupFns.current.push(() => {
        rainGeo.dispose(); rainMat2.dispose(); wispGeo.dispose(); wispMat.dispose()
        if (rainMesh) { scene.remove(rainMesh) }
        scene.remove(wispMesh)
        streamGeo.dispose(); streamMat.dispose(); forestAltarMat.dispose()
        npcData.forEach(n => { n.mesh.traverse((c: any) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose() }); scene.remove(n.mesh) })
      })

      // Player
      const player = { pos: new THREE.Vector3(0, 0.5, 28), rot: 0, vel: new THREE.Vector3(), isMoving: false, speed: 0.09 }
      function buildPlayerMesh() {
        const g = new THREE.Group()
        const b = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: new THREE.Color(c) }))
          m.position.set(x, y, z); m.castShadow = true; g.add(m); return m
        }
        b(0, 0.55, 0, 0.65, 0.55, 0.55, '#3d4a33'); b(0, 1.18, 0, 0.48, 0.48, 0.48, '#3d4a33')
        b(-0.13, 1.22, -0.25, 0.09, 0.09, 0.02, '#0a0906'); b(0.13, 1.22, -0.25, 0.09, 0.09, 0.02, '#0a0906')
        b(-0.19, 1.52, 0.05, 0.09, 0.22, 0.09, '#2a3323'); b(0.19, 1.52, 0.05, 0.09, 0.22, 0.09, '#2a3323')
        b(0, 0.45, 0.34, 0.2, 0.2, 0.2, '#2a3323'); b(0.12, 0.45, 0.5, 0.15, 0.15, 0.2, '#2a3323')
        const legs = {
          FL: b(-0.16, 0.18, -0.19, 0.13, 0.32, 0.13, '#2a3323'),
          FR: b(0.16, 0.18, -0.19, 0.13, 0.32, 0.13, '#2a3323'),
          BL: b(-0.16, 0.18, 0.19, 0.13, 0.32, 0.13, '#2a3323'),
          BR: b(0.16, 0.18, 0.19, 0.13, 0.32, 0.13, '#2a3323'),
        }
        g.castShadow = true; scene.add(g); return { group: g, legs }
      }
      const playerMesh = buildPlayerMesh()

      const COLLIDERS: [number, number, number, number][] = [
        [-4, -26, 4, -18], [-2.3, -8.5, -1.1, -7], [1.1, -8.5, 2.3, -7], [-2.3, -19, -1.1, -17], [1.1, -19, 2.3, -17],
        [5, -8, 14, 0], [-12.5, -6.5, -9.5, -3.5], [-16, -14, -13, -11], [10.5, -9.5, 13.5, -6.5], [-8, 2, -6, 4], [8, -2, 10, 0], [-13, -13, -3, -3],
      ]
      function checkCollision(p: any): boolean {
        const r = 0.55
        return COLLIDERS.some(([x0, z0, x1, z1]) => p.x + r > x0 && p.x - r < x1 && p.z + r > z0 && p.z - r < z1)
      }

      const keys: Record<string, boolean> = {}
      let nearestObj: any = null
      let cameraMode: 'follow' | 'cinematic' = 'follow'
      const cinematicPos = new THREE.Vector3()
      const cinematicLook = new THREE.Vector3()

      interface Obj { pos: any; radius: number; label: string; onInteract: () => void }
      const interactables: Obj[] = [
        {
          pos: new THREE.Vector3(-7, 0, 3), radius: 3, label: '[ E ]  What is Git-Pet?',
          onInteract: () => openOverlay('about')
        },
        {
          pos: new THREE.Vector3(9, 0, -1), radius: 3, label: '[ E ]  Choose species',
          onInteract: () => openOverlay('species')
        },
        {
          pos: new THREE.Vector3(-8, 0, -8), radius: 4, label: '[ E ]  Meet the pets',
          onInteract: () => openOverlay('pets')
        },
        {
          pos: new THREE.Vector3(0, 0, -24.5), radius: 3.5, label: '[ E ]  Hall of Legends',
          onInteract: () => openOverlay('leaderboard')
        },
        {
          pos: new THREE.Vector3(9, 0, -4), radius: 3.5, label: '[ E ]  Feed the koi',
          onInteract: () => { koiData.forEach(k => { k.speed = 0.018 }); setTimeout(() => koiData.forEach(k => { k.speed = 0.005 }), 3000) }
        },
        {
          pos: new THREE.Vector3(0, 0, -20), radius: 5, label: '[ E ]  Enter the shrine',
          onInteract: () => {
            cameraMode = 'cinematic'; cinematicPos.set(0, 5, -13); cinematicLook.set(0, 2, -20)
            setTimeout(() => { if (!mounted.current) return; openOverlay('shrineChoice') }, 900)
          }
        },
        {
          pos: new THREE.Vector3(26, 0, -24), radius: 4, label: '[ E ]  Forest Altar',
          onInteract: () => {
            forestAltarMat.emissiveIntensity = 4.5; forestAltarLight.intensity = 2.5
            playChime(440, 0.8, 0); playChime(554, 0.7, 0.2); playChime(659, 0.9, 0.45)
            setTimeout(() => { forestAltarMat.emissiveIntensity = 1.5; forestAltarLight.intensity = 0.7 }, 2200)
          }
        },
        {
          pos: new THREE.Vector3(-13, 0, 18), radius: 3.5, label: '[ E ]  Cross the bridge',
          onInteract: () => {
            streamMat.color.setHSL(0.55, 0.75, 0.55)
            playChime(396, 1.2, 0); playChime(528, 0.9, 0.3)
            setTimeout(() => streamMat.color.setHSL(0.55, 0.5, 0.38), 2500)
          }
        },
        {
          pos: new THREE.Vector3(-18, 0, -32), radius: 5.5, label: '[ E ]  Spirit Stones',
          onInteract: () => {
            spiritAreaLight.intensity = 3.0; spiritAreaLight.distance = 20
            playChime(220, 2.2, 0); playChime(277, 1.8, 0.5); playChime(330, 2.0, 1.1); playChime(415, 1.5, 1.8)
            setTimeout(() => { spiritAreaLight.intensity = 0.5; spiritAreaLight.distance = 10 }, 3500)
          }
        },
      ]

      const onKeyDown = (e: KeyboardEvent) => {
        keys[e.code] = true
        if (activeOverlayRef.current === 'shrineChoice') {
          if (e.code === 'Digit1') setTriggerWorldEnter(true)
          if (e.code === 'Digit2') signIn('github', { callbackUrl: '/dashboard' })
        }
        if (e.code === 'KeyE' && nearestObj) nearestObj.onInteract()
        if (e.code === 'Escape') { openOverlay(null); cameraMode = 'follow' }
      }
      const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false }
      window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp)
      cleanupFns.current.push(() => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) })

      let gatePassed = false, leaderStoneRisen = false, controlEnabled = false
      // ─── Day/Night state (0=dawn→0.25=noon→0.5=dusk→0.75=night→1=dawn) ──
      let dayNightT = 0.15 // start just past dawn
      const DAY_DURATION = 75 // seconds per full cycle
      setTimeout(() => {
        controlEnabled = true
        if (mounted.current) { setCinematicDone(true); setTimeout(() => { if (mounted.current) setControlsHint(false) }, 8000) }
      }, 7000)

      const camPos = new THREE.Vector3(0, 14, 40)
      const camLook = new THREE.Vector3(0, 2, 0)

      // Audio
      let audioCtx: AudioContext | null = null
      const initAudio = () => { if (!audioCtx) audioCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)() }
      const playChime = (freq: number, dur: number, delay = 0) => {
        if (!audioCtx) return
        setTimeout(() => {
          if (!audioCtx) return
          const osc = audioCtx.createOscillator(), gain = audioCtx.createGain()
          osc.connect(gain); gain.connect(audioCtx.destination)
          osc.frequency.value = freq; osc.type = 'sine'
          gain.gain.setValueAtTime(0.25, audioCtx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur)
          osc.start(); osc.stop(audioCtx.currentTime + dur)
        }, delay * 1000)
      }
      const initAudioOnce = () => { initAudio(); window.removeEventListener('click', initAudioOnce) }
      window.addEventListener('click', initAudioOnce)
      cleanupFns.current.push(() => window.removeEventListener('click', initAudioOnce))

      // Mobile check
      const mobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      if (mounted.current) setIsMobile(mobile)

      let elapsed = 0, last = performance.now(), cinematicT = 0

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick)
        const now = performance.now()
        const delta = Math.min((now - last) / 1000, 0.05)
        last = now; elapsed += delta

        const uiOpen = activeOverlayRef.current !== null

        if (!controlEnabled) {
          cinematicT += delta
          if (cinematicT < 2) { camPos.lerp(new THREE.Vector3(0, 12, 38), 0.03); camLook.lerp(new THREE.Vector3(0, 3, 0), 0.05) }
          else if (cinematicT < 5) { camPos.lerp(new THREE.Vector3(0, 7, 22), 0.015); camLook.lerp(new THREE.Vector3(0, 2, -4), 0.02) }
          camera.position.copy(camPos); camera.lookAt(camLook)
          renderer.render(scene, camera); return
        }

        if (!uiOpen) {
          const spd = player.speed; let moved = false
          if (keys['KeyW'] || keys['ArrowUp']) { player.vel.x -= Math.sin(player.rot) * spd; player.vel.z -= Math.cos(player.rot) * spd; moved = true }
          if (keys['KeyS'] || keys['ArrowDown']) { player.vel.x += Math.sin(player.rot) * spd; player.vel.z += Math.cos(player.rot) * spd; moved = true }
          if (keys['KeyA'] || keys['ArrowLeft']) player.rot += 0.045
          if (keys['KeyD'] || keys['ArrowRight']) player.rot -= 0.045
          if (joystickRef.current.active) {
            const { dx, dy } = joystickRef.current
            player.vel.x -= Math.sin(player.rot) * player.speed * dy; player.vel.z -= Math.cos(player.rot) * player.speed * dy
            player.rot -= dx * 0.04; if (Math.abs(dy) > 0.1) moved = true
          }
          player.isMoving = moved
        }

        player.vel.multiplyScalar(0.72)
        const next = player.pos.clone().add(player.vel)
        next.x = Math.max(-28, Math.min(28, next.x)); next.z = Math.max(-28, Math.min(30, next.z)); next.y = 0.5
        if (!checkCollision(next)) { player.pos.copy(next) } else {
          const nx = new THREE.Vector3(player.pos.x + player.vel.x, 0.5, player.pos.z)
          if (!checkCollision(nx)) player.pos.x = nx.x
          const nz = new THREE.Vector3(player.pos.x, 0.5, player.pos.z + player.vel.z)
          if (!checkCollision(nz)) player.pos.z = nz.z
        }

        playerMesh.group.position.copy(player.pos)
        playerMesh.group.rotation.y = player.rot
        playerMesh.group.position.y = 0.5 + Math.sin(elapsed * 2.2) * 0.035
        const swing = player.isMoving ? Math.sin(elapsed * 9) * 0.35 : 0
        playerMesh.legs.FL.rotation.x = swing; playerMesh.legs.BR.rotation.x = swing
        playerMesh.legs.FR.rotation.x = -swing; playerMesh.legs.BL.rotation.x = -swing

        if (cameraMode === 'follow') {
          const offset = new THREE.Vector3(0, 7, 14); offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rot)
          camPos.lerp(player.pos.clone().add(offset), 0.065)
          camLook.lerp(player.pos.clone().add(new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rot).multiplyScalar(3)), 0.1)
        } else { camPos.lerp(cinematicPos, 0.04); camLook.lerp(cinematicLook, 0.06) }
        camera.position.copy(camPos); camera.lookAt(camLook)

        if (!gatePassed && player.pos.z < -8) {
          gatePassed = true
          toriiBars.forEach(bar => {
            bar.material.emissive = new THREE.Color(0xffaa22); bar.material.emissiveIntensity = 3
            setTimeout(() => { bar.material.emissive = new THREE.Color(0); bar.material.emissiveIntensity = 0 }, 1200)
          })
          playChime(523.25, 0.5, 0); playChime(659.25, 0.5, 0.15); playChime(783.99, 0.7, 0.3)
        }

        if (!leaderStoneRisen && player.pos.distanceTo(new THREE.Vector3(0, 0, -24.5)) < 6) {
          leaderStoneRisen = true
          const rise = () => { if (leaderStoneMesh.scale.y < 2.6) { leaderStoneMesh.scale.y += 0.05; leaderStoneMesh.position.y = leaderStoneMesh.scale.y * 0.5 - 0.5; requestAnimationFrame(rise) } }
          rise()
        }

        let nearest: Obj | null = null; let nearDist = Infinity
        interactables.forEach(obj => { const d = player.pos.distanceTo(obj.pos); if (d < obj.radius && d < nearDist) { nearDist = d; nearest = obj } })
        nearestObj = nearest
        if (mounted.current) setPromptLabel(nearest ? (nearest as Obj).label : null)

        // Petals
        petalData.forEach((p, i) => {
          p.y += p.vy; p.x += p.vx + Math.sin(elapsed * 0.4 + p.z) * 0.002; p.z += p.vz; p.rz += p.spin
          if (p.y < -0.5) { p.y = 14 + Math.random() * 4; p.x = (Math.random() - 0.5) * 40; p.z = (Math.random() - 0.5) * 40 }
          dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx, p.ry, p.rz); dummy.updateMatrix()
          petalMesh.setMatrixAt(i, dummy.matrix)
        })
        petalMesh.instanceMatrix.needsUpdate = true

        koiData.forEach(k => {
          k.angle += k.speed
          k.mesh.position.set(POND_X + Math.cos(k.angle) * k.radius, 0.12, POND_Z + Math.sin(k.angle) * k.radius * 0.6)
          k.mesh.rotation.y = -k.angle + Math.PI / 2
        })

        // ─── Day / Night Cycle ───────────────────────────────────────────────
        dayNightT = (dayNightT + delta / DAY_DURATION) % 1
        const dnAngle = dayNightT * Math.PI * 2
        const sunHeight = Math.sin(dnAngle - Math.PI / 2)          // -1=night  1=noon
        const dayBright = Math.max(0, Math.min(1, (sunHeight + 0.3) / 1.3))
        sun.intensity = 0.35 + dayBright * 2.1
        sun.color.setHSL(0.10, dayBright > 0.4 ? 0.45 : 0.1, 0.5 + dayBright * 0.5)
        sun.position.set(Math.cos(dnAngle) * 30, Math.sin(dnAngle) * 40, 10)
        ambientLight.intensity = 0.1 + dayBright * 0.45
        hemiLight.intensity = 0.1 + dayBright * 0.35
        const skyL = 0.18 + dayBright * 0.62
          ; (scene.background as any).setHSL(dayBright > 0.15 ? 0.60 : 0.67, 0.32, skyL)
          ; (scene.fog as any).color.setHSL(dayBright > 0.15 ? 0.60 : 0.67, 0.22, skyL)
        const nightBoost = 1.0 - dayBright * 0.55

        // Lanterns — enhanced flicker + night boost
        lanternMats.forEach((mat, i) => { mat.emissiveIntensity = (0.65 + Math.sin(elapsed * 1.8 + i * 1.3) * 0.45) * (0.75 + nightBoost * 1.3) })
        forestAltarLight.intensity = 0.65 + nightBoost * 0.65
        spiritAreaLight.intensity = 0.45 + nightBoost * 0.85

        // ─── Rain ────────────────────────────────────────────────────────────
        rainPhaseTimer += delta
        if (rainPhaseTimer > 30) { rainActive = !rainActive; rainPhaseTimer = 0 }
        if (rainActive && rainMesh) {
          rainMesh.visible = true
          rainData.forEach((r, i) => {
            r.y += r.vy; r.x += r.vx + Math.sin(elapsed * 0.25 + i * 0.3) * 0.006; r.z += (Math.random() - 0.5) * 0.004
            if (r.y < -0.5) { r.y = 20 + Math.random() * 6; r.x = (Math.random() - 0.5) * 60; r.z = (Math.random() - 0.5) * 60 }
            rainDummy.position.set(r.x, r.y, r.z); rainDummy.rotation.z = 0.1; rainDummy.updateMatrix()
            rainMesh.setMatrixAt(i, rainDummy.matrix)
          })
          rainMesh.instanceMatrix.needsUpdate = true
          ambientLight.intensity *= 0.78
        } else if (rainMesh) { rainMesh.visible = false }

        // ─── NPCs ────────────────────────────────────────────────────────────
        npcData.forEach(npc => {
          npc.timer -= delta
          const np = new THREE.Vector3(npc.mesh.position.x, 0, npc.mesh.position.z)
          const distToPlayer = player.pos.distanceTo(np)
          if (distToPlayer < 4 && npc.state !== 'react') {
            npc.state = 'react'; npc.timer = 1.8
          } else if (npc.timer <= 0 && npc.state !== 'react') {
            npc.state = npc.state === 'idle' ? 'wander' : 'idle'
            npc.timer = 2 + Math.random() * 3
          } else if (npc.timer <= 0 && npc.state === 'react') {
            npc.state = 'idle'; npc.timer = 2
          }
          if (npc.state === 'wander') {
            npc.angle += npc.speed
            const tx = npc.homeX + Math.cos(npc.angle) * npc.radius
            const tz = npc.homeZ + Math.sin(npc.angle) * npc.radius
            npc.mesh.position.x += (tx - npc.mesh.position.x) * 0.04
            npc.mesh.position.z += (tz - npc.mesh.position.z) * 0.04
            npc.mesh.lookAt(tx, npc.mesh.position.y, tz)
          } else if (npc.state === 'react') {
            npc.mesh.lookAt(player.pos.x, npc.mesh.position.y, player.pos.z)
          }
          npc.walkPhase += delta * 4.5
          npc.mesh.position.y = 0.28 + Math.abs(Math.sin(npc.walkPhase)) * (npc.state === 'wander' ? 0.07 : 0.015)
        })

        // ─── Spirit Wisps ────────────────────────────────────────────────────
        wispData.forEach((w, i) => {
          w.angle += w.speed
          rainDummy.position.set(
            -18 + Math.cos(w.angle) * w.radius,
            w.baseY + Math.sin(elapsed * 0.8 + i * 1.15) * 0.35,
            -32 + Math.sin(w.angle) * w.radius * 0.75
          )
          rainDummy.rotation.set(elapsed * 0.4 + i, elapsed * 0.25 + i, 0)
          rainDummy.updateMatrix()
          wispMesh.setMatrixAt(i, rainDummy.matrix)
        })
        wispMesh.instanceMatrix.needsUpdate = true

        // ─── Micro: stream shimmer + forest altar flicker ────────────────────
        streamMat.color.setHSL(0.55, 0.55, 0.36 + Math.sin(elapsed * 1.3) * 0.04)
        forestAltarMat.emissiveIntensity = 1.2 + Math.sin(elapsed * 3.8) * 0.45
        forestAltarFlame.position.y = 1.15 + Math.sin(elapsed * 4.2) * 0.03
        waterMat.color.setHSL(0.55, 0.5, 0.35 + Math.sin(elapsed * 0.9) * 0.025)

        if (minimapRef.current) {
          const mc = minimapRef.current.getContext('2d')!
          mc.fillStyle = '#1a1812'; mc.fillRect(0, 0, 120, 120)
          mc.strokeStyle = 'rgba(240,200,140,0.3)'; mc.strokeRect(0, 0, 120, 120)
          const mx = (player.pos.x + 28) / 56 * 112 + 4, mz = (player.pos.z + 28) / 58 * 112 + 4
          interactables.forEach(obj => {
            const ix = (obj.pos.x + 28) / 56 * 112 + 4, iz = (obj.pos.z + 28) / 58 * 112 + 4
            mc.fillStyle = 'rgba(255,200,80,0.6)'; mc.fillRect(ix - 2, iz - 2, 4, 4)
          })
          mc.fillStyle = '#ffffff'; mc.beginPath(); mc.arc(mx, mz, 4, 0, Math.PI * 2); mc.fill()
          mc.strokeStyle = '#ffffff'; mc.lineWidth = 1.5; mc.beginPath(); mc.moveTo(mx, mz)
          mc.lineTo(mx - Math.sin(player.rot) * 8, mz - Math.cos(player.rot) * 8); mc.stroke()
        }

        renderer.render(scene, camera)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    init()

    return () => {
      mounted.current = false
      cancelAnimationFrame(rafRef.current)
      if (rendererRef.current) rendererRef.current.dispose()
      cleanupFns.current.forEach(fn => fn())
    }
  }, [openOverlay])

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', overflow: 'hidden', fontFamily: "'Syne', sans-serif", background: '#0d0f18' }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Syne:wght@400;700;800&family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet" />

      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, background: 'radial-gradient(ellipse 75% 75% at 50% 50%, transparent 35%, rgba(8,6,4,0.6) 100%)' }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, opacity: 0.028,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        animation: 'grain 0.4s steps(1) infinite'
      }} />

      <div style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 90, opacity: cinematicDone ? 0 : 1, transition: 'opacity 2s ease', pointerEvents: cinematicDone ? 'none' : 'all' }} />

      {!cinematicDone && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 91, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 'clamp(20px,3vw,36px)', color: 'rgba(240,235,224,0.85)', animation: 'fadeInOut 4s ease 2s both' }}>Your GitHub activity is waiting inside.</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 11, color: 'rgba(240,235,224,0.4)', letterSpacing: 3, textTransform: 'uppercase', animation: 'fadeInOut 3s ease 4s both' }}>WASD to move · E to interact</div>
        </div>
      )}

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20, padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(8,6,4,0.5)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(240,200,140,0.1)', width: '100%', overflow: 'hidden' }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: '#f0ebe0', letterSpacing: 2, textShadow: '0 0 30px rgba(255,180,80,0.5)' }}>GIT-PET</div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {isLoggedIn ? (
            <a href="/dashboard" style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#ffd4a0', textDecoration: 'none', background: 'rgba(181,71,10,0.4)', border: '1px solid rgba(255,180,80,0.35)', padding: '9px 20px', backdropFilter: 'blur(8px)' }}>My Pet →</a>
          ) : (
            <button onClick={() => signIn('github', { callbackUrl: '/dashboard' })} style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#ffd4a0', background: 'rgba(26,20,14,0.7)', border: '1px solid rgba(240,200,140,0.25)', padding: '9px 20px', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>Sign In →</button>
          )}
        </div>
      </nav>

      {promptLabel && cinematicDone && (
        <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,14,8,0.88)', border: '1px solid rgba(240,200,140,0.3)', backdropFilter: 'blur(10px)', padding: '10px 22px', zIndex: 20, fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: '#ffd4a0', letterSpacing: 1, whiteSpace: 'nowrap', animation: 'floatBob 2s ease-in-out infinite' }}>{promptLabel}</div>
      )}

      {controlsHint && cinematicDone && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 10, color: 'rgba(240,235,224,0.38)', letterSpacing: 3, textTransform: 'uppercase', zIndex: 15, pointerEvents: 'none', animation: 'fadeOut 1.5s ease 7s forwards' }}>WASD · MOVE &nbsp;·&nbsp; A/D · TURN &nbsp;·&nbsp; E · INTERACT</div>
      )}

      {cinematicDone && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 20, border: '1px solid rgba(240,200,140,0.2)', borderRadius: 2 }}>
          <canvas ref={minimapRef} width={120} height={120} style={{ display: 'block', opacity: 0.8 }} />
        </div>
      )}

      {activeOverlay && (
        <div onClick={(e) => { if (e.target === e.currentTarget) openOverlay(null) }} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(8,6,4,0.78)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'rgba(22,16,10,0.96)', border: '1px solid rgba(240,200,140,0.2)', padding: '48px 52px', maxWidth: 580, width: '90%', position: 'relative', maxHeight: '85vh', overflowY: 'auto' }}>
            <button onClick={() => openOverlay(null)} style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.4)', fontSize: 20, fontFamily: 'monospace' }}>×</button>

            {activeOverlay === 'about' && <>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 'clamp(28px,4vw,48px)', color: '#f0ebe0', marginBottom: 24, lineHeight: 1 }}>What is Git-Pet?</div>
              <p style={{ fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 13, color: 'rgba(240,235,224,0.65)', lineHeight: 1.9, marginBottom: 16 }}>Every commit you push on GitHub feeds a living pixel creature. Miss a day, it gets sick. Keep your streak, it evolves. It&apos;s your GitHub consistency — made visible.</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 13, color: 'rgba(240,235,224,0.65)', lineHeight: 1.9, marginBottom: 32 }}>Walk through this world. Find the shrine. Meet your pet.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2, marginBottom: 32 }}>
                {[['1,284', 'Pets alive'], ['94,720', 'Commits tracked'], ['3,871', 'World battles']].map(([n, l]) => (
                  <div key={l} style={{ background: 'rgba(255,255,255,0.04)', padding: '20px 16px', textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 32, color: '#f0ebe0', marginBottom: 6 }}>{n}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(240,235,224,0.4)', letterSpacing: 2, textTransform: 'uppercase' }}>{l}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => { openOverlay(null) }} style={overlayBtnStyle}>Keep Exploring →</button>
            </>}

            {activeOverlay === 'shrineChoice' && <>
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>⛩️</div>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 'clamp(24px,4vw,42px)', color: '#f0ebe0', marginBottom: 12, lineHeight: 1.1 }}>The shrine awakens</div>
                <p style={{ fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 12, color: 'rgba(240,235,224,0.5)', lineHeight: 1.8, marginBottom: 32 }}>Choose your path</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button onClick={() => setTriggerWorldEnter(true)} style={{ width: '100%', padding: '18px 32px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', background: 'rgba(26,20,14,0.7)', border: '1px solid rgba(255,180,80,0.4)', color: '#ffd4a0', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                  <span>[ 1 ] Enter the World</span><span>→</span>
                </button>
                <button onClick={() => signIn('github', { callbackUrl: '/dashboard' })} style={{ width: '100%', padding: '18px 32px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', background: 'rgba(181,71,10,0.6)', border: '1px solid rgba(255,180,80,0.4)', color: '#fff', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                  <span>[ 2 ] View My Pet</span><span>→</span>
                </button>
              </div>
            </>}

            {activeOverlay === 'signin' && <>
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🏮</div>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 'clamp(24px,4vw,42px)', color: '#f0ebe0', marginBottom: 12, lineHeight: 1.1 }}>Your pet lives<br />inside the shrine.</div>
                <p style={{ fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 12, color: 'rgba(240,235,224,0.5)', lineHeight: 1.8, marginBottom: 32 }}>Connect GitHub to hatch your creature.<br />Takes 8 seconds. Free forever.</p>
              </div>
              <button onClick={() => signIn('github', { callbackUrl: '/dashboard' })} style={{ width: '100%', padding: '18px 32px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', background: 'rgba(181,71,10,0.6)', border: '1px solid rgba(255,180,80,0.4)', color: '#fff', cursor: 'pointer', marginBottom: 12, transition: 'all 0.2s' }}>Sign In with GitHub →</button>
              <div style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(240,235,224,0.25)', letterSpacing: 1 }}>No email · No credit card · Open source</div>
            </>}

            {activeOverlay === 'species' && <>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 40, color: '#f0ebe0', marginBottom: 8 }}>Choose your creature</div>
              <p style={{ fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 11, color: 'rgba(240,235,224,0.4)', marginBottom: 28, letterSpacing: 1 }}>Sign in first — your species is selected in settings after.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
                {[{ name: 'Wolf', id: 'wolf', col: '#7a8070', role: 'Aggro' }, { name: 'Saber', id: 'sabertooth', col: '#c5c0b8', role: 'Tank' }, { name: 'Capy', id: 'capybara', col: '#8a6a3a', role: 'Support' }, { name: 'Dragon', id: 'dragon', col: '#3d4a33', role: 'Legend' }, { name: 'Axolotl', id: 'axolotl', col: '#8a5a60', role: 'Regen' }].map(s => (
                  <div key={s.name} style={{ border: `1px solid ${s.col}44`, padding: '16px 8px', textAlign: 'center', cursor: 'pointer', transition: 'background 0.2s', overflow: 'hidden' }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${s.col}22`)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => signIn('github', { callbackUrl: '/dashboard' })}>
                    <div style={{ display: 'flex', justifyContent: 'center', transform: 'scale(0.8)', transformOrigin: 'top center', marginBottom: -8, marginTop: -4 }}><SpeciesCanvas species={s.id as any} isSelected={false} isHovered={true} /></div>
                    <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 15, color: '#f0ebe0', marginBottom: 4 }}>{s.name}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(240,235,224,0.4)' }}>{s.role}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => signIn('github', { callbackUrl: '/dashboard' })} style={{ ...overlayBtnStyle, marginTop: 24, width: '100%' }}>Sign In to Choose →</button>
            </>}

            {activeOverlay === 'leaderboard' && <>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color: '#ffd4a0', marginBottom: 32, letterSpacing: 1, textAlign: 'center' }}>HALL OF LEGENDS</div>
              {[['@iris', 'Dragon', '42d'], ['@alice', 'Wolf', '30d'], ['@carol', 'Axolotl', '22d'], ['@saad', 'Dragon', '14d'], ['@bob', 'Capybara', '11d'], ['@dave', 'Wolf', '9d'], ['@eve', 'Sabertooth', '7d'], ['@frank', 'Dragon', '5d'], ['@grace', 'Axolotl', '4d'], ['@henry', 'Capybara', '3d']].map(([user, species, streak], i) => (
                <div key={user} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid rgba(240,200,140,0.08)', animation: `fadeSlideIn 0.4s ease ${i * 0.07}s both` }}>
                  <div style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 24, color: i < 3 ? '#ffd4a0' : 'rgba(240,235,224,0.3)', minWidth: 28 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#f0ebe0' }}>{user}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(240,235,224,0.4)' }}>{species}</div>
                  </div>
                  <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: '#b5470a' }}>🔥 {streak}</div>
                </div>
              ))}
            </>}

            {activeOverlay === 'pets' && <>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 40, color: '#f0ebe0', marginBottom: 24 }}>The creatures</div>
              {[{ name: '@saad', species: 'Dragon', streak: 14, health: 87, mood: 92, col: '#3d4a33' }, { name: '@alice', species: 'Wolf', streak: 30, health: 95, mood: 88, col: '#7a8070' }, { name: '@bob', species: 'Axolotl', streak: 3, health: 42, mood: 61, col: '#8a5a60' }].map(p => (
                <div key={p.name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(240,200,140,0.1)', padding: '20px 24px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ width: 40, height: 40, background: p.col, borderRadius: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#f0ebe0', marginBottom: 6 }}>{p.name} · {p.species}</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[['Health', p.health, '#3d8a4a'], ['Mood', p.mood, '#c8930a']].map(([label, val, col]) => (
                        <div key={String(label)} style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(240,235,224,0.4)', marginBottom: 4, letterSpacing: 1 }}>{label}</div>
                          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${val}%`, background: String(col), borderRadius: 2, transition: 'width 0.8s ease' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#b5470a' }}>🔥 {p.streak}d</div>
                </div>
              ))}
              <button onClick={() => signIn('github', { callbackUrl: '/dashboard' })} style={{ ...overlayBtnStyle, marginTop: 16, width: '100%' }}>Meet your pet →</button>
            </>}
          </div>
        </div>
      )}

      {isMobile && cinematicDone && (
        <div style={{ position: 'fixed', bottom: 40, left: 40, zIndex: 25, width: 120, height: 120, borderRadius: '50%', background: 'rgba(240,235,224,0.08)', border: '1px solid rgba(240,235,224,0.15)', touchAction: 'none' }}
          onTouchStart={() => { joystickRef.current = { active: true, dx: 0, dy: 0 }; setJoystick({ active: true, dx: 0, dy: 0 }) }}
          onTouchMove={e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            const dx = (e.touches[0].clientX - rect.left - rect.width / 2) / 60
            const dy = (e.touches[0].clientY - rect.top - rect.height / 2) / 60
            joystickRef.current = { active: true, dx, dy }; setJoystick({ active: true, dx, dy })
          }}
          onTouchEnd={() => { joystickRef.current = { active: false, dx: 0, dy: 0 }; setJoystick({ active: false, dx: 0, dy: 0 }) }}>
          <div style={{ position: 'absolute', left: `${50 + joystick.dx * 30}%`, top: `${50 + joystick.dy * 30}%`, transform: 'translate(-50%,-50%)', width: 40, height: 40, borderRadius: '50%', background: 'rgba(240,235,224,0.25)', border: '1px solid rgba(240,235,224,0.4)', pointerEvents: 'none' }} />
        </div>
      )}

      <style>{`
        @keyframes grain { 0%,100%{transform:translate(0,0)} 25%{transform:translate(-2px,1px)} 50%{transform:translate(2px,-1px)} 75%{transform:translate(-1px,2px)} }
        @keyframes floatBob { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-5px)} }
        @keyframes fadeOut { to{opacity:0;pointer-events:none} }
        @keyframes fadeInOut { 0%{opacity:0} 20%{opacity:1} 80%{opacity:1} 100%{opacity:0} }
        @keyframes fadeSlideIn { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
      `}</style>
    </div>
  )
}