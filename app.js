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
'Bleak Falls Barrow':[-2000,-30000,'Above Riverwood, an ancient Nordic barrow.'],'Broken Fang Cave':[-5000,-8000,'A cavern near the White River.'],'Chillwind Depths':[-60000,10000,'A deep cavern in the Reach foothills.'],'Dustman’s Cairn':[-12000,5000,'A Nordic burial site west of Whiterun.'],'Gloomreach':[-140000,5000,'A vast Falmer-occupied cavern in the Reach.'],'Ironbind Barrow':[85000,85000,'A frozen Nordic tomb north-east of Winterhold.'],'Lost Knife Hideout':[115000,15000,'A bandit hideout in the Pale.'],'Mzulft':[150000,10000,'An abandoned Dwemer ruin east of Windhelm.'],'Shriekwind Bastion':[-70000,85000,'A ruined fort in the snowy reaches.'],'Wolfskull Cave':[-90000,90000,'A cave associated with necromantic rites near Solitude.'],'Bleak Falls Sanctum':[-2600,-31000,'The inner sanctum below Bleak Falls.'],'Brittleshin Pass':[-8000,-40000,'A mountain pass near Riverwood.'],'Bronze Water Cave':[128000,62000,'A cave near Windhelm and the Eastmarch coast.'],'Brood Cavern':[-8000,25000,'A spider-infested cavern north of Whiterun.'],'Crystaldrift Cave':[120000,-70000,'A remote cave in the southern Pale.'],'Dark Water Pass':[120000,-30000,'A pass south-east of Windhelm.'],'Forsaken Cave':[50000,95000,'A Nordic cave in the winter coast mountains.'],'Hob’s Fall Cave':[95000,110000,'A cave beneath Winterhold’s northern coast.'],'Illinalta’s Deep':[-25000,-55000,'A sunken ruins beneath Lake Ilinalta.'],'Liar’s Retreat':[-95000,75000,'A bandit and Falmer-infested cavern in the Reach.'],'Moss Mother Cavern':[-20000,-75000,'A small cave west of Falkreath.'],'Orotheim':[-55000,80000,'A brigand stronghold in Hjaalmarch.'],'Purewater Run':[-150000,30000,'A Falmer ruin in the Reach.'],'Ravenscar Hollow':[-90000,115000],'Red Eagle’s Redoubt':[-125000,-30000],'Rebel’s Cairn':[-120000,-25000],'Shadowgreen Cavern':[-85000,120000],'Shimmermist Cave':[45000,20000],'Steepfall Burrow':[-105000,95000],'Swindler’s Den':[-20000,15000],'Uttering Hills Cave':[125000,55000],'Valtheim Towers':[55000,-8000],'White River Watch':[55000,0],'Yngvild':[40000,125000]
};
const trackerResources = [
  {id:'tracker:sp2',name:'Whiterun plains elk',x:-22000,y:-8000,type:'hunting',description:'Hunting ground on the plains west of Whiterun. Good bow practice; watch for saber cats near the watchtower.'}
];
const builtInLocations = cities.map(([name,x,y,description])=>({id:`builtin:${name}`,name,x,y,type:'city',description}))
  .concat(trackerResources);
