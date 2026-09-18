import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { GARDEN_RADIUS } from '../contracts/module.js';

function randomSource() {
  let seed = 6181;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function inside(point, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}
function edgeDistance(point, polygon) {
  let distance2 = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    distance2 = Math.min(distance2, (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2);
  }
  return Math.sqrt(distance2);
}

// Sample the supplied SVG curves, keeping all separate sections and holes.
// SVG Y points down; negate it here, then lay the geometry onto the XZ floor.
export function gardenFootprints(paths) {
  const source = paths.flatMap(path => SVGLoader.createShapes(path));
  if (!source.length) throw new Error('The garden SVG contains no planting contours.');
  const extracted = source.map(shape => shape.extractPoints(10));
  const bounds = new THREE.Box2();
  for (const shape of extracted) for (const p of shape.shape) bounds.expandByPoint(p);
  const center = bounds.getCenter(new THREE.Vector2());
  let radius = 0;
  for (const shape of extracted) for (const p of shape.shape) radius = Math.max(radius, p.distanceTo(center));
  const scale = (GARDEN_RADIUS - 0.20) / radius;
  const transform = p => new THREE.Vector2((p.x - center.x) * scale, -(p.y - center.y) * scale);
  return extracted.map(points => {
    const contour = points.shape.map(transform);
    const holes = points.holes.map(hole => hole.map(transform));
    const shape = new THREE.Shape(contour);
    for (const hole of holes) shape.holes.push(new THREE.Path(hole));
    return { contour, holes, shape, bounds: new THREE.Box2().setFromPoints(contour) };
  });
}

export function buildGarden(root, footprints, reducedMotion = false, navigation) {
  const random = randomSource();
  const obstacles = footprints.map(bed => ({ contour: bed.contour.map(p => ({ x: p.x, z: -p.y })), holes: bed.holes.map(hole => hole.map(p => ({ x: p.x, z: -p.y }))) }));
  const geometries = new Set(), materials = new Set(), instances = [];
  const material = color => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 }); materials.add(m); return m; };
  const soil = material('#624b38'), stone = material('#ded6c7');
  const foliageMaterial = material('#ffffff');
  const soilGeometry = new THREE.ExtrudeGeometry(footprints.map(bed => bed.shape), { depth: 0.085, bevelEnabled: false, curveSegments: 10, steps: 1 });
  geometries.add(soilGeometry);
  const beds = new THREE.Mesh(soilGeometry, soil);
  beds.name = 'garden:soil-beds';
  beds.rotation.x = -Math.PI / 2; beds.position.y = 0.025;
  beds.castShadow = beds.receiveShadow = true; root.add(beds);
  // Follow every contour with a low rounded stone curb, rather than a sign face.
  for (const bed of footprints) for (const outline of [bed.contour, ...bed.holes]) {
    const path = new THREE.CurvePath();
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      if (a.distanceToSquared(b) < 1e-10) continue;
      path.add(new THREE.LineCurve3(new THREE.Vector3(a.x, 0.105, -a.y), new THREE.Vector3(b.x, 0.105, -b.y)));
    }
    const geometry = new THREE.TubeGeometry(path, Math.max(48, outline.length), 0.028, 6, true);
    geometries.add(geometry);
    const curb = new THREE.Mesh(geometry, stone); curb.name = 'garden:stone-edging';
    curb.castShadow = curb.receiveShadow = true; root.add(curb);
  }

  const shrubParts = [], grassParts = [], flowerParts = [], stemParts = [];
  const leaves = ['#4a7b42', '#66934e', '#7caa5b', '#376a48', '#92b56c'];
  const blooms = ['#fff5dc', '#f4b7c5', '#b6a0d7', '#f1c763'];
  const points = [];
  for (const bed of footprints) {
    // A jittered planting grid is repeatable, compact, and never fills the gaps.
    for (let x = bed.bounds.min.x; x <= bed.bounds.max.x; x += 0.135) for (let y = bed.bounds.min.y; y <= bed.bounds.max.y; y += 0.135) {
      const p = new THREE.Vector2(x + (random() - 0.5) * 0.04, y + (random() - 0.5) * 0.04);
      if (!inside(p, bed.contour) || bed.holes.some(hole => inside(p, hole))) continue;
      const clearance = Math.min(edgeDistance(p, bed.contour), ...bed.holes.map(hole => edgeDistance(p, hole)));
      if (clearance < 0.05) continue;
      points.push({ x: p.x, z: -p.y, clearance });
      const type = random(), height = 0.14 + random() * 0.20;
      const green = leaves[Math.floor(random() * leaves.length)];
      if (type < 0.50) {
        const radius = Math.min(clearance - 0.016, 0.07 + random() * 0.045);
        for (let lobe = 0; lobe < 3; lobe++) {
          const a = lobe / 3 * Math.PI * 2;
          shrubParts.push({ x: p.x + Math.cos(a) * radius * 0.25, y: 0.13 + height * 0.35, z: -p.y + Math.sin(a) * radius * 0.25, sx: radius * 0.78, sy: height * (0.42 + lobe * 0.08), sz: radius * 0.78, color: green, angle: random() * 6 });
        }
      } else if (type < 0.73) {
        for (let blade = 0; blade < 4; blade++) grassParts.push({ x: p.x, y: 0.11, z: -p.y, sx: 0.018, sy: height, sz: 0.018, color: green, angle: blade * 1.7 + random(), lean: 0.15 + random() * 0.30 });
      } else {
        stemParts.push({ x: p.x, y: 0.11 + height / 2, z: -p.y, sx: 0.009, sy: height, sz: 0.009, color: '#4d7544', angle: 0 });
        const color = blooms[Math.floor(random() * blooms.length)];
        for (let petal = 0; petal < 5; petal++) {
          const angle = petal / 5 * Math.PI * 2;
          flowerParts.push({ x: p.x + Math.cos(angle) * 0.024, y: 0.11 + height, z: -p.y + Math.sin(angle) * 0.024, sx: 0.027, sy: 0.014, sz: 0.027, color, angle });
        }
        flowerParts.push({ x: p.x, y: 0.12 + height, z: -p.y, sx: 0.018, sy: 0.014, sz: 0.018, color: '#e5b747', angle: 0 });
        shrubParts.push({ x: p.x + 0.018, y: 0.12 + height * 0.45, z: -p.y, sx: 0.036, sy: 0.013, sz: 0.025, color: green, angle: 0.4 });
      }
    }
  }
  const sphere = new THREE.IcosahedronGeometry(1, 1);
  const blade = new THREE.ConeGeometry(1, 1, 4); blade.translate(0, 0.5, 0);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 5);
  geometries.add(sphere); geometries.add(blade); geometries.add(cylinder);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  function batch(name, geometry, parts, sway = false) {
    if (!parts.length) return;
    const mesh = new THREE.InstancedMesh(geometry, foliageMaterial, parts.length);
    mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
    if (sway) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      dummy.position.set(part.x, part.y, part.z); dummy.scale.set(part.sx, part.sy, part.sz);
      dummy.rotation.set(part.lean ?? 0, part.angle, 0); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.set(part.color));
    }
    mesh.instanceMatrix.needsUpdate = mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.boundingSphere.radius += 0.1;
    root.add(mesh); instances.push({ mesh, parts, sway });
  }
  batch('garden:shrubs', sphere, shrubParts);
  batch('garden:grasses', blade, grassParts, true);
  batch('garden:flowers', sphere, flowerParts);
  batch('garden:stems', cylinder, stemParts);
  root.name = 'signet-garden';
  root.userData.plantCount = points.length;
  root.userData.bedCount = footprints.length;
  function openPath(x, z) {
    const p = new THREE.Vector2(x, -z);
    for (const bed of footprints) {
      if (inside(p, bed.contour) && !bed.holes.some(hole => inside(p, hole))) return false;
      if (edgeDistance(p, bed.contour) < 0.25 || bed.holes.some(hole => edgeDistance(p, hole) < 0.25)) return false;
    }
    return true;
  }
  const furniture = addGardenFurniture(root, geometries, materials, obstacles, openPath);
  addPerimeterNature(root, geometries, materials);
  root.userData.benches = furniture.benches;
  root.userData.lanterns = furniture.lanterns;
  let unregister = navigation?.register('garden', obstacles);
  const destinations = [];
  if (navigation) {
    const candidates = [...furniture.approaches];
    for (let x = -6.4; x <= 6.4; x += 0.65) for (let z = -6.4; z <= 6.4; z += 0.65) {
      if (Math.hypot(x, z) < 6.7 && openPath(x, z)) candidates.push({ x, z });
    }
    for (const place of candidates) {
      if (destinations.some(other => Math.hypot(other.x-place.x, other.z-place.z) < 1.4)) continue;
      if (navigation.findPath({x:9.8,z:0}, place)) destinations.push(place);
      if (destinations.length >= 18) break;
    }
    unregister();
    unregister = navigation.register('garden', obstacles, destinations);
  }
  root.userData.pathDestinations = destinations;
  const settings = { breeze: !reducedMotion };
  return {
    update({ time }) {
      if (!settings.breeze || reducedMotion) return;
      for (const instance of instances) {
        if (!instance.sway) continue;
        for (let i = 0; i < instance.parts.length; i++) {
          const p = instance.parts[i];
          dummy.position.set(p.x, p.y, p.z); dummy.scale.set(p.sx, p.sy, p.sz);
          dummy.rotation.set(p.lean + Math.sin(time * 1.1 + p.x * 3 + p.z) * 0.055, p.angle, 0);
          dummy.updateMatrix(); instance.mesh.setMatrixAt(i, dummy.matrix);
        }
        instance.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    debugUI(gui) {
      gui.add({ beds: footprints.length }, 'beds').name('Planting beds').disable();
      gui.add({ plants: points.length }, 'plants').name('Plants').disable();
      gui.add(settings, 'breeze').name('Gentle breeze');
    },
    dispose() {
      unregister?.();
      for (const { mesh } of instances) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const m of materials) m.dispose();
      root.clear();
    },
  };
}


