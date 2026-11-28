// Public connection settings only. Never put a service-role key here.
// Optional: enter a business slug to use this folder for a single painter.
const DEFAULT_BUSINESS = "";
const CONNECTION = {
  supabaseUrl: "https://tehxobdokbvqtwtgqzrh.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaHhvYmRva2J2cXR3dGdxenJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTA0MzEsImV4cCI6MjA5NzY2NjQzMX0.ofwrtvy7T4_uDP4hcWdO9roO2viWEmrplp8CCpFNupE"
};
window.PD={
 slug:new URLSearchParams(location.search).get('b')||DEFAULT_BUSINESS,
 booking(){return this.slug?'app/?b='+encodeURIComponent(this.slug)+'#book':'demo/#book';},
 async load(){if(!this.slug){try{return JSON.parse(localStorage.getItem('painterDeluxeDemo_v1')||'null')?.biz||null;}catch{return null;}}
 const response=await fetch(CONNECTION.supabaseUrl+'/rest/v1/rpc/trd_public',{method:'POST',headers:{apikey:CONNECTION.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({p_venue:this.slug})});
 const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Business unavailable');return {...data.config.biz,...data.venue};}
};
