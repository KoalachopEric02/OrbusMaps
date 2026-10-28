const cities = [
  ['Whiterun',24000,-3500,'The central hold capital, beneath the Skyforge and the cloud district.'],
  ['Solitude',-60800,106500,'The capital of Skyrim and seat of the Imperial-aligned High King.'],
  ['Windhelm',133500,40500,'Ancient capital of Eastmarch, held within the walls of the Pale Pass.'],
  ['Markarth',-175000,6000,'Dwemer city carved into the Reach’s sheer cliffs.'],
  ['Riften',173500,-96500,'A walled city built around the waterways and docks of Lake Honrich.'],
  ['Dawnstar',28500,103000,'The northern coastal town on the Sea of Ghosts.'],
  ['Morthal',-37000,65500,'Hjaalmarch settlement beside the marsh road.'],
  ['Falkreath',-33000,-89000,'Southwestern hold capital beneath an old graveyard.'],
  ['Winterhold',110500,102000,'Northern coastal hold centered around the College of Winterhold.']
];

const dungeonData = {
  'Bleak Falls Barrow':[-2000,-30000,'Above Riverwood, an ancient Nordic barrow.'],
  'Broken Fang Cave':[-5000,-8000,'A cavern near the White River.'],
  'Chillwind Depths':[-60000,10000,'A deep cavern in the shivering foothills.'],
  'Gloomreach':[-50000,35000,'A forgotten cavern in the eastern mountains.'],
  'Mzulft':[-135000,15000,'A Dwemer ruin near the eastern plains.'],
  'Shroud Hearth Barrow':[-60000,-60000,'A hidden barrow in the southern marshes.']
};

const trackerResources = [
  {id:'tracker:sp2',name:'Whiterun plains elk',x:-22000,y:-8000,type:'hunting',description:'Hunting ground on the plains west of Whiterun. Good bow practice; watch for saber cats near the watchtower.'},
  {id:'tracker:sp3',name:'Morthal marsh stag',x:-60000,y:63000,type:'hunting',description:'A marshy hunting route east of Morthal with rich game tracks.'},
  {id:'tracker:sp4',name:'Reach quarry',x:-170000,y:30000,type:'resource',description:'A rich resource outcrop for iron and stone. Good stop for crafting needs.'}
];

const builtInLocations = cities
  .map(([name, x, y, description]) => ({id:`builtin:${name}`, name, x, y, type:'city', description}))
  .concat(Object.entries(dungeonData).map(([name, [x, y, description]]) => ({
    id: `builtin:${name}`,
    name,
    x,
    y,
    type: 'dungeon',
    description
  })))
  .concat(trackerResources);

const MAP_STATE_ENDPOINT = '/api/map-state';
const map = document.getElementById('map');
const tiles = document.getElementById('tiles');
const markers = document.getElementById('markers');
const TILE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 4;

let zoom = 4;
let camera = {x: 0, y: -12000};
let center = {x: 0, y: 0};
let dragging = false;
let pointer = {x: 0, y: 0};
let start = {x: 0, y: 0};
let activeFilter = 'all';
let selected = null;
let pendingMarker = null;
let editingMarkerId = null;
let customLocations = [];
let deletedLocations = [];
let locations = buildLocations();

function buildLocations() {
  return builtInLocations
    .filter((loc) => !deletedLocations.includes(loc.id))
    .concat(customLocations);
}

function resetMarkerForm() {
  editingMarkerId = null;
  document.getElementById('markerName').value = '';
  document.getElementById('markerDescription').value = '';
  document.getElementById('markerType').value = 'dungeon';
  document.getElementById('placeMarker').textContent = 'Place on Map';
}

function openMarkerFormForEdit(marker) {
  editingMarkerId = marker.id;
  document.getElementById('markerName').value = marker.name || '';
  document.getElementById('markerType').value = marker.type || 'dungeon';
  document.getElementById('markerDescription').value = marker.description || '';
  document.getElementById('placeMarker').textContent = 'Save Changes';
  document.getElementById('addMarkerPanel').classList.add('open');
  document.getElementById('markerName').focus();
}