const storageKey='orbus-map-markers';
const deletedKey='orbus-map-deleted';
let customLocations=[];let deletedLocations=[];
try{customLocations=JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{}
try{deletedLocations=JSON.parse(localStorage.getItem(deletedKey)||'[]')}catch{}
let locations=builtInLocations.filter(loc=>!deletedLocations.includes(loc.id)).concat(customLocations);
function saveCustomLocations(){try{localStorage.setItem(storageKey,JSON.stringify(customLocations));return true}catch(error){console.error('Could not save markers',error);return false}}
function saveDeletedLocations(){try{localStorage.setItem(deletedKey,JSON.stringify([...new Set(deletedLocations)]));return true}catch(error){console.error('Could not save marker removals',error);return false}}

const map=document.getElementById('map'), tiles=document.getElementById('tiles'), markers=document.getElementById('markers');
const TILE=256, MIN_ZOOM=2, MAX_ZOOM=5;
let zoom=4, camera={x:0,y:-12000}, center={x:0,y:0};
let dragging=false, pointer={x:0,y:0}, start={x:0,y:0}, activeFilter='all', selected=null;

function worldToPixel(x,y,z=zoom){return {x:Math.pow(2,z)*(x/2048+128),y:Math.pow(2,z)*(-y/2048+128)}}
function pixelToWorld(px,py,z=zoom){return {x:(px/Math.pow(2,z)-128)*2048,y:(128-py/Math.pow(2,z))*2048}}
function screenPoint(x,y){const p=worldToPixel(x,y);return {x:p.x-camera.x,y:p.y-camera.y}}
function resize(){const r=map.getBoundingClientRect();center={x:r.width/2,y:r.height/2};render()}
function normalizedWorldSize(){return 2*262144}
function render(){const rect=map.getBoundingClientRect();camera.x=0,camera.y=0;}

function updateCamera(){const rect=map.getBoundingClientRect();const cx=worldToPixel(camera.x,camera.y);camera.px=cx.x,camera.py=cx.y;draw()}
function draw(){const rect=map.getBoundingClientRect();const worldPixel=worldToPixel(camera.x,camera.y,zoom);const originX=rect.width/2-worldPixel.x,originY=rect.height/2-worldPixel.y;
  tiles.replaceChildren(); const worldSize=256*Math.pow(2,zoom);let sourceZoom=Math.min(zoom,5), scale=Math.pow(2,zoom-sourceZoom), tileScreen=256*scale;
  const screenColumns=Math.pow(2,zoom), screenRows=Math.pow(2,zoom);
  let x0=Math.max(0,Math.floor((-originX)/tileScreen)-1),x1=Math.min(screenColumns,Math.ceil((rect.width-originX)/tileScreen)+1),y0=Math.max(0,Math.floor((-originY)/tileScreen)-1),y1=Math.min(screenRows,Math.ceil((rect.height-originY)/tileScreen)+1);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    if(x<0||y<0||x>=screenColumns||y>=screenRows)continue;
    const sourceColumns=Math.pow(2,sourceZoom), sourceRows=Math.pow(2,sourceZoom);
    const sx=Math.floor(x/scale),sy=Math.floor(y/scale); if(sx>=sourceColumns||sy>=sourceRows)continue; const img=document.createElement('img');img.className='map-tile';img.src=`tiles/skyrim/${sourceZoom}/${sx}/${sy}.jpg`;img.alt='';img.draggable=false;
    img.style.left=`${originX+x*tileScreen}px`;img.style.top=`${originY+y*tileScreen}px`;img.style.width=`${tileScreen}px`;img.style.height=`${tileScreen}px`;img.onerror=()=>img.remove();tiles.append(img);
  }
  drawMarkers(originX,originY);document.getElementById('zoomLabel').textContent=`Zoom ${zoom}`;
}
function drawMarkers(originX,originY){markers.replaceChildren();const query=document.getElementById('search').value.trim().toLowerCase();const visible=locations.filter(loc=>activeFilter==='all'||loc.type===activeFilter).filter(loc=>!query||loc.name.toLowerCase().includes(query)||loc.description.toLowerCase().includes(query));
  visible.forEach(loc=>{const p=worldToPixel(loc.x,loc.y);const marker=document.createElement('button');marker.className=`marker ${loc.type}${selected===loc.name?' selected':''}`;marker.style.left=`${originX+p.x}px`;marker.style.top=`${originY+p.y}px`;marker.title=loc.name;marker.textContent=loc.type==='city'?'S':loc.type==='dungeon'?'D':loc.type==='hunting'?'H':'R';marker.addEventListener('click',e=>{e.stopPropagation();selectLocation(loc,true)});markers.append(marker)});
}
function selectLocation(loc,moveTo=false){selected=loc.name;openDetails(loc);if(moveTo){camera={x:loc.x,y:loc.y};draw()}renderList();}
function openDetails(loc){document.getElementById('details').classList.add('open');document.getElementById('detailEyebrow').textContent=loc.type==='city'?'SETTLEMENT':loc.type==='resource'?'RESOURCE NODE':loc.type==='hunting'?'HUNTING':'DUNGEON / POINT OF INTEREST';document.getElementById('detailName').textContent=loc.name;document.getElementById('detailDescription').textContent=loc.description;document.getElementById('detailMeta').innerHTML=`<span>${loc.type==='city'?'Confirmed settlement position':'Map marker'}</span><span>World coordinates · ${Math.round(loc.x).toLocaleString()}, ${Math.round(loc.y).toLocaleString()}</span><button class="delete-button" data-delete-location="${loc.id}">Delete Marker</button>`;}
function renderList(){const query=document.getElementById('search').value.trim().toLowerCase();const visible=locations.filter(loc=>activeFilter==='all'||loc.type===activeFilter).filter(loc=>!query||loc.name.toLowerCase().includes(query)||loc.description.toLowerCase().includes(query));
  const box=document.getElementById('locationItems');box.replaceChildren();document.getElementById('resultCount').textContent=`${visible.length} locations`;visible.forEach(loc=>{const b=document.createElement('button');b.className=`location-item ${loc.type}`;b.innerHTML=`<span class="dot"></span><span><strong>${loc.name}</strong><small>${loc.type==='city'?'Settlement':loc.type==='resource'?'Resource Node':loc.type==='hunting'?'Hunting':'Dungeon'}</small></span>`;b.onclick=()=>selectLocation(loc,true);box.append(b)});}