function addGardenFurniture(root, geometries, materials, obstacles, openPath) {
  const wood = new THREE.MeshStandardMaterial({ color: '#b18658', roughness: 0.87 });
  const metal = new THREE.MeshStandardMaterial({ color: '#394c47', roughness: 0.6 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff0bf', emissive: '#ffc56b', emissiveIntensity: 0.65, roughness: 0.4 });
  materials.add(wood); materials.add(metal); materials.add(lamp);
  const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  geometries.add(box); geometries.add(cylinder);
  function part(group, geometry, material, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  const candidates = [], chosen = [], approaches = [];
  for (let x = -6; x <= 6; x += 0.30) for (let z = -6; z <= 6; z += 0.30) {
    if (Math.hypot(x,z) > 6.2 || Math.hypot(x,z) < 1.3) continue;
    const heading = Math.atan2(x,z) + Math.PI;
    let fits = true;
    for (const px of [-0.7,0,0.7]) for (const pz of [-0.4,0,0.75]) {
      if (!openPath(x+Math.cos(heading)*px+Math.sin(heading)*pz,z-Math.sin(heading)*px+Math.cos(heading)*pz)) fits=false;
    }
    if (fits) candidates.push({x,z,heading});
  }
  for (let i = 0; i < 4; i++) {
    const desiredAngle = Math.PI/4+i*Math.PI/2;
    candidates.sort((a,b) => Math.hypot(a.x-Math.sin(desiredAngle)*3.5,a.z-Math.cos(desiredAngle)*3.5)-Math.hypot(b.x-Math.sin(desiredAngle)*3.5,b.z-Math.cos(desiredAngle)*3.5));
    const place = candidates.find(p=>chosen.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>1.7));
    if (!place) continue;
    chosen.push(place);
    const {x,z,heading} = place, angle = heading-Math.PI;
    approaches.push({x:x+Math.sin(heading)*0.8,z:z+Math.cos(heading)*0.8});
    const bench = new THREE.Group(); bench.name = 'garden:bench';
    bench.position.set(x, 0, z); bench.rotation.y = angle + Math.PI;
    for (const side of [-1, 1]) part(bench, box, metal, side * 0.42, 0.2, 0, 0.06, 0.40, 0.38);
    for (let slat = 0; slat < 3; slat++) {
      part(bench, box, wood, 0, 0.42, (slat - 1) * 0.13, 1.12, 0.06, 0.115);
      part(bench, box, wood, 0, 0.60 + slat * 0.10, -0.20, 1.12, 0.08, 0.045);
    }
    root.add(bench);
    const contour = [[-0.60,-0.25],[0.60,-0.25],[0.60,0.25],[-0.60,0.25]].map(([px,pz]) => ({ x: x + Math.cos(bench.rotation.y)*px + Math.sin(bench.rotation.y)*pz, z: z - Math.sin(bench.rotation.y)*px + Math.cos(bench.rotation.y)*pz }));
    obstacles.push({ contour });
  }
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * Math.PI * 2;
    const x = Math.sin(angle) * 7.75, z = Math.cos(angle) * 7.75;
    const lantern = new THREE.Group(); lantern.name = 'garden:lantern'; lantern.position.set(x, 0, z);
    part(lantern, cylinder, metal, 0, 0.07, 0, 0.14, 0.14, 0.14);
    part(lantern, cylinder, metal, 0, 0.62, 0, 0.035, 1.18, 0.035);
    part(lantern, box, lamp, 0, 1.28, 0, 0.17, 0.24, 0.17);
    part(lantern, box, metal, 0, 1.44, 0, 0.25, 0.065, 0.25);
    part(lantern, box, metal, 0, 1.13, 0, 0.22, 0.04, 0.22);
    for (const sx of [-1,1]) for (const sz of [-1,1]) part(lantern, box, metal, sx*0.09, 1.28, sz*0.09, 0.016, 0.26, 0.016);
    root.add(lantern);
    obstacles.push({ contour: [{x:x-.16,z:z-.16},{x:x+.16,z:z-.16},{x:x+.16,z:z+.16},{x:x-.16,z:z+.16}] });
  }
  return { benches: chosen.length, lanterns: 6, approaches };
}


// Low planting islands, rounded trees and rocks occupy the empty rim outside
// the crowd's walking boundary. No billboard textures or extra point lights.
function addPerimeterNature(root, geometries, materials) {
  const random = randomSource();
  const sphere = new THREE.IcosahedronGeometry(1, 1), trunk = new THREE.CylinderGeometry(0.055,0.075,1,7), patch = new THREE.CircleGeometry(1,24);
  geometries.add(sphere); geometries.add(trunk); geometries.add(patch);
  const greens = ['#789761','#64935b','#82a96a','#4f7b4f'].map(color => new THREE.MeshStandardMaterial({color,roughness:1}));
  const stone = new THREE.MeshStandardMaterial({color:'#c9c4b8',roughness:1});
  const bark = new THREE.MeshStandardMaterial({color:'#947354',roughness:1});
  const flowers = new THREE.MeshStandardMaterial({color:'#efb7b8',roughness:1});
  for(const mat of [...greens,stone,bark,flowers])materials.add(mat);
  const group=new THREE.Group();group.name='garden:perimeter-landscaping';root.add(group);
  function mesh(geometry,mat,x,y,z,sx,sy,sz) {
    const part=new THREE.Mesh(geometry,mat);part.position.set(x,y,z);part.scale.set(sx,sy,sz);part.castShadow=part.receiveShadow=true;group.add(part);return part;
  }
  for(let i=0;i<22;i++) {
    const angle=i/22*Math.PI*2, radius=12.05+(i%3)*0.25;
    const x=Math.sin(angle)*radius,z=Math.cos(angle)*radius;
    const lawn=mesh(patch,greens[0],x,.018,z,.64,.48,1);lawn.rotation.x=-Math.PI/2;
    for(let shrub=0;shrub<4;shrub++) {
      const a=shrub/4*Math.PI*2, r=.26;
      mesh(sphere,greens[(i+shrub)%greens.length],x+Math.sin(a)*r,.22,z+Math.cos(a)*r,.20,.20+random()*.10,.22);
    }
    if(i%3===0) {
      mesh(trunk,bark,x,.47,z,1,.9,1);
      for(let lobe=0;lobe<3;lobe++)mesh(sphere,greens[(i+lobe)%greens.length],x+(lobe-1)*.22,1.05+(lobe%2)*.25,z,.37,.49,.38);
    } else if(i%3===1) {
      mesh(sphere,stone,x+.4,.12,z+.1,.22,.14,.19);
      mesh(sphere,stone,x+.15,.08,z-.4,.14,.09,.12);
    } else {
      for(let bloom=0;bloom<5;bloom++)mesh(sphere,flowers,x+(random()-.5)*.65,.32,z+(random()-.5)*.6,.055,.06,.055);
    }
  }
}
