(function(){
'use strict';
const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n);
let biz=null,w={},gst=true,ready=!RD.slug,available=!RD.slug,current=null,routeVersion=0,routeSource='Manual distance';
const suffix=RD.slug?'?b='+encodeURIComponent(RD.slug):'';
$('homeLink').href=$('business').href='site.html'+suffix;$('staffLink').href='app/'+suffix+'#website';
document.querySelectorAll('.estimator').forEach(a=>a.href='estimate.html'+suffix);
document.querySelectorAll('.booking').forEach(a=>a.href=booking('visit'));
function booking(intent){return(RD.slug?'app/?b='+encodeURIComponent(RD.slug)+'&intent='+intent:'demo/?intent='+intent)+'#book';}
function input(){
 return {bedrooms:$('bedrooms').value,living:$('living').value,extra:$('extra').value,load:$('load').value,distance:$('distance').value,bulky:$('bulky').value,packing:$('packing').value,pickup:{floors:$('pickupFloors').value,carry:$('pickupCarry').value,lift:$('pickupLift').checked},dropoff:{floors:$('dropoffFloors').value,carry:$('dropoffCarry').value,lift:$('dropoffLift').checked}};
}
function render(){
 current=null;let err='';try{if(!ready)throw Error(available?'Ask the removalist for rates':'Loading business…');if(!$('movingForm').checkValidity()){const bad=Array.from($('movingForm').elements).find(e=>e.type==='number'&&!e.checkValidity());if(bad)throw Error('Check the highlighted fields.');}current=RM.calculate(input(),w,gst);}catch(e){err=e.message;}
 $('estimateTotal').textContent=current?money(current.low)+' – '+money(current.high):err;
 $('estimateTax').textContent=current?(gst?'Includes 10% GST':'GST not added')+' · planning guide only':'The removalist must publish their rates before estimates can be calculated.';
 $('breakdown').replaceChildren();
 if(current){for(const [name,value]of[['Crew + truck ('+current.hours.toFixed(1)+' h)',current.crew],['Vehicle distance charge',current.vehicle],['Setup / callout',current.callout],['Packing & bulky-item allowances',current.extras],...(current.minAdjustment?[['Minimum adjustment',current.minAdjustment]]:[]),...(gst?[['GST',current.tax]]:[]),['Calculated total',current.total]]){const row=document.createElement('div');row.className='line';const a=document.createElement('span'),b=document.createElement('span');a.textContent=name;b.textContent=money(value);row.append(a,b);$('breakdown').append(row);}}
 $('volumeSummary').textContent=current?'Approx. '+current.volume.toFixed(1)+' m³ · loading, unloading, driving and access included in estimated crew hours.':'';
 $('reviewNote').textContent=current&&current.review?'Larger, longer-distance or difficult-access move: an individual assessment is especially important.':'';
 $('requestQuote').disabled=$('bookVisit').disabled=!available;
 $('saveEstimate').disabled=$('printEstimate').disabled=!current;
 const r=RM.rates(w);$('assumptions').textContent=(RD.slug?'Published business rates':'Illustrative demo rates — a real business sets its own')+': crew + truck '+money(r.hourlyRate)+'/hour, vehicle '+r.perKm.toFixed(2)+'/km, setup '+money(r.calloutFee)+', minimum '+r.minimumHours+' hours / '+money(r.minimum)+' before GST. Loading '+r.handlingRate+' m³/hour; unloading '+Math.round(r.unloadFactor*100)+'% of loading; driving '+r.driveSpeed+' km/hour; stairs '+r.stairsMinutes+' min/floor; lift '+r.liftMinutes+' min/property; carry '+r.carryMinutes+' min per 25 m/property; bulky item '+money(r.bulkyFee)+'; packing '+money(r.packingHourly)+'/crew hour. Range ±'+r.spread+'%. Driving labour time and vehicle km charges are both included. Actual inventory and truck requirements may differ.';
}
function summary(){
 const i=input(),p=$('from').value.trim(),to=$('to').value.trim();
 const access=prefix=>$ (prefix+'Type').value+', '+$(prefix+'Floors').value+' floors, lift '+($(prefix+'Lift').checked?'yes':'no')+', carry '+$(prefix+'Carry').value+' m';
 return(biz?.name||'Removalist Deluxe demo')+' — MOVING QUOTATION REQUEST\nPickup: '+p+'\nDestination: '+to+'\nPreferred moving date: '+($('moveDate').value||'To discuss')+' (not reserved)\nRooms: '+i.bedrooms+' bedrooms, '+i.living+' living/dining, '+i.extra+' other; contents '+$('load').selectedOptions[0].text+'\nRoute: '+i.distance+' km; '+routeSource+'\nPickup access: '+access('pickup')+'\nDestination access: '+access('dropoff')+'\nBulky items: '+i.bulky+'; packing crew hours: '+i.packing+'\n'+(current?'INDICATIVE RANGE: '+money(current.low)+' – '+money(current.high)+'; calculated total '+money(current.total)+(gst?' including GST.':' without GST.')+'\nApprox. '+current.volume.toFixed(1)+' m³ and '+current.hours.toFixed(1)+' crew hours.':'Estimate unavailable — business rates or inputs need checking.')+'\nOther requirements: '+$('notes').value.trim()+'\nA written quote and moving-day availability must be confirmed directly. Tolls, storage, ferries, overnight stays, insurance upgrades and specialist handling excluded unless agreed. This summary is not a booking or contract.';
}
function handoff(intent){
 if(!$('movingForm').reportValidity())return;
 const text=summary();try{sessionStorage.setItem('removalistBrief:'+(RD.slug||'demo'),JSON.stringify({at:Date.now(),pickup:$('from').value.trim(),text}));}catch{alert('Your browser could not carry the details. Download the estimate summary and add it to the quotation request.');return;}
 location.href=booking(intent);
}
$('requestQuote').onclick=()=>handoff('quote');$('bookVisit').onclick=()=>handoff('visit');
$('movingForm').onsubmit=e=>e.preventDefault();
$('movingForm').addEventListener('input',e=>{if(['from','to'].includes(e.target.id)){routeVersion++;{$('distance').value='';routeSource='Manual distance';$('routeStatus').textContent='Route changed. Recalculate or enter a driving distance.';}}if(e.target.id==='distance'){routeSource='Manual distance';$('routeStatus').textContent='Using your entered driving distance.';}render();});
$('saveEstimate').onclick=()=>{if(!current||!$('movingForm').reportValidity())return;const link=document.createElement('a'),url=URL.createObjectURL(new Blob([summary()],{type:'text/plain;charset=utf-8'}));link.href=url;link.download='Moving_Estimate_Summary.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('printEstimate').onclick=()=>{if(!current||!$('movingForm').reportValidity())return;$('printSummary').textContent=summary();window.print();};
const geoCache=new Map();let lastGeo=0;
async function geo(q){
 q=q.trim();if(geoCache.has(q))return geoCache.get(q);
 const wait=Math.max(0,1100-(Date.now()-lastGeo));if(wait)await new Promise(r=>setTimeout(r,wait));lastGeo=Date.now();
 const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&q='+encodeURIComponent(q+', Australia'),{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Location lookup unavailable.');
 const data=await r.json();if(!data[0])throw Error('Could not match a suburb. Add the state and postcode.');const p={lat:Number(data[0].lat),lon:Number(data[0].lon),name:data[0].display_name};if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))throw Error('Invalid location result.');geoCache.set(q,p);return p;
}
$('route').onclick=async()=>{
 const from=$('from').value.trim(),to=$('to').value.trim();if(!from||!to){$('routeStatus').textContent='Enter both suburbs and postcodes first.';return;}
 const version=++routeVersion; $('route').disabled=true;$('routeStatus').textContent='Matching suburbs and finding the road route…';
 try{const a=await geo(from),b=await geo(to);const response=await fetch('https://router.project-osrm.org/route/v1/driving/'+a.lon+','+a.lat+';'+b.lon+','+b.lat+'?overview=false&steps=false',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Road route unavailable.');const data=await response.json();if(data.code!=='Ok'||!data.routes?.[0])throw Error('No road route found.');if(version!==routeVersion)return;const km=data.routes[0].distance/1000;if(!Number.isFinite(km)||km>3000)throw Error('This route needs an individual quote.');$('distance').value=Math.max(0.1,km).toFixed(1);routeSource='Approximate suburb route from OpenStreetMap / OSRM';$('routeStatus').textContent='Approx. '+$('distance').value+' km. Matched: '+a.name+' → '+b.name+'. Confirm the route and truck access with the removalist.';render();}
 catch(e){if(version===routeVersion)$('routeStatus').textContent=(e.name==='TimeoutError'?'Route lookup timed out.':e.message)+' Enter driving kilometres manually to continue.';}
 finally{$('route').disabled=false;}
};
$('moveDate').min=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
render();RD.load().then(b=>{biz=b;w=b?.website||{};gst=b?.gst!==false;available=true;ready=!RD.slug||Number.isFinite(w.hourlyRate);if(b){$('business').textContent=b.name;$('business').href='site.html'+suffix;$('footerName').textContent=b.name+' · Powered by Removalist Deluxe';$('contact').textContent=[b.phone,b.email,b.base?'Based in '+b.base:''].filter(Boolean).join(' · ');if(/^#[0-9a-f]{6}$/i.test(w.accent||''))document.documentElement.style.setProperty('--accent',w.accent);}if(RD.slug)$('notice').hidden=true;if(RD.mountChat)RD.mountChat(b);render();}).catch(()=>{available=false;ready=false;$('notice').textContent='This business is unavailable. Please contact the removalist directly.';render();});
})();
