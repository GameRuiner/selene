import * as THREE from 'three';

export type ResourceRegistry = {
  geometry<T extends THREE.BufferGeometry>(resource: T): T;
  material<T extends THREE.Material>(resource: T): T;
  texture<T extends THREE.Texture>(resource: T): T;
  dispose(): void;
};

export function createResourceRegistry(): ResourceRegistry {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let disposed = false;
  return {
    geometry<T extends THREE.BufferGeometry>(resource: T) { geometries.add(resource); return resource; },
    material<T extends THREE.Material>(resource: T) { materials.add(resource); return resource; },
    texture<T extends THREE.Texture>(resource: T) { textures.add(resource); return resource; },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach((resource) => resource.dispose());
      materials.forEach((resource) => resource.dispose());
      textures.forEach((resource) => resource.dispose());
    },
  };
}

export function loadSrgbTexture(loader: THREE.TextureLoader, renderer: THREE.WebGLRenderer, registry: ResourceRegistry, url: string, onError: () => void): THREE.Texture {
  const texture = loader.load(url, undefined, undefined, onError);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return registry.texture(texture);
}
