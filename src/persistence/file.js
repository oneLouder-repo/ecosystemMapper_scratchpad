export function exportMap(map) {
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(map.name || 'map').replace(/[^\w-]+/g, '-').toLowerCase()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importMap(file) {
  const map = JSON.parse(await file.text());
  if (!map || typeof map.actors !== 'object' || typeof map.connectors !== 'object' || !Array.isArray(map.layers)) {
    throw new Error('it is not an ecosystem map');
  }
  return map;
}
