/* Configurable planning model, not a market-price or binding quote engine. */
(function(scope){
'use strict';
const defaults={hourlyRate:160,perKm:1.8,calloutFee:80,minimumHours:2,minimum:350,baseVolume:6,bedroomVolume:5,livingVolume:8,extraVolume:4,handlingRate:10,unloadFactor:0.65,driveSpeed:45,stairsMinutes:20,liftMinutes:15,carryMinutes:10,bulkyFee:60,packingHourly:120,spread:20};
function number(v,min,max,name){if(v===''||v==null)throw Error('Check '+name+'.');v=Number(v);if(!Number.isFinite(v)||v<min||v>max)throw Error('Check '+name+'.');return v;}
function rates(website){const r={...defaults};for(const k of Object.keys(defaults)){if(website&&Number.isFinite(website[k]))r[k]=website[k];}r.handlingRate=Math.max(1,r.handlingRate);r.driveSpeed=Math.max(5,r.driveSpeed);r.spread=Math.max(0,Math.min(50,r.spread));for(const k of Object.keys(r))r[k]=Math.max(0,r[k]);return r;}
function calculate(input,website,gst){
 const r=rates(website),bedrooms=number(input.bedrooms,0,8,'bedroom count'),living=number(input.living,0,6,'living room count'),extra=number(input.extra,0,10,'other room count'),km=number(input.distance,0,3000,'driving distance'),load=number(input.load,0.5,2,'contents level'),bulky=number(input.bulky,0,20,'bulky items'),packing=number(input.packing,0,30,'packing hours');
 function access(p){const floors=number(p.floors,0,20,'floors'),carry=number(p.carry,0,250,'carrying distance'),lift=p.lift===true;return (lift&&floors>0?r.liftMinutes:floors*r.stairsMinutes)+Math.ceil(carry/25)*r.carryMinutes;}
 const volume=(r.baseVolume+bedrooms*r.bedroomVolume+living*r.livingVolume+extra*r.extraVolume)*load;
 const loading=volume/r.handlingRate,unloading=loading*r.unloadFactor,drive=km/r.driveSpeed,accessHours=(access(input.pickup)+access(input.dropoff))/60;
 const hours=Math.max(r.minimumHours,loading+unloading+drive+accessHours),crew=hours*r.hourlyRate,vehicle=km*r.perKm,extras=bulky*r.bulkyFee+packing*r.packingHourly;
 const raw=crew+vehicle+extras+r.calloutFee,minAdjustment=Math.max(0,r.minimum-raw),subtotal=raw+minAdjustment,tax=gst?subtotal*.1:0,total=subtotal+tax,low=total*(1-r.spread/100),high=total*(1+r.spread/100);
 return {rates:r,volume,loading,unloading,drive,accessHours,hours,crew,vehicle,extras,callout:r.calloutFee,minAdjustment,subtotal,tax,total,low,high,review:km>200||bedrooms>4||bulky>2||input.pickup.floors>5||input.dropoff.floors>5};
}
scope.RM={defaults,rates,calculate};
})(typeof window==='undefined'?globalThis:window);
