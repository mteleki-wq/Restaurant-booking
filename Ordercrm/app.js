(() => {
  'use strict';

  const CONFIG = {
    supabaseUrl: 'https://tehxobdokbvqtwtgqzrh.supabase.co',
    publishableKey: 'sb_publishable_CrlY9xXYdhI7qCQwuMnDWg_hFQ3mXCJ',
    currency: 'AUD'
  };

  const NAV = [
    ['overview','▦','Overview'],['sales','⌁','Sales'],['menu','◫','Menu'],['tables','▤','Tables'],
    ['operations','◉','Operations'],['payments','◇','Payments'],['ask','✦','Ask Analytics'],['export','⇩','Export'],['connection','⚙','Connection']
  ];

  const state = {
    page:'overview', days:30, mode:'demo', accessToken:sessionStorage.getItem('rd_access_token') || '',
    venues:[], venueId:'demo-sunset', dataset:null, loading:false, userEmail:sessionStorage.getItem('rd_user_email') || ''
  };

  const $ = s => document.querySelector(s);
  const content = $('#content');
  const nav = $('#nav');
  const venueSelect = $('#venueSelect');
  const banner = $('#banner');

  const money = cents => new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format((Number(cents)||0)/100);
  const pct = v => Number.isFinite(v) ? `${(v*100).toFixed(1)}%` : '—';
  const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const localDate = d => new Date(d).toLocaleDateString('en-AU',{day:'numeric',month:'short'});
  const minutes = v => Number.isFinite(v) ? (v<60?`${Math.round(v)} min`:`${Math.floor(v/60)}h ${Math.round(v%60)}m`) : '—';
  const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const fromDays = days => { const d=new Date(); d.setDate(d.getDate()-days+1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const sum = (arr, fn=x=>x) => arr.reduce((a,x)=>a+(Number(fn(x))||0),0);
  const groupBy = (arr, fn) => arr.reduce((m,x)=>{const k=fn(x);(m[k]??=[]).push(x);return m;},{});
  const avg = vals => vals.length ? sum(vals)/vals.length : null;

  function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
  function setBanner(msg=''){ banner.textContent=msg; banner.classList.toggle('hidden',!msg); }

  function buildNav(){
    nav.innerHTML = NAV.map(([id,icon,label])=>`<button data-page="${id}" class="${state.page===id?'active':''}"><span class="icon">${icon}</span>${label}</button>`).join('');
    nav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ state.page=b.dataset.page; $('#sidebar').classList.remove('open'); buildNav(); render(); }));
  }

  function setTitle(title, subtitle='Know what is happening in your restaurant.'){
    $('#pageTitle').textContent=title; $('#pageSubtitle').textContent=subtitle;
  }

  function setConnectionUI(){
    const el=$('#connectionMini');
    el.innerHTML = state.mode==='live' ? `<span class="dot live"></span><div><strong>Live Supabase</strong><small>${esc(state.userEmail||'Authenticated staff')}</small></div>` : `<span class="dot demo"></span><div><strong>Demo data</strong><small>Safe preview mode</small></div>`;
  }

  async function signIn(email,password){
    const res=await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'apikey':CONFIG.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const body=await res.json(); if(!res.ok) throw new Error(body.error_description||body.msg||'Sign in failed');
    state.accessToken=body.access_token; state.userEmail=email; sessionStorage.setItem('rd_access_token',body.access_token); sessionStorage.setItem('rd_user_email',email);
    state.mode='live'; await loadVenues(); await loadData();
  }

  function signOut(){ state.accessToken=''; state.mode='demo'; state.userEmail=''; sessionStorage.removeItem('rd_access_token'); sessionStorage.removeItem('rd_user_email'); initDemo(); toast('Switched to demo mode'); }

  async function restAll(table, query=''){
    const all=[]; let start=0; const page=1000;
    while(true){
      const res=await fetch(`${CONFIG.supabaseUrl}/rest/v1/${table}?${query}`,{headers:{'apikey':CONFIG.publishableKey,'Authorization':`Bearer ${state.accessToken}`,'Range':`${start}-${start+page-1}`,'Range-Unit':'items','Prefer':'count=exact'}});
      if(!res.ok) throw new Error(`${table}: ${await res.text()}`);
      const rows=await res.json(); all.push(...rows); if(rows.length<page) break; start+=page; if(start>10000) break;
    } return all;
  }

  async function loadVenues(){
    state.venues=await restAll('rd_venues','select=id,slug,name,timezone,currency_symbol&order=name.asc');
    if(!state.venues.length) throw new Error('No restaurant venues are available for this account.');
    if(!state.venues.some(v=>v.id===state.venueId)) state.venueId=state.venues[0].id;
    updateVenueSelect();
  }

  async function loadData(){
    state.loading=true; renderLoading(); setBanner('');
    try{
      if(state.mode==='demo'){ state.dataset=makeDemoDataset(state.days); state.loading=false; render(); return; }
      const from=fromDays(state.days), to=todayStr(), v=encodeURIComponent(state.venueId);
      const [orders,sessions,tables,payments,stations,allItems,events,mods] = await Promise.all([
        restAll('rd_orders',`select=*&venue_id=eq.${v}&service_date=gte.${from}&service_date=lte.${to}&order=service_date.asc`),
        restAll('rd_table_sessions',`select=*&venue_id=eq.${v}&service_date=gte.${from}&service_date=lte.${to}&order=opened_at.asc`),
        restAll('rd_tables',`select=id,venue_id,label,active,seats,sort&venue_id=eq.${v}&order=sort.asc`),
        restAll('rd_payments',`select=*&venue_id=eq.${v}&service_date=gte.${from}&service_date=lte.${to}&order=created_at.asc`),
        restAll('rd_stations',`select=id,venue_id,name&venue_id=eq.${v}`),
        restAll('rd_order_items','select=*'),
        restAll('rd_order_status_events','select=*'),
        restAll('rd_order_item_modifiers','select=*')
      ]);
      const orderIds=new Set(orders.map(o=>o.id));
      state.dataset={orders,sessions,tables,payments,stations,items:allItems.filter(x=>orderIds.has(x.order_id)),events:events.filter(x=>orderIds.has(x.order_id)),mods:mods.filter(m=>allItems.some(i=>i.id===m.order_item_id&&orderIds.has(i.order_id))),from,to,isDemo:false};
      state.loading=false; render();
    }catch(e){ state.loading=false; setBanner(`Live data could not be loaded: ${e.message}`); render(); }
  }

  function initDemo(){
    state.mode='demo'; state.venues=[{id:'demo-sunset',name:'Sunset Grill — Demo'},{id:'demo-cafe',name:'Cafe Bojo — Demo'}]; state.venueId=state.venues[0].id; updateVenueSelect(); state.dataset=makeDemoDataset(state.days); setConnectionUI(); render();
  }

  function updateVenueSelect(){ venueSelect.innerHTML=state.venues.map(v=>`<option value="${esc(v.id)}" ${v.id===state.venueId?'selected':''}>${esc(v.name)}</option>`).join(''); }

  function makeDemoDataset(days){
    let seed=state.venueId==='demo-cafe'?771:137; const rnd=()=>{seed=(seed*9301+49297)%233280;return seed/233280};
    const venueId=state.venueId, tableDefs=['T1','T2','T3','T4','T5','T6','T7','T8','Terrace 1','Bar 1'];
    const tables=tableDefs.map((label,i)=>({id:`t${i}`,venue_id:venueId,label,seats:i===9?2:2+(i%3)*2,active:true,sort:i}));
    const stations=[{id:'s-kitchen',venue_id:venueId,name:'Kitchen'},{id:'s-grill',venue_id:venueId,name:'Grill'},{id:'s-bar',venue_id:venueId,name:'Bar'},{id:'s-dessert',venue_id:venueId,name:'Dessert'}];
    const menu=[['Scotch Fillet',4200,'s-grill',8,.25],['Barramundi',3600,'s-grill',7,.05],['Chicken & Chips',2100,'s-kitchen',9,.15],['Crispy Calamari',1900,'s-kitchen',8,-.25],['Pumpkin Risotto',2800,'s-kitchen',6,-.35],['House Burger',2400,'s-kitchen',9,.10],['Fries',1100,'s-kitchen',11,.05],['Tiramisu',1600,'s-dessert',5,-.2],['House Red Glass',1400,'s-bar',9,.3],['Craft Lager',1300,'s-bar',10,.15],['Negroni',2100,'s-bar',5,.35],['Sparkling Water',900,'s-bar',6,0]];
    const orders=[],items=[],sessions=[],payments=[],events=[],mods=[]; let orderNo=1000;
    for(let d=days-1;d>=0;d--){
      const day=new Date();day.setHours(0,0,0,0);day.setDate(day.getDate()-d);const ds=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
      const weekend=[5,6].includes(day.getDay())?1.5:1; const count=Math.max(2,Math.round((7+rnd()*7)*weekend));
      for(let s=0;s<count;s++){
        const table=tables[Math.floor(rnd()*tables.length)], hour=rnd()<.32?12+Math.floor(rnd()*3):18+Math.floor(rnd()*4), min=Math.floor(rnd()*60); const opened=new Date(day);opened.setHours(hour,min,0,0);
        const duration=42+Math.floor(rnd()*65), sessionId=`sess-${ds}-${s}`, isToday=d===0, stillOpen=isToday&&rnd()<.18;
        sessions.push({id:sessionId,venue_id:venueId,table_id:table.id,status:stillOpen?'open':'closed',service_date:ds,opened_at:opened.toISOString(),closed_at:stillOpen?null:new Date(opened.getTime()+duration*60000).toISOString()});
        const numOrders=1+(rnd()<.35?1:0);
        for(let o=0;o<numOrders;o++){
          const orderId=`o-${ds}-${s}-${o}`, created=new Date(opened.getTime()+o*15*60000), lineCount=2+Math.floor(rnd()*4); let total=0;
          for(let li=0;li<lineCount;li++){
            const weights=menu.map(m=>Math.max(.3,m[3]*(1+m[4]*((days-d)/days)))); let r=rnd()*sum(weights);let idx=0;while(r>weights[idx]&&idx<menu.length-1){r-=weights[idx++]} const m=menu[idx], qty=rnd()<.15?2:1, mod=rnd()<.22?200+Math.floor(rnd()*4)*100:0, line=(m[1]+mod)*qty; total+=line;
            const itemId=`oi-${orderId}-${li}`; items.push({id:itemId,order_id:orderId,item_id:`item-${idx}`,station_id:m[2],name_snapshot:m[0],qty,base_cents:m[1],modifier_cents:mod,unit_cents:m[1]+mod,line_cents:line,gst_free:m[0]==='Sparkling Water',created_at:created.toISOString(),status:'served'});
            if(mod) mods.push({id:`mod-${itemId}`,order_item_id:itemId,group_name_snapshot:'Extras',name_snapshot:'Add-on',price_delta_cents:mod});
          }
          const paid=!stillOpen&&rnd()>.06, tip=paid&&rnd()<.35?Math.round(total*(.05+rnd()*.06)/50)*50:0;
          orders.push({id:orderId,venue_id:venueId,table_id:table.id,session_id:sessionId,order_number:++orderNo,service_date:ds,status:paid?'paid':'new',subtotal_cents:total,total_cents:total,tip_cents:tip,created_at:created.toISOString(),paid_at:paid?new Date(created.getTime()+duration*60000).toISOString():null,payment_ref:paid?`pi_${orderNo}`:null});
          [['new',0],['accepted',2+rnd()*3],['preparing',3+rnd()*3],['ready',10+rnd()*18],['served',3+rnd()*6]].reduce((tm,[st,mn])=>{tm+=mn*60000;events.push({id:`e-${orderId}-${st}`,order_id:orderId,to_status:st,created_at:new Date(created.getTime()+tm).toISOString(),station_id:items.find(i=>i.order_id===orderId)?.station_id});return tm},0);
          if(paid){ let captured=total+tip; if(rnd()<.018)captured-=200; payments.push({id:`p-${orderId}`,venue_id:venueId,session_id:sessionId,order_id:orderId,amount_cents:captured,method:rnd()<.78?'card':rnd()<.65?'cash':'eftpos',reference:`pi_${orderNo}`,service_date:ds,created_at:new Date(created.getTime()+duration*60000).toISOString()}); if(rnd()<.006)payments.push({...payments[payments.length-1],id:`dup-${orderId}`,created_at:new Date(created.getTime()+duration*60000+70000).toISOString()}); }
        }
      }
    }
    return {orders,items,sessions,payments,stations,tables,events,mods,from:fromDays(days),to:todayStr(),isDemo:true};
  }

  function analytics(ds=state.dataset){
    if(!ds) return null;
    const paidOrders=ds.orders.filter(o=>o.paid_at||o.status==='paid'), paidIds=new Set(paidOrders.map(o=>o.id)), captured=sum(ds.payments,p=>p.amount_cents), orderRevenue=sum(paidOrders,o=>o.total_cents), tips=sum(paidOrders,o=>o.tip_cents), expected=orderRevenue+tips;
    const products={}; ds.items.filter(i=>paidIds.has(i.order_id)).forEach(i=>{const k=i.name_snapshot;products[k]??={name:k,qty:0,revenue:0,modifier:0,station_id:i.station_id,first:0,second:0};const p=products[k];p.qty+=i.qty;p.revenue+=i.line_cents;p.modifier+=(i.modifier_cents||0)*i.qty;const order=ds.orders.find(o=>o.id===i.order_id);const mid=(new Date(ds.from).getTime()+new Date(ds.to).getTime())/2; if(new Date(order.service_date).getTime()<mid)p.first+=i.qty;else p.second+=i.qty;});
    const productRows=Object.values(products).map(p=>({...p,trend:p.first?((p.second-p.first)/p.first):null})).sort((a,b)=>b.revenue-a.revenue);
    const days={}; for(let i=0;i<state.days;i++){const d=new Date();d.setDate(d.getDate()-i);const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;days[k]={date:k,revenue:0,orders:0};} paidOrders.forEach(o=>{days[o.service_date]??={date:o.service_date,revenue:0,orders:0};days[o.service_date].revenue+=o.total_cents;days[o.service_date].orders++});
    const tableMap={};ds.tables.forEach(t=>tableMap[t.id]={...t,revenue:0,orders:0,sessions:0,open:0,durations:[]});paidOrders.forEach(o=>{if(tableMap[o.table_id]){tableMap[o.table_id].revenue+=o.total_cents;tableMap[o.table_id].orders++}});ds.sessions.forEach(s=>{const t=tableMap[s.table_id];if(t){t.sessions++;if(!s.closed_at)t.open++;else t.durations.push((new Date(s.closed_at)-new Date(s.opened_at))/60000)}});
    const tableRows=Object.values(tableMap).map(t=>({...t,avgSpend:t.orders?t.revenue/t.orders:0,avgSession:avg(t.durations),ordersPerSession:t.sessions?t.orders/t.sessions:0})).sort((a,b)=>b.revenue-a.revenue);
    const stationNames=Object.fromEntries(ds.stations.map(s=>[s.id,s.name])); const stationMap={}; ds.items.forEach(i=>{const k=i.station_id||'none';stationMap[k]??={name:stationNames[k]||'Unassigned',qty:0,revenue:0};stationMap[k].qty+=i.qty;stationMap[k].revenue+=i.line_cents});
    const eventByOrder=groupBy(ds.events,e=>e.order_id); const timingRows=ds.orders.map(o=>{const ev=(eventByOrder[o.id]||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));const tm=Object.fromEntries(ev.map(e=>[e.to_status,new Date(e.created_at).getTime()]));const diff=(a,b)=>tm[a]&&tm[b]?(tm[b]-tm[a])/60000:null;return {order:o,total:diff('new','served')??diff('placed','served'),prep:diff('accepted','ready'),serve:diff('ready','served')}}).filter(x=>x.total!=null||x.prep!=null);
    const paymentsByOrder=groupBy(ds.payments.filter(p=>p.order_id),p=>p.order_id);const recon=ds.orders.map(o=>{const ps=paymentsByOrder[o.id]||[], capturedOrder=sum(ps,p=>p.amount_cents), expectedOrder=(o.paid_at||o.status==='paid')?(o.total_cents+(o.tip_cents||0)):o.total_cents+(o.tip_cents||0);let issue='OK';if(!(o.paid_at||o.status==='paid')&&!ps.length)issue='Unpaid';else if(ps.length>1)issue='Possible duplicate';else if(ps.length&&capturedOrder!==expectedOrder)issue='Amount mismatch';else if((o.paid_at||o.status==='paid')&&!ps.length)issue='Payment missing';return {order:o,expected:expectedOrder,captured:capturedOrder,variance:capturedOrder-expectedOrder,issue}});
    ds.payments.filter(p=>!p.order_id).forEach(p=>recon.push({order:{order_number:'—',service_date:p.service_date,id:null},expected:0,captured:p.amount_cents,variance:p.amount_cents,issue:'Payment without order'}));
    return {paidOrders,captured,orderRevenue,tips,expected,variance:captured-expected,avgOrder:paidOrders.length?orderRevenue/paidOrders.length:0,activeTables:ds.sessions.filter(s=>!s.closed_at||s.status==='open').length,productRows,daily:Object.values(days).sort((a,b)=>a.date.localeCompare(b.date)),tableRows,stationRows:Object.values(stationMap).sort((a,b)=>b.qty-a.qty),timingRows,recon,unpaid:ds.orders.filter(o=>!(o.paid_at||o.status==='paid'))};
  }

  function delta(current,previous){ if(!previous)return null; return (current-previous)/previous; }
  function kpi(label,value,sub='',tone='neutral'){return `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="delta ${tone}">${sub}</div></div>`;}

  function lineChart(rows){
    if(!rows.length)return '<div class="empty">No sales data for this period.</div>'; const w=920,h=250,p=24,max=Math.max(1,...rows.map(r=>r.revenue)); const step=(w-p*2)/Math.max(1,rows.length-1); const pts=rows.map((r,i)=>[p+i*step,h-p-(r.revenue/max)*(h-p*2)]); const path=pts.map((q,i)=>`${i?'L':'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');const area=`${path} L${pts[pts.length-1][0]},${h-p} L${pts[0][0]},${h-p} Z`; const labels=rows.filter((_,i)=>i===0||i===rows.length-1||i%Math.ceil(rows.length/5)===0).map((r)=>{const i=rows.indexOf(r),x=p+i*step;return `<text x="${x}" y="${h-4}" text-anchor="middle" class="chart-axis">${localDate(r.date)}</text>`}).join(''); return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="lineGrad"><stop stop-color="#8b5cf6"/><stop offset="1" stop-color="#21d4e5"/></linearGradient><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#725df0" stop-opacity=".55"/><stop offset="1" stop-color="#725df0" stop-opacity="0"/></linearGradient></defs>${[.25,.5,.75,1].map(v=>`<line x1="${p}" x2="${w-p}" y1="${h-p-v*(h-p*2)}" y2="${h-p-v*(h-p*2)}" class="chart-grid"/>`).join('')}<path d="${area}" class="chart-area"/><path d="${path}" class="chart-line"/>${pts.filter((_,i)=>i===pts.length-1).map(q=>`<circle cx="${q[0]}" cy="${q[1]}" r="5" class="chart-dot"/>`).join('')}${labels}</svg>`;
  }

  function bars(rows,labelKey,valueKey,formatter=v=>v){const max=Math.max(1,...rows.map(r=>r[valueKey]));return rows.map(r=>`<div class="bar-row"><div class="bar-label">${esc(r[labelKey])}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,r[valueKey]/max*100)}%"></div></div><div class="bar-value">${formatter(r[valueKey])}</div></div>`).join('')||'<div class="empty">No data available.</div>';}

  function renderLoading(){content.innerHTML='<div class="loading">Loading restaurant data…</div>';}

  function render(){
    setConnectionUI(); updateVenueSelect(); document.querySelectorAll('#rangeSwitch button').forEach(b=>b.classList.toggle('active',Number(b.dataset.days)===state.days));
    if(state.loading){renderLoading();return} if(!state.dataset){content.innerHTML='<div class="empty">No dataset loaded.</div>';return}
    ({overview:renderOverview,sales:renderSales,menu:renderMenu,tables:renderTables,operations:renderOperations,payments:renderPayments,ask:renderAsk,export:renderExport,connection:renderConnection}[state.page]||renderOverview)();
  }

  function renderOverview(){ setTitle('Overview'); const a=analytics(); const top=a.productRows.slice(0,5); const issues=a.recon.filter(r=>r.issue!=='OK');
    content.innerHTML=`<div class="grid kpis">${kpi('Captured revenue',money(a.captured),`${a.paidOrders.length} paid orders`,'positive')}${kpi('Average order',money(a.avgOrder),`${state.days}-day period`)}${kpi('Active tables',a.activeTables,a.activeTables?'Currently open':'No open sessions',a.activeTables?'warn':'neutral')}${kpi('Reconciliation',money(a.variance),a.variance===0?'Orders and payments match':'Needs review',a.variance===0?'positive':'negative')}</div>
    <div class="grid two section-gap"><div class="card"><h2>Sales activity</h2><div class="sub">Paid order revenue across the selected period</div><div class="chart-wrap">${lineChart(a.daily)}</div></div><div class="card"><h2>Top sellers</h2><div class="sub">By item revenue</div>${bars(top,'name','revenue',money)}</div></div>
    <div class="grid two section-gap"><div class="card"><h2>Owner alerts</h2><div class="sub">Things that deserve attention</div>${alertsHtml(a)}</div><div class="card"><h2>At a glance</h2><div class="sub">Operational summary</div>${[['Order revenue',money(a.orderRevenue)],['Tips',money(a.tips)],['Unpaid orders',a.unpaid.length],['Payments recorded',state.dataset.payments.length],['Menu items sold',a.productRows.length],['Avg prep time',minutes(avg(a.timingRows.map(x=>x.prep).filter(Number.isFinite)))]].map(([l,v])=>`<div class="metric-pair"><span>${l}</span><strong>${v}</strong></div>`).join('')}</div></div>`;
  }

  function alertsHtml(a){const arr=[];if(a.unpaid.length)arr.push(['⚠',`${a.unpaid.length} unpaid order${a.unpaid.length===1?'':'s'}`,'Review open or unsettled orders.','warn']);if(Math.abs(a.variance)>100)arr.push(['◇',`Reconciliation variance ${money(a.variance)}`,'Captured payments differ from paid order totals plus tips.','negative']);const declining=a.productRows.filter(p=>p.trend!=null&&p.trend<-.25&&p.first>=3);if(declining.length)arr.push(['↘',`${declining.length} menu item${declining.length===1?'':'s'} declining`,`${declining[0].name} shows the largest decline in this period.`,'warn']);const prep=avg(a.timingRows.map(x=>x.prep).filter(Number.isFinite));if(prep&&prep>22)arr.push(['◷',`Average prep time ${minutes(prep)}`,'Kitchen preparation time is above the 22-minute watch level.','warn']);if(!arr.length)arr.push(['✓','No major issues detected','Trading and reconciliation look stable for this period.','positive']);return arr.map(([ic,t,d,c])=>`<div class="alert"><div class="alert-icon ${c}">${ic}</div><div><strong>${t}</strong><p>${d}</p></div></div>`).join('');}

  function renderSales(){setTitle('Sales','Understand when and how your restaurant earns revenue.');const a=analytics();const methods=Object.values(groupBy(state.dataset.payments,p=>p.method||'unknown')).map(ps=>({method:ps[0].method||'Unknown',amount:sum(ps,p=>p.amount_cents),count:ps.length})).sort((a,b)=>b.amount-a.amount);const taxable=sum(state.dataset.items.filter(i=>!i.gst_free),i=>i.line_cents),gstfree=sum(state.dataset.items.filter(i=>i.gst_free),i=>i.line_cents);content.innerHTML=`<div class="grid kpis">${kpi('Captured',money(a.captured),`${state.dataset.payments.length} payments`,'positive')}${kpi('Order sales',money(a.orderRevenue),`${a.paidOrders.length} paid orders`)}${kpi('Tips',money(a.tips),pct(a.orderRevenue?a.tips/a.orderRevenue:0),'positive')}${kpi('Estimated GST',money(Math.round(taxable/11)),'Taxable sales ÷ 11')}</div><div class="grid two section-gap"><div class="card"><h2>Revenue trend</h2><div class="sub">Paid order value by service date</div><div class="chart-wrap">${lineChart(a.daily)}</div></div><div class="card"><h2>Payment methods</h2><div class="sub">Captured payment mix</div>${bars(methods,'method','amount',money)}</div></div><div class="grid two section-gap"><div class="card"><h2>GST view</h2><div class="sub">Based on order-item GST flags</div>${[['Taxable item sales',money(taxable)],['GST-free item sales',money(gstfree)],['Estimated GST included',money(Math.round(taxable/11))]].map(([l,v])=>`<div class="metric-pair"><span>${l}</span><strong>${v}</strong></div>`).join('')}</div><div class="card"><h2>Settlement</h2><div class="sub">Paid and unpaid order counts</div>${[['Paid orders',a.paidOrders.length],['Unpaid/open orders',a.unpaid.length],['Average paid order',money(a.avgOrder)],['Reconciliation difference',money(a.variance)]].map(([l,v])=>`<div class="metric-pair"><span>${l}</span><strong>${v}</strong></div>`).join('')}</div></div>`;}

  function renderMenu(){setTitle('Menu Analytics','See what sells, what is declining, and where revenue comes from.');const a=analytics(),rows=a.productRows;content.innerHTML=`<div class="page-head"><div><h2>Product performance</h2><p>Historical names and prices come from frozen order-item snapshots.</p></div><span class="status pending">Category history limited</span></div><div class="grid three">${kpi('Top item',esc(rows[0]?.name||'—'),rows[0]?money(rows[0].revenue):'No sales','positive')}${kpi('Items sold',sum(rows,r=>r.qty),`${rows.length} unique menu items`)}${kpi('Modifier revenue',money(sum(rows,r=>r.modifier)),'Recorded add-ons')}</div><div class="card section-gap"><div class="table-wrap"><table class="data-table"><thead><tr><th>Menu item</th><th class="number">Qty</th><th class="money">Revenue</th><th class="money">Modifier revenue</th><th>Station</th><th>Trend</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td class="number">${r.qty}</td><td class="money">${money(r.revenue)}</td><td class="money">${money(r.modifier)}</td><td>${esc(state.dataset.stations.find(s=>s.id===r.station_id)?.name||'—')}</td><td>${r.trend==null?'—':`<span class="${r.trend>=0?'positive':'negative'}">${r.trend>=0?'↗':'↘'} ${Math.abs(r.trend*100).toFixed(0)}%</span>`}</td></tr>`).join('')}</tbody></table></div></div>`;}

  function renderTables(){setTitle('Tables','Understand table value, turnover and session duration.');const a=analytics(),rows=a.tableRows;content.innerHTML=`<div class="grid three">${kpi('Top table',rows[0]?.label||'—',rows[0]?money(rows[0].revenue):'No sales','positive')}${kpi('Open sessions',a.activeTables,'Currently active')}${kpi('Avg session',minutes(avg(rows.map(r=>r.avgSession).filter(Number.isFinite))),'Closed sessions only')}</div><div class="card section-gap"><div class="table-wrap"><table class="data-table"><thead><tr><th>Table</th><th class="money">Revenue</th><th class="number">Orders</th><th class="money">Avg spend</th><th class="number">Sessions</th><th>Avg duration</th><th>Orders / session</th><th>Open</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.label)}</td><td class="money">${money(r.revenue)}</td><td class="number">${r.orders}</td><td class="money">${money(r.avgSpend)}</td><td class="number">${r.sessions}</td><td>${minutes(r.avgSession)}</td><td>${r.ordersPerSession.toFixed(1)}</td><td>${r.open?`<span class="status pending">${r.open} open</span>`:'—'}</td></tr>`).join('')}</tbody></table></div></div>`;}

  function renderOperations(){setTitle('Operations','Track stations, preparation flow and service timing.');const a=analytics(),valid=a.timingRows.filter(x=>Number.isFinite(x.prep)),prep=avg(valid.map(x=>x.prep)),total=avg(a.timingRows.map(x=>x.total).filter(Number.isFinite));const waits=a.timingRows.filter(x=>Number.isFinite(x.total)).sort((x,y)=>y.total-x.total).slice(0,8);content.innerHTML=`<div class="grid kpis">${kpi('Avg prep time',minutes(prep),valid.length?`${valid.length} timed orders`:'Insufficient status history',valid.length?'neutral':'warn')}${kpi('Avg total fulfilment',minutes(total),a.timingRows.length?`${a.timingRows.length} timed orders`:'Insufficient status history')}${kpi('Busiest station',a.stationRows[0]?.name||'—',a.stationRows[0]?`${a.stationRows[0].qty} items`:'No station data')}${kpi('Open tables',a.activeTables,'Live sessions')}</div><div class="grid two section-gap"><div class="card"><h2>Station workload</h2><div class="sub">Items routed by station</div>${bars(a.stationRows,'name','qty',v=>`${v} items`)}</div><div class="card"><h2>Longest fulfilment times</h2><div class="sub">Orders with usable status-event history</div>${waits.length?waits.map(w=>`<div class="metric-pair"><span>Order #${w.order.order_number}</span><strong class="${w.total>30?'warn':''}">${minutes(w.total)}</strong></div>`).join(''):'<div class="empty">Insufficient status history.</div>'}</div></div>`;}

  function renderPayments(){setTitle('Payments & Reconciliation','Match order value to captured payments and surface exceptions.');const a=analytics(),issues=a.recon.filter(r=>r.issue!=='OK');content.innerHTML=`<div class="grid kpis">${kpi('Expected',money(a.expected),'Paid orders + tips')}${kpi('Captured',money(a.captured),`${state.dataset.payments.length} payment records`,'positive')}${kpi('Variance',money(a.variance),a.variance===0?'Fully reconciled':'Needs review',a.variance===0?'positive':'negative')}${kpi('Exceptions',issues.length,issues.length?'Review below':'No exceptions',issues.length?'warn':'positive')}</div><div class="note section-gap">Payment-intent data is intentionally excluded from the browser because <strong>rd_payment_intents</strong> does not currently have Row Level Security enabled. This dashboard uses secured orders and captured payments only.</div><div class="card section-gap"><div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Date</th><th class="money">Expected</th><th class="money">Captured</th><th class="money">Variance</th><th>Status</th></tr></thead><tbody>${a.recon.slice().sort((x,y)=>String(y.order.service_date).localeCompare(String(x.order.service_date))).map(r=>`<tr><td>#${esc(r.order.order_number)}</td><td>${esc(r.order.service_date)}</td><td class="money">${money(r.expected)}</td><td class="money">${money(r.captured)}</td><td class="money ${r.variance===0?'':'negative'}">${money(r.variance)}</td><td><span class="status ${r.issue==='OK'?'ok':r.issue==='Unpaid'?'pending':'issue'}">${esc(r.issue)}</span></td></tr>`).join('')}</tbody></table></div></div>`;}

  function renderAsk(){setTitle('Ask Analytics','Ask plain-English questions about real restaurant data.');content.innerHTML=`<div class="ask-layout"><div class="card chat"><div class="messages" id="messages"><div class="message assistant"><strong>Ask Restaurant Deluxe</strong><br>Try a question about sales, menu items, tables, unpaid orders, busy periods or an accountant summary. I only answer from the loaded restaurant data.</div></div><form class="ask-form" id="askForm"><input id="askInput" autocomplete="off" placeholder="What were my top 5 dishes this month?"/><button class="button primary">Ask</button></form></div><div class="card"><h2>Suggested questions</h2><div class="sub">Deterministic analytics — no invented numbers</div><div class="suggestions" id="suggestions">${['What were my top 5 dishes?','Which tables generate the most revenue?','What time is busiest?','Show unpaid orders','Which menu items are declining?','Give me a monthly summary for my accountant','How was this Saturday compared with last Saturday?'].map(q=>`<button>${q}</button>`).join('')}</div></div></div>`;$('#askForm').addEventListener('submit',e=>{e.preventDefault();ask($('#askInput').value)});$('#suggestions').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>ask(b.textContent)));}

  function ask(q){q=(q||'').trim();if(!q)return;const box=$('#messages');box.insertAdjacentHTML('beforeend',`<div class="message user">${esc(q)}</div>`);const answer=answerQuestion(q.toLowerCase());box.insertAdjacentHTML('beforeend',`<div class="message assistant">${answer}</div>`);$('#askInput').value='';box.scrollTop=box.scrollHeight;}
  function answerQuestion(q){const a=analytics();if(q.includes('top')&&(q.includes('dish')||q.includes('item')||q.includes('menu'))){const n=Number((q.match(/top\s+(\d+)/)||[])[1])||5;return `<strong>Top ${n} items by revenue</strong><table class="mini-table">${a.productRows.slice(0,n).map((r,i)=>`<tr><td>${i+1}. ${esc(r.name)}</td><td class="money">${money(r.revenue)}</td></tr>`).join('')}</table>`}if(q.includes('table')&&(q.includes('revenue')||q.includes('most')||q.includes('best'))){return `<strong>Highest-revenue tables</strong><table class="mini-table">${a.tableRows.slice(0,5).map(r=>`<tr><td>${esc(r.label)}</td><td>${money(r.revenue)}</td></tr>`).join('')}</table>`}if(q.includes('busy')||q.includes('busiest')||q.includes('time')){const hrs={};a.paidOrders.forEach(o=>{const h=new Date(o.created_at).getHours();hrs[h]=(hrs[h]||0)+1});const arr=Object.entries(hrs).sort((a,b)=>b[1]-a[1]).slice(0,3);return arr.length?`The busiest ordering hours were ${arr.map(([h,n])=>`<strong>${String(h).padStart(2,'0')}:00</strong> (${n} paid orders)`).join(', ')}.`:'There are not enough paid orders to identify a busy period.'}if(q.includes('unpaid')||q.includes('outstanding')){return a.unpaid.length?`There are <strong>${a.unpaid.length} unpaid/open orders</strong>, totalling ${money(sum(a.unpaid,o=>o.total_cents+(o.tip_cents||0)))}. The oldest is order #${a.unpaid.slice().sort((x,y)=>new Date(x.created_at)-new Date(y.created_at))[0].order_number}.`:'There are no unpaid orders in the selected period.'}if(q.includes('declin')){const d=a.productRows.filter(r=>r.trend!=null&&r.trend<-.2).sort((x,y)=>x.trend-y.trend).slice(0,5);return d.length?`<strong>Items declining between the first and second half of the selected period:</strong><table class="mini-table">${d.map(r=>`<tr><td>${esc(r.name)}</td><td class="negative">${(r.trend*100).toFixed(0)}%</td></tr>`).join('')}</table>`:'No menu item has a decline greater than 20% in the selected period.'}if(q.includes('accountant')||q.includes('summary')||q.includes('month')){return `<strong>Restaurant summary — ${state.days} days</strong><br>Captured revenue: ${money(a.captured)}<br>Paid order sales: ${money(a.orderRevenue)}<br>Tips: ${money(a.tips)}<br>Paid orders: ${a.paidOrders.length}<br>Unpaid/open orders: ${a.unpaid.length}<br>Reconciliation variance: ${money(a.variance)}<br>Estimated GST on taxable item sales: ${money(Math.round(sum(state.dataset.items.filter(i=>!i.gst_free),i=>i.line_cents)/11))}.`}if(q.includes('saturday')){const sats=a.daily.filter(r=>new Date(`${r.date}T12:00:00`).getDay()===6).slice(-2);if(sats.length<2)return 'I need at least two Saturdays in the selected period to make that comparison.';const [prev,cur]=sats;const ch=prev.revenue?(cur.revenue-prev.revenue)/prev.revenue:null;return `This Saturday generated <strong>${money(cur.revenue)}</strong> from ${cur.orders} paid orders, compared with <strong>${money(prev.revenue)}</strong> from ${prev.orders} paid orders the previous Saturday.${ch==null?'':` Revenue was <span class="${ch>=0?'positive':'negative'}">${Math.abs(ch*100).toFixed(1)}% ${ch>=0?'higher':'lower'}</span>.`}`}return 'I can currently answer questions about top-selling items, table revenue, busiest hours, unpaid orders, declining menu items, Saturday comparisons, and accountant summaries. This rules layer can later be replaced by a secure server-side AI interpreter without allowing arbitrary SQL.';}

  function renderExport(){setTitle('Export','Take restaurant data into Excel for accounting and deeper analysis.');content.innerHTML=`<div class="connection-panel"><div class="card"><h2>Export current ${state.days}-day period</h2><div class="sub">Creates a multi-sheet Excel workbook from the data currently loaded.</div><div class="grid two"><div><div class="metric-pair"><span>Venue</span><strong>${esc(state.venues.find(v=>v.id===state.venueId)?.name||'Venue')}</strong></div><div class="metric-pair"><span>Period</span><strong>${state.dataset.from} → ${state.dataset.to}</strong></div><div class="metric-pair"><span>Orders</span><strong>${state.dataset.orders.length}</strong></div><div class="metric-pair"><span>Payments</span><strong>${state.dataset.payments.length}</strong></div></div><div class="note">Workbook sheets: Summary, Sales, Tables, Product Mix, Payments and Reconciliation. Monetary values export as dollars for accounting usability while calculations remain in cents inside the dashboard.</div></div><div style="margin-top:18px;display:flex;gap:9px;flex-wrap:wrap"><button class="button primary" id="xlsxBtn">Export Excel (.xlsx)</button><button class="button secondary" id="csvBtn">Export sales CSV</button></div></div></div>`;$('#xlsxBtn').addEventListener('click',exportXlsx);$('#csvBtn').addEventListener('click',exportSalesCsv);}

  function exportXlsx(){if(!window.XLSX){toast('Excel export library did not load. Use CSV instead.');return}const a=analytics(),wb=XLSX.utils.book_new(),venue=state.venues.find(v=>v.id===state.venueId)?.name||'Venue';const summary=[['Restaurant Deluxe — Order Intelligence',''],['Venue',venue],['Period',`${state.dataset.from} to ${state.dataset.to}`],['Captured revenue',a.captured/100],['Paid order sales',a.orderRevenue/100],['Tips',a.tips/100],['Paid orders',a.paidOrders.length],['Unpaid orders',a.unpaid.length],['Average paid order',a.avgOrder/100],['Active tables',a.activeTables],['Reconciliation variance',a.variance/100]];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),'Summary');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(a.daily.map(r=>({Date:r.date,'Paid orders':r.orders,'Revenue AUD':r.revenue/100}))),'Sales');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(a.tableRows.map(r=>({Table:r.label,'Revenue AUD':r.revenue/100,Orders:r.orders,'Average spend AUD':r.avgSpend/100,Sessions:r.sessions,'Average session minutes':r.avgSession,'Open sessions':r.open}))),'Tables');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(a.productRows.map(r=>({Item:r.name,Quantity:r.qty,'Revenue AUD':r.revenue/100,'Modifier revenue AUD':r.modifier/100,'Trend %':r.trend==null?'':r.trend*100,Station:state.dataset.stations.find(s=>s.id===r.station_id)?.name||''}))),'Product Mix');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.dataset.payments.map(p=>({Date:p.service_date,Method:p.method,'Amount AUD':p.amount_cents/100,Reference:p.reference||'',Order:p.order_id||''}))),'Payments');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(a.recon.map(r=>({Order:r.order.order_number,Date:r.order.service_date,'Expected AUD':r.expected/100,'Captured AUD':r.captured/100,'Variance AUD':r.variance/100,Status:r.issue}))),'Reconciliation');XLSX.writeFile(wb,`restaurant-deluxe-order-intelligence-${todayStr()}.xlsx`);toast('Excel workbook exported');}
  function exportSalesCsv(){const a=analytics();download(`Date,Paid Orders,Revenue AUD\n${a.daily.map(r=>`${r.date},${r.orders},${(r.revenue/100).toFixed(2)}`).join('\n')}`,'restaurant-deluxe-sales.csv','text/csv');}
  function download(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  function renderConnection(){setTitle('Connection','Connect securely to your existing Restaurant Deluxe Supabase project.');content.innerHTML=`<div class="connection-panel"><div class="card"><h2>${state.mode==='live'?'Live data connected':'Connect live restaurant data'}</h2><div class="sub">The app uses your existing Supabase Auth and Row Level Security. No Stripe secret or service-role key is used.</div>${state.mode==='live'?`<div class="note">Signed in as <strong>${esc(state.userEmail)}</strong>. You can only see venues allowed by existing <code>rd_is_staff()</code> RLS policies.</div><div style="margin-top:16px"><button class="button danger" id="signOutBtn">Sign out / Demo mode</button></div>`:`<form id="loginForm"><div class="form-row"><label>Staff email</label><input id="email" type="email" required placeholder="manager@restaurant.com" autocomplete="username"></div><div class="form-row"><label>Password</label><input id="password" type="password" required autocomplete="current-password"></div><div style="margin-top:16px;display:flex;gap:8px"><button class="button primary">Connect live data</button><button type="button" class="button secondary" id="demoBtn">Stay in demo mode</button></div></form>`}</div><div class="card section-gap"><h3>Security status</h3><div class="metric-pair"><span>Orders, payments, tables, menu and status events</span><strong class="positive">RLS protected</strong></div><div class="metric-pair"><span>Stripe secret table</span><strong class="positive">Never queried</strong></div><div class="metric-pair"><span>Payment intents</span><strong class="warn">Excluded until RLS enabled</strong></div><div class="metric-pair"><span>Browser SQL</span><strong class="positive">Not allowed</strong></div></div></div>`;if(state.mode==='live')$('#signOutBtn').addEventListener('click',signOut);else{$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;btn.textContent='Connecting…';try{await signIn($('#email').value,$('#password').value);toast('Live restaurant data connected');state.page='overview';buildNav();render()}catch(err){toast(err.message);btn.disabled=false;btn.textContent='Connect live data'}});$('#demoBtn').addEventListener('click',()=>{state.page='overview';buildNav();render()})}}

  venueSelect.addEventListener('change',()=>{state.venueId=venueSelect.value;loadData()});
  $('#rangeSwitch').addEventListener('click',e=>{const b=e.target.closest('button[data-days]');if(!b)return;state.days=Number(b.dataset.days);loadData()});
  $('#refreshBtn').addEventListener('click',loadData); $('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));

  async function boot(){ buildNav(); if(state.accessToken){state.mode='live';try{await loadVenues();await loadData();return}catch(e){setBanner(`Saved session could not be restored: ${e.message}. Demo mode is available.`);state.accessToken='';sessionStorage.removeItem('rd_access_token')}} initDemo(); }
  boot();
})();
