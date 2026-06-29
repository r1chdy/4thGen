import * as THREE from 'three'

export const FLOOR1_Y =  0.0
export const FLOOR2_Y = -9.0

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const fragmentShader = `
  varying vec2 vUv;
  uniform float     uTime;
  uniform vec2      uMouse;
  uniform float     uAspect;
  uniform float     uCamY;
  uniform float     uVertScale;
  uniform float     uCover;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }

  const float FLOOR1 = 0.0;
  const float FLOOR2 = -9.0;

  void main() {
    vec2 uv = vUv;
    vec2 uvCentered = (uv - 0.5) * vec2(uAspect, 1.0);
    float dist = length(uvCentered);

    float n  = noise(uv * 2.5 + uTime * 0.05);
    float n2 = noise(uv * 5.0 - uTime * 0.03 + 0.5);
    uv += vec2(uMouse.x * 0.008, uMouse.y * 0.006);

    float worldY  = uCamY + (vUv.y - 0.5) * uVertScale;
    float tiltedY = worldY + (vUv.x - 0.5) * 1.5;

    float z1 = step(FLOOR1, tiltedY);
    float z2 = step(FLOOR2, tiltedY) * (1.0 - z1);
    float z3 = 1.0 - z1 - z2;

    if (uCover > 0.5 && z3 > 0.5) discard;

    vec3 dark   = vec3(0.024, 0.015, 0.025);
    vec3 mid    = vec3(0.055, 0.020, 0.035);
    vec3 accent = vec3(0.095, 0.022, 0.050);

    float vig  = 1.0 - smoothstep(0.15, 0.95, dist);
    vec3 base  = mix(dark, mid, vig * 0.7 + n * 0.15);
    float aura = smoothstep(0.45, 0.0, dist) * (0.12 + n2 * 0.1);
    base      += accent * aura;

    // Soft vignette
    float deepVig = smoothstep(1.1, 0.1, dist);
    base *= 0.55 + 0.45 * deepVig;

    float fcX = (vUv.x - 0.5) * 2.0;

    // Corner glow — world-fixed per floor
    float pulse1 = 0.78 + 0.22 * sin(uTime * 0.65);
    float pulse2 = 0.80 + 0.20 * sin(uTime * 0.45 + 1.0);
    float pulse3 = 0.75 + 0.25 * sin(uTime * 0.55 + 2.0);

    vec2 f1fc = vec2(fcX, (tiltedY - 4.0) / 4.0);
    float cg1 = exp(-distance(f1fc, vec2(-1.0,  1.0)) * 1.2)
              + exp(-distance(f1fc, vec2( 1.0, -1.0)) * 5.0);

    vec2 f2fc = vec2(fcX, (tiltedY + 4.5) / 4.5);
    float cg2 = exp(-distance(f2fc, vec2(-1.0,  1.0)) * 1.2)
              + exp(-distance(f2fc, vec2( 1.0, -1.0)) * 5.0);

    // Floor3: anchor glow to camera so it stays consistent at all scroll depths
    vec2 f3fc = vec2(fcX, (tiltedY - uCamY) / 3.5);
    float cg3 = exp(-distance(f3fc, vec2(-1.0,  1.0)) * 1.2)
              + exp(-distance(f3fc, vec2( 1.0, -1.0)) * 5.0);

    base += vec3(0.50, 0.04, 0.06) * z1 * pulse1 * cg1
          + vec3(0.50, 0.04, 0.06) * z2 * pulse2 * cg2
          + vec3(0.50, 0.04, 0.06) * z3 * pulse3 * cg3;

    gl_FragColor = vec4(base, 1.0);
  }
`

export class Background {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(2, 2)

    this._u = {
      uTime:      { value: 0 },
      uMouse:     { value: new THREE.Vector2(0, 0) },
      uAspect:    { value: window.innerWidth / window.innerHeight },
      uCamY:      { value: 2.5 },
      uVertScale: { value: 7.0 },
    }

    const matBase = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms:   { ...this._u, uCover: { value: 0 } },
      depthTest:  false,
      depthWrite: false,
    })

    // Cover: renders after all 3D content in scene.instance (renderOrder=100)
    // opaque in floor1+2 zones → covers 3D objects that bleed across floor boundary
    // transparent in floor3 zone → dragon/cards show through
    const matCover = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms:    { ...this._u, uCover: { value: 1 } },
      transparent: true,
      depthTest:   false,
      depthWrite:  false,
    })

    const meshBase = new THREE.Mesh(geo, matBase)
    meshBase.frustumCulled = false
    meshBase.renderOrder = -1
    scene.instance.add(meshBase)

    const meshCover = new THREE.Mesh(geo, matCover)
    meshCover.frustumCulled = false
    meshCover.renderOrder = 100
    scene.instance.add(meshCover)

    window.addEventListener('resize', () => {
      this._u.uAspect.value = window.innerWidth / window.innerHeight
    })

    this._scene = scene
  }

  update({ elapsed, camY = 2.5, vertScale = 7.0 }) {
    this._u.uTime.value      = elapsed
    this._u.uCamY.value      = camY
    this._u.uVertScale.value = vertScale
    this._u.uMouse.value.set(
      this._scene.lerpMouse.x,
      this._scene.lerpMouse.y
    )
  }

  destroy() {}
}
