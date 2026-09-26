// Three.js r128 is loaded at runtime from a CDN (see WorldClient.tsx /
// LandingPage.tsx), not bundled from npm, so `window.THREE` has no types of
// its own. These are types only — `import type` is erased at compile time,
// so nothing from the `three` package ends up in the bundle. The versions
// match: @types/three is pinned to 0.128.x, the same r128 the CDN serves.
import type * as ThreeNS from "three";
import type { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer";

// The CDN's examples/js/renderers/CSS2DRenderer.js attaches these to the
// global THREE object rather than exporting them.
export type ThreeGlobal = typeof ThreeNS & {
  CSS2DObject: typeof CSS2DObject;
  CSS2DRenderer: typeof CSS2DRenderer;
};

export type { ThreeNS };

export function getThree(): ThreeGlobal | undefined {
  return (window as unknown as { THREE?: ThreeGlobal }).THREE;
}
