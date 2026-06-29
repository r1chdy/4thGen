import * as THREE from 'three'

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const FRAG = `
  uniform sampler2D tDiffuse;
  uniform float     uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    // CRT barrel distortion
    vec2 bc  = (vUv - 0.5) * 2.0;
    bc      *= 1.0 + dot(bc, bc) * 0.018;
    vec2 uv  = bc * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Chromatic aberration — RGB split horizontally
    float ca = 0.004;
    float r  = texture2D(tDiffuse, uv + vec2( ca, 0.0)).r;
    float g  = texture2D(tDiffuse, uv              ).g;
    float b  = texture2D(tDiffuse, uv - vec2( ca, 0.0)).b;
    float a  = texture2D(tDiffuse, uv              ).a;
    vec4 col = vec4(r, g, b, a);

    // Scanlines
    float scan = sin(vUv.y * 480.0 * 3.14159) * 0.5 + 0.5;
    col.rgb   *= 0.92 + 0.08 * scan;

    // Film grain (only where content exists)
    float grain = (hash(vUv + fract(uTime * 0.13)) - 0.5) * 0.055;
    col.rgb    += grain * col.a;

    // Subtle CRT flicker
    col.rgb *= 0.974 + 0.026 * fract(sin(uTime * 31.7) * 1000.0);

    // Contrast boost
    col.rgb = clamp((col.rgb - 0.5) * 1.08 + 0.5, 0.0, 1.0);

    gl_FragColor = col;
  }
`

export class RetroFilter {
  constructor(renderer, godRayBloom) {
    this._gl     = renderer
    this._godRay = godRayBloom

    const W = window.innerWidth
    const H = window.innerHeight

    this._rt = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })

    this._uniforms = {
      tDiffuse: { value: this._rt.texture },
      uTime:    { value: 0 },
    }

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms:       this._uniforms,
        vertexShader:   VERT,
        fragmentShader: FRAG,
        transparent:    true,
        depthTest:      false,
        depthWrite:     false,
      })
    )
    mesh.frustumCulled = false
    this._scene = new THREE.Scene()
    this._scene.add(mesh)
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    window.addEventListener('resize', () => this._rt.setSize(window.innerWidth, window.innerHeight))
  }

  render(elapsed) {
    this._godRay.render(this._rt)
    this._uniforms.uTime.value = elapsed
    this._gl.setRenderTarget(null)
    this._gl.clearDepth()
    this._gl.render(this._scene, this._cam)
  }

  destroy() {
    this._rt.dispose()
  }
}