async function loadMapState() {
  try {
    const response = await fetch(MAP_STATE_ENDPOINT, {headers: {'Accept': 'application/json'}});
    if (!response.ok) throw new Error(`Map state fetch failed: ${response.status}`);

    const data = await response.json();
    customLocations = Array.isArray(data.customLocations) ? data.customLocations : [];
    deletedLocations = Array.isArray(data.deletedLocations) ? data.deletedLocations : [];
    locations = buildLocations();
    renderList();
    draw();
    return true;
  } catch (error) {
    console.error('Could not load map state from the database.', error);
    return false;
  }
}

async function persistLocationState() {
  try {
    const response = await fetch(MAP_STATE_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        customLocations,
        deletedLocations: [...new Set(deletedLocations)]
      })
    });

    if (!response.ok) throw new Error(`Persist failed: ${response.status}`);

    const data = await response.json();
    customLocations = Array.isArray(data.customLocations) ? data.customLocations : customLocations;
    deletedLocations = Array.isArray(data.deletedLocations) ? data.deletedLocations : deletedLocations;
    locations = buildLocations();
    renderList();
    draw();
    return true;
  } catch (error) {
    console.error('Could not sync map state to the database.', error);
    return false;
  }
}

window.orbusMapDB = {
  getState() {
    return {
      customLocations: [...customLocations],
      deletedLocations: [...deletedLocations]
    };
  },
  async saveState() {
    return persistLocationState();
  },
  async reset() {
    customLocations = [];
    deletedLocations = [];
    const result = await persistLocationState();
    locations = buildLocations();
    renderList();
    draw();
    return result;
  }
};

function worldToPixel(x, y, z = zoom) {
  return {
    x: Math.pow(2, z) * (x / 2048 + 128),
    y: Math.pow(2, z) * (-y / 2048 + 128)
  };
}

function pixelToWorld(px, py, z = zoom) {
  return {
    x: (px / Math.pow(2, z) - 128) * 2048,
    y: (128 - py / Math.pow(2, z)) * 2048
  };
}

function screenPoint(x, y) {
  const p = worldToPixel(x, y);
  return {x: p.x - camera.x, y: p.y - camera.y};
}

function resize() {
  const rect = map.getBoundingClientRect();
  center = {x: rect.width / 2, y: rect.height / 2};
  render();
}

function normalizedWorldSize() {
  return 2 * 262144;
}

function render() {
  const rect = map.getBoundingClientRect();
  camera.x = 0;
  camera.y = 0;
}

function updateCamera() {
  const rect = map.getBoundingClientRect();
  const cx = worldToPixel(camera.x, camera.y);
  camera.px = cx.x;
  camera.py = cx.y;
  draw();
}

function draw() {
  const rect = map.getBoundingClientRect();
  const worldPixel = worldToPixel(camera.x, camera.y, zoom);
  const originX = rect.width / 2 - worldPixel.x;
  const originY = rect.height / 2 - worldPixel.y;

  tiles.replaceChildren();
  const worldSize = 256 * Math.pow(2, zoom);
  let sourceZoom = Math.min(zoom, 5);
  let scale = Math.pow(2, zoom - sourceZoom);
  let tileScreen = 256 * scale;

  const screenColumns = Math.pow(2, zoom);
  const screenRows = Math.pow(2, zoom);

  let x0 = Math.max(0, Math.floor((-originX) / tileScreen) - 1);
  let x1 = Math.min(screenColumns, Math.ceil((rect.width - originX) / tileScreen) + 1);
  let y0 = Math.max(0, Math.floor((-originY) / tileScreen) - 1);
  let y1 = Math.min(screenRows, Math.ceil((rect.height - originY) / tileScreen) + 1);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= screenColumns || y >= screenRows) continue;

      const sourceColumns = Math.pow(2, sourceZoom);
      const sourceRows = Math.pow(2, sourceZoom);
      const sx = Math.floor(x / scale);
      const sy = Math.floor(y / scale);
      if (sx >= sourceColumns || sy >= sourceRows) continue;

      const img = document.createElement('img');
      img.className = 'map-tile';
      img.src = `tiles/skyrim/${sourceZoom}/${sx}/${sy}.jpg`;
      img.style.left = `${originX + x * tileScreen}px`;
      img.style.top = `${originY + y * tileScreen}px`;
      img.style.width = `${tileScreen}px`;
      img.style.height = `${tileScreen}px`;
      img.onerror = () => img.remove();
      tiles.appendChild(img);
    }
  }

  drawMarkers(originX, originY);
  document.getElementById('zoomLabel').textContent = `Zoom ${zoom}`;
}

