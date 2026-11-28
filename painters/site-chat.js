/* Painter customer website assistant. Public knowledge only; credentials stay on the server. */
(function(){
'use strict';
var endpoint='https://tehxobdokbvqtwtgqzrh.supabase.co/functions/v1/painter-site-chat';
var key='sb_publishable_CrlY9xXYdhI7qCQwuMnDWg_hFQ3mXCJ';
function el(tag,props,text){var n=document.createElement(tag);Object.keys(props||{}).forEach(function(k){if(k==='class')n.className=props[k];else n.setAttribute(k,props[k]);});if(text)n.textContent=text;return n;}
window.PD=window.PD||{};
PD.mountChat=function(b){
 var old=document.getElementById('painterSiteChat');if(old)old.remove();
 var slug=PD.slug||'',demo=!slug,w=b&&b.website||{};
 if(!demo&&(!b||w.chatEnabled!==true))return;
 if(demo&&w.chatEnabled===false)return;
 var name=String(w.chatName||'Ask the painter').slice(0,60);
 var business=String(b&&b.name||'Painter Deluxe demo');
 if(!document.getElementById('painterSiteChatStyle')){
  var css=el('style',{id:'painterSiteChatStyle'});
  css.textContent='#painterSiteChat{position:fixed;right:20px;bottom:max(20px,env(safe-area-inset-bottom));z-index:70;font:14px/1.5 Manrope,system-ui,sans-serif;color:#23473c}#painterSiteChat *{box-sizing:border-box}#painterSiteChat [hidden]{display:none!important}#painterSiteChat button,#painterSiteChat input{font:inherit}#painterSiteChat .psc-launch{border:0;border-radius:999px;background:var(--accent,#456859);color:#fff;padding:15px 22px;cursor:pointer;box-shadow:0 6px 24px #172a2533;font-weight:700}#painterSiteChat .psc-box{width:min(390px,calc(100vw - 28px));height:min(650px,calc(100dvh - 110px));height:min(650px,calc(100svh - 110px));background:#f6f4eb;border:1px solid #deded3;border-radius:20px;overflow:hidden;box-shadow:0 14px 60px #172a2540;display:flex;flex-direction:column;margin-bottom:12px}#painterSiteChat .psc-head{display:flex;gap:10px;align-items:center;padding:15px 17px;background:#23473c;color:white}#painterSiteChat .psc-head strong{font-size:16px}#painterSiteChat .psc-head small{display:block;font-size:11px;opacity:.8}#painterSiteChat .psc-close{margin-left:auto;border:0;background:#ffffff20;color:#fff;border-radius:50%;width:32px;height:32px;cursor:pointer}#painterSiteChat .psc-log{overflow-y:auto;overscroll-behavior:contain;flex:1;padding:14px;min-height:100px}#painterSiteChat .psc-msg{white-space:pre-wrap;overflow-wrap:anywhere;background:white;border:1px solid #e2e0d6;border-radius:13px;padding:11px 13px;margin:0 24px 12px 0;font-size:14px}#painterSiteChat .psc-user{margin:0 0 12px 24px;background:#e0e9dc}#painterSiteChat .psc-quick{display:flex;gap:7px;flex-wrap:wrap;padding:0 14px 12px}#painterSiteChat .psc-quick button{font-size:12px;border:1px solid #c7cfc0;border-radius:999px;padding:7px 10px;background:white;cursor:pointer}#painterSiteChat .psc-form{display:flex;gap:7px;border-top:1px solid #deded3;padding:12px}#painterSiteChat .psc-form input{width:0;flex:1;min-width:0;border:1px solid #d7d9cd;border-radius:999px;padding:11px 13px;background:white;color:#23473c}#painterSiteChat .psc-form button{border:0;background:#23473c;color:white;border-radius:999px;padding:10px 16px;cursor:pointer}#painterSiteChat button:disabled{opacity:.5;cursor:wait}#painterSiteChat .psc-status{font-size:12px;padding:0 15px;color:#456859;min-height:18px}#painterSiteChat .psc-foot{font-size:11px;text-align:center;padding:4px 12px 12px;color:#596758}#painterSiteChat .psc-links{display:flex;gap:12px;justify-content:center;padding:0 12px 5px}#painterSiteChat .psc-links a{font-size:12px;color:#23473c}#painterSiteChat :focus-visible{outline:3px solid #d0ae70;outline-offset:2px}@media(max-width:480px){#painterSiteChat{right:14px;bottom:max(14px,env(safe-area-inset-bottom))}}';
  document.head.appendChild(css);
 }
 var root=el('div',{id:'painterSiteChat'}),panel=el('section',{class:'psc-box',id:'painterChatPanel','aria-label':name}),head=el('div',{class:'psc-head'}),title=el('div'),close=el('button',{type:'button',class:'psc-close','aria-label':'Close chat'},'×');
 title.append(el('strong',{},name),el('small',{},demo?'Demo answers from this browser':business+' · AI assistant'));head.append(title,close);
 var log=el('div',{class:'psc-log',role:'log','aria-label':'Chat messages','aria-live':'polite','aria-relevant':'additions'}),quick=el('div',{class:'psc-quick'}),form=el('form',{class:'psc-form'}),input=el('input',{type:'text',maxlength:'600',placeholder:'Your question…','aria-label':'Your question',autocomplete:'off'}),send=el('button',{type:'submit'},'Send'),status=el('div',{class:'psc-status',role:'status'}),links=el('div',{class:'psc-links'}),foot=el('div',{class:'psc-foot'},demo?'Demo preview. A live business uses the connected AI assistant.':'AI answers can be wrong. Confirm important details with the painter.');
 var book=el('a',{href:PD.booking()},'Check times & book'),contact=el('a',{href:'#about'},'Contact the painter');links.append(book,contact);form.append(input,send);
 panel.append(head,log,quick,status,form,links,foot);panel.hidden=true;
 var launch=el('button',{class:'psc-launch',type:'button','aria-expanded':'false','aria-controls':'painterChatPanel'},name);root.append(panel,launch);document.body.appendChild(root);
 var history=[],waiting=false,session=typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 function message(text,user){log.appendChild(el('p',{class:'psc-msg'+(user?' psc-user':'')},text));log.scrollTop=log.scrollHeight;}
 message('Hello! Ask me about '+business+'—painting services, colour previews, estimates or how to book a quote visit.',false);
 function open(on){panel.hidden=!on;launch.setAttribute('aria-expanded',String(on));if(on)input.focus();else launch.focus();}
 launch.onclick=function(){open(panel.hidden);};close.onclick=function(){open(false);};contact.onclick=function(){open(false);};
 root.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden)open(false);});
 function demoReply(q){
  var query=q.toLowerCase(),notes=String(w.chatKnowledge||'').trim();
  var terms=query.match(/[a-z]{4,}/g)||[],stops=['what','does','your','about','have','with','this','that','please','could','would','information','tell'];
  terms=terms.filter(function(t){return stops.indexOf(t)<0;});
  if(notes){var sentences=notes.split(/\n+|(?<=[.!?])\s+/).filter(Boolean),rank=sentences.map(function(s){return{t:s,n:terms.reduce(function(n,t){return n+(s.toLowerCase().includes(t)?1:0);},0)};}).sort(function(a,b){return b.n-a.n;});if(rank[0]&&rank[0].n)return rank.filter(function(r){return r.n>0;}).slice(0,2).map(function(r){return r.t;}).join(' ');}
  if(/colour|color|sample|preview/.test(query))return 'Try colours in a lounge, bedroom, kitchen or house exterior using the colour studio. These are illustrative previews; test physical paint samples before deciding.';
  if(/cost|price|estimate|quote/.test(query))return 'The online estimator gives an indicative budget using the configured painting rates. A site inspection confirms preparation, access, measurements and the final quote. Use the estimate button on this website to explore your project.';
  if(/book|availab|time|appoint|travel/.test(query))return 'Use “Check times & book” to choose an available quote visit. The booking system checks existing appointments, working hours and estimated travel. Chat does not reserve a time.';
  if(/area|suburb|where|location/.test(query)&&b&&b.base)return 'The business is based in '+b.base+'. Check your address through the booking form to confirm service coverage.';
  if(/contact|phone|email/.test(query)&&b)return [b.phone,b.email].filter(Boolean).join(' · ')||'Use the contact section on this website to speak to the painter.';
  if(/about|business|service/.test(query)&&w.about)return String(w.about);
  return 'This demo answers common website questions and matching FAQs you saved in the Website editor. For a live business, the AI assistant uses that painter’s published information. Please contact the painter for anything not covered.';
 }
 async function ask(q){
  q=String(q||'').trim().slice(0,600);if(!q||waiting)return;waiting=true;input.value='';quick.hidden=true;send.disabled=true;input.disabled=true;status.textContent='Finding an answer…';message(q,true);history.push({role:'user',content:q});
  try{
   var reply;
   if(demo)reply=demoReply(q);
   else{
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},35000);
    var r;try{r=await fetch(endpoint,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({business:slug,session:session,messages:history.slice(-12)}),signal:controller.signal});}finally{clearTimeout(timer);}
    var data=await r.json();if(!r.ok||!data.ok)throw Error(data.error==='chat_disabled'?'The painter has switched this assistant off. Please contact them directly.':'The assistant is unavailable right now. Please use the booking or contact link below.');
    reply=String(data.reply||'');if(!reply)throw Error('No answer was returned. Please contact the painter.');
   }
   message(reply,false);history.push({role:'assistant',content:reply});
  }catch(e){message(e.name==='AbortError'?'The answer took too long. Please try again or contact the painter.':e.message,false);}
  finally{waiting=false;send.disabled=false;input.disabled=false;status.textContent='';if(!panel.hidden)input.focus();}
 }
 ['Can I try colours?','How do estimates work?','How do I book?'].forEach(function(q){var btn=el('button',{type:'button'},q);btn.onclick=function(){ask(q);};quick.appendChild(btn);});
 form.onsubmit=function(e){e.preventDefault();ask(input.value);};
};
})();
