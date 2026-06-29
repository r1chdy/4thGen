import * as THREE from 'three'

const COUNT = 5000

const VERT = `
  attribute float aSize;
  attribute float aBright;
  attribute float aRed;
  varying float   vBright;
  varying float   vRed;
  varying vec2    vScreenUV;

  void main() {
    vBright = aBright;
    vRed    = aRed;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vec4 clip  = projectionMatrix * mvPos;
    vScreenUV  = clip.xy / clip.w * 0.5 + 0.5;
    gl_PointSize = clamp(aSize / -mvPos.z, 0.5, 32.0);
    gl_Position  = clip;
  }
`

const FRAG = `
  varying float vBright;
  varying float vRed;
  varying vec2  vScreenUV;
  uniform float uCamY;
  uniform float uVertScale;
  uniform float uFloorMin;
  uniform float uFloorMax;

  void main() {
    float worldY  = uCamY + (vScreenUV.y - 0.5) * uVertScale;
    float tiltedY = worldY + (vScreenUV.x - 0.5) * 1.5;
    if (tiltedY < uFloorMin) discard;
    if (tiltedY >= uFloorMax) discard;

    vec2  uv = gl_PointCoord - 0.5;
    float d  = length(uv);
    if (d > 0.5) discard;

    float alpha = smoothstep(0.5, 0.1, d) * vBright;
    vec3 white = vec3(1.0, 0.97, 0.94);
    vec3 red   = vec3(0.86, 0.21, 0.21);
    gl_FragColor = vec4(mix(white, red, vRed), alpha);
  }
`

export class Stars {
  constructor(scene, { floorMin = 0.0, floorMax = 999.0, renderOrder = -2 } = {}) {
    const pos    = new Float32Array(COUNT * 3)
    const size   = new Float32Array(COUNT)
    const bright = new Float32Array(COUNT)
    const red    = new Float32Array(COUNT)

    for (let i = 0; i < COUNT; i++) {
      // Uniform sphere distribution
      const u     = Math.random()
      const v     = Math.random()
      const theta = u * Math.PI * 2
      const phi   = Math.acos(2 * v - 1)
      const r     = 14 + Math.random() * 38  // 14–52 units from origin

      pos[i * 3    ] = Math.sin(phi) * Math.cos(theta) * r
      pos[i * 3 + 1] = Math.cos(phi) * r
      pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r

      const t = Math.random()
      size[i] = t < 0.65 ? 60 + Math.random() * 40
               : t < 0.88 ? 130 + Math.random() * 80
               :              260 + Math.random() * 140

      bright[i] = 0.25 + Math.random() * 0.75
      red[i]    = Math.random()
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos,    3))
    geo.setAttribute('aSize',    new THREE.BufferAttribute(size,   1))
    geo.setAttribute('aBright',  new THREE.BufferAttribute(bright, 1))
    geo.setAttribute('aRed',     new THREE.BufferAttribute(red,    1))

    this._uniforms = {
      uCamY:      { value: 0 },
      uVertScale: { value: 7 },
      uFloorMin:  { value: floorMin },
      uFloorMax:  { value: floorMax },
    }

    this._points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms:       this._uniforms,
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    }))
    this._points.renderOrder = renderOrder
    scene.instance.add(this._points)
  }

  update({ camY = 0, vertScale = 7 }) {
    this._uniforms.uCamY.value      = camY
    this._uniforms.uVertScale.value = vertScale
  }

  destroy() {
    this._points.geometry.dispose()
    this._points.material.dispose()
    this._points.parent?.remove(this._points)
  }
}
