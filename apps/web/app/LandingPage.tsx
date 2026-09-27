'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { SpeciesCanvas } from '@/components/SpeciesSwitch'
import { getThree, type ThreeNS } from '@/lib/three-global'
import { CANON_COLORS } from '@git-pet/renderer'
import type { Species } from '@/lib/redis'

// The hatch intro plays in full once per browser session. Storage can throw
// (private mode, blocked site data), in which case the intro just plays.
const INTRO_SEEN_KEY = 'gitpet_intro_seen'
function hasSeenIntro(): boolean {
  try { return sessionStorage.getItem(INTRO_SEEN_KEY) === '1' } catch { return false }
}
function markIntroSeen(): void {
  try { sessionStorage.setItem(INTRO_SEEN_KEY, '1') } catch { /* ignore */ }
}

// Role words match the shareable pet card's canonical class labels
// (apps/web/app/api/card/[username]/route.tsx) — one flavor per species,
// not a third independent set of descriptions.
const SPECIES_PREVIEW: { id: Species; name: string; role: string; tagline: string }[] = [
  { id: 'wolf', name: 'Wolf', role: 'Aggro', tagline: 'Strikes first, hits hard.' },
  { id: 'sabertooth', name: 'Saber', role: 'Tank', tagline: 'Built to endure.' },
  { id: 'capybara', name: 'Capy', role: 'Support', tagline: 'Keeps the group together.' },
  { id: 'dragon', name: 'Dragon', role: 'Legend', tagline: 'Master of everything.' },
  { id: 'axolotl', name: 'Axolotl', role: 'Regen', tagline: 'Recovers from anything.' },
]

type LBEntry = { username: string; species: string; value: number }
type LBData = { topStreak: LBEntry[]; topCommits: LBEntry[]; topFriends: LBEntry[] }
type SamplePet = { username: string; species: string; health: number; happiness: number; streak: number }

// Plain top-level helper (not a hook/component), so its own try/catch and
// optional-chaining aren't something React Compiler ever needs to lower —
// only the effect that calls it, which has no try/catch of its own, is.
async function fetchSamplePets(existingLb: LBData | null): Promise<{ lb: LBData; pets: SamplePet[] }> {
  try {
    const lb: LBData = existingLb ?? await fetch('/api/leaderboard').then(r => r.json())
    const usernames = Array.from(new Set(
      [...lb.topCommits, ...lb.topStreak, ...lb.topFriends].map(e => e.username)
    )).slice(0, 3)

    const pets = await Promise.all(usernames.map(async (username): Promise<SamplePet | null> => {
      try {
        const res = await fetch(`/api/pet/${username}`)
        if (!res.ok) return null
        const d = await res.json()
        if (!d.species) return null
        return {
          username,
          species: d.species as string,
          health: (d.stats?.health as number | undefined) ?? 0,
          happiness: (d.stats?.happiness as number | undefined) ?? 0,
          streak: (d.gitData?.streak as number | undefined) ?? 0,
        }
      } catch { return null }
    }))
    return { lb, pets: pets.filter((p): p is SamplePet => p !== null) }
  } catch {
    return { lb: existingLb ?? { topStreak: [], topCommits: [], topFriends: [] }, pets: [] }
  }
}