function drawMarkers(originX, originY) {
  markers.replaceChildren();
  const query = document.getElementById('search').value.trim().toLowerCase();

  const visible = locations.filter((loc) => {
    if (activeFilter !== 'all' && loc.type !== activeFilter) return false;
    if (!query) return true;
    return loc.name.toLowerCase().includes(query) || (loc.description || '').toLowerCase().includes(query);
  });

  visible.forEach((loc) => {
    const p = worldToPixel(loc.x, loc.y);
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = `marker ${loc.type}${selected === loc.name ? ' selected' : ''}`;
    marker.style.left = `${originX + p.x}px`;
    marker.style.top = `${originY + p.y}px`;
    marker.title = loc.name;
    marker.addEventListener('click', (event) => {
      event.stopPropagation();
      selectLocation(loc, false);
    });
    markers.appendChild(marker);
  });
}

function selectLocation(loc, moveTo = false) {
  selected = loc.name;
  openDetails(loc);
  if (moveTo) {
    camera = {x: loc.x, y: loc.y};
    draw();
  }
  renderList();
}

function openDetails(loc) {
  document.getElementById('details').classList.add('open');
  document.getElementById('detailEyebrow').textContent = loc.type === 'city'
    ? 'SETTLEMENT'
    : loc.type === 'resource'
      ? 'RESOURCE NODE'
      : loc.type === 'hunting'
        ? 'HUNTING'
        : 'DUNGEON';

  document.getElementById('detailName').textContent = loc.name;
  document.getElementById('detailDescription').textContent = loc.description || 'No description provided.';

  const detailMeta = document.getElementById('detailMeta');
  detailMeta.innerHTML = '';

  const coords = document.createElement('span');
  coords.textContent = `Coordinates: ${Math.round(loc.x)}, ${Math.round(loc.y)}`;
  detailMeta.appendChild(coords);

  const type = document.createElement('span');
  type.textContent = `Type: ${loc.type}`;
  detailMeta.appendChild(type);

  if (loc.id && !loc.id.startsWith('builtin:')) {
    const customTag = document.createElement('span');
    customTag.textContent = 'Custom marker';
    detailMeta.appendChild(customTag);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'edit-button';
    editButton.dataset.editLocation = loc.id;
    editButton.textContent = 'Edit marker';
    detailMeta.appendChild(editButton);
  }

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'delete-button';
  deleteButton.dataset.deleteLocation = loc.id;
  deleteButton.textContent = 'Delete marker';
  detailMeta.appendChild(deleteButton);
}

function renderList() {
  const query = document.getElementById('search').value.trim().toLowerCase();
  const visible = locations
    .filter((loc) => activeFilter === 'all' || loc.type === activeFilter)
    .filter((loc) => !query || loc.name.toLowerCase().includes(query) || (loc.description || '').toLowerCase().includes(query));

  const box = document.getElementById('locationItems');
  box.replaceChildren();
  document.getElementById('resultCount').textContent = `${visible.length} locations`;

  visible.forEach((loc) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `location-item${selected === loc.name ? ' active' : ''}`;
    button.innerHTML = `<strong>${loc.name}</strong><small>${loc.type}</small>`;
    button.addEventListener('click', () => {
      selectLocation(loc, true);
    });
    box.appendChild(button);
  });
}

let panStart = null;

