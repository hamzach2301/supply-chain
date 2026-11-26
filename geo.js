// Geographic registry for the Algeria-focused network.
// Kept separate from the regression implementation so routing data has one source of truth.
// Outline: simplified Natural Earth country polygon for Algeria (public domain), rounded to 4 decimals.
const ALGERIA_OUTLINE = [
  [11.9995,23.4717],[8.5729,21.5657],[5.6776,19.6012],[4.2674,19.1553],[3.1581,19.0574],[3.1467,19.6936],
  [2.6836,19.8562],[2.061,20.1422],[1.8232,20.6108],[-1.5501,22.7927],[-4.9233,24.9746],[-8.6844,27.3957],
  [-8.6651,27.5895],[-8.6656,27.6564],[-8.6741,28.8413],[-7.0592,29.5792],[-6.0606,29.7317],[-5.2421,30.0004],
  [-4.8596,30.5012],[-3.6904,30.897],[-3.6475,31.6373],[-3.069,31.7245],[-2.6166,32.0943],[-1.3079,32.2629],
  [-1.1246,32.6515],[-1.388,32.864],[-1.7335,33.9197],[-1.793,34.5279],[-2.1699,35.1684],[-1.2086,35.7148],
  [-0.1275,35.8887],[0.5039,36.3013],[1.4669,36.6056],[3.1617,36.7839],[4.8158,36.865],[5.3201,36.7165],
  [6.2618,37.1107],[7.3304,37.1184],[7.7371,36.8857],[8.421,36.9464],[8.2178,36.4332],[8.3764,35.4799],
  [8.141,34.6551],[7.5245,34.0974],[7.6126,33.3441],[8.4305,32.7483],[8.4391,32.5063],[9.0556,32.1027],
  [9.4821,30.3076],[9.8056,29.4246],[9.86,28.96],[9.6839,28.1442],[9.7561,27.6883],[9.6291,27.141],
  [9.7163,26.5122],[9.3194,26.0943],[9.9107,25.3655],[9.9483,24.937],[10.3038,24.3793],[10.7714,24.5625],
  [11.5607,24.0979],[11.9995,23.4717]
];

// `dataset:true` marks cities that appear in the original 900 shipment records.
// `mapRegion:'external'` cities are shown in a labelled schematic inset because they
// lie outside Algeria; their coordinates are real but cannot share the Algeria frame.
const LOCATIONS = [
  { id:'ALG', name:'Algiers', aliases:['Alger'], country:'Algeria', lat:36.7538, lon:3.0588, mapRegion:'algeria', dataset:false, role:'Algeria hub' },
  { id:'ORN', name:'Oran', aliases:[], country:'Algeria', lat:35.6961, lon:-0.6331, mapRegion:'algeria', dataset:false, role:'Algeria location' },
  { id:'CST', name:'Constantine', aliases:[], country:'Algeria', lat:36.365, lon:6.6147, mapRegion:'algeria', dataset:false, role:'Algeria location' },
  { id:'ANN', name:'Annaba', aliases:[], country:'Algeria', lat:36.8997, lon:7.7633, mapRegion:'algeria', dataset:false, role:'Algeria location' },
  { id:'TMR', name:'Tamanrasset', aliases:[], country:'Algeria', lat:22.785, lon:5.5228, mapRegion:'algeria', dataset:false, role:'Algeria location' },
  { id:'RTM', name:'Rotterdam', aliases:[], country:'Netherlands', lat:51.9244, lon:4.4777, mapRegion:'external', dataset:true, role:'Dataset origin/destination' },
  { id:'HAM', name:'Hamburg', aliases:[], country:'Germany', lat:53.5511, lon:9.9937, mapRegion:'external', dataset:true, role:'Dataset origin/destination' },
  { id:'ANR', name:'Antwerp', aliases:[], country:'Belgium', lat:51.2194, lon:4.4025, mapRegion:'external', dataset:true, role:'Dataset origin/destination' },
  { id:'PAR', name:'Paris', aliases:[], country:'France', lat:48.8566, lon:2.3522, mapRegion:'external', dataset:true, role:'Dataset origin/destination' },
  { id:'LYN', name:'Lyon', aliases:[], country:'France', lat:45.764, lon:4.8357, mapRegion:'external', dataset:true, role:'Dataset origin/destination' },
  { id:'MIL', name:'Milan', aliases:[], country:'Italy', lat:45.4642, lon:9.19, mapRegion:'external', dataset:true, role:'Dataset origin/destination' },
  { id:'BCN', name:'Barcelona', aliases:[], country:'Spain', lat:41.3874, lon:2.1686, mapRegion:'external', dataset:true, role:'Dataset origin/destination' },
  { id:'WAW', name:'Warsaw', aliases:[], country:'Poland', lat:52.2297, lon:21.0122, mapRegion:'external', dataset:true, role:'Dataset origin/destination' },
  { id:'DXB', name:'Dubai', aliases:[], country:'UAE', lat:25.2048, lon:55.2708, mapRegion:'external', dataset:true, role:'Dataset origin/destination' },
  { id:'SIN', name:'Singapore', aliases:[], country:'Singapore', lat:1.3521, lon:103.8198, mapRegion:'external', dataset:true, role:'Dataset origin/destination' }
];

const LOCATION_INDEX = new Map();
for (const loc of LOCATIONS) {
  LOCATION_INDEX.set(loc.name.toLowerCase(), loc);
  for (const alias of loc.aliases) LOCATION_INDEX.set(alias.toLowerCase(), loc);
}
function resolveLocation(value) {
  if (typeof value !== 'string') return null;
  return LOCATION_INDEX.get(value.trim().toLowerCase()) || null;
}

module.exports = { LOCATIONS, LOCATION_INDEX, ALGERIA_OUTLINE, resolveLocation };
