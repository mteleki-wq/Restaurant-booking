import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const script = readFileSync(new URL('../restaurant-analytics.js', import.meta.url), 'utf8');
function simulate(path, search = '', storageBlocked = false) {
 const sent = [], listeners = {}, storage = new Map();
 const context = { window: { innerWidth: 800 }, location: { hostname: 'webescapade.com', pathname: path, search, origin: 'https://webescapade.com', href: 'https://webescapade.com' + path + search }, URL, URLSearchParams, crypto: { randomUUID: () => 'anonymous-browser-id' }, localStorage: { getItem: key => { if(storageBlocked) throw Error('blocked'); return storage.get(key); }, setItem: (key,v) => storage.set(key,v) }, document: { referrer:'', getElementById: () => null, addEventListener: (name,fn) => listeners[name] = fn }, fetch: (url,init) => { sent.push({url,...JSON.parse(init.body)}); return Promise.resolve({ ok: true }); } };
 runInNewContext(script,context); runInNewContext(script,context);
 return { sent, listeners };
}
for(const [path,search,scope] of [['/Restaurant/','','website'],['/Restaurant/site-editable.html','?edit=1','editor'],['/Resto-order-test/table-order.html','?venue=demo&table=secret-token','ordering'],['/Resto-order-test/staff-kds.html','','staff']]) {
 test(`records ${scope} separately without query secrets or duplicate page views`,()=>{
  const {sent}=simulate(path,search); assert.equal(sent.length,1);assert.equal(sent[0].metadata.scope,scope);assert.equal(sent[0].page_url,'https://webescapade.com'+path);assert.ok(!JSON.stringify(sent).includes('secret-token')); assert.equal(sent[0].event_name,'page_view');
 });
}
test('blocked browser storage preserves one anonymous ID for events on the same page',()=>{
 const {sent,listeners}=simulate('/Restaurant/','',true);
 listeners.click({target:{closest:()=>({getAttribute:()=> 'ordering',href:'https://example.invalid/demo?secret=hidden'})}});
 assert.equal(sent[0].session_id,sent[1].session_id);assert.equal(sent[1].event_name,'ordering_click');assert.equal(sent[1].target_url,'https://example.invalid/demo');
});
test('live and editable masters load the tracker before body closes',()=>{
 for(const path of ['Restaurant/index.html','Restaurant/site-editable.html','Restaurant/site-editable-final.html','source/site-editable.html','Resto-order-test/table-order.html','Resto-order-test/staff-counter.html','Resto-order-test/staff-kds.html','Resto-order-test/staff-order-entry.html','Resto-order-test/restaurant-menu-manager.html','Resto-order-test/platform-admin.html','Resto-order-test/restaurant-deluxe-dashboard.html','Resto-order-test/terms.html']) {
 const html=readFileSync(new URL('../'+path,import.meta.url),'utf8');assert.equal(html.match(/src="\.\.\/restaurant-analytics.js"/g)?.length,1,path);assert.ok(html.lastIndexOf('restaurant-analytics.js') < html.toLowerCase().lastIndexOf('</body>'));
 }
});
