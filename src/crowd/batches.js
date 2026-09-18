import * as THREE from 'three';

// Render all rigid character parts with one draw call per shared geometry.
// The off-scene bone trees stay independently poseable; their world matrices
// become instance matrices, and shirt/skin/hair variation uses instance colors.
export function createCrowdBatches(root, characters) {
  const groups = new Map();
  for (const character of characters) character.traverse(part => {
    if (!part.isMesh) return;
    let group = groups.get(part.geometry);
    if (!group) { group = []; groups.set(part.geometry, group); }
    group.push(part);
  });
  const material = new THREE.MeshStandardMaterial({ roughness: 0.78 });
  const batches = [];
  for (const [geometry, parts] of groups) {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = 'crowd:parts';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.frustumCulled = false; // Small bounded lobby; gestures change bounds every frame.
    for (let i = 0; i < parts.length; i++) mesh.setColorAt(i, parts[i].material.color);
    mesh.instanceColor.needsUpdate = true;
    root.add(mesh);
    batches.push({ mesh, parts });
  }
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    update() {
      for (const character of characters) character.updateMatrixWorld(true);
      for (const batch of batches) {
        for (let i = 0; i < batch.parts.length; i++) {
          const part = batch.parts[i];
          let visible = true;
          for (let parent = part; parent !== null; parent = parent.parent) {
            if (!parent.visible) { visible = false; break; }
          }
          batch.mesh.setMatrixAt(i, visible ? part.matrixWorld : hidden);
        }
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      for (const { mesh } of batches) { root.remove(mesh); mesh.dispose(); }
      // Geometry is shared with buildMii / avatar-maker and stays in its cache.
      material.dispose();
    },
  };
}