let panStart=null;
map.addEventListener('pointerdown',e=>{if(pendingMarker||e.target.closest('.marker'))return;dragging=true;pointer={x:e.clientX,y:e.clientY};panStart={camera:{...camera},pixels:worldToPixel(camera.x,camera.y,zoom)};map.classList.add('dragging');map.setPointerCapture(e.pointerId)});
map.addEventListener('pointermove',e=>{const rect=map.getBoundingClientRect();const p=worldToPixel(camera.x,camera.y,zoom);const world=pixelToWorld(p.x+(e.clientX-rect.left-rect.width/2),p.y+(e.clientY-rect.top-rect.height/2));document.getElementById('coordLabel').textContent=`${Math.round(world.x).toLocaleString()} · ${Math.round(world.y).toLocaleString()}`;
  if(!dragging||!panStart)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;camera=pixelToWorld(panStart.pixels.x-dx,panStart.pixels.y-dy,zoom);draw();});
map.addEventListener('pointerup',()=>{dragging=false;map.classList.remove('dragging')});map.addEventListener('pointercancel',()=>{dragging=false;map.classList.remove('dragging')});
map.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e,e.deltaY<0?1:-1)},{passive:false});
function zoomAt(e,change){zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoom+change));draw()}
document.getElementById('zoomIn').onclick=()=>zoomAt(null,1);document.getElementById('zoomOut').onclick=()=>zoomAt(null,-1);document.getElementById('closeDetails').onclick=()=>{document.getElementById('details').classList.remove('open');selected=null;draw()};document.getElementById('listButton').onclick=()=>document.getElementById('locationList').classList.toggle('collapsed');
document.getElementById('search').addEventListener('input',()=>{renderList();draw()});document.getElementById('filters').addEventListener('click',e=>{if(e.target.tagName==='BUTTON'){activeFilter=e.target.dataset.filter;document.querySelectorAll('.filters button').forEach(b=>b.classList.toggle('active',b===e.target));renderList();draw()}});
let pendingMarker=null;
document.getElementById('addMarkerButton').onclick=()=>{document.getElementById('details').classList.remove('open');document.getElementById('addMarkerPanel').classList.add('open');document.getElementById('markerName').focus();};
document.getElementById('closeAddMarker').onclick=()=>{document.getElementById('addMarkerPanel').classList.remove('open');pendingMarker=null;};
document.getElementById('placeMarker').onclick=()=>{const name=document.getElementById('markerName').value.trim();if(!name){document.getElementById('markerName').focus();return;}pendingMarker={name,type:document.getElementById('markerType').value,description:document.getElementById('markerDescription').value.trim()||'Custom map marker.'};document.getElementById('addMarkerPanel').classList.remove('open');map.classList.add('placing-marker');};
map.addEventListener('pointerdown',e=>{if(!pendingMarker||e.target.closest('.marker'))return;const rect=map.getBoundingClientRect();const cameraPixel=worldToPixel(camera.x,camera.y,zoom);const world=pixelToWorld(cameraPixel.x+(e.clientX-rect.left-rect.width/2),cameraPixel.y+(e.clientY-rect.top-rect.height/2),zoom);const marker={id:`custom:${Date.now()}`,name:pendingMarker.name,x:world.x,y:world.y,type:pendingMarker.type,description:pendingMarker.description};customLocations.push(marker);locations.push(marker);saveCustomLocations();pendingMarker=null;map.classList.remove('placing-marker');document.getElementById('markerName').value='';document.getElementById('markerDescription').value='';selectLocation(marker,true);});
document.getElementById('details').addEventListener('click',e=>{const button=e.target.closest('[data-delete-location]');if(!button)return;const id=button.dataset.deleteLocation;if(!confirm('Delete this map marker?'))return;customLocations=customLocations.filter(loc=>loc.id!==id);locations=locations.filter(loc=>loc.id!==id);if(id.startsWith('builtin:')){if(!deletedLocations.includes(id))deletedLocations.push(id);saveDeletedLocations();}else{saveCustomLocations();}selected=null;document.getElementById('details').classList.remove('open');renderList();draw();});
window.addEventListener('resize',draw);camera={x:24000,y:-3500};zoom=4;renderList();draw();
