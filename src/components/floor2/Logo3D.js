import * as THREE from 'three'
import gsap from 'gsap'

const vertexShader = `
  out vec3 vNormal;
  out vec3 vViewDir;
  out vec3 vNormalView;
  out vec2 vUv;
  out vec4 vClipPos;

  void main() {
    vUv         = uv;
    vec4 mvPos  = modelViewMatrix * vec4(position, 1.0);
    vNormal     = normalize(normalMatrix * normal);
    vNormalView = normalize((normalMatrix * normal).xyz);
    vViewDir    = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
    vClipPos    = gl_Position;
  }
`

const fragmentShader = `
  precision highp float;
  in vec3 vNormal;
  in vec3 vViewDir;
  in vec3 vNormalView;
  in vec2 vUv;
  in vec4 vClipPos;
  uniform float uTime;
  uniform float uEnterAlpha;
  uniform vec2  uMouse;
  uniform float uMouseStrength;
  uniform sampler2D uVideoTex;
  out vec4 fragColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1,0)), f.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }

  vec2 ghash(vec2 p) {
    vec2 k = vec2(0.3183099, 0.3678794);
    p = p * k + k.yx;
    return -1.0 + 2.0 * fract(16.0 * k * fract(p.x * p.y * (p.x + p.y)));
  }
  vec3 gnoise(vec2 p) {
    vec2 i  = floor(p);
    vec2 f  = fract(p);
    vec2 u  = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    vec2 ga = ghash(i); vec2 gb = ghash(i + vec2(1,0));
    vec2 gc = ghash(i + vec2(0,1)); vec2 gd = ghash(i + vec2(1,1));
    float va = dot(ga, f);
    float vb = dot(gb, f - vec2(1,0));
    float vc = dot(gc, f - vec2(0,1));
    float vd = dot(gd, f - vec2(1,1));
    vec2 deriv = ga + u.x*(gb-ga) + u.y*(gc-ga) + u.x*u.y*(ga-gb-gc+gd)
               + du * (u.yx*(va-vb-vc+vd) + vec2(vb-va, vc-va));
    return vec3(va + u.x*(vb-va) + u.y*(vc-va) + u.x*u.y*(va-vb-vc+vd), deriv);
  }

  void main() {
    vec3  gn        = gnoise(vUv * 30.0 + uTime * 0.06);
    float roughness = gn.x * 0.5 + 0.5;

    float NdotV   = max(dot(vNormal, vViewDir), 0.0);
    float fresnel = pow(1.0 - NdotV, mix(3.2, 1.6, roughness));
    float rimR    = length(vNormalView.xy);
    float rim     = smoothstep(0.3, 1.0, rimR);

    vec2 screenUV  = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
    vec2 refractUV = (screenUV - 0.5) * 2.0 + 0.5 + vNormalView.xy * 0.035
                   + gn.yz * roughness * 0.010;
    float dofRadius = pow(1.0 - NdotV, 1.8) * 0.032;
    vec3 video = texture(uVideoTex, refractUV).rgb;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      video += texture(uVideoTex, refractUV + vec2(cos(a), sin(a)) * dofRadius).rgb;
    }
    video /= 13.0;

    vec3 col = mix(video, vec3(0.04, 0.01, 0.02), 0.22);

    float angle    = atan(vNormalView.y, vNormalView.x);
    float rimRight = smoothstep(-0.5, 0.6, angle) * smoothstep(1.8, 0.6, angle);
    float rimTop   = smoothstep(0.6, 1.5, angle) * smoothstep(3.2, 1.5, angle);
    float edgeLine = smoothstep(0.78, 0.95, rimR) * smoothstep(1.0, 0.90, rimR);
    col += vec3(0.75, 0.06, 0.10) * rim * rimRight * 1.0;
    col += vec3(0.80, 0.75, 0.72) * rim * rimTop   * 0.5;
    col += vec3(0.95, 0.88, 0.86) * edgeLine * 0.8;

    float mDist = length(screenUV - uMouse);
    float halo  = smoothstep(0.28, 0.0, mDist) * uMouseStrength;
    col += vec3(0.80, 0.10, 0.14) * halo * (0.5 + rim * 0.5);

    float n1    = noise(screenUV * 4.0 + uTime * 0.08);
    float n2    = noise(screenUV * 8.0  - uTime * 0.15) * 0.5;
    float grain = smoothstep(0.30, 0.75, (n1 + n2) / 1.5);
    float faceW = 1.0 - smoothstep(0.0, 0.50, rim);

    float alpha    = mix(0.10, 1.0, max(fresnel, edgeLine * 0.9));
    float cutAlpha = mix(0.0, alpha, grain * faceW + (1.0 - faceW));
    fragColor = vec4(col, cutAlpha * uEnterAlpha);
  }
`

export class Logo3D {
  constructor(scene, gltf, videoTex = null) {
    this._scene      = scene.instance
    this._group      = new THREE.Group()
    this._mats       = []
    this._ready      = false
    this._enterProxy = { v: 0 }
    this._mouse      = new THREE.Vector2(0.5, 0.5)
    this._mouseStrength      = 0
    this._mouseStrengthTarget = 0

    if (!videoTex) {
      const fb = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat)
      fb.needsUpdate = true
      videoTex = fb
    }
    this._videoTex = videoTex

    window.addEventListener('mousemove', (e) => {
      this._mouse.x = e.clientX / window.innerWidth
      this._mouse.y = 1.0 - e.clientY / window.innerHeight
      this._mouseStrengthTarget = 1
    })

    this._scene.add(this._group)
    if (gltf) this._applyGLTF(gltf)
    window.addEventListener('resize', () => this._applyScale())
  }

  _applyScale() {
    const aspect = window.innerWidth / window.innerHeight
    const s = aspect < 1 ? Math.max(0.50, aspect * 0.90) : 1.0
    this._group.scale.setScalar(s)
  }

  _applyGLTF(gltf) {
    const model  = gltf.scene.clone(true)
    const box    = new THREE.Box3().setFromObject(model)
    const size   = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    const maxDim = Math.max(size.x, size.y, size.z)
    const scale  = 1.0 / maxDim
    model.scale.setScalar(scale)
    model.position.sub(center.multiplyScalar(scale))

    model.traverse(child => {
      if (!child.isMesh) return
      const mat = new THREE.ShaderMaterial({
        glslVersion:    THREE.GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime:          { value: 0 },
          uEnterAlpha:    { value: 0 },
          uMouse:         { value: new THREE.Vector2(0.5, 0.5) },
          uMouseStrength: { value: 0 },
          uVideoTex:      { value: this._videoTex },
        },
        transparent: true,
        side:        THREE.DoubleSide,
        depthWrite:  false,
      })
      child.material = mat
      this._mats.push(mat)
    })

    this._group.add(model)
    this._applyScale()
    this._ready = true

    gsap.to(this._enterProxy, {
      v: 1, duration: 1.6, delay: 0.3, ease: 'power2.out',
      onUpdate: () => {
        this._mats.forEach(m => { m.uniforms.uEnterAlpha.value = this._enterProxy.v })
      },
    })
  }

  update({ elapsed, progress = 0, camY = 0, vertScale = 7 }) {
    if (!this._ready) return
    if (this._videoTex) this._videoTex.needsUpdate = true

    this._group.position.y = -(camY + 4.5) * 2 / vertScale
    this._group.rotation.y = Math.PI + progress * Math.PI * 2

    this._mouseStrengthTarget *= 0.88
    this._mouseStrength += (this._mouseStrengthTarget - this._mouseStrength) * 0.12

    this._mats.forEach(m => {
      m.uniforms.uTime.value          = elapsed
      m.uniforms.uMouse.value.copy(this._mouse)
      m.uniforms.uMouseStrength.value = this._mouseStrength
    })
  }

  destroy() {
    this._group.traverse(child => {
      if (child.isMesh) { child.geometry.dispose(); child.material.dispose() }
    })
    this._scene.remove(this._group)
  }
}
