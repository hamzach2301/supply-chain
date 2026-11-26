const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let meta, baseline=null, presets={
 manager:{origin:'Rotterdam',destination:'Hamburg',mode:'Road',distanceKm:520,cargoWeightKg:6200,fuelCost:125,labourCost:87,otherExpenses:46,roadQuality:5,trafficIntensity:8,portCongestion:4,portEfficiency:6,logisticsConnectivity:6},
 analyst:{origin:'Antwerp',destination:'Dubai',mode:'Sea',distanceKm:6100,cargoWeightKg:13200,fuelCost:475,labourCost:310,otherExpenses:980,roadQuality:5,trafficIntensity:7,portCongestion:9,portEfficiency:3,logisticsConnectivity:4},
 planner:{origin:'Hamburg',destination:'Singapore',mode:'Multimodal',distanceKm:9800,cargoWeightKg:8200,fuelCost:1150,labourCost:690,otherExpenses:1480,roadQuality:7,trafficIntensity:4,portCongestion:3,portEfficiency:8,logisticsConnectivity:8},
 dispatcher:{origin:'Paris',destination:'Milan',mode:'Road',distanceKm:860,cargoWeightKg:1800,fuelCost:185,labourCost:118,otherExpenses:61,roadQuality:7,trafficIntensity:4,portCongestion:2,portEfficiency:7,logisticsConnectivity:8}
};
let locations=[], routes=[], outline=[], locationByName=new Map(), locationById=new Map(), routeById=new Map(), recData=null, recSelectedRank=1, mapState={origin:'',destination:'',mode:'Road',load:5000,routeId:null,locationId:null};
const money=x=>'$'+Number(x).toLocaleString('en-US',{maximumFractionDigits:0}), num=x=>Number(x).toFixed(2), days=x=>Number(x).toFixed(2)+' d';
async function api(url,opts){const r=await fetch(url,opts);const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed.');return data}
function option(select,values,label){select.innerHTML=`<option value="">${label}</option>`+values.map(x=>`<option value="${x}">${x}</option>`).join('')}
function fillSelects(){option($('#fMode'),meta.modes,'All modes');option($('#fOrigin'),meta.cities,'All origins');option($('#fDestination'),meta.cities,'All destinations');for(const id of ['origin','destination'])option($('#'+id),meta.cities,'Choose a city');option($('#mode'),meta.modes,'Choose a mode')}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function resolveLocal(value){const key=String(value||'').trim().toLowerCase();return locationByName.get(key)||null}
function samePair(a,b,c,d){return (a===c&&b===d)||(a===d&&b===c)}
function findRoute(a,b,mode){return routes.find(r=>samePair(r.from,r.to,a,b)&&r.mode===mode)||null}
async function loadGeoData(){
  const [geo,routeData]=await Promise.all([api('/api/locations'),api('/api/routes')]);
  locations=geo.locations; outline=geo.outline; routes=routeData.routes;
  locationByName=new Map();locationById=new Map();routeById=new Map(routes.map(r=>[r.id,r]));
  for(const loc of locations){locationByName.set(loc.name.toLowerCase(),loc);for(const alias of loc.aliases)locationByName.set(alias.toLowerCase(),loc);locationById.set(loc.id,loc)}
  fillGeoSelectors();
  const initial=findRoute('Rotterdam','Hamburg','Road');
  mapState={origin:'Rotterdam',destination:'Hamburg',mode:'Road',load:5000,routeId:initial?initial.id:null,locationId:null};
  drawMap($('#mapCanvas'),mapState,{onLocation:mapLocationSelected,onRoute:mapRouteSelected});
  drawMap($('#recMapCanvas'),mapState,{},true);
}
function fillGeoSelectors(){
  const opts=locations.map(loc=>`<option value="${esc(loc.name)}">${esc(loc.name)} — ${esc(loc.country)}</option>`).join('');
  for(const id of ['mapOrigin','mapDestination'])$('#'+id).innerHTML='<option value="">Choose a location</option>'+opts;
  option($('#mapMode'),meta.modes,'Choose a mode');
  $('#mapOrigin').value='Rotterdam';$('#mapDestination').value='Hamburg';$('#mapMode').value='Road';
  for(const mode of meta.modes)$('#recMode').insertAdjacentHTML('beforeend',`<option value="${esc(mode)}">${esc(mode)}</option>`);
  const dataOpts=[];
  for(const loc of locations){dataOpts.push(`<option value="${esc(loc.name)}" label="${esc(loc.country)}"></option>`);for(const alias of loc.aliases)dataOpts.push(`<option value="${esc(alias)}" label="${esc(loc.name)}"></option>`)}
  $('#recLocationOptions').innerHTML=dataOpts.join('');
  $('#recOrigin').value='Rotterdam';$('#recDestination').value='Hamburg';
}
function params(){const p=new URLSearchParams;[['mode','fMode'],['origin','fOrigin'],['destination','fDestination'],['severity','fSeverity']].forEach(([k,id])=>{const v=$('#'+id).value;if(v)p.set(k,v)});return p}
async function dashboard(){const view=$('#dashboard');view.setAttribute('aria-busy','true');try{const d=await api('/api/dashboard?'+params());$('#kDays').textContent=days(d.kpis.averageDays);$('#kOnTime').textContent=d.kpis.onTimeRate.toFixed(1)+'%';$('#kTotal').textContent=money(d.kpis.totalCost);$('#kAverage').textContent=money(d.kpis.averageCost);$('#kBottle').textContent=d.kpis.bottleneckRate.toFixed(1)+'%';lineChart(d.month);bars('modeBars',d.mode,'value',x=>days(x),'modeTable','Mode','Average delivery duration');costChart(d);bars('bottleneckBars',d.bottlenecks,'value',x=>x.toFixed(1)+'%','bottleneckTable','Condition','Frequency');bars('conditionBars',d.conditions,'value',x=>days(x),'conditionTable','Condition','Average delivery duration');$('#conditionTable').innerHTML=`<thead><tr><th>Condition profile</th><th>Average duration (days)</th><th>Records</th></tr></thead><tbody>${d.conditions.map(x=>`<tr><td>${x.name}</td><td>${num(x.value)}</td><td>${x.count}</td></tr>`).join('')}</tbody>`}catch(e){alert(e.message)}finally{view.removeAttribute('aria-busy')}}
function lineChart(data){const points=data.filter(x=>x.value!==null),w=700,h=220,p=30,lo=Math.min(...points.map(x=>x.value))-.2,hi=Math.max(...points.map(x=>x.value))+.2,x=i=>p+i*(w-2*p)/(points.length-1),y=v=>h-p-(v-lo)/(hi-lo)*(h-2*p);const path=points.map((d,i)=>`${x(i)},${y(d.value)}`).join(' ');$('#trendChart').innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Average delivery time by month, from ${num(lo)} to ${num(hi)} days"><line x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}" stroke="var(--border-strong)"/><polyline points="${path}" fill="none" stroke="var(--accent)" stroke-width="3"/>${points.map((d,i)=>`<circle class="point" tabindex="0" role="img" aria-label="${d.name}: ${num(d.value)} days (${d.count} records)" data-tip="${d.name}: ${num(d.value)} days (${d.count} records)" cx="${x(i)}" cy="${y(d.value)}" r="5" fill="var(--accent)"/><text x="${x(i)}" y="${h-8}" text-anchor="middle" font-size="11" fill="var(--muted)">${d.name}</text>`).join('')}</svg>`;$('#trendText').textContent=points.map(x=>`${x.name}: ${num(x.value)} days`).join('. ');tooltips()}
function bars(id,data,key,label,tableId,first,second){const max=Math.max(...data.map(x=>x[key]));$('#'+id).innerHTML=data.map(x=>`<div class="bar-row"><span class="bar-name">${x.name}</span><div class="bar-track"><div class="bar" tabindex="0" role="img" aria-label="${x.name}: ${label(x[key])}" style="width:${Math.max(2,x[key]/max*100)}%" data-tip="${x.name}: ${label(x[key])}"></div></div><strong>${label(x[key])}</strong></div>`).join('');if(tableId)$('#'+tableId).innerHTML=`<thead><tr><th>${first}</th><th>${second}</th><th>Records</th></tr></thead><tbody>${data.map(x=>`<tr><td>${x.name}</td><td>${label(x[key])}</td><td>${x.count??'—'}</td></tr>`).join('')}</tbody>`;tooltips()}
function costChart(d){const colors=['var(--info)','var(--accent)','var(--warning)'],byMode=d.costByMode.map(x=>({...x,total:x.fuelCost+x.labourCost+x.otherExpenses})),max=Math.max(...byMode.map(x=>x.total));$('#costStack').innerHTML=byMode.map(x=>`<div class="bar-row"><span class="bar-name">${x.name}</span><div class="stack" tabindex="0" role="img" aria-label="${x.name}: Fuel ${money(x.fuelCost)}, Labour ${money(x.labourCost)}, Other ${money(x.otherExpenses)}" data-tip="${x.name}: Fuel ${money(x.fuelCost)}, Labour ${money(x.labourCost)}, Other ${money(x.otherExpenses)}"><i style="width:${x.fuelCost/max*100}%;background:${colors[0]}"></i><i style="width:${x.labourCost/max*100}%;background:${colors[1]}"></i><i style="width:${x.otherExpenses/max*100}%;background:${colors[2]}"></i></div><strong>${money(x.total)}</strong></div>`).join('')+`<div class="legend"><span style="--c:${colors[0]}">Fuel</span><span style="--c:${colors[1]}">Labour</span><span style="--c:${colors[2]}">Other expenses</span></div>`;$('#costTable').innerHTML=`<thead><tr><th>Mode</th><th>Fuel (USD)</th><th>Labour (USD)</th><th>Other (USD)</th><th>Total (USD)</th></tr></thead><tbody>${byMode.map(x=>`<tr><td>${x.name}</td><td>${money(x.fuelCost)}</td><td>${money(x.labourCost)}</td><td>${money(x.otherExpenses)}</td><td>${money(x.total)}</td></tr>`).join('')}</tbody>`;tooltips()}
function tooltips(){const tip=$('#tip');const place=(x,y)=>{tip.style.left=Math.max(8,Math.min(x+12,window.innerWidth-tip.offsetWidth-12))+'px';tip.style.top=Math.max(8,Math.min(y+12,window.innerHeight-tip.offsetHeight-12))+'px'};$$('[data-tip]').forEach(el=>{const show=e=>{tip.textContent=el.dataset.tip;tip.style.display='block';const r=el.getBoundingClientRect();place(e.clientX??r.left,e.clientY??r.top)};const move=e=>place(e.clientX,e.clientY);const hide=()=>tip.style.display='none';el.onmouseenter=show;el.onmousemove=move;el.onmouseleave=hide;el.onfocus=show;el.onblur=hide})}
function formData(){const f=new FormData($('#predictForm')),o={};for(const [k,v] of f)o[k]=v;for(const k of ['distanceKm','cargoWeightKg','fuelCost','labourCost','otherExpenses','roadQuality','trafficIntensity','portCongestion','portEfficiency','logisticsConnectivity']){if(o[k].trim()===''||!Number.isFinite(Number(o[k])))throw Error(`Enter a valid ${k}.`);o[k]=Number(o[k])}return o}
function loadPreset(name='planner'){const p=presets[name];for(const[k,v]of Object.entries(p))$('#'+k).value=v;$('#formError').textContent='';go('predictor')}
async function predict(e){e.preventDefault();const button=e.submitter||$('#predictForm button[type="submit"]');button.disabled=true;try{const input=formData();if(input.origin===input.destination)throw Error('Origin and destination must be different.');const d=await api('/api/predict',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});baseline=input;$('#predictionEmpty').classList.add('hide');$('#predictionResult').classList.remove('hide');$('#predDays').textContent=num(d.days);$('#predSummary').textContent=`Estimated total operational cost: ${money(d.cost)} USD`;$('#arrivalDate').textContent=new Intl.DateTimeFormat('en',{dateStyle:'full'}).format(new Date(d.arrivalDate));$('#mMae').textContent=num(d.metrics.mae)+' d';$('#mRmse').textContent=num(d.metrics.rmse)+' d';$('#mR2').textContent=num(d.metrics.r2);buildSliders();$('#scenarioDisabled').classList.add('hide');$('#scenarioArea').classList.remove('hide');$('#baseResult').textContent=days(d.days);$('#scenarioResult').textContent='—';$('#deltaResult').textContent='—';$('#changeResult').textContent='—';$('#formError').textContent=''}catch(err){$('#formError').textContent=err.message}finally{button.disabled=false}}
const scenarioKeys=[['trafficIntensity','Traffic intensity'],['roadQuality','Road quality'],['portCongestion','Port congestion'],['portEfficiency','Port efficiency'],['logisticsConnectivity','Logistics connectivity']];
function buildSliders(){const s=$('#sliders');s.innerHTML=scenarioKeys.map(([key,label])=>`<div class="range-row"><div><label for="s_${key}">${label} <span style="font-weight:400;color:var(--subtle)">(1–10)</span></label><b id="v_${key}">${baseline[key]}</b></div><input id="s_${key}" type="range" min="1" max="10" step="1" value="${baseline[key]}" aria-label="Scenario ${label}"></div>`).join('');scenarioKeys.forEach(([key])=>$('#s_'+key).oninput=e=>$('#v_'+key).textContent=e.target.value)}
async function scenario(){if(!baseline)return;const button=$('#runScenario');button.disabled=true;try{const sim={...baseline};scenarioKeys.forEach(([k])=>sim[k]=Number($('#s_'+k).value));const d=await api('/api/scenario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseline,scenario:sim})});$('#baseResult').textContent=days(d.baselineDays);$('#scenarioResult').textContent=days(d.scenarioDays);const set=(id,v,suffix)=>{const el=$(id);el.textContent=(v>0?'+':'')+num(v)+suffix;el.className=v<0?'delta-good':'delta-bad'};set('#deltaResult',d.deltaDays,' d');set('#changeResult',d.changePercent,'%')}catch(e){alert(e.message)}finally{button.disabled=false}}
function buildProjection(){
  const lons=outline.map(p=>p[0]),lats=outline.map(p=>p[1]);
  const minLon=Math.min(...lons),maxLon=Math.max(...lons),minLat=Math.min(...lats),maxLat=Math.max(...lats);
  const midLon=(minLon+maxLon)/2,midLat=(minLat+maxLat)/2,cos=Math.cos(midLat*Math.PI/180);
  const box={x:28,y:24,w:392,h:340},scale=Math.min(box.w/((maxLon-minLon)*cos),box.h/(maxLat-minLat));
  const cx=box.x+box.w/2,cy=box.y+box.h/2;
  return (lon,lat)=>({x:cx+(lon-midLon)*scale*cos,y:cy-(lat-midLat)*scale});
}
function externalLayout(){
  const ext=locations.filter(loc=>loc.mapRegion==='external'),inset={x:452,y:24,w:280,h:340},cols=3,rows=Math.ceil(ext.length/cols),points=new Map();
  ext.forEach((loc,i)=>{const col=i%cols,row=Math.floor(i/cols);points.set(loc.id,{x:inset.x+42+col*(inset.w-90)/(cols-1),y:inset.y+52+row*(inset.h-100)/(rows-1),col})});
  return points;
}
function drawMap(container,state,handlers={},compact=false){
  if(!container||!outline.length)return;
  const project=buildProjection(),ext=externalLayout();
  const pointOf=loc=>loc.mapRegion==='algeria'?project(loc.lon,loc.lat):ext.get(loc.id);
  const origin=locationById.get(state.origin)||null,destination=locationById.get(state.destination)||null;
  const selectedRoute=state.routeId?routeById.get(state.routeId):findRoute(state.origin,state.destination,state.mode);
  const path=outline.map((p,i)=>{const {x,y}=project(p[0],p[1]);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`}).join('')+'Z';
  const bestByPair=new Map();
  for(const route of routes){
    const from=locationByName.get(route.from.toLowerCase()),to=locationByName.get(route.to.toLowerCase());
    if(!route.available||!from||!to||from.mapRegion!=='external'||to.mapRegion!=='external')continue;
    const key=[from.id,to.id].sort().join('|');
    if(!bestByPair.has(key)||route.sampleCount>bestByPair.get(key).sampleCount)bestByPair.set(key,route);
  }
  const network=[...bestByPair.values()].sort((a,b)=>b.sampleCount-a.sampleCount).slice(0,10);
  let links=network.map(route=>{
    const from=pointOf(locationByName.get(route.from.toLowerCase())),to=pointOf(locationByName.get(route.to.toLowerCase()));
    return `<g><line class="map-link map-link--network" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/><line class="map-link-hit" data-route-id="${esc(route.id)}" tabindex="0" role="button" aria-label="${esc(route.from)} to ${esc(route.to)}, ${esc(route.mode)}, ${route.available?route.distanceKm+' km recorded':'no verified distance'}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/></g>`;
  }).join('');
  if(selectedRoute){
    const fromLoc=locationByName.get(selectedRoute.from.toLowerCase()),toLoc=locationByName.get(selectedRoute.to.toLowerCase());
    if(fromLoc&&toLoc){
      const from=pointOf(fromLoc),to=pointOf(toLoc),missing=!selectedRoute.available;
      const label=missing?`No verified ${esc(selectedRoute.mode)} distance`:`${selectedRoute.distanceKm} km · ${esc(selectedRoute.mode)}`;
      const mx=(from.x+to.x)/2,my=(from.y+to.y)/2;
      links+=`<g><line class="map-link ${missing?'map-link--missing map-link--selected-missing':'map-link--available map-link--selected'}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/><line class="map-link-hit" data-route-id="${esc(selectedRoute.id)}" tabindex="0" role="button" aria-label="${esc(selectedRoute.from)} to ${esc(selectedRoute.to)}, ${esc(selectedRoute.mode)}, ${selectedRoute.available?selectedRoute.distanceKm+' km recorded':'no verified distance'}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/><text class="map-link-label" x="${mx}" y="${my-8}" text-anchor="middle">${label}</text></g>`;
    }
  }
  let nodes='';
  for(const loc of locations){
    const p=pointOf(loc),focused=state.locationId===loc.id;
    const classes=['map-node',loc.id==='ALG'?'hub':'',state.origin===loc.name?'origin':'',state.destination===loc.name?'destination':'',focused?'focused':''].filter(Boolean).join(' ');
    const anchor=loc.mapRegion==='external'&&p.col===2?'end':'start';
    const labelX=anchor==='end'?p.x-9:p.x+9;
    nodes+=`<g class="${classes}" data-loc-id="${esc(loc.id)}" tabindex="0" role="button" aria-label="${esc(loc.name)}, ${esc(loc.country)}. ${loc.historicalRouteCount} recorded route combinations. Activate for details."><circle cx="${p.x}" cy="${p.y}" r="${loc.id==='ALG'?7:5.5}"/><text class="map-node-label" x="${labelX}" y="${p.y-8}" text-anchor="${anchor}">${esc(loc.name)}</text></g>`;
  }
  const desc=origin&&destination?`Selected route ${origin.name} to ${destination.name}${selectedRoute?(selectedRoute.available?`, recorded distance ${selectedRoute.distanceKm} km via ${selectedRoute.mode}`:', no verified distance'):''}.`:'Algeria overview with Algiers and the external dataset network.';
  container.innerHTML=`<svg viewBox="0 0 760 410" aria-label="Schematic Algeria delivery network map. ${esc(desc)}"><title>Algeria delivery network</title><desc>${esc(desc)} Schematic connections are not road geometry.</desc><path class="map-land" d="${path}"/><rect class="map-inset" x="452" y="24" width="280" height="340" rx="10"/><text class="map-inset-title" x="466" y="44">External dataset network · schematic</text>${links}${nodes}</svg>`;
  container.querySelectorAll('[data-loc-id]').forEach(el=>{
    const activate=()=>handlers.onLocation&&handlers.onLocation(el.dataset.locId);
    el.addEventListener('click',activate);
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate()}});
  });
  container.querySelectorAll('[data-route-id]').forEach(el=>{
    const activate=()=>handlers.onRoute&&handlers.onRoute(el.dataset.routeId);
    el.addEventListener('click',activate);
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate()}});
  });
}
function detailList(pairs){return `<dl class="detail-list">${pairs.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`}
function mapLocationSelected(id){
  const loc=locationById.get(id);if(!loc)return;
  mapState={...mapState,locationId:id};
  drawMap($('#mapCanvas'),mapState,{onLocation:mapLocationSelected,onRoute:mapRouteSelected});
  const availability=loc.recommendationAvailable?`${loc.historicalRouteCount} recorded mode combinations`:'Selectable on the map only — no historical route distance';
  $('#mapSelection').className='';
  $('#mapSelection').innerHTML=`<h3>${esc(loc.name)}</h3>${detailList([['Country',loc.country],['Role',loc.role],['Coordinates',`${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`],['Route history',availability]])}<div class="detail-actions"><button class="btn" type="button" data-set-loc="origin">Set as origin</button><button class="btn" type="button" data-set-loc="destination">Set as destination</button></div>`;
  $('#mapSelection').querySelectorAll('[data-set-loc]').forEach(button=>button.onclick=()=>{
    $('#map'+(button.dataset.setLoc==='origin'?'Origin':'Destination')).value=loc.name;
    mapLocationSelected(id);
  });
}
async function mapRouteSelected(id){
  const route=routeById.get(id);if(!route)return;
  const load=Number($('#mapLoad').value)||5000;
  $('#mapOrigin').value=route.from;$('#mapDestination').value=route.to;$('#mapMode').value=route.mode;
  mapState={origin:route.from,destination:route.to,mode:route.mode,load,routeId:id,locationId:null};
  drawMap($('#mapCanvas'),mapState,{onLocation:mapLocationSelected,onRoute:mapRouteSelected});
  $('#mapSelection').className='';
  $('#mapSelection').innerHTML=`<h3>${esc(route.from)} → ${esc(route.to)}</h3>${detailList([['Mode',route.mode],['Distance',route.available?`${route.distanceKm} km (recorded)`:'Not available'],['Provenance',route.available?route.provenance:route.reason],['Samples',route.sampleCount]])}`;
  if(!route.available){
    $('#mapRouteResult').innerHTML=`<div class="empty-state" style="margin-top:12px"><b>No verified route distance</b>No model prediction is produced for this route and mode. Algiers and other Algerian locations remain selectable on the map.</div>`;
    return;
  }
  try{
    const candidate=await predictionForRoute(route.from,route.to,route.mode,load);
    $('#mapRouteResult').innerHTML=`<div style="margin-top:14px"><span class="status-chip">Model estimate</span>${detailList([['Selected transport',candidate.mode],['Route distance',`${candidate.distanceKm} km`],['Predicted duration',`${candidate.predictedDays} days`],['Estimated cost',`$${candidate.estimatedCost.toLocaleString('en-US')}`],['Basis',candidate.predictionBasis]])}<div class="note">Condition inputs: road ${candidate.conditions.roadQuality}, traffic ${candidate.conditions.trafficIntensity}, port congestion ${candidate.conditions.portCongestion}, port efficiency ${candidate.conditions.portEfficiency}, connectivity ${candidate.conditions.logisticsConnectivity}.</div></div>`;
  }catch(e){$('#mapRouteResult').innerHTML=`<div class="empty-state" style="margin-top:12px"><b>Estimate unavailable</b>${esc(e.message)}</div>`}
}
async function predictionForRoute(origin,destination,mode,load){
  const d=await api('/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin,destination,cargoWeightKg:load,objective:'fastest',modePreference:mode})});
  return d.ranked.find(candidate=>candidate.mode===mode)||d.best;
}
async function showMapRoute(e){
  if(e)e.preventDefault();
  const origin=$('#mapOrigin').value,destination=$('#mapDestination').value,mode=$('#mapMode').value,load=Number($('#mapLoad').value);
  if(!origin||!destination||!mode)return $('#mapSelection').innerHTML=`<div class="empty-state"><b>Incomplete selection</b>Choose an origin, destination, and transport method.</div>`;
  if(origin===destination)return $('#mapSelection').innerHTML=`<div class="empty-state"><b>Same location</b>Choose two different locations.</div>`;
  if(!Number.isFinite(load)||load<=0||load>50000)return $('#mapSelection').innerHTML=`<div class="empty-state"><b>Invalid load</b>Enter a load between 1 and 50,000 kg.</div>`;
  const route=findRoute(origin,destination,mode);
  await mapRouteSelected(route?route.id:null);
  if(!route){
    mapState={origin,destination,mode,load,routeId:null,locationId:null};
    drawMap($('#mapCanvas'),mapState,{onLocation:mapLocationSelected,onRoute:mapRouteSelected});
    $('#mapSelection').innerHTML=`<h3>${esc(origin)} → ${esc(destination)}</h3><div class="empty-state" style="margin-top:10px"><b>Route entry not found</b>No verified distance is registered for this pair and mode.</div>`;
    $('#mapRouteResult').innerHTML='';
  }
}
const formatWhen=iso=>iso?new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso)):'Not selected';
function arrivalFor(iso,days){return iso?formatWhen(new Date(Date.parse(iso)+days*86_400_000).toISOString()):'Choose a departure time'}
function selectedCandidate(){return recData?recData.ranked.find(c=>c.rank===recSelectedRank)||recData.best:null}
function renderSelectedCandidate(){
  if(!recData)return;
  const c=selectedCandidate();
  $('#recSelected').innerHTML=`<h3>Selected option · ${esc(c.mode)}</h3>${detailList([
    ['Rank',`${c.rank} of ${recData.candidateCount}`],
    ['Route',`${esc(c.origin)} → ${esc(c.destination)}`],
    ['Distance',`${c.distanceKm} km · recorded`],
    ['Predicted duration',`${c.predictedDays} days`],
    ['Estimated cost',`$${c.estimatedCost.toLocaleString('en-US')}`],
    ['Arrival',arrivalFor(recData.request.departure,c.predictedDays)],
    [`${recData.request.objectiveLabel} score`,c.score.toFixed(4)]
  ])}`;
}
function renderAlternatives(){
  if(!recData)return;
  $('#recAlternatives').innerHTML=recData.ranked.map(c=>`<article class="alt-card ${c.rank===recSelectedRank?'selected':''}" data-rank="${c.rank}"><div class="alt-card-head"><h3>${c.rank===1?'Recommended':`Alternative ${c.rank}`}</h3><span class="status-chip ${c.approximate?'warn':''}">${c.rank===1?'Best':'Rank '+c.rank}</span></div><div class="alt-mode">${esc(c.mode)}</div>${detailList([['Distance',`${c.distanceKm} km`],['Predicted duration',`${c.predictedDays} d`],['Estimated cost',`$${c.estimatedCost.toLocaleString('en-US')}`],['Score',c.score.toFixed(4)]])}<button class="btn" type="button" data-select-rank="${c.rank}">${c.rank===recSelectedRank?'Selected':'View on map'}</button></article>`).join('');
  $('#recAlternatives').querySelectorAll('[data-select-rank]').forEach(button=>button.onclick=()=>selectCandidate(Number(button.dataset.selectRank)));
}
function renderRecommendation(data){
  recData=data;recSelectedRank=1;
  $('#recEmpty').classList.add('hide');$('#recResult').classList.remove('hide');
  const best=data.best,dep=data.departureGuidance;
  $('#recBest').innerHTML=`<span class="status-chip">Best recommendation</span><div class="rec-hero"><strong>${best.predictedDays}</strong><span>days predicted</span></div>${detailList([
    ['Route',`${esc(best.origin)} → ${esc(best.destination)}`],
    ['Transport',best.mode],
    ['Route distance',`${best.distanceKm} km · recorded`],
    ['Estimated cost',`$${best.estimatedCost.toLocaleString('en-US')}`],
    ['Suggested departure',formatWhen(dep.suggestedDeparture)],
    ['Estimated arrival',arrivalFor(dep.suggestedDeparture,best.predictedDays)],
    ['Candidates evaluated',data.candidateCount]
  ])}<div class="rec-explanation">${esc(data.explanation)}</div>`;
  renderAlternatives();renderSelectedCandidate();
  const state={origin:data.request.origin,destination:data.request.destination,mode:best.mode,load:data.request.cargoWeightKg,routeId:best.routeId,locationId:null};
  drawMap($('#recMapCanvas'),state,{},true);
  setMapState(state);
}
function setMapState(state){
  mapState=state;
  $('#mapOrigin').value=state.origin;$('#mapDestination').value=state.destination;$('#mapMode').value=state.mode;$('#mapLoad').value=state.load;
  drawMap($('#mapCanvas'),mapState,{onLocation:mapLocationSelected,onRoute:mapRouteSelected});
  const c=selectedCandidate();
  if(c)$('#mapRouteResult').innerHTML=`<div style="margin-top:12px"><span class="status-chip">Selected option</span>${detailList([['Mode',c.mode],['Distance',`${c.distanceKm} km`],['Predicted duration',`${c.predictedDays} days`],['Estimated cost',`$${c.estimatedCost.toLocaleString('en-US')}`]])}</div>`;
}
function selectCandidate(rank){
  if(!recData)return;
  recSelectedRank=rank;
  const c=selectedCandidate();
  renderAlternatives();renderSelectedCandidate();
  const state={origin:recData.request.origin,destination:recData.request.destination,mode:c.mode,load:recData.request.cargoWeightKg,routeId:c.routeId,locationId:null};
  drawMap($('#recMapCanvas'),state,{},true);
  setMapState(state);
}
async function submitRecommendation(e){
  e.preventDefault();
  const button=$('#recSubmit'),card=$('#recResultCard');
  button.disabled=true;card.setAttribute('aria-busy','true');$('#recError').textContent='';
  try{
    const origin=resolveLocal($('#recOrigin').value),destination=resolveLocal($('#recDestination').value),load=Number($('#recLoad').value);
    if(!origin||!destination)throw Error('Choose an origin and destination from the location list.');
    if(origin.name===destination.name)throw Error('Origin and destination must be different.');
    if(!Number.isFinite(load)||load<=0||load>50000)throw Error('Enter a shipment load between 1 and 50,000 kg.');
    const body={origin:origin.name,destination:destination.name,cargoWeightKg:load,objective:$('input[name="objective"]:checked').value,modePreference:$('#recMode').value,departure:$('#recDeparture').value};
    renderRecommendation(await api('/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  }catch(err){$('#recError').textContent=err.message}
  finally{button.disabled=false;card.removeAttribute('aria-busy')}
}
function closeNav(restoreFocus=false){document.body.classList.remove('nav-open');$('#navToggle').setAttribute('aria-expanded','false');$('#navToggle').setAttribute('aria-label','Open navigation');if(restoreFocus)$('#navToggle').focus()}
function openNav(){document.body.classList.add('nav-open');$('#navToggle').setAttribute('aria-expanded','true');$('#navToggle').setAttribute('aria-label','Close navigation');$('.sidebar-nav .nav-item').focus()}
function setupShell(){
  const toggle=$('#navToggle'),scrim=$('#navScrim'),collapse=$('#sideToggle');
  toggle.onclick=()=>document.body.classList.contains('nav-open')?closeNav():openNav();
  scrim.onclick=()=>closeNav();
  collapse.onclick=()=>{const collapsed=document.body.classList.toggle('sidebar-collapsed');collapse.setAttribute('aria-expanded',String(!collapsed));collapse.setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');collapse.firstElementChild.textContent=collapsed?'›':'‹'};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('nav-open'))closeNav(true)});
  window.matchMedia('(min-width:981px)').addEventListener('change',e=>{if(e.matches)closeNav()});
}
function go(view){$$('.view').forEach(x=>x.classList.toggle('active',x.id===view));$$('.nav button').forEach(x=>{const active=x.dataset.view===view;x.classList.toggle('active',active);active?x.setAttribute('aria-current','page'):x.removeAttribute('aria-current')});$('#crumb').textContent=({dashboard:'Dashboard',map:'Interactive Map',recommend:'Smart Recommendations',predictor:'Predictor & What-If',users:'Target Users & Use Cases'})[view]||'Dashboard';closeNav();window.scrollTo({top:0,behavior:'smooth'})}
async function init(){setupShell();meta=await api('/api/meta');fillSelects();await loadGeoData();['fMode','fOrigin','fDestination','fSeverity'].forEach(id=>$('#'+id).onchange=dashboard);$$('.nav button').forEach(x=>x.onclick=()=>go(x.dataset.view));$('#mapForm').onsubmit=showMapRoute;$('#recForm').onsubmit=submitRecommendation;$('#predictForm').onsubmit=predict;$('#loadPreset').onclick=()=>loadPreset('planner');$('#resetScenario').onclick=()=>{if(baseline)buildSliders()};$('#runScenario').onclick=scenario;$$('.usecase').forEach(x=>x.onclick=()=>loadPreset(x.dataset.preset));dashboard()}
init().catch(e=>alert('Could not connect to model service: '+e.message));
