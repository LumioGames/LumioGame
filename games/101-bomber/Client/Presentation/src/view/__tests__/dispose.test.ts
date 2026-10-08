import { describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, ShaderMaterial, Texture } from 'three'
import { disposeSceneResources } from '../dispose'

describe('presentation scene disposal', () => {
  it('releases shared mesh resources once and includes shader textures', () => {
    const root = new Group()
    const geometry = new BoxGeometry()
    const texture = new Texture()
    const material = new MeshBasicMaterial({ map: texture })
    const shaderTexture = new Texture()
    const shader = new ShaderMaterial({ uniforms: { map: { value: shaderTexture } } })
    root.add(new Mesh(geometry, material), new Mesh(geometry, material), new Mesh(geometry, shader))
    const disposed = [geometry, texture, material, shaderTexture, shader].map((resource) => vi.spyOn(resource, 'dispose'))
    disposeSceneResources(root)
    for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1)
  })
})
