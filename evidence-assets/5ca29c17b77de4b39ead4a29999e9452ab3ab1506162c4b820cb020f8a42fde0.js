// Map movement follows physical east/north coordinates, never array order.
export function resolvePatch(patches, id) {
  return patches.find(p => p.id === id) || patches.find(p => p.dxM === 0 && p.dyM === 0) || patches[0];
}
export function adjacentPatch(patches, id, key) {
  const current = resolvePatch(patches, id);
  if (!current) return null;
  const direction = {ArrowUp:[0,1],ArrowDown:[0,-1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[key];
  if (!direction) return current;
  const [east,north] = direction;
  const neighbors = patches.filter(p => east
    ? p.dyM === current.dyM && (p.dxM-current.dxM)*east > 0
    : p.dxM === current.dxM && (p.dyM-current.dyM)*north > 0);
  return neighbors.sort((a,b) => Math.abs(a.dxM-current.dxM)+Math.abs(a.dyM-current.dyM)-Math.abs(b.dxM-current.dxM)-Math.abs(b.dyM-current.dyM))[0] || current;
}
