import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, Mesh, ShaderMaterial, type Quaternion, type Object3D, type Texture } from 'three'
import { Batch, M, tqs } from '../batch'
import { billboardQuad } from '../geo/bomb'
import { softQuadMaterial } from '../materials'
import { SUNSHINE } from '../palette'
import type { GroundMarks } from './ground-marks'

/**
 * 帽王聚光灯（design §9.3，玩具世界口径）：半透明开口锥体（顶 0.35 → 底 0.9、高 9）+ 纵向渐变叠加 +
 * 12 粒上浮光尘 + 地面旋转金色虚线圈。与大补给光柱靠轮廓 + 图标（皇冠）区分。终局更亮更粗。
 */
export const SPOT_VERT = /* glsl */ `
varying float vH;
varying vec3 vN;
varying vec3 vView;
void main() {
  vH = uv.y;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
export const SPOT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uTime;
varying float vH;
varying vec3 vN;
varying vec3 vView;
void main() {
  float fall = pow(1.0 - vH, 1.4);
  float rim = 1.0 - abs(dot(normalize(vN), vView));
  float bands = 0.85 + 0.15 * sin(vH * 30.0 - uTime * 3.0);
  float a = (0.12 + 0.28 * fall) * (0.55 + 0.45 * rim) * bands * uStrength;
  gl_FragColor = vec4(uColor * a, a);
  #include <colorspace_fragment>
}
`

export class Spotlight {
  private readonly cone: Mesh
  private readonly mat: ShaderMaterial
  private readonly motes: Batch
  private readonly moteColor = new Color(0xfff4c2)
  private visible = 0

  constructor(scene: Object3D, radial: Texture) {
    const geo = new CylinderGeometry(0.35, 0.9, 9, 32, 1, true)
    geo.translate(0, 4.5, 0)
    this.mat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(0xfff4c2) }, uStrength: { value: 1 }, uTime: { value: 0 } },
      vertexShader: SPOT_VERT,
      fragmentShader: SPOT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    })
    this.mat.toneMapped = false
    this.cone = new Mesh(geo, this.mat)
    this.cone.renderOrder = 6
    this.cone.visible = false
    scene.add(this.cone)
    this.motes = new Batch(billboardQuad(), softQuadMaterial(radial, true), 12, { tint: true, renderOrder: 7 })
    scene.add(this.motes.mesh)
  }

  /** active = 帽王存在且 ≥ 阈值且活着。fade in/out 0.3 s。 */
  update(active: boolean, x: number, z: number, now: number, dt: number, endgame: boolean, camQuat: Quaternion, marks: GroundMarks): void {
    this.visible = Math.max(0, Math.min(1, this.visible + (active ? dt / 0.3 : -dt / 0.3)))
    this.motes.begin()
    if (this.visible <= 0) {
      this.cone.visible = false
      this.motes.end()
      return
    }
    const t = now / 1000
    const strength = this.visible * (endgame ? 1.5 : 1)
    const width = endgame ? 1.25 : 1
    this.cone.visible = true
    this.cone.position.set(x, 0, z)
    this.cone.scale.set(width, 1, width)
    this.cone.rotation.y = t * 0.4
    this.mat.uniforms.uStrength.value = strength
    this.mat.uniforms.uTime.value = t
    for (let i = 0; i < 12; i++) {
      const h = ((t * 0.5 + i / 12) % 1) * 7.5
      const a = i * 2.39996 + t * 0.6
      const r = (0.3 + 0.25 * ((i * 7) % 5) / 5) * width
      const idx = this.motes.push(tqs(M, x + Math.sin(a) * r, 0.4 + h, z + Math.cos(a) * r, camQuat, 0.12, 0.12, 1))
      const fade = Math.sin((h / 7.5) * Math.PI) * strength
      this.motes.tint(idx, this.moteColor.r, this.moteColor.g, this.moteColor.b, fade * 0.8)
    }
    this.motes.end()
    marks.dashedRing(x, z, 1.7 * width, SUNSHINE, 0.9 * this.visible, t * 0.9)
    marks.glowAt(x, z, 2.2 * width, 0.35 * strength, 0.3 * strength, 0.12 * strength, 1)
  }
}
