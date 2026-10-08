import { BufferGeometry, InstancedMesh, Material, Mesh, Texture, type Object3D } from 'three'

/** Release scene-owned GPU allocations once, including shared instance materials. */
export function disposeSceneResources(root: Object3D): void {
  const geometry = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    geometry.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    if (object instanceof InstancedMesh) object.dispose()
  })
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value)
    if ('uniforms' in material) {
      for (const uniform of Object.values(material.uniforms as Record<string, { value: unknown }>)) {
        if (uniform.value instanceof Texture) textures.add(uniform.value)
      }
    }
    material.dispose()
  }
  for (const item of geometry) item.dispose()
  for (const texture of textures) texture.dispose()
}
