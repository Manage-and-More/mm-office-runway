// The existing center-module slot now hosts a garden shaped by the supplied
// signet, rather than a floating logo sculpture. It stays on the plaza floor.
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { gardenFootprints, buildGarden } from './garden.js';

/** @type {import('../contracts/module.js').CreateModule} */
export default async function createGarden({ root, assetBase, reducedMotion, navigation }) {
  const svg = await new SVGLoader().loadAsync(new URL('manage-and-more-signet.svg', assetBase).href);
  return buildGarden(root, gardenFootprints(svg.paths), reducedMotion, navigation);
}
