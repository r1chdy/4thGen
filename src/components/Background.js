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
  uniform float uTime;
  uniform vec2  uMouse;
  uniform float uAspect;
  uniform float uCamY;
  uniform float uVertScale;
  uniform float uCover;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }

  float hexDist(vec2 p) {
    p = abs(p);
    float c = dot(p, normalize(vec2(1.0, 1.73205)));
    return max(c, p.x);
  }

  vec4 hexGrid(vec2 p) {
    vec2 r  = vec2(1.0, 1.73205);
    vec2 h  = r * 0.5;
    vec2 a  = mod(p, r) - h;
    vec2 b  = mod(p - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    return vec4(gv, p - gv);
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

    vec3 dark1   = vec3(0.085, 0.020, 0.032);
    vec3 mid1    = vec3(0.190, 0.040, 0.075);
    vec3 accent1 = vec3(0.320, 0.040, 0.100);
    vec3 dark2   = vec3(0.085, 0.020, 0.032);
    vec3 mid2    = vec3(0.190, 0.040, 0.075);
    vec3 accent2 = vec3(0.320, 0.040, 0.100);
    vec3 dark3   = vec3(0.085, 0.020, 0.032);
    vec3 mid3    = vec3(0.190, 0.040, 0.075);
    vec3 accent3 = vec3(0.320, 0.040, 0.100);

    vec3 dark   = dark1*z1   + dark2*z2   + dark3*z3;
    vec3 mid    = mid1*z1    + mid2*z2    + mid3*z3;
    vec3 accent = accent1*z1 + accent2*z2 + accent3*z3;

    float vig  = 1.0 - smoothstep(0.15, 0.95, dist);
    vec3 base  = mix(dark, mid, vig * 0.7 + n * 0.15);
    float aura = smoothstep(0.45, 0.0, dist) * (0.12 + n2 * 0.1);
    base      += accent * aura;

    if (z2 > 0.5) {
      vec4  hex   = hexGrid(uvCentered * 5.0);
      vec2  gv    = hex.xy;
      vec2  hId   = hex.zw;
      float d     = hexDist(gv);
      float wave  = 0.5 + 0.5 * sin(hId.x * 0.7 - hId.y * 0.5 + uTime * 0.5);
      float outer = smoothstep(0.50, 0.47, d);
      float inner = smoothstep(0.47, 0.41, d);
      float ring  = outer - inner;
      float fill  = inner * wave * 0.04;
      base += accent2 * ring * (0.5 + 0.5 * wave) * 0.45;
      base += mid2 * fill;
    }

    // Seam lines only on cover pass (in front of 3D content — always visible)
    gl_FragColor = vec4(base, 1.0);
  }
`

export class Background {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(2, 2)

    // Shared uniform values — both materials reference the same objects
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