map.addEventListener('pointerdown', async (event) => {
  if (pendingMarker && !event.target.closest('.marker')) {
    const rect = map.getBoundingClientRect();
    const cameraPixel = worldToPixel(camera.x, camera.y, zoom);
    const world = pixelToWorld(
      cameraPixel.x + (event.clientX - rect.left - rect.width / 2),
      cameraPixel.y + (event.clientY - rect.top - rect.height / 2),
      zoom
    );

    const newMarker = {
      id: `custom:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      name: pendingMarker.name,
      x: Math.round(world.x),
      y: Math.round(world.y),
      type: pendingMarker.type,
      description: pendingMarker.description || 'Custom marker placed on the map.'
    };

    customLocations.push(newMarker);
    await persistLocationState();
    selected = newMarker.name;
    openDetails(newMarker);
    pendingMarker = null;
    document.getElementById('addMarkerPanel').classList.remove('open');
    return;
  }

  if (event.target.closest('.marker')) return;

  dragging = true;
  pointer = {x: event.clientX, y: event.clientY};
  panStart = {
    camera: {...camera},
    pixels: worldToPixel(camera.x, camera.y, zoom)
  };
  map.classList.add('dragging');
});

map.addEventListener('pointermove', (event) => {
  const rect = map.getBoundingClientRect();
  const p = worldToPixel(camera.x, camera.y, zoom);
  const world = pixelToWorld(
    p.x + (event.clientX - rect.left - rect.width / 2),
    p.y + (event.clientY - rect.top - rect.height / 2),
    zoom
  );

  document.getElementById('coordLabel').textContent = `World ${Math.round(world.x)}, ${Math.round(world.y)}`;

  if (!dragging || !panStart) return;

  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  camera = pixelToWorld(panStart.pixels.x - dx, panStart.pixels.y - dy, zoom);
  draw();
});

map.addEventListener('pointerup', () => {
  dragging = false;
  map.classList.remove('dragging');
});

map.addEventListener('pointercancel', () => {
  dragging = false;
  map.classList.remove('dragging');
});

map.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomAt(event, event.deltaY < 0 ? 1 : -1);
}, {passive: false});

function zoomAt(event, change) {
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + change));
  draw();
}

document.getElementById('zoomIn').onclick = () => zoomAt(null, 1);
document.getElementById('zoomOut').onclick = () => zoomAt(null, -1);

document.getElementById('closeDetails').onclick = () => {
  document.getElementById('details').classList.remove('open');
};

document.getElementById('search').addEventListener('input', () => {
  renderList();
  draw();
});

document.getElementById('filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;

  activeFilter = button.dataset.filter;
  document.querySelectorAll('#filters [data-filter]').forEach((item) => item.classList.toggle('active', item === button));
  renderList();
  draw();
});

document.getElementById('listButton').addEventListener('click', () => {
  const list = document.getElementById('locationList');
  list.classList.toggle('open');
});

document.getElementById('addMarkerButton').onclick = () => {
  document.getElementById('details').classList.remove('open');
  pendingMarker = null;
  resetMarkerForm();
  document.getElementById('addMarkerPanel').classList.add('open');
  document.getElementById('markerName').focus();
};

document.getElementById('closeAddMarker').onclick = () => {
  document.getElementById('addMarkerPanel').classList.remove('open');
  pendingMarker = null;
  resetMarkerForm();
};

document.getElementById('placeMarker').onclick = async () => {
  const name = document.getElementById('markerName').value.trim();
  if (!name) {
    document.getElementById('markerName').focus();
    return;
  }

  const type = document.getElementById('markerType').value;
  const description = document.getElementById('markerDescription').value.trim();

  if (editingMarkerId) {
    const index = customLocations.findIndex((loc) => loc.id === editingMarkerId);
    if (index >= 0) {
      customLocations[index] = {
        ...customLocations[index],
        name,
        type,
        description: description || customLocations[index].description || 'Custom marker updated.'
      };
      await persistLocationState();
      selected = name;
      openDetails(customLocations[index]);
    }

    resetMarkerForm();
    document.getElementById('addMarkerPanel').classList.remove('open');
    return;
  }

  pendingMarker = {name, type, description};
  document.getElementById('addMarkerPanel').classList.remove('open');
  resetMarkerForm();
};

document.getElementById('details').addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-location]');
  if (editButton) {
    const id = editButton.dataset.editLocation;
    const loc = customLocations.find((item) => item.id === id);
    if (loc) {
      document.getElementById('details').classList.remove('open');
      openMarkerFormForEdit(loc);
    }
    return;
  }

  const deleteButton = event.target.closest('[data-delete-location]');
  if (!deleteButton) return;

  const id = deleteButton.dataset.deleteLocation;
  const loc = locations.find((item) => item.id === id) || customLocations.find((item) => item.id === id);
  if (!loc) return;

  const confirmed = window.confirm(`Delete ${loc.name}?`);
  if (!confirmed) return;

  if (loc.id.startsWith('builtin:')) {
    deletedLocations.push(loc.id);
  } else {
    customLocations = customLocations.filter((item) => item.id !== loc.id);
  }

  await persistLocationState();
  selected = null;
  document.getElementById('details').classList.remove('open');
});

window.addEventListener('resize', draw);

camera = {x: 24000, y: -3500};
zoom = 4;
loadMapState();
renderList();
draw();
