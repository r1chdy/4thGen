import * as THREE from 'three'

const VERT = `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = `
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform vec3  uCenter;
  uniform vec3  uRadii;
  uniform mat3  uRotMat;

  float hash3(vec3 p) {
    p = fract(p * vec3(127.1, 311.7, 74.7));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i),             hash3(i+vec3(1,0,0)), f.x),
          mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x),
          mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm4(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise3(p); p = p*2.1 + vec3(1.7,9.2,5.4); a *= 0.5; }
    return v;
  }

  // Ellipsoid ray intersection — returns (tNear, tFar), or (-1,-1) if miss
  vec2 ellipsoidHit(vec3 ro, vec3 rd, vec3 c, vec3 r) {
    vec3 oc = (ro - c) / r;
    vec3 dc = rd / r;
    float a  = dot(dc, dc);
    float b  = dot(oc, dc);
    float cv = dot(oc, oc) - 1.0;
    float disc = b*b - a*cv;
    if (disc < 0.0) return vec2(-1.0);
    float sq = sqrt(disc);
    return vec2((-b - sq) / a, (-b + sq) / a);
  }

  float puff(vec3 lp, vec3 c, vec3 r) {
    vec3 d = (lp - c) / r;
    float len = length(d);
    if (len > 1.0) return 0.0;
    float core    = pow(1.0 - len, 0.8);
    float surface = fbm4(d * 2.2 + uTime * 0.005);
    return core * max(0.0, surface - 0.02) * 6.0;
  }

  float sampleDens(vec3 wp) {
    vec3 lp = uRotMat * (wp - uCenter);
    float d = puff(lp, vec3(  0.0,  0.0,  0.0), vec3(4.2, 2.8, 2.5));
    d += puff(lp, vec3( -3.2,  0.3,  0.2),      vec3(2.8, 1.8, 2.2));
    d += puff(lp, vec3(  3.4,  0.1, -0.2),      vec3(3.1, 1.6, 1.8));
    d += puff(lp, vec3( -5.8,  0.2,  0.1),      vec3(2.4, 1.4, 1.6));
    d += puff(lp, vec3(  6.0, -0.2,  0.2),      vec3(2.0, 2.2, 1.5));
    d += puff(lp, vec3( -7.8, -0.1,  0.0),      vec3(1.8, 1.2, 2.0));
    d += puff(lp, vec3(  7.6, -0.4,  0.1),      vec3(2.2, 1.0, 1.4));
    d += puff(lp, vec3(  0.6,  2.2, -0.3),      vec3(1.6, 2.4, 1.5));
    d += puff(lp, vec3( -2.2,  1.9,  0.4),      vec3(2.0, 1.5, 1.8));
    d += puff(lp, vec3(  3.0,  1.7,  0.2),      vec3(1.4, 2.0, 1.3));
    d += puff(lp, vec3( -0.2,  3.5, -0.1),      vec3(1.2, 1.8, 1.0));
    d += puff(lp, vec3( -1.8, -0.9,  0.6),      vec3(2.2, 1.3, 1.6));
    d += puff(lp, vec3(  2.0, -0.8,  0.3),      vec3(1.5, 1.8, 2.0));
    return min(d, 4.0);
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorldPos - cameraPosition);

    vec2 t = ellipsoidHit(ro, rd, uCenter, uRadii);
    if (t.y < 0.0) discard;
    float t0 = max(0.0, t.x);
    float t1 = t.y;
    if (t0 >= t1) discard;

    float stepSize = (t1 - t0) / 32.0;
    float transmittance = 1.0;
    vec3  scattered     = vec3(0.0);
    vec3  lightDir      = normalize(vec3(0.5, 1.5, -0.5));

    for (int i = 0; i < 32; i++) {
      vec3 p = ro + rd * (t0 + (float(i) + 0.5) * stepSize);
      float dens = sampleDens(p);
      if (dens < 0.005) continue;

      // Shadow march toward light
      float shadowD = 0.0;
      for (int j = 1; j <= 4; j++) {
        shadowD += sampleDens(p + lightDir * float(j) * 0.9) * 0.9;
      }
      float shadow = exp(-shadowD * 5.0);

      vec3 litColor = vec3(0.28, 0.03, 0.01)
                    + vec3(1.6,  0.32, 0.09) * shadow;

      scattered     += transmittance * litColor * dens * stepSize;
      transmittance *= exp(-dens * 10.0 * stepSize);
      if (transmittance < 0.004) break;
    }

    float alpha = (1.0 - transmittance);
    if (alpha < 0.002) discard;

    gl_FragColor = vec4(scattered, alpha);
  }
`

export class SpaceCloud {
  constructor(scene) {
    const center = new THREE.Vector3(14, 2.0, -45)
    const radii  = new THREE.Vector3(14, 10, 7)

    // Rotate ~25° around Z (tilt), ~10° around Y (depth angle)
    const az = -0.44, ay = 0.18
    const cz = Math.cos(az), sz = Math.sin(az)
    const cy = Math.cos(ay), sy = Math.sin(ay)
    const rotMat = new THREE.Matrix3().set(
       cz * cy,  -sz,  cz * sy,
       sz * cy,   cz,  sz * sy,
          -sy,    0,      cy
    )

    this._mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime:   { value: 0 },
        uCenter: { value: center },
        uRadii:  { value: radii },
        uRotMat: { value: rotMat },
      },
      transparent: true,
      depthTest:   false,
      depthWrite:  false,
      side:        THREE.DoubleSide,
      blending:    THREE.NormalBlending,
    })

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 24), this._mat)
    mesh.position.copy(center)
    mesh.frustumCulled = false
    mesh.renderOrder   = -3
    scene.instance.add(mesh)
  }

  update({ elapsed }) {
    this._mat.uniforms.uTime.value = elapsed
  }

  destroy() {
    this._mat.dispose()
  }
}