const PROMPT_SUBTITLES: Record<string, string> = {
  'What is Git-Pet?': 'NOTICE BOARD',
  'Choose species': 'SPECIES BOARD',
  'Meet the pets': 'PET PEN',
  'Hall of Legends': 'LEADERBOARD',
  'Feed the koi': 'POND',
  'Enter the shrine': 'SHRINE',
  'Forest Altar': 'ALTAR',
  'Cross the bridge': 'BRIDGE',
  'Spirit Stones': 'SPIRIT AREA',
}

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
  // Set by the Skip button / Esc; read by the render loop, which owns the
  // intro's timeline, so skipping doesn't need a React re-render to land.
  const skipIntroRef = useRef(false)
  const mounted = useRef(true)
  const rafRef = useRef<number>(0)
  const rendererRef = useRef<ThreeNS.WebGLRenderer | null>(null)
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
  // First frame of the 3D scene has rendered — lifts the black cover so the
  // intro plays out in the real world rather than behind it.
  const [sceneReady, setSceneReady] = useState(false)
  // 0 = egg hatching, 1 = title beat (driven from the render loop's clock)
  const [introStep, setIntroStep] = useState<0|1>(0)
  const [questStep, setQuestStep] = useState<0|1|2|'done'|'hidden'>(0)
  const [hasSeenAbout, setHasSeenAbout] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [joystick, setJoystick] = useState({ active: false, dx: 0, dy: 0 })

  // Leaderboard state
  const [lbData, setLbData] = useState<LBData | null>(null)
  const [lbLoading, setLbLoading] = useState(false)
  const [lbTab, setLbTab] = useState<'streak' | 'commits' | 'friends'>('streak')

  // Species picker: a real pre-signup choice, not a redirect-on-click. The
  // pick is carried into onboarding via localStorage (see SpeciesSelect.tsx).
  const [pickedSpecies, setPickedSpecies] = useState<Species | null>(null)
  const [hoveredSpecies, setHoveredSpecies] = useState<Species | null>(null)

  // "Meet the pets": real onboarded users' real stats, fetched from the same
  // public endpoints the leaderboard and shareable card use — not mockup data.
  const [samplePets, setSamplePets] = useState<SamplePet[] | null>(null)
  const [samplePetsLoading, setSamplePetsLoading] = useState(false)

  useEffect(() => {
    if (!triggerWorldEnter || status === 'loading') return

    if (status === 'authenticated') {
      router.push('/world')
    } else {
      signIn('github', { callbackUrl: '/world' })
    }
    
    // Reset trigger after a tick to avoid cascading render warning
    const t = setTimeout(() => setTriggerWorldEnter(false), 0)
    return () => clearTimeout(t)
  }, [triggerWorldEnter, status, router])

  // Hint rotation
  useEffect(() => {
    if (!controlsHint) return
    const interval = setInterval(() => {
      setHintIndex(i => Math.min(i + 1, 2))
    }, 3000)
    return () => clearInterval(interval)
  }, [controlsHint])

  // Quest advancement
  useEffect(() => {
    if (questStep === 0 && promptLabel?.includes('What is Git-Pet')) {
      setQuestStep(1)
    }
  }, [promptLabel, questStep])

  // Fetch leaderboard data when the overlay opens
  useEffect(() => {
    if (activeOverlay !== 'leaderboard') return
    if (lbData !== null || lbLoading) return // already fetched or in flight
    setLbLoading(true)
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then((data: LBData) => { setLbData(data); setLbLoading(false) })
      .catch(() => { setLbData({ topStreak: [], topCommits: [], topFriends: [] }); setLbLoading(false) })
  }, [activeOverlay, lbData, lbLoading])

  // Fetch a few real pets when "Meet the pets" opens. Discovers real
  // usernames from the leaderboard (reusing it if already loaded from the
  // Hall of Legends), then reads each one's real stats from the same public
  // /api/pet/[username] endpoint the shareable card uses — no mockup data.
  // The actual fetching (and its try/catch) lives in the plain top-level
  // fetchSamplePets() above; this effect body is just a promise chain, no
  // try/catch of its own, which is what keeps it compilable.
  useEffect(() => {
    if (activeOverlay !== 'pets') return
    if (samplePets !== null || samplePetsLoading) return
    setSamplePetsLoading(true)
    fetchSamplePets(lbData).then(({ lb, pets }) => {
      if (!lbData) setLbData(lb)
      setSamplePets(pets)
      setSamplePetsLoading(false)
    })
  }, [activeOverlay, samplePets, samplePetsLoading, lbData])

  useEffect(() => {
    if (activeOverlay === 'about' && !hasSeenAbout) {
      setHasSeenAbout(true)
    }
    if (activeOverlay === 'about' && questStep === 1) {
      setQuestStep(2)
    }
    if (activeOverlay === 'shrineChoice') {
      setQuestStep('done')
    }
  }, [activeOverlay, hasSeenAbout, questStep])

  useEffect(() => {
    if (questStep === 'done') {
      const t = setTimeout(() => setQuestStep('hidden'), 4000)
      return () => clearTimeout(t)
    }
  }, [questStep])

  useEffect(() => { return () => { mounted.current = false } }, [])

  const openOverlay = useCallback((v: typeof activeOverlay) => {
    if (!mounted.current) return
    activeOverlayRef.current = v
    setActiveOverlay(v)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!canvasRef.current) return
    // Same array init() pushes into below; captured once so the cleanup
    // runs exactly the functions registered by this run.
    const cleanups = cleanupFns.current

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

      const loadedThree = getThree()
      if (!loadedThree) return
      // Re-bound so hoisted function declarations below (which TypeScript
      // can't see the null check from) get the non-undefined type too.
      const THREE = loadedThree

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
      // Kept as typed references so the day/night cycle can recolor them
      // directly instead of casting scene.fog / scene.background every frame.
      const sceneFog = new THREE.FogExp2(0xb8cce0, 0.018)
      const skyColor = new THREE.Color(0x87b4d0)
      scene.fog = sceneFog
      scene.background = skyColor

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
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: new THREE.Color(color) })
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
      const toriiBars: ThreeNS.Mesh<ThreeNS.BoxGeometry, ThreeNS.MeshLambertMaterial>[] = []
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
      const lanternMats: ThreeNS.MeshLambertMaterial[] = []
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
      function buildNPC(x: number, z: number, col: string): ThreeNS.Group {
        const g = new THREE.Group()
        const nb = (px: number, py: number, pz: number, w: number, h: number, d: number) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: new THREE.Color(col) }))
          m.position.set(px, py, pz); m.castShadow = true; g.add(m)
        }
        nb(0, 0.28, 0, 0.55, 0.42, 0.55); nb(0, 0.65, 0, 0.40, 0.38, 0.40)
        nb(-0.12, 0.63, -0.22, 0.08, 0.08, 0.02); nb(0.12, 0.63, -0.22, 0.08, 0.08, 0.02)
        g.position.set(x, 0.28, z); scene.add(g); return g
      }
      const npcData: Array<{ mesh: ThreeNS.Group, homeX: number, homeZ: number, angle: number, radius: number, speed: number, state: string, timer: number, walkPhase: number }> = [
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
        npcData.forEach(n => {
          n.mesh.traverse((c) => {
            const renderable = c as Partial<Pick<ThreeNS.Mesh, 'geometry' | 'material'>>
            renderable.geometry?.dispose()
            if (renderable.material) (Array.isArray(renderable.material) ? renderable.material : [renderable.material]).forEach(m => m.dispose())
          })
          scene.remove(n.mesh)
        })
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
      function checkCollision(p: { x: number; z: number }): boolean {
        const r = 0.55
        return COLLIDERS.some(([x0, z0, x1, z1]) => p.x + r > x0 && p.x - r < x1 && p.z + r > z0 && p.z - r < z1)
      }

      const keys: Record<string, boolean> = {}
      let nearestObj: Obj | null = null
      let cameraMode: 'follow' | 'cinematic' = 'follow'
      const cinematicPos = new THREE.Vector3()
      const cinematicLook = new THREE.Vector3()

      interface Obj { pos: ThreeNS.Vector3; radius: number; label: string; onInteract: () => void }
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
        if (e.code === 'Escape') { openOverlay(null); cameraMode = 'follow'; skipIntroRef.current = true }
      }
      const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false }
      window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp)
      cleanupFns.current.push(() => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) })

      let gatePassed = false, leaderStoneRisen = false, controlEnabled = false
      // ─── Day/Night state (0=dawn→0.25=noon→0.5=dusk→0.75=night→1=dawn) ──
      let dayNightT = 0.15 // start just past dawn
      const DAY_DURATION = 75 // seconds per full cycle

      const camPos = new THREE.Vector3(0, 14, 40)
      const camLook = new THREE.Vector3(0, 2, 0)

      // ─── HATCHING EGG INTRO ─────────────────────────────────────────────────
      // The egg lives in the world itself: blocks lit by the same sun and
      // lanterns, casting real shadows, glowing from a core inside. Cracks are
      // blocks physically popping out to reveal that glow, which is why they
      // read as the shell breaking — a line drawn over a flat 2D egg never
      // could. One InstancedMesh, so ~400 blocks cost a single draw call.
      const EGG_X = player.pos.x, EGG_Z = player.pos.z
      // Block size matters: at 0.1 the whole egg was only ~290 blocks, so
      // even a one-block-wide crack ate most of the visible surface and read
      // as holes, not a crack. At 0.07 it's ~610 blocks and a crack is a line.
      const EGG_VOX = 0.07, EGG_R = 0.5, EGG_H = 0.66
      // Intro clock, in seconds from the first rendered frame.
      const STAR_START = 1.9          // impact: one jagged crack runs down from the top
      const EQ_START = 2.7            // zig-zag split spreads around the middle...
      const EQ_SPREAD = 0.9           // ...all the way round over this long
      const TREMBLE_START = 3.6
      const BURST_T = 4.2
      const PET_IN_DUR = 0.7
      const TITLE_T = 4.9
      // Pull back as soon as the pet has landed, so it never fills the frame.
      const PULLBACK_START = BURST_T + 0.75
      const PULLBACK_DUR = 1.9
      const INTRO_END = PULLBACK_START + PULLBACK_DUR + 0.1
      const IMPACT_THETA = 1.1        // the side of the egg facing the camera

      const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
      const smoothstep = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k) }
      const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
      const easeOutBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1, k = clamp01(x); return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2) }
      const triWave = (x: number) => 1 - 4 * Math.abs(x - Math.floor(x + 0.5)) // -1..1, sharp corners
      const angDist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
      const hash = (a: number, b: number, c: number) => { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s) }
      // Height (in -1..1 egg space) of the zig-zag line the shell splits
      // along — ~2 blocks of amplitude, or the teeth round away to a flat band.
      const splitAt = (theta: number) => 0.1 + 0.24 * triWave(theta * 6 / (Math.PI * 2))
      // The impact crack's path down the camera-facing side, and a short
      // branch forking off it partway down.
      const mainCrackAt = (v: number) => IMPACT_THETA + 0.16 * triWave(v * 3.2) + 0.05 * Math.sin(v * 23)
      const BRANCH_V = 0.6
      const branchCrackAt = (v: number) => IMPACT_THETA + 0.16 * triWave(BRANCH_V * 3.2) + (BRANCH_V - v) * 0.9
      const CRACK_RUN = 0.7 // seconds for the main crack to travel top → split

      // Classic egg profile: narrower at the top than the bottom.
      const eggRadiusAt = (v: number) => Math.sqrt(Math.max(0, 1 - v * v)) * (1 - 0.14 * v) * EGG_R
      const insideEgg = (x: number, y: number, z: number) => {
        const v = y / EGG_H
        return Math.abs(v) <= 1 && Math.hypot(x, z) <= eggRadiusAt(v)
      }

      type EggVoxel = {
        base: ThreeNS.Vector3; normal: ThreeNS.Vector3; isCap: boolean; crackAt: number
        pos: ThreeNS.Vector3; vel: ThreeNS.Vector3; rot: ThreeNS.Euler; spin: ThreeNS.Vector3; scale: number
      }
      const eggVoxels: EggVoxel[] = []
      const eggColors: ThreeNS.Color[] = []
      const nR = Math.ceil(EGG_R / EGG_VOX), nH = Math.ceil(EGG_H / EGG_VOX)
      for (let i = -nR; i <= nR; i++) for (let j = -nH; j <= nH; j++) for (let k = -nR; k <= nR; k++) {
        const x = i * EGG_VOX, y = j * EGG_VOX, z = k * EGG_VOX
        if (!insideEgg(x, y, z)) continue
        // Hollow shell: keep only blocks with an exposed face.
        const d = EGG_VOX
        if (insideEgg(x + d, y, z) && insideEgg(x - d, y, z) && insideEgg(x, y + d, z) &&
            insideEgg(x, y - d, z) && insideEgg(x, y, z + d) && insideEgg(x, y, z - d)) continue

        const v = y / EGG_H, theta = Math.atan2(z, x), rho = Math.max(Math.hypot(x, z), EGG_VOX)
        const split = splitAt(theta)
        // Every crack is one block wide (a band of ~half a block either side
        // of its path) — wider and it reads as holes rather than a crack.
        const halfBlock = EGG_VOX * 0.55
        let crackAt = Infinity
        // The zig-zag split, spreading around from the impact side.
        if (Math.abs(v - split) < (EGG_VOX / EGG_H) * 0.55) {
          crackAt = EQ_START + (angDist(theta, IMPACT_THETA) / Math.PI) * EQ_SPREAD
        }
        // The impact crack, travelling down from the top...
        if (v > split && v < 0.97 && angDist(theta, mainCrackAt(v)) * rho < halfBlock) {
          crackAt = Math.min(crackAt, STAR_START + (0.97 - v) * CRACK_RUN)
        }
        // ...and its branch, starting once the main crack reaches the fork.
        if (v > split && v < BRANCH_V && v > 0.28 && angDist(theta, branchCrackAt(v)) * rho < halfBlock) {
          crackAt = Math.min(crackAt, STAR_START + (0.97 - BRANCH_V) * CRACK_RUN + (BRANCH_V - v) * 0.8)
        }
        const base = new THREE.Vector3(x, y + EGG_H + EGG_VOX / 2, z)
        eggVoxels.push({
          base, normal: new THREE.Vector3(x / EGG_R, y / EGG_H, z / EGG_R).normalize(),
          isCap: v > split, crackAt,
          pos: base.clone(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), scale: 1,
        })
        // Warm cream shell with a little per-block variation, plus sparse speckles.
        const h = hash(i, j, k)
        const col = new THREE.Color(0xf2e6cc).offsetHSL(0, 0, (hash(k, i, j) - 0.5) * 0.06)
        if (h > 0.955) col.set(0xb98552)
        else if (h > 0.93) col.set(0x8fb3a4)
        eggColors.push(col)
      }

      const eggGroup = new THREE.Group()
      eggGroup.position.set(EGG_X, 0, EGG_Z)
      scene.add(eggGroup)
      const eggGeo = new THREE.BoxGeometry(EGG_VOX * 0.97, EGG_VOX * 0.97, EGG_VOX * 0.97)
      // A faint warm self-glow keeps the shell reading as a cream egg under
      // the dim pre-dawn exposure (without it, it looked like grey stone).
      const eggMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0x3a2a14), emissiveIntensity: 0.9 })
      const eggMesh = new THREE.InstancedMesh(eggGeo, eggMat, eggVoxels.length)
      eggMesh.castShadow = true; eggMesh.receiveShadow = true
      eggColors.forEach((c, i) => eggMesh.setColorAt(i, c))
      eggGroup.add(eggMesh)
      // The glowing core the cracks reveal. Not tone-mapped, so it stays
      // bright against the dimmed pre-dawn scene.
      const coreGeo = new THREE.SphereGeometry(1, 20, 14)
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, toneMapped: false })
      const eggCore = new THREE.Mesh(coreGeo, coreMat)
      eggCore.scale.set(EGG_R * 0.8, EGG_H * 0.8, EGG_R * 0.8)
      eggCore.position.y = EGG_H + EGG_VOX / 2
      eggGroup.add(eggCore)
      const eggLight = new THREE.PointLight(0xffb45a, 0.6, 7)
      eggLight.position.y = EGG_H
      eggGroup.add(eggLight)
      const crackTotal = eggVoxels.filter(ev => ev.crackAt < Infinity).length || 1
      cleanupFns.current.push(() => {
        scene.remove(eggGroup)
        eggGeo.dispose(); eggMat.dispose(); coreGeo.dispose(); coreMat.dispose()
      })

      // Where the normal follow camera settles behind the pet — the intro
      // ends exactly here so control hands over without a jump.
      const followPos = player.pos.clone().add(new THREE.Vector3(0, 7, 14))
      const followLook = player.pos.clone().add(new THREE.Vector3(0, 3, 0))
      const orbitPos = new THREE.Vector3(), orbitLook = new THREE.Vector3()
      const eggDummy = new THREE.Object3D()
      const INTRO_EXPOSURE_START = 0.38, FINAL_EXPOSURE = renderer.toneMappingExposure
      renderer.toneMappingExposure = INTRO_EXPOSURE_START
      playerMesh.group.visible = false

      let introDone = false, introT = 0, burstStarted = false, titleShown = false, sceneShown = false

      const finishIntro = () => {
        if (introDone) return
        introDone = true
        eggGroup.visible = false
        playerMesh.group.visible = true
        playerMesh.group.scale.setScalar(1)
        renderer.toneMappingExposure = FINAL_EXPOSURE
        camPos.copy(followPos); camLook.copy(followLook)
        controlEnabled = true
        markIntroSeen()
        if (mounted.current) {
          setSceneReady(true)
          setCinematicDone(true)
          setTimeout(() => { if (mounted.current) setControlsHint(false) }, 8000)
        }
      }

      // Seen it already this visit? Go straight into the world.
      if (hasSeenIntro()) finishIntro()

      const updateIntro = (delta: number) => {
        if (skipIntroRef.current || introT >= INTRO_END) { finishIntro(); return }
        introT += delta
        const t = introT

        // ── Camera: slow push-in orbit around the egg, then a pull-back that
        // lands on the follow camera's resting pose.
        const a = 0.55 - t * 0.05
        // Push in while the egg cracks; ease back out the moment it bursts.
        const r = 4.4 - Math.min(t, BURST_T) * 0.22 + smoothstep((t - BURST_T) / 0.9) * 1.2
        orbitPos.set(EGG_X + Math.sin(a) * r, 1.25 + Math.sin(t * 0.5) * 0.1, EGG_Z + Math.cos(a) * r)
        orbitLook.set(EGG_X, 0.75 + smoothstep((t - BURST_T) / 0.8) * 0.25, EGG_Z)
        const pull = smoothstep((t - PULLBACK_START) / PULLBACK_DUR)
        camPos.copy(orbitPos).lerp(followPos, pull)
        camLook.copy(orbitLook).lerp(followLook, pull)
        const shake = t >= BURST_T ? Math.exp(-(t - BURST_T) * 6) * 0.12 : 0
        camera.position.copy(camPos).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0))
        camera.lookAt(camLook)

        if (t < BURST_T) {
          // ── Whole egg: idle rock, a jolt at each crack event, a rising
          // tremble, then a squash just before it gives way.
          const jolt = (dt: number) => (dt >= 0 ? Math.exp(-dt * 5) * Math.sin(dt * 38) * 0.09 : 0)
          const trem = clamp01((t - TREMBLE_START) / (BURST_T - TREMBLE_START))
          const idle = Math.sin(t * 1.7) * 0.025
          eggGroup.rotation.z = idle + jolt(t - STAR_START) + jolt(t - EQ_START) * 0.8 + trem * 0.05 * Math.sin(t * 70)
          eggGroup.rotation.x = idle * 0.6 + trem * 0.035 * Math.sin(t * 61 + 1)
          const squash = smoothstep((t - (BURST_T - 0.3)) / 0.3)
          eggGroup.scale.set(1 + squash * 0.04, 1 - squash * 0.07, 1 + squash * 0.04)

          // A plain loop (not forEach) because React Compiler can't handle
          // incrementing a counter captured inside a callback, and bails out
          // of compiling the whole component if it sees one.
          let cracked = 0
          for (let i = 0; i < eggVoxels.length; i++) {
            const ev = eggVoxels[i]
            const k = t >= ev.crackAt ? clamp01((t - ev.crackAt) / 0.22) : 0
            if (k > 0) cracked += 1
            ev.pos.copy(ev.base).addScaledVector(ev.normal, 0.06 * k)
            ev.scale = 1 - k
            eggDummy.position.copy(ev.pos); eggDummy.rotation.set(0, 0, 0); eggDummy.scale.setScalar(ev.scale)
            eggDummy.updateMatrix(); eggMesh.setMatrixAt(i, eggDummy.matrix)
          }
          const crackedFrac = cracked / crackTotal
          eggLight.intensity = 0.6 + Math.sin(t * 3) * 0.2 + crackedFrac * 2.8 + trem * 1.5
          renderer.toneMappingExposure = INTRO_EXPOSURE_START + crackedFrac * 0.12
        } else {
          // ── Burst: the cap flies up, the lower shell falls outward, every
          // block under gravity with a little bounce, then they shrink away.
          if (!burstStarted) {
            burstStarted = true
            eggGroup.rotation.set(0, 0, 0); eggGroup.scale.setScalar(1)
            eggVoxels.forEach(ev => {
              // Kept deliberately tight: a small ring of shell at the pet's
              // feet, not debris carpeting the whole scene.
              const rnd = Math.random()
              if (ev.isCap) ev.vel.copy(ev.normal).multiplyScalar(0.6 + rnd * 0.5).add(new THREE.Vector3(0, 2.4 + Math.random() * 0.8, 0))
              else ev.vel.copy(ev.normal).multiplyScalar(0.8 + rnd * 0.6).add(new THREE.Vector3(0, 0.7 + Math.random() * 0.6, 0))
              ev.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12)
            })
          }
          const fade = 1 - smoothstep((t - (BURST_T + 0.9)) / 0.8)
          eggVoxels.forEach((ev, i) => {
            if (ev.scale > 0 || t < ev.crackAt) {
              ev.vel.y -= 9.8 * delta
              ev.pos.addScaledVector(ev.vel, delta)
              if (ev.pos.y < EGG_VOX / 2) {
                ev.pos.y = EGG_VOX / 2
                ev.vel.y *= -0.35; ev.vel.x *= 0.7; ev.vel.z *= 0.7; ev.spin.multiplyScalar(0.8)
              }
              ev.rot.x += ev.spin.x * delta; ev.rot.y += ev.spin.y * delta; ev.rot.z += ev.spin.z * delta
            }
            const s = t < ev.crackAt ? fade : 0
            eggDummy.position.copy(ev.pos); eggDummy.rotation.copy(ev.rot); eggDummy.scale.setScalar(s)
            eggDummy.updateMatrix(); eggMesh.setMatrixAt(i, eggDummy.matrix)
          })
          if (fade <= 0) eggMesh.visible = false
          // The core collapses into the pet as it steps out.
          const coreK = clamp01((t - BURST_T) / 0.35)
          eggCore.scale.set(EGG_R * 0.8 * (1 - coreK), EGG_H * 0.8 * (1 - coreK), EGG_R * 0.8 * (1 - coreK))
          coreMat.opacity = 1 - coreK
          eggLight.intensity = 6 * Math.exp(-(t - BURST_T) * 3)
          // Dawn breaks as the shell opens.
          renderer.toneMappingExposure = INTRO_EXPOSURE_START + 0.12 +
            (FINAL_EXPOSURE - INTRO_EXPOSURE_START - 0.12) * easeOutCubic((t - BURST_T) / 1.6)

          // ── The pet: pops up with a hop, facing the camera, then turns to
          // face the world as the camera swings round behind it.
          const p = clamp01((t - BURST_T - 0.05) / PET_IN_DUR)
          playerMesh.group.visible = p > 0
          playerMesh.group.scale.setScalar(Math.max(0.001, easeOutBack(p)))
          playerMesh.group.position.set(EGG_X, 0.5 + Math.sin(Math.PI * p) * 0.35, EGG_Z)
          const toCam = Math.atan2(-(orbitPos.x - EGG_X), -(orbitPos.z - EGG_Z))
          playerMesh.group.rotation.y = toCam * (1 - smoothstep((t - (PULLBACK_START + 0.1)) / 1.3))
        }
        eggMesh.instanceMatrix.needsUpdate = true

        if (!titleShown && t >= TITLE_T) { titleShown = true; if (mounted.current) setIntroStep(1) }
        if (!sceneShown) { sceneShown = true; if (mounted.current) setSceneReady(true) }
      }

      // Audio
      let audioCtx: AudioContext | null = null
      const initAudio = () => {
        if (audioCtx) return
        const AudioContextClass =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioContextClass) audioCtx = new AudioContextClass()
      }
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

      let elapsed = 0, last = performance.now()

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick)
        const now = performance.now()
        const delta = Math.min((now - last) / 1000, 0.05)
        last = now; elapsed += delta

        const uiOpen = activeOverlayRef.current !== null

        // During the intro the loop still runs everything below the player
        // block (petals, koi, lanterns, day/night...), so the world stays
        // alive around the egg — only input, player physics, and the follow
        // camera are held until it hands over.
        if (!controlEnabled) updateIntro(delta)
        if (controlEnabled) {
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
        }

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
        skyColor.setHSL(dayBright > 0.15 ? 0.60 : 0.67, 0.32, skyL)
        sceneFog.color.setHSL(dayBright > 0.15 ? 0.60 : 0.67, 0.22, skyL)
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
      cleanups.forEach(fn => fn())
      // Emptied after running so earlier runs' cleanups don't pile up and
      // fire again on the next teardown.
      cleanups.length = 0
    }
  }, [openOverlay])

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', overflow: 'hidden', fontFamily: "'Syne', sans-serif", background: '#0d0f18' }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Syne:wght@400;700;800&family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes questFlash {
          0%   { border-color: rgba(240,200,140,0.25); }
          30%  { border-color: rgba(255,180,80,0.8); }
          100% { border-color: rgba(240,200,140,0.25); }
        }
        @keyframes arrowPulse {
          0%,100% { opacity: 0.4; transform: translateY(0); }
          50%     { opacity: 1;   transform: translateY(-4px); }
        }
        @keyframes arrowPulseDown {
          0%,100% { opacity: 0.4; transform: translateY(0); }
          50%     { opacity: 1;   transform: translateY(4px); }
        }
      `}</style>

      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, background: 'radial-gradient(ellipse 75% 75% at 50% 50%, transparent 35%, rgba(8,6,4,0.6) 100%)' }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, opacity: 0.028,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        animation: 'grain 0.4s steps(1) infinite'
      }} />

      {/* Black cover only until the 3D scene's first frame — the intro itself
          plays out in the real world (see updateIntro in the scene effect). */}
      <div style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 90, opacity: sceneReady ? 0 : 1, transition: 'opacity 1.4s ease', pointerEvents: sceneReady ? 'none' : 'all' }} />

      {!cinematicDone && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: '14vh', zIndex: 91, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, pointerEvents: 'none' }}>
          {/* GIT PET title + subtitle, as the pet steps out of the shell */}
          {introStep === 1 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: '22px 64px',
              // A soft dark band so the title reads over a bright, busy scene.
              background: 'radial-gradient(ellipse at center, rgba(8,6,4,0.55) 0%, rgba(8,6,4,0) 70%)',
              animation: 'fadeInOut 2.2s ease 0s both',
            }}>
              <div style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 18,
                color: '#ffd4a0',
                letterSpacing: 8,
                textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 0 30px rgba(255,180,80,0.55)',
              }}>
                GIT PET
              </div>
              <div style={{
                fontFamily: "'DM Mono', monospace",
                fontWeight: 400,
                fontSize: 11,
                color: 'rgba(240,235,224,0.8)',
                letterSpacing: 2,
                textShadow: '0 1px 2px rgba(0,0,0,0.7)',
              }}>
                Your GitHub commits · made alive
              </div>
            </div>
          )}

        </div>
      )}

      {sceneReady && !cinematicDone && (
        <button
          onClick={() => { skipIntroRef.current = true }}
          style={{
            position: 'fixed', right: 28, bottom: 28, zIndex: 95,
            fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 10,
            letterSpacing: 3, textTransform: 'uppercase',
            color: 'rgba(240,235,224,0.55)', background: 'rgba(8,6,4,0.35)',
            border: '1px solid rgba(240,200,140,0.18)', padding: '8px 14px',
            cursor: 'pointer', backdropFilter: 'blur(6px)',
            animation: 'slideUpFade 0.6s ease 1s both',
          }}
        >
          Skip intro →
        </button>
      )}

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20, padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(8,6,4,0.5)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(240,200,140,0.1)', width: '100%', overflow: 'hidden' }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: '#f0ebe0', letterSpacing: 2, textShadow: '0 0 30px rgba(255,180,80,0.5)' }}>GIT-PET</div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <button
            onClick={() => openOverlay('about')}
            style={{
              fontFamily: "'DM Mono', monospace",
              fontWeight: 300,
              fontSize: 11,
              letterSpacing: 1,
              color: 'rgba(240,235,224,0.45)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '9px 12px',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            what is this?
          </button>
          {isLoggedIn ? (
            <a href="/dashboard" style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#ffd4a0', textDecoration: 'none', background: 'rgba(181,71,10,0.4)', border: '1px solid rgba(255,180,80,0.35)', padding: '9px 20px', backdropFilter: 'blur(8px)' }}>My Pet →</a>
          ) : (
            <button onClick={() => signIn('github', { callbackUrl: '/dashboard' })} style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#ffd4a0', background: 'rgba(26,20,14,0.7)', border: '1px solid rgba(240,200,140,0.25)', padding: '9px 20px', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>Sign In →</button>
          )}
        </div>
      </nav>

      {promptLabel && cinematicDone && (
        <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,14,8,0.88)', border: '1px solid rgba(240,200,140,0.3)', backdropFilter: 'blur(10px)', padding: '10px 22px', zIndex: 20, fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: '#ffd4a0', letterSpacing: 1, whiteSpace: 'nowrap', animation: 'floatBob 2s ease-in-out infinite', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div>{promptLabel}</div>
          {Object.entries(PROMPT_SUBTITLES).find(([k]) => promptLabel?.includes(k))?.[1] && (
            <div style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 8,
              color: 'rgba(240,200,140,0.4)',
              letterSpacing: 3,
              marginTop: 5,
              textAlign: 'center',
            }}>
              {Object.entries(PROMPT_SUBTITLES).find(([k]) => promptLabel?.includes(k))?.[1]}
            </div>
          )}
        </div>
      )}

      {controlsHint && cinematicDone && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 10, color: 'rgba(240,235,224,0.38)', letterSpacing: 3, textTransform: 'uppercase', zIndex: 15, pointerEvents: 'none', transition: 'opacity 0.5s ease', opacity: controlsHint ? 1 : 0, animation: 'fadeOut 1.5s ease 7s forwards' }}>
          {hintIndex === 0 && 'WASD · MOVE  ·  A/D · TURN'}
          {hintIndex === 1 && 'E · INTERACT WITH OBJECTS'}
          {hintIndex === 2 && 'EXPLORE · FIND THE SHRINE ⛩️'}
        </div>
      )}

      {cinematicDone && questStep !== 'hidden' && (
        <div
          key={questStep}
          style={{
            position: 'fixed', bottom: 28, left: 24,
            background: 'rgba(22,16,10,0.92)',
            border: '1px solid rgba(240,200,140,0.25)',
            padding: '16px 20px',
            width: 220,
            zIndex: 15,
            pointerEvents: 'none',
            animation: 'slideUpFade 0.5s ease forwards, questFlash 0.8s ease 0s',
          }}
        >
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#ffd4a0', marginBottom: 12 }}>QUEST</div>
          
          {questStep === 0 && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#f0ebe0', marginBottom: 4 }}>Walk to the notice board</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(240,235,224,0.4)' }}>[ follow the path north ]</div>
              </div>
              <div style={{ color: '#ffd4a0', fontSize: 16, animation: 'arrowPulse 1.5s infinite' }}>↑</div>
            </div>
          )}

          {questStep === 1 && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#f0ebe0', marginBottom: 4 }}>Press E to learn more</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(240,235,224,0.4)' }}>[ or keep exploring ]</div>
              </div>
            </div>
          )}

          {questStep === 2 && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#f0ebe0', marginBottom: 4 }}>Find the shrine</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(240,235,224,0.4)' }}>[ walk south past the torii ]</div>
              </div>
              <div style={{ color: '#ffd4a0', fontSize: 16, animation: 'arrowPulseDown 1.5s infinite' }}>↓</div>
            </div>
          )}

          {questStep === 'done' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', animation: 'fadeOutToZero 1s ease 3s forwards' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#f0ebe0', marginBottom: 4 }}>You found it. ⛩️</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(240,235,224,0.4)' }}>[ enter the world or sign in ]</div>
              </div>
            </div>
          )}
        </div>
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
              <p style={{ fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: 11, color: 'rgba(240,235,224,0.4)', marginBottom: 28, letterSpacing: 1 }}>Pick one — it comes with you when you sign in.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
                {SPECIES_PREVIEW.map(s => {
                  const col = CANON_COLORS[s.id]
                  const isSelected = pickedSpecies === s.id
                  const isHovered = hoveredSpecies === s.id
                  return (
                    <div key={s.id}
                      style={{
                        border: `1px solid ${isSelected ? col : `${col}44`}`,
                        background: isSelected ? `${col}2a` : isHovered ? `${col}15` : 'transparent',
                        padding: '16px 8px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s', overflow: 'hidden',
                      }}
                      onMouseEnter={() => setHoveredSpecies(s.id)}
                      onMouseLeave={() => setHoveredSpecies(null)}
                      onClick={() => setPickedSpecies(s.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'center', transform: 'scale(0.8)', transformOrigin: 'top center', marginBottom: -8, marginTop: -4 }}>
                        <SpeciesCanvas species={s.id} isSelected={isSelected} isHovered={isHovered} />
                      </div>
                      <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 15, color: isSelected ? col : '#f0ebe0', marginBottom: 4 }}>{s.name}</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.role}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ minHeight: 34, marginTop: 16, textAlign: 'center' }}>
                {pickedSpecies && (
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(240,235,224,0.6)', letterSpacing: 1 }}>
                    {SPECIES_PREVIEW.find(s => s.id === pickedSpecies)?.tagline}
                  </p>
                )}
              </div>
              <button
                disabled={!pickedSpecies}
                onClick={() => {
                  if (!pickedSpecies) return
                  // Carried into onboarding — SpeciesSelect.tsx reads this so
                  // signing in doesn't ask the same question twice.
                  try { localStorage.setItem('gitpet_preselected_species', pickedSpecies) } catch { /* private mode etc. */ }
                  signIn('github', { callbackUrl: '/dashboard' })
                }}
                style={{ ...overlayBtnStyle, marginTop: 8, width: '100%', opacity: pickedSpecies ? 1 : 0.4, cursor: pickedSpecies ? 'pointer' : 'not-allowed' }}
              >
                {pickedSpecies ? `Continue as ${SPECIES_PREVIEW.find(s => s.id === pickedSpecies)?.name} →` : 'Pick a creature first'}
              </button>
            </>}

            {activeOverlay === 'leaderboard' && <>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color: '#ffd4a0', marginBottom: 24, letterSpacing: 1, textAlign: 'center' }}>HALL OF LEGENDS</div>

              {/* Tab bar */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
                {(['streak', 'commits', 'friends'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setLbTab(tab)}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 9,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      background: lbTab === tab ? 'rgba(181,71,10,0.4)' : 'rgba(255,255,255,0.04)',
                      border: lbTab === tab ? '1px solid rgba(255,180,80,0.5)' : '1px solid rgba(240,200,140,0.1)',
                      color: lbTab === tab ? '#ffd4a0' : 'rgba(240,235,224,0.4)',
                      cursor: 'pointer',
                    }}
                  >
                    {tab === 'streak' ? '🔥 Streak' : tab === 'commits' ? '⚡ Commits' : '❤️ Friends'}
                  </button>
                ))}
              </div>

              {/* Loading state */}
              {lbLoading && (
                <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(240,235,224,0.3)', letterSpacing: 2 }}>
                  loading...
                </div>
              )}

              {/* Empty state */}
              {!lbLoading && lbData && (
                lbTab === 'streak' ? lbData.topStreak : lbTab === 'commits' ? lbData.topCommits : lbData.topFriends
              )?.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(240,235,224,0.3)', letterSpacing: 2 }}>
                  no entries yet
                </div>
              )}

              {/* Real data rows */}
              {!lbLoading && lbData && (
                (lbTab === 'streak' ? lbData.topStreak : lbTab === 'commits' ? lbData.topCommits : lbData.topFriends)
                  .map((entry, i) => (
                    <div key={entry.username} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid rgba(240,200,140,0.08)', animation: `fadeSlideIn 0.4s ease ${i * 0.07}s both` }}>
                      <div style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 24, color: i < 3 ? '#ffd4a0' : 'rgba(240,235,224,0.3)', minWidth: 28 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#f0ebe0' }}>@{entry.username}</div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'capitalize' }}>{entry.species}</div>
                      </div>
                      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: '#b5470a' }}>
                        {lbTab === 'streak' && `🔥 ${entry.value}d`}
                        {lbTab === 'commits' && `⚡ ${entry.value >= 1000 ? (entry.value / 1000).toFixed(1) + 'k' : entry.value}`}
                        {lbTab === 'friends' && `❤️ ${entry.value}`}
                      </div>
                    </div>
                  ))
              )}
            </>}

            {activeOverlay === 'pets' && <>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 40, color: '#f0ebe0', marginBottom: 24 }}>The creatures</div>

              {samplePetsLoading && (
                <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(240,235,224,0.3)', letterSpacing: 2 }}>
                  loading...
                </div>
              )}

              {!samplePetsLoading && samplePets?.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(240,235,224,0.3)', letterSpacing: 2 }}>
                  no pets hatched yet — you could be the first
                </div>
              )}

              {/* Real onboarded users' real stats — same public endpoint the
                  shareable card uses. No mockup data. */}
              {!samplePetsLoading && samplePets?.map(p => (
                <div key={p.username} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(240,200,140,0.1)', padding: '20px 24px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ width: 40, height: 40, background: CANON_COLORS[p.species] ?? '#666', borderRadius: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#f0ebe0', marginBottom: 6 }}>@{p.username} · {p.species}</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {([['Health', p.health, '#3d8a4a'], ['Happiness', p.happiness, '#c8930a']] as const).map(([label, val, col]) => (
                        <div key={label} style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(240,235,224,0.4)', marginBottom: 4, letterSpacing: 1 }}>{label}</div>
                          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${val}%`, background: col, borderRadius: 2, transition: 'width 0.8s ease' }} />
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