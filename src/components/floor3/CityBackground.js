import * as THREE from 'three'

const vert = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vWorldY;
  varying vec4  vClipPos;
  void main() {
    vUv      = uv;
    vNormal  = normalize(normalMatrix * normal);
    vWorldY  = (modelMatrix * vec4(position, 1.0)).y;
    vec4 mv  = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    vClipPos = projectionMatrix * mv;
    gl_Position = vClipPos;
  }
`

const frag = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vWorldY;
  varying vec4  vClipPos;

  void main() {
    // Floor3 boundary clip — mirrors Background.js tilted zone (FLOOR2_Y = -9.0)
    vec2 sUV    = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
    float tiltY = vWorldY + (sUV.x - 0.5) * 1.5;
    if (tiltY >= -9.0) discard;

    if (abs(vNormal.y) > 0.5) { gl_FragColor = vec4(0.0); return; }

    // Silhouette body — dark but slightly visible
    vec3 col = vec3(0.018, 0.016, 0.028);

    // Backlight rim: stronger spread, more visible
    float NdotV = max(0.0, dot(vNormal, vViewDir));
    float rim   = pow(1.0 - NdotV, 2.2);

    // Red backlight — matches floor3 background tone
    vec3 rimCol = vec3(0.90, 0.06, 0.08);

    col += rim * rimCol * 1.6;

    // Fade base
    float alpha = smoothstep(0.0, 0.06, vUv.y);
    gl_FragColor = vec4(col, alpha);
  }
`

const _mat = new THREE.ShaderMaterial({
  vertexShader:   vert,
  fragmentShader: frag,
  transparent: true,
  depthWrite:  true,
  side:        THREE.FrontSide,
})

// [angle_rad, radius, width, height, depth]
function buildRingDefs() {
  const defs = []

  // Inner ring — r=18, 7 buildings
  const iR = 18, iN = 7
  for (let i = 0; i < iN; i++) {
    const a = (i / iN) * Math.PI * 2
    defs.push([a, iR, 3.0 + (i % 2) * 1.5, 12 + (i % 3) * 4, 2.5])
  }
  // Mid ring — r=28, 9 buildings
  const mR = 28, mN = 9
  for (let i = 0; i < mN; i++) {
    const a = (i / mN) * Math.PI * 2 + 0.18
    defs.push([a, mR, 3.5 + (i % 3) * 1.0, 16 + (i % 4) * 2, 3.0])
  }
  // Outer ring — r=42, 8 buildings (tallest)
  const oR = 42, oN = 8
  for (let i = 0; i < oN; i++) {
    const a = (i / oN) * Math.PI * 2 + 0.40
    defs.push([a, oR, 4.5 + (i % 2) * 2.0, 20 + (i % 3) * 4, 4.0])
  }

  return defs
}

const Y_CENTER = -25

export class CityBackground {
  constructor(scene) {
    this._group = new THREE.Group()
    scene.instance.add(this._group)
    this._build()
  }

  _build() {
    buildRingDefs().forEach(([angle, r, w, h, d]) => {
      const x = r * Math.sin(angle)
      const z = -r * Math.cos(angle)
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), _mat)
      mesh.position.set(x, Y_CENTER, z)
      mesh.rotation.y = Math.PI - angle  // front face points toward Y axis
      mesh.renderOrder = -1
      this._group.add(mesh)
    })
  }

  update() {}

  destroy() {
    this._group.traverse(c => {
      if (!c.isMesh) return
      c.geometry.dispose()
    })
    _mat.dispose()
    this._group.parent?.remove(this._group)
  }
}
