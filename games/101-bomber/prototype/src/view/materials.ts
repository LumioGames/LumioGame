import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  ShaderMaterial,
  type Blending,
  type Texture,
} from 'three'

/**
 * 共享材质。整体口径（render-design §2）：高粗糙度塑料 / 毛毡感、不描边；
 * 铁皮与炸弹帽带一点金属 + 环境贴图。
 */

const softVert = /* glsl */ `
attribute vec4 aTint;
varying vec4 vTint;
varying vec2 vUv;
void main() {
  vTint = aTint;
  vUv = uv;
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}
`

const softFrag = /* glsl */ `
uniform sampler2D map;
varying vec4 vTint;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb * vTint.rgb, t.a * vTint.a);
  if (gl_FragColor.a < 0.003) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * 带每实例 `aTint`（线性 RGB + A）的贴图四边形材质：接触阴影、地面辉光、脚圈、火花、预览格。
 * 配合 {@link Batch} 的 `tint: true` 使用。
 */
export function softQuadMaterial(map: Texture, additive: boolean, opts: { depthTest?: boolean; toneMapped?: boolean } = {}): ShaderMaterial {
  const blending: Blending = additive ? AdditiveBlending : NormalBlending
  const m = new ShaderMaterial({
    uniforms: { map: { value: map } },
    vertexShader: softVert,
    fragmentShader: softFrag,
    transparent: true,
    depthWrite: false,
    depthTest: opts.depthTest ?? true,
    blending,
    side: DoubleSide,
  })
  m.toneMapped = opts.toneMapped ?? !additive
  return m
}

export interface SharedMaterials {
  /** 顶点色塑料（积木、木箱、装饰、帽子、糖果）。 */
  plastic: MeshStandardMaterial
  /** 顶点色 + 每实例色（积木四色轮换）。 */
  plasticTinted: MeshStandardMaterial
  /** 铁皮：顶点色，带金属感。 */
  tin: MeshStandardMaterial
  /** 炸弹壳 + 帽。 */
  bombShell: MeshStandardMaterial
  /** 每实例色的纯色塑料（炸弹色带、碎片、棉花）。 */
  solid: MeshStandardMaterial
  /** 棉花：不受光太多，保持白亮。 */
  cotton: MeshStandardMaterial
  /** 爆炸火球：每实例色 + 恒定橙色自发光。 */
  flame: MeshStandardMaterial
  /** 叠加辉光（炸弹危险红光）：每实例色，黑 = 不可见。 */
  glowAdd: MeshBasicMaterial
  /** 金色金属（糖果金环、皇冠）。 */
  gold: MeshStandardMaterial
  /** 纽扣眼：更亮的高光。 */
  eyes: MeshStandardMaterial
}

export function createSharedMaterials(): SharedMaterials {
  return {
    plastic: new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }),
    plasticTinted: new MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }),
    tin: new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.35 }),
    bombShell: new MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.3 }),
    solid: new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0 }),
    cotton: new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, emissive: new Color(0xfff6ea), emissiveIntensity: 0.35 }),
    flame: new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, emissive: new Color(0xff8a2a), emissiveIntensity: 0.75 }),
    glowAdd: new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    gold: new MeshStandardMaterial({ color: 0xffc93c, roughness: 0.3, metalness: 0.55 }),
    eyes: new MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0 }),
  }
}
