
function llaToECEF(lon, lat, alt) {
  const a = 6378137.0;
  const e2 = 0.00669437999014;
  
  const radLat = lat * Math.PI / 180;
  const radLon = lon * Math.PI / 180;
  
  const N = a / Math.sqrt(1 - e2 * Math.sin(radLat) * Math.sin(radLat));
  
  const x = (N + alt) * Math.cos(radLat) * Math.cos(radLon);
  const y = (N + alt) * Math.cos(radLat) * Math.sin(radLon);
  const z = (N * (1 - e2) + alt) * Math.sin(radLat);
  
  return [x, y, z];
}

const configCenter = { lon: 47.171, lat: 55.770, alt: 115 };
const rootSphere = [2444680.234246, 2637325.879016, 5250179.310926];

const ecef = llaToECEF(configCenter.lon, configCenter.lat, configCenter.alt);

console.log('Config ECEF:', ecef);
console.log('Root Sphere:', rootSphere);

const dx = ecef[0] - rootSphere[0];
const dy = ecef[1] - rootSphere[1];
const dz = ecef[2] - rootSphere[2];
const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

console.log('Distance:', dist);
