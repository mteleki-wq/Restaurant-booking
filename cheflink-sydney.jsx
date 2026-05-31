import { useState, useEffect, useRef } from "react";

const CUISINES = ["All","French","Italian","Modern Australian","Asian","Japanese","Thai","Korean","Indian","Mediterranean","Pastry","Bakery","Seafood","Café","Fine Dining","Catering","Events","Hotel Banquet"];
const LOCATIONS = ["All","Sydney CBD","Surry Hills","Newtown","Glebe","Bondi","Manly","North Sydney","Parramatta","Chatswood","Darlinghurst","Paddington","Mosman","Balmain","Rozelle"];
const WORK_TYPES = ["All","Casual","Part-Time","Contract","Events","Full-Time"];
const AVAILABILITY = ["All","Weekdays","Weekends","Evenings","Immediate","Flexible"];

const SEED_CHEFS = [
  {
    id:"c1", approved:true, featured:true, plan:"premium",
    name:"Marc Dupont", title:"Executive Chef — French Fine Dining",
    location:"Sydney CBD", cuisine:["French","Fine Dining"],
    experience:14, rate:"$85–$120/hr", availability:"Weekends / Casual",
    workType:["Casual","Events"],
    summary:"Award-winning French chef with 14 years across Paris & Sydney.",
    bio:"Trained under Michelin-starred kitchens in Lyon before moving to Sydney in 2012. Specialises in classical French technique with a modern Australian twist, using local seasonal produce. Former head chef at Quay and Bennelong.",
    qualifications:"Advanced Diploma of Hospitality Management · Le Cordon Bleu Paris",
    restaurants:["Quay", "Bennelong", "Restaurant Leo", "Aria"],
    photo:"https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=400&q=80",
    heroPhoto:"https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=80",
    gallery:[
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80",
      "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80",
      "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&q=80",
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80"
    ],
    dishes:[
      {name:"Duck Confit with Orange Jus",img:"https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80",category:"French",desc:"Slow-cooked duck leg, confit overnight, served with bitter orange reduction and pommes sarladaises.",chefNote:"My signature for 8 years. Works beautifully as a banquet entrée."},
      {name:"Bouillabaisse Marseillaise",img:"https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80",category:"Seafood",desc:"Traditional Provençal fish stew with local Sydney rock oysters and saffron rouille.",chefNote:"Adapted for Australian seafood — showcases the best of both worlds."}
    ],
    email:"marc@cheflink.com.au", phone:"0412 000 001",
    instagram:"@marcdupont_chef"
  },
  {
    id:"c2", approved:true, featured:true, plan:"premium",
    name:"Yuki Tanaka", title:"Sushi Master & Modern Japanese",
    location:"Surry Hills", cuisine:["Japanese","Asian","Fine Dining"],
    experience:10, rate:"$75–$110/hr", availability:"Flexible",
    workType:["Casual","Contract","Events"],
    summary:"Tokyo-trained sushi master bringing authentic Edomae technique to Sydney.",
    bio:"Yuki trained under a sushi master in Tsukiji, Tokyo for six years before establishing herself in Sydney's vibrant dining scene. She blends Edomae sushi traditions with local Australian ingredients.",
    qualifications:"Culinary Arts Diploma, Tokyo · WSET Level 2 Sake",
    restaurants:["Nobu Sydney","Sokyo","est.","Billy Kwong"],
    photo:"https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400&q=80",
    heroPhoto:"https://images.unsplash.com/photo-1553621042-f6e147245754?w=900&q=80",
    gallery:[
      "https://images.unsplash.com/photo-1563612116625-3012372fccce?w=600&q=80",
      "https://images.unsplash.com/photo-1617196034183-421b4040ed20?w=600&q=80",
      "https://images.unsplash.com/photo-1559410545-0bdcd187e0a6?w=600&q=80",
      "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&q=80"
    ],
    dishes:[
      {name:"Omakase Nigiri Selection",img:"https://images.unsplash.com/photo-1553621042-f6e147245754?w=600&q=80",category:"Japanese",desc:"8-piece seasonal nigiri featuring Sydney kingfish, ocean trout and Tasmanian sea urchin.",chefNote:"Changes with the season. Always sourced from trusted local fishmongers."},
      {name:"Wagyu Tataki with Ponzu",img:"https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80",category:"Japanese",desc:"Grade 9+ Australian wagyu, lightly seared, with house-made citrus ponzu.",chefNote:"A crowd favourite at private events."}
    ],
    email:"yuki@cheflink.com.au", phone:"0412 000 002",
    instagram:"@yuki_sushi_sydney"
  },
  {
    id:"c3", approved:true, featured:false, plan:"basic",
    name:"Sofia Ricci", title:"Pastry Chef & Chocolatier",
    location:"Newtown", cuisine:["Pastry","Bakery","Italian"],
    experience:8, rate:"$65–$90/hr", availability:"Weekends",
    workType:["Casual","Events"],
    summary:"Italian-trained pastry chef specialising in artisan desserts and chocolate work.",
    bio:"Sofia studied under renowned pastry chefs in Florence and Milan before bringing her skills to Sydney. Her desserts are known for their architectural beauty and precise flavour balance.",
    qualifications:"Diploma Pasticceria, Florence · Certificate in Chocolate Arts",
    restaurants:["Quay","Rockpool","Bathers' Pavilion","Aria"],
    photo:"https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80",
    heroPhoto:"https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=900&q=80",
    gallery:[
      "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=600&q=80",
      "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=600&q=80",
      "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&q=80",
      "https://images.unsplash.com/photo-1559181567-c3190ca9be46?w=600&q=80"
    ],
    dishes:[
      {name:"Tiramisu Moderno",img:"https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&q=80",category:"Pastry",desc:"Deconstructed tiramisu with mascarpone espuma, coffee gel and house-made savoiardi.",chefNote:"My reimagined classic — always a showstopper at events."},
      {name:"Dark Chocolate Sphere",img:"https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&q=80",category:"Pastry",desc:"70% Valrhona sphere with caramel centre, dissolved tableside with warm sauce.",chefNote:"Designed for fine dining table theatre."}
    ],
    email:"sofia@cheflink.com.au", phone:"0412 000 003",
    instagram:"@sofiariccipatisserie"
  },
  {
    id:"c4", approved:true, featured:false, plan:"basic",
    name:"James Okafor", title:"Modern Australian & Catering Specialist",
    location:"Parramatta", cuisine:["Modern Australian","Catering","Events"],
    experience:11, rate:"$70–$95/hr", availability:"Immediate",
    workType:["Casual","Contract","Events","Part-Time"],
    summary:"Versatile chef with 11 years delivering modern Australian cuisine at scale.",
    bio:"James has led kitchen brigades across Sydney's western suburbs, building expertise in large-scale catering and corporate events. His modern Australian cooking celebrates native ingredients.",
    qualifications:"Certificate IV Commercial Cookery · Food Safety Supervisor",
    restaurants:["Flying Fish","Aqua Dining","The Grounds of Alexandria","Merivale Events"],
    photo:"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80",
    heroPhoto:"https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=900&q=80",
    gallery:[
      "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80",
      "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&q=80",
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80",
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80"
    ],
    dishes:[
      {name:"Kangaroo Loin with Wattleseed Jus",img:"https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80",category:"Modern Australian",desc:"Perfectly seared kangaroo loin, wattleseed and red wine reduction, bunya nut purée.",chefNote:"Showcases native Australian ingredients — always a conversation starter."},
      {name:"Barramundi with Finger Lime",img:"https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80",category:"Seafood",desc:"Crispy-skinned barramundi, native finger lime beurre blanc, samphire and sea herbs.",chefNote:"My go-to for corporate lunches."}
    ],
    email:"james@cheflink.com.au", phone:"0412 000 004",
    instagram:"@jamesokafor_chef"
  }
];

const defaultDB = () => {
  const stored = localStorage.getItem("cheflink_chefs");
  if (stored) return JSON.parse(stored);
  localStorage.setItem("cheflink_chefs", JSON.stringify(SEED_CHEFS));
  return SEED_CHEFS;
};

const saveDB = (chefs) => localStorage.setItem("cheflink_chefs", JSON.stringify(chefs));

// ─── Styles ───────────────────────────────────────────────────────────────────
const G = {
  ivory: "#FAF8F3", charcoal: "#1C1C1C", gold: "#C9A84C", warmGrey: "#F0EDE6",
  softGrey: "#8A8580", orange: "#D4622A", white: "#FFFFFF", cream: "#F5F1E8",
  darkGold: "#9B7E35", border: "#E8E2D6", textMuted: "#6B6560"
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Jost:wght@300;400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body,html{font-family:'Jost',sans-serif;background:${G.ivory};color:${G.charcoal};line-height:1.6}
  h1,h2,h3,h4{font-family:'Playfair Display',serif;line-height:1.2}
  button{cursor:pointer;font-family:'Jost',sans-serif}
  input,textarea,select{font-family:'Jost',sans-serif}
  img{object-fit:cover}
  ::-webkit-scrollbar{width:6px}
  ::-webkit-scrollbar-thumb{background:${G.gold};border-radius:3px}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;letter-spacing:.5px;text-transform:uppercase}
  .badge-green{background:#E8F5E4;color:#3A7D2C}
  .badge-gold{background:#FBF4E2;color:#9B7E35}
  .badge-orange{background:#FDF0EA;color:#C04E1A}
  .btn{padding:10px 24px;border-radius:2px;font-size:13px;font-weight:500;letter-spacing:.8px;text-transform:uppercase;border:none;transition:all .25s}
  .btn-primary{background:${G.charcoal};color:#fff}
  .btn-primary:hover{background:${G.gold};color:${G.charcoal}}
  .btn-outline{background:transparent;color:${G.charcoal};border:1px solid ${G.charcoal}}
  .btn-outline:hover{background:${G.charcoal};color:#fff}
  .btn-gold{background:${G.gold};color:${G.charcoal}}
  .btn-gold:hover{background:${G.darkGold};color:#fff}
  .input{width:100%;padding:10px 14px;border:1px solid ${G.border};background:#fff;border-radius:2px;font-size:14px;outline:none}
  .input:focus{border-color:${G.gold}}
  .tag{display:inline-block;padding:4px 10px;background:${G.cream};border:1px solid ${G.border};border-radius:1px;font-size:12px;color:${G.softGrey};margin:2px}
`;

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav({ view, setView }) {
  const [open, setOpen] = useState(false);
  return (
    <nav style={{background:G.charcoal,padding:"0 40px",display:"flex",alignItems:"center",justifyContent:"space-between",height:64,position:"sticky",top:0,zIndex:999}}>
      <div onClick={()=>setView("home")} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:G.gold,fontWeight:700,letterSpacing:1}}>ChefLink</span>
        <span style={{fontFamily:"'Jost',sans-serif",fontSize:12,color:G.softGrey,letterSpacing:3,textTransform:"uppercase",marginTop:3}}>Sydney</span>
      </div>
      <div style={{display:"flex",gap:28,alignItems:"center"}}>
        {[["home","Home"],["directory","Find Chefs"],["upload","Join as Chef"],["admin","Admin"]].map(([v,l])=>(
          <span key={v} onClick={()=>setView(v)} style={{fontSize:13,color:view===v?G.gold:"#CCC",letterSpacing:.8,textTransform:"uppercase",cursor:"pointer",transition:"color .2s",fontWeight:view===v?500:400}}>{l}</span>
        ))}
        <button onClick={()=>setView("inquiry")} className="btn btn-gold" style={{padding:"8px 18px",fontSize:12}}>Hire a Chef</button>
      </div>
    </nav>
  );
}

// ─── Homepage ─────────────────────────────────────────────────────────────────
function HomePage({ chefs, setView, setSelectedChef }) {
  const [search, setSearch] = useState("");
  const [cuisine, setCuisine] = useState("All");
  const featured = chefs.filter(c=>c.featured && c.approved);

  const doSearch = () => {
    setView("directory");
  };

  return (
    <div>
      {/* Hero */}
      <div style={{position:"relative",height:600,overflow:"hidden"}}>
        <img src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1400&q=80" alt="hero" style={{width:"100%",height:"100%",filter:"brightness(.45)"}} />
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 20px",textAlign:"center"}}>
          <p style={{fontFamily:"'Jost',sans-serif",letterSpacing:4,textTransform:"uppercase",fontSize:12,color:G.gold,marginBottom:16}}>Sydney's Premier Chef Staffing Platform</p>
          <h1 style={{fontSize:52,color:"#fff",maxWidth:740,marginBottom:16,fontWeight:700,lineHeight:1.1}}>Find Skilled Chefs in Sydney for Casual, Contract & Event Work</h1>
          <p style={{fontSize:17,color:"rgba(255,255,255,.75)",maxWidth:560,marginBottom:40,fontWeight:300}}>A premium platform connecting restaurants with experienced chefs through professional portfolios.</p>
          {/* Search Bar */}
          <div style={{display:"flex",gap:0,background:"#fff",borderRadius:2,overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,.4)",maxWidth:700,width:"100%"}}>
            <input className="input" placeholder="Search chefs, cuisine, location..." value={search} onChange={e=>setSearch(e.target.value)} style={{border:"none",borderRadius:0,flex:1,fontSize:15,padding:"14px 20px"}} onKeyDown={e=>e.key==="Enter"&&doSearch()} />
            <select value={cuisine} onChange={e=>setCuisine(e.target.value)} style={{border:"none",borderLeft:`1px solid ${G.border}`,padding:"0 16px",fontSize:14,color:G.softGrey,background:"#fff",outline:"none",minWidth:150}}>
              {CUISINES.map(c=><option key={c}>{c}</option>)}
            </select>
            <button onClick={doSearch} className="btn btn-primary" style={{borderRadius:0,padding:"0 28px",fontSize:13,letterSpacing:1}}>Search</button>
          </div>
        </div>
      </div>

      {/* Cuisine Filters */}
      <div style={{background:G.cream,padding:"20px 40px",borderBottom:`1px solid ${G.border}`}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
          {CUISINES.slice(1).map(c=>(
            <span key={c} onClick={()=>setView("directory")} style={{padding:"6px 16px",border:`1px solid ${G.border}`,borderRadius:20,fontSize:12,letterSpacing:.5,cursor:"pointer",transition:"all .2s",background:"#fff",color:G.softGrey,fontFamily:"'Jost',sans-serif",fontWeight:500,textTransform:"uppercase"}} onMouseEnter={e=>{e.target.style.background=G.gold;e.target.style.color=G.charcoal;e.target.style.borderColor=G.gold}} onMouseLeave={e=>{e.target.style.background="#fff";e.target.style.color=G.softGrey;e.target.style.borderColor=G.border}}>{c}</span>
          ))}
        </div>
      </div>

      {/* Featured Chefs */}
      <div style={{padding:"72px 40px",maxWidth:1200,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:48}}>
          <p style={{letterSpacing:3,textTransform:"uppercase",fontSize:11,color:G.gold,marginBottom:8,fontWeight:500}}>Handpicked Talent</p>
          <h2 style={{fontSize:38}}>Featured Chefs</h2>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:28}}>
          {featured.map(c=><ChefCard key={c.id} chef={c} setView={setView} setSelectedChef={setSelectedChef} />)}
        </div>
        <div style={{textAlign:"center",marginTop:48}}>
          <button onClick={()=>setView("directory")} className="btn btn-outline">View All Chefs</button>
        </div>
      </div>

      {/* How It Works */}
      <div style={{background:G.charcoal,padding:"72px 40px"}}>
        <div style={{maxWidth:1100,margin:"0 auto",textAlign:"center"}}>
          <p style={{letterSpacing:3,textTransform:"uppercase",fontSize:11,color:G.gold,marginBottom:8,fontWeight:500}}>Simple Process</p>
          <h2 style={{fontSize:38,color:"#fff",marginBottom:56}}>How ChefLink Works</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:40}}>
            {[["01","Search","Browse verified chef profiles by cuisine, availability and location."],["02","Review","View full portfolios, experience, dish galleries and references."],["03","Connect","Send a direct inquiry and arrange your booking easily."]].map(([n,t,d])=>(
              <div key={n} style={{textAlign:"center"}}>
                <div style={{fontSize:48,fontFamily:"'Playfair Display',serif",color:G.gold,fontWeight:700,lineHeight:1,marginBottom:16}}>{n}</div>
                <h3 style={{fontSize:22,color:"#fff",marginBottom:12}}>{t}</h3>
                <p style={{color:"rgba(255,255,255,.55)",fontSize:15,lineHeight:1.7,fontWeight:300}}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Join / Find CTAs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
        <div style={{background:G.gold,padding:"60px 60px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <p style={{letterSpacing:3,textTransform:"uppercase",fontSize:11,color:G.darkGold,marginBottom:8,fontWeight:500}}>For Chefs</p>
          <h2 style={{fontSize:34,marginBottom:16,color:G.charcoal}}>Showcase Your Talent</h2>
          <p style={{fontSize:15,color:G.charcoal,opacity:.75,marginBottom:28,fontWeight:300,lineHeight:1.7}}>Create your portfolio, upload your best work and connect with Sydney's top restaurants and venues.</p>
          <button onClick={()=>setView("upload")} className="btn btn-primary" style={{alignSelf:"flex-start"}}>Create Your Profile</button>
        </div>
        <div style={{backgroundImage:"url(https://images.unsplash.com/photo-1532980400857-e8d9d275d858?w=700&q=80)",backgroundSize:"cover",backgroundPosition:"center",position:"relative",minHeight:340}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)",display:"flex",flexDirection:"column",justifyContent:"center",padding:"60px 60px"}}>
            <p style={{letterSpacing:3,textTransform:"uppercase",fontSize:11,color:G.gold,marginBottom:8,fontWeight:500}}>For Restaurants</p>
            <h2 style={{fontSize:34,marginBottom:16,color:"#fff"}}>Find the Right Chef</h2>
            <p style={{fontSize:15,color:"rgba(255,255,255,.7)",marginBottom:28,fontWeight:300,lineHeight:1.7}}>Search verified chefs for your specific cuisine, date and budget. Fast, easy, professional.</p>
            <button onClick={()=>setView("inquiry")} className="btn btn-gold" style={{alignSelf:"flex-start"}}>Post a Request</button>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div style={{padding:"72px 40px",maxWidth:1000,margin:"0 auto",textAlign:"center"}}>
        <p style={{letterSpacing:3,textTransform:"uppercase",fontSize:11,color:G.gold,marginBottom:8,fontWeight:500}}>Chef Plans</p>
        <h2 style={{fontSize:38,marginBottom:48}}>Simple, Transparent Pricing</h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:24}}>
          {[
            {name:"Free Trial",price:"$0",color:G.warmGrey,features:["Basic profile","One photo","Limited visibility","7-day trial"]},
            {name:"Basic",price:"$29/mo",color:"#fff",features:["Full profile page","Portfolio","Cuisine tags","Availability listing","Contact form"],popular:false},
            {name:"Premium",price:"$59/mo",color:G.charcoal,dark:true,features:["Featured placement","Full gallery","Signature recipes","Priority search ranking","Direct inquiry button","Analytics dashboard"],popular:true}
          ].map(p=>(
            <div key={p.name} style={{background:p.color,border:p.dark?"none":`1px solid ${G.border}`,borderRadius:4,padding:"36px 28px",position:"relative"}}>
              {p.popular&&<div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:G.gold,color:G.charcoal,fontSize:11,fontWeight:600,letterSpacing:1,textTransform:"uppercase",padding:"4px 16px",borderRadius:20}}>Most Popular</div>}
              <h3 style={{fontSize:20,color:p.dark?"#fff":G.charcoal,marginBottom:8}}>{p.name}</h3>
              <div style={{fontSize:36,fontFamily:"'Playfair Display',serif",color:p.dark?G.gold:G.charcoal,fontWeight:700,marginBottom:24}}>{p.price}</div>
              <ul style={{listStyle:"none",textAlign:"left",marginBottom:28}}>
                {p.features.map(f=><li key={f} style={{padding:"6px 0",fontSize:14,color:p.dark?"rgba(255,255,255,.7)":G.softGrey,borderBottom:`1px solid ${p.dark?"rgba(255,255,255,.1)":G.border}`}}>✓ {f}</li>)}
              </ul>
              <button onClick={()=>setView("upload")} className={p.dark?"btn btn-gold":"btn btn-outline"} style={{width:"100%",padding:"11px 0"}}>Get Started</button>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer style={{background:G.charcoal,padding:"40px 40px",textAlign:"center"}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:G.gold,marginBottom:8}}>ChefLink Sydney</div>
        <p style={{color:"rgba(255,255,255,.4)",fontSize:13,letterSpacing:.5}}>© 2025 ChefLink Sydney · Premium Chef Staffing Platform · All Rights Reserved</p>
      </footer>
    </div>
  );
}

// ─── Chef Card ────────────────────────────────────────────────────────────────
function ChefCard({ chef, setView, setSelectedChef }) {
  const open = () => { setSelectedChef(chef); setView("portfolio"); };
  return (
    <div onClick={open} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:2,overflow:"hidden",cursor:"pointer",transition:"transform .25s, box-shadow .25s"}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="0 16px 40px rgba(0,0,0,.12)"}}
      onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none"}}>
      {chef.heroPhoto && <div style={{height:160,overflow:"hidden",position:"relative"}}>
        <img src={chef.heroPhoto} alt="" style={{width:"100%",height:"100%"}} />
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:80,background:"linear-gradient(transparent,rgba(0,0,0,.6))"}}/>
        {chef.featured && <div className="badge badge-gold" style={{position:"absolute",top:10,right:10}}>Featured</div>}
      </div>}
      <div style={{padding:"16px 18px"}}>
        <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:12}}>
          <img src={chef.photo} alt={chef.name} style={{width:52,height:52,borderRadius:"50%",border:`2px solid ${G.gold}`,flexShrink:0}} />
          <div style={{flex:1,minWidth:0}}>
            <h3 style={{fontSize:17,fontWeight:600,marginBottom:2,fontFamily:"'Playfair Display',serif"}}>{chef.name}</h3>
            <p style={{fontSize:12,color:G.softGrey,lineHeight:1.3}}>{chef.title}</p>
          </div>
        </div>
        <div style={{marginBottom:10}}>
          {chef.cuisine.slice(0,3).map(c=><span key={c} className="tag">{c}</span>)}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:G.softGrey,marginBottom:10}}>
          <span>📍 {chef.location}</span>
          <span>⭐ {chef.experience} yrs exp</span>
        </div>
        <p style={{fontSize:13,color:G.textMuted,lineHeight:1.5,marginBottom:14,borderTop:`1px solid ${G.border}`,paddingTop:10}}>{chef.summary}</p>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span className={`badge ${chef.availability.toLowerCase().includes("immediate")?"badge-green":"badge-gold"}`}>{chef.availability}</span>
          <span style={{fontSize:13,color:G.gold,fontWeight:500}}>{chef.rate}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Directory ────────────────────────────────────────────────────────────────
function DirectoryPage({ chefs, setView, setSelectedChef }) {
  const [filters, setFilters] = useState({search:"",cuisine:"All",location:"All",workType:"All",availability:"All"});
  const setF = (k,v) => setFilters(p=>({...p,[k]:v}));

  const filtered = chefs.filter(c => {
    if (!c.approved) return false;
    if (filters.search && !c.name.toLowerCase().includes(filters.search.toLowerCase()) && !c.cuisine.join(" ").toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.cuisine !== "All" && !c.cuisine.includes(filters.cuisine)) return false;
    if (filters.location !== "All" && c.location !== filters.location) return false;
    if (filters.workType !== "All" && !c.workType.includes(filters.workType)) return false;
    if (filters.availability !== "All" && !c.availability.toLowerCase().includes(filters.availability.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{minHeight:"100vh"}}>
      {/* Header */}
      <div style={{background:G.charcoal,padding:"48px 40px 32px"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <p style={{letterSpacing:3,textTransform:"uppercase",fontSize:11,color:G.gold,marginBottom:6,fontWeight:500}}>Chef Directory</p>
          <h1 style={{fontSize:40,color:"#fff",marginBottom:4}}>Find Your Chef</h1>
          <p style={{color:"rgba(255,255,255,.5)",fontSize:15,fontWeight:300}}>{filtered.length} chefs available in Sydney</p>
        </div>
      </div>
      {/* Filters */}
      <div style={{background:"#fff",padding:"20px 40px",borderBottom:`1px solid ${G.border}`,position:"sticky",top:64,zIndex:10}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
          <input className="input" placeholder="Search name or cuisine..." value={filters.search} onChange={e=>setF("search",e.target.value)} style={{flex:1,minWidth:200}} />
          {[[CUISINES,"cuisine"],[LOCATIONS,"location"],[WORK_TYPES,"workType"],[AVAILABILITY,"availability"]].map(([opts,key])=>(
            <select key={key} className="input" value={filters[key]} onChange={e=>setF(key,e.target.value)} style={{width:160}}>
              {opts.map(o=><option key={o}>{o}</option>)}
            </select>
          ))}
          <button onClick={()=>setFilters({search:"",cuisine:"All",location:"All",workType:"All",availability:"All"})} className="btn btn-outline" style={{fontSize:12,padding:"9px 16px"}}>Clear</button>
        </div>
      </div>
      {/* Grid */}
      <div style={{maxWidth:1200,margin:"0 auto",padding:"40px 40px"}}>
        {filtered.length===0 ? (
          <div style={{textAlign:"center",padding:"80px 0",color:G.softGrey}}>
            <div style={{fontSize:48,marginBottom:16}}>🔍</div>
            <h3 style={{fontSize:22,marginBottom:8}}>No chefs found</h3>
            <p style={{fontSize:15}}>Try adjusting your search filters.</p>
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:28}}>
            {filtered.map(c=><ChefCard key={c.id} chef={c} setView={setView} setSelectedChef={setSelectedChef} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Portfolio ─────────────────────────────────────────────────────────────────
function PortfolioPage({ chef, setView }) {
  const [openDish, setOpenDish] = useState(null);
  if (!chef) return null;

  return (
    <div style={{minHeight:"100vh"}}>
      {/* Hero */}
      <div style={{position:"relative",height:480,overflow:"hidden"}}>
        <img src={chef.heroPhoto||chef.photo} alt="" style={{width:"100%",height:"100%",filter:"brightness(.5)"}} />
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"flex-end",padding:"48px 60px",background:"linear-gradient(transparent 30%,rgba(0,0,0,.75))"}}>
          <div style={{display:"flex",gap:24,alignItems:"flex-end"}}>
            <img src={chef.photo} alt={chef.name} style={{width:120,height:120,borderRadius:"50%",border:`3px solid ${G.gold}`,flexShrink:0}} />
            <div>
              <div style={{marginBottom:8}}>
                {chef.cuisine.map(c=><span key={c} style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:G.gold,marginRight:12,fontWeight:500}}>{c}</span>)}
              </div>
              <h1 style={{fontSize:44,color:"#fff",marginBottom:6}}>{chef.name}</h1>
              <p style={{fontSize:17,color:"rgba(255,255,255,.7)",fontWeight:300}}>{chef.title}</p>
              <div style={{display:"flex",gap:20,marginTop:10,fontSize:13,color:"rgba(255,255,255,.6)"}}>
                <span>📍 {chef.location}</span>
                <span>⭐ {chef.experience} yrs experience</span>
                <span>💰 {chef.rate}</span>
              </div>
            </div>
          </div>
        </div>
        <button onClick={()=>setView("directory")} style={{position:"absolute",top:24,left:24,background:"rgba(0,0,0,.5)",color:"#fff",border:"1px solid rgba(255,255,255,.3)",padding:"8px 16px",borderRadius:2,fontSize:13,cursor:"pointer",letterSpacing:.5}}>← Back</button>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"60px 40px"}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:60}}>
          {/* Main */}
          <div>
            {/* Bio */}
            <Section title="About the Chef">
              <p style={{fontSize:16,lineHeight:1.8,color:G.charcoal,fontWeight:300}}>{chef.bio}</p>
            </Section>

            {/* Experience */}
            <Section title="Experience & Restaurants">
              <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                {chef.restaurants.map(r=>(
                  <div key={r} style={{background:G.cream,border:`1px solid ${G.border}`,padding:"10px 18px",borderRadius:2,fontSize:14,fontWeight:500}}>{r}</div>
                ))}
              </div>
              <p style={{marginTop:16,fontSize:14,color:G.softGrey}}>{chef.qualifications}</p>
            </Section>

            {/* Dishes */}
            {chef.dishes?.length>0 && (
              <Section title="Signature Dishes">
                {chef.dishes.map((d,i)=>(
                  <div key={i} style={{border:`1px solid ${G.border}`,borderRadius:2,marginBottom:12,overflow:"hidden"}}>
                    <div onClick={()=>setOpenDish(openDish===i?null:i)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",cursor:"pointer",background:openDish===i?G.cream:"#fff"}}>
                      <span style={{fontSize:15,fontFamily:"'Playfair Display',serif",fontWeight:600}}>▾ {d.name}</span>
                      <span className="tag">{d.category}</span>
                    </div>
                    {openDish===i && (
                      <div style={{display:"grid",gridTemplateColumns:"200px 1fr",gap:0}}>
                        <img src={d.img} alt={d.name} style={{height:200,width:"100%"}} />
                        <div style={{padding:"20px 24px"}}>
                          <p style={{fontSize:14,lineHeight:1.7,marginBottom:10}}>{d.desc}</p>
                          <p style={{fontSize:13,color:G.gold,fontStyle:"italic",borderTop:`1px solid ${G.border}`,paddingTop:10,marginTop:10}}>Chef's Note: "{d.chefNote}"</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {/* Gallery */}
            {chef.gallery?.length>0 && (
              <Section title="Gallery">
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
                  {chef.gallery.map((g,i)=>(
                    <img key={i} src={g} alt="" style={{width:"100%",height:180,borderRadius:2,border:`1px solid ${G.border}`}} />
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* Sidebar */}
          <div>
            <div style={{background:G.cream,border:`1px solid ${G.border}`,borderRadius:2,padding:28,marginBottom:20,position:"sticky",top:90}}>
              <h3 style={{fontSize:18,marginBottom:20,paddingBottom:12,borderBottom:`1px solid ${G.border}`}}>Availability</h3>
              <Info label="Status" value={<span className={`badge ${chef.availability.toLowerCase().includes("immediate")?"badge-green":"badge-gold"}`}>{chef.availability}</span>} />
              <Info label="Work Type" value={chef.workType?.join(", ")||"Flexible"} />
              <Info label="Rate" value={<span style={{color:G.gold,fontWeight:600}}>{chef.rate}</span>} />
              <Info label="Location" value={chef.location} />
              {chef.instagram && <Info label="Instagram" value={chef.instagram} />}

              <button onClick={()=>setView("inquiry")} className="btn btn-primary" style={{width:"100%",marginTop:20,padding:"13px 0",fontSize:14}}>Send Inquiry</button>
              <p style={{fontSize:12,color:G.softGrey,textAlign:"center",marginTop:10}}>Usually responds within 24 hours</p>
            </div>
            <div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:2,padding:20}}>
              <h4 style={{fontSize:14,marginBottom:12,textTransform:"uppercase",letterSpacing:1,color:G.softGrey}}>Cuisine Specialties</h4>
              {chef.cuisine.map(c=><div key={c} style={{padding:"8px 0",borderBottom:`1px solid ${G.border}`,fontSize:14,fontWeight:500,color:G.charcoal}}>{c}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{marginBottom:48}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <h2 style={{fontSize:24}}>{title}</h2>
        <div style={{flex:1,height:1,background:G.border}} />
      </div>
      {children}
    </div>
  );
}
function Info({ label, value }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${G.border}`,fontSize:14}}>
      <span style={{color:G.softGrey}}>{label}</span>
      <span style={{fontWeight:500}}>{value}</span>
    </div>
  );
}

// ─── Upload / Profile Form ────────────────────────────────────────────────────
function UploadPage({ chefs, setChefs, setView }) {
  const blank = {id:"",approved:false,featured:false,plan:"free",name:"",title:"",location:"Sydney CBD",cuisine:[],experience:"",rate:"",availability:"Flexible",workType:[],summary:"",bio:"",qualifications:"",restaurants:"",photo:"",heroPhoto:"",gallery:[],dishes:[{name:"",img:"",category:"",desc:"",chefNote:""}],email:"",phone:"",instagram:""};
  const [form, setForm] = useState(blank);
  const [saved, setSaved] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [previewHero, setPreviewHero] = useState(null);

  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const toggleArr = (k,v) => set(k, form[k].includes(v) ? form[k].filter(x=>x!==v) : [...form[k],v]);

  const handleImg = (key, setter) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setter(ev.target.result); set(key, ev.target.result); };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!form.name||!form.email) return alert("Name and email required.");
    const id = "c"+Date.now();
    const chef = {...form, id, restaurants: form.restaurants.split(",").map(s=>s.trim()).filter(Boolean)};
    const updated = [...chefs, chef];
    setChefs(updated); saveDB(updated);
    setSaved(true);
  };

  if (saved) return (
    <div style={{minHeight:"60vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,textAlign:"center"}}>
      <div style={{fontSize:56,marginBottom:16}}>✅</div>
      <h2 style={{fontSize:32,marginBottom:12,fontFamily:"'Playfair Display',serif"}}>Profile Submitted!</h2>
      <p style={{fontSize:16,color:G.softGrey,maxWidth:480,marginBottom:32}}>Your profile is pending admin approval. Once approved, it will appear in the chef directory.</p>
      <div style={{display:"flex",gap:12}}>
        <button onClick={()=>{setForm(blank);setSaved(false);}} className="btn btn-outline">Add Another Profile</button>
        <button onClick={()=>setView("directory")} className="btn btn-primary">Browse Chefs</button>
      </div>
    </div>
  );

  return (
    <div style={{maxWidth:800,margin:"0 auto",padding:"60px 40px"}}>
      <p style={{letterSpacing:3,textTransform:"uppercase",fontSize:11,color:G.gold,marginBottom:8,fontWeight:500}}>Chef Portal</p>
      <h1 style={{fontSize:40,marginBottom:8}}>Create Your Profile</h1>
      <p style={{fontSize:15,color:G.softGrey,marginBottom:40,fontWeight:300}}>Fill in your details to appear in the ChefLink Sydney directory.</p>

      <FormSection title="Personal Details">
        <FormRow>
          <div style={{flex:1}}><label className="fl">Full Name *</label><input className="input" value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Marc Dupont" /></div>
          <div style={{flex:1}}><label className="fl">Professional Title</label><input className="input" value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. Head Chef — French Fine Dining" /></div>
        </FormRow>
        <FormRow>
          <div style={{flex:1}}><label className="fl">Email *</label><input className="input" type="email" value={form.email} onChange={e=>set("email",e.target.value)} /></div>
          <div style={{flex:1}}><label className="fl">Phone</label><input className="input" value={form.phone} onChange={e=>set("phone",e.target.value)} /></div>
        </FormRow>
        <FormRow>
          <div style={{flex:1}}><label className="fl">Location</label><select className="input" value={form.location} onChange={e=>set("location",e.target.value)}>{LOCATIONS.slice(1).map(l=><option key={l}>{l}</option>)}</select></div>
          <div style={{flex:1}}><label className="fl">Hourly/Day Rate</label><input className="input" value={form.rate} onChange={e=>set("rate",e.target.value)} placeholder="e.g. $85–$120/hr" /></div>
        </FormRow>
        <div><label className="fl">Years of Experience</label><input className="input" type="number" value={form.experience} onChange={e=>set("experience",e.target.value)} style={{width:200}} /></div>
      </FormSection>

      <FormSection title="Photos">
        <FormRow>
          <div style={{flex:1}}>
            <label className="fl">Profile Photo</label>
            <input type="file" accept="image/*" onChange={handleImg("photo",setPreviewPhoto)} style={{marginBottom:8}} />
            {previewPhoto && <img src={previewPhoto} alt="" style={{width:80,height:80,borderRadius:"50%",border:`2px solid ${G.gold}`}} />}
            {!previewPhoto && <input className="input" value={form.photo} onChange={e=>set("photo",e.target.value)} placeholder="Or paste image URL" />}
          </div>
          <div style={{flex:1}}>
            <label className="fl">Hero / Best Dish Photo</label>
            <input type="file" accept="image/*" onChange={handleImg("heroPhoto",setPreviewHero)} style={{marginBottom:8}} />
            {previewHero && <img src={previewHero} alt="" style={{width:"100%",height:100,borderRadius:2,objectFit:"cover"}} />}
            {!previewHero && <input className="input" value={form.heroPhoto} onChange={e=>set("heroPhoto",e.target.value)} placeholder="Or paste image URL" />}
          </div>
        </FormRow>
      </FormSection>

      <FormSection title="Cuisine Specialties">
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {CUISINES.slice(1).map(c=>(
            <span key={c} onClick={()=>toggleArr("cuisine",c)} style={{padding:"7px 14px",border:`1px solid ${form.cuisine.includes(c)?G.gold:G.border}`,background:form.cuisine.includes(c)?G.gold:"#fff",borderRadius:20,fontSize:13,cursor:"pointer",transition:"all .2s",color:form.cuisine.includes(c)?G.charcoal:G.softGrey}}>{c}</span>
          ))}
        </div>
      </FormSection>

      <FormSection title="Work Details">
        <div style={{marginBottom:16}}>
          <label className="fl">Work Type</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {WORK_TYPES.slice(1).map(w=>(
              <span key={w} onClick={()=>toggleArr("workType",w)} style={{padding:"7px 14px",border:`1px solid ${form.workType.includes(w)?G.charcoal:G.border}`,background:form.workType.includes(w)?G.charcoal:"#fff",borderRadius:20,fontSize:13,cursor:"pointer",color:form.workType.includes(w)?"#fff":G.softGrey}}>{w}</span>
            ))}
          </div>
        </div>
        <div><label className="fl">Availability</label><input className="input" value={form.availability} onChange={e=>set("availability",e.target.value)} placeholder="e.g. Weekends / Casual / Immediate" /></div>
      </FormSection>

      <FormSection title="About You">
        <div style={{marginBottom:12}}><label className="fl">One-line Summary</label><input className="input" value={form.summary} onChange={e=>set("summary",e.target.value)} placeholder="A brief summary for your directory card" /></div>
        <div style={{marginBottom:12}}><label className="fl">Full Bio</label><textarea className="input" rows={5} value={form.bio} onChange={e=>set("bio",e.target.value)} placeholder="Your background, experience and cooking philosophy..." style={{resize:"vertical"}} /></div>
        <div style={{marginBottom:12}}><label className="fl">Qualifications</label><input className="input" value={form.qualifications} onChange={e=>set("qualifications",e.target.value)} placeholder="e.g. Advanced Diploma, Le Cordon Bleu Paris" /></div>
        <div><label className="fl">Previous Restaurants (comma separated)</label><input className="input" value={form.restaurants} onChange={e=>set("restaurants",e.target.value)} placeholder="e.g. Quay, Bennelong, Aria" /></div>
      </FormSection>

      <FormSection title="Signature Dish">
        <div style={{background:G.cream,border:`1px solid ${G.border}`,borderRadius:2,padding:20}}>
          {["name","category","img","desc","chefNote"].map(f=>(
            <div key={f} style={{marginBottom:10}}>
              <label className="fl">{f==="img"?"Dish Image URL":f==="chefNote"?"Chef's Note":f.charAt(0).toUpperCase()+f.slice(1)}</label>
              {f==="desc"||f==="chefNote" ? <textarea className="input" rows={2} value={form.dishes[0][f]} onChange={e=>{const d=[...form.dishes];d[0]={...d[0],[f]:e.target.value};set("dishes",d);}} style={{resize:"vertical"}} /> : <input className="input" value={form.dishes[0][f]} onChange={e=>{const d=[...form.dishes];d[0]={...d[0],[f]:e.target.value};set("dishes",d);}} />}
            </div>
          ))}
        </div>
      </FormSection>

      <FormSection title="Social Links">
        <FormRow>
          <div style={{flex:1}}><label className="fl">Instagram</label><input className="input" value={form.instagram} onChange={e=>set("instagram",e.target.value)} placeholder="@yourhandle" /></div>
        </FormRow>
      </FormSection>

      <div style={{borderTop:`1px solid ${G.border}`,paddingTop:32,marginTop:32}}>
        <button onClick={submit} className="btn btn-primary" style={{padding:"14px 40px",fontSize:15}}>Submit Profile for Review</button>
        <p style={{fontSize:13,color:G.softGrey,marginTop:10}}>Your profile will appear in the directory after admin approval.</p>
      </div>
    </div>
  );
}

function FormSection({ title, children }) {
  return <div style={{marginBottom:36}}><h3 style={{fontSize:18,marginBottom:16,paddingBottom:10,borderBottom:`1px solid ${G.border}`}}>{title}</h3>{children}</div>;
}
function FormRow({ children }) {
  return <div style={{display:"flex",gap:16,marginBottom:12}}>{children}</div>;
}

// ─── Inquiry ──────────────────────────────────────────────────────────────────
function InquiryPage() {
  const [form, setForm] = useState({business:"",contact:"",email:"",phone:"",location:"",date:"",time:"",cuisine:"",workType:"",chefs:"1",notes:"",urgent:false});
  const [sent, setSent] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const submit = () => { if (!form.business||!form.email) return alert("Business name and email required."); setSent(true); };

  if (sent) return (
    <div style={{minHeight:"60vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,textAlign:"center"}}>
      <div style={{fontSize:56,marginBottom:16}}>📩</div>
      <h2 style={{fontSize:32,marginBottom:12}}>Inquiry Sent!</h2>
      <p style={{fontSize:16,color:G.softGrey,maxWidth:480}}>We'll match you with suitable chefs and respond within 24 hours.</p>
    </div>
  );

  return (
    <div style={{maxWidth:720,margin:"0 auto",padding:"60px 40px"}}>
      <p style={{letterSpacing:3,textTransform:"uppercase",fontSize:11,color:G.gold,marginBottom:8,fontWeight:500}}>Restaurant Portal</p>
      <h1 style={{fontSize:40,marginBottom:8}}>Hire a Chef</h1>
      <p style={{fontSize:15,color:G.softGrey,marginBottom:40,fontWeight:300}}>Tell us what you need and we'll connect you with the right chef.</p>

      {[["Business Name *","business","text"],["Contact Person","contact","text"],["Email *","email","email"],["Phone","phone","tel"]].map(([l,k,t])=>(
        <div key={k} style={{marginBottom:14}}><label style={{display:"block",fontSize:13,fontWeight:500,marginBottom:4,textTransform:"uppercase",letterSpacing:.5,color:G.softGrey}}>{l}</label><input className="input" type={t} value={form[k]} onChange={e=>set(k,e.target.value)} /></div>
      ))}
      <FormRow>
        <div style={{flex:1}}><label style={{display:"block",fontSize:13,fontWeight:500,marginBottom:4,textTransform:"uppercase",letterSpacing:.5,color:G.softGrey}}>Date Needed</label><input className="input" type="date" value={form.date} onChange={e=>set("date",e.target.value)} /></div>
        <div style={{flex:1}}><label style={{display:"block",fontSize:13,fontWeight:500,marginBottom:4,textTransform:"uppercase",letterSpacing:.5,color:G.softGrey}}>Time</label><input className="input" value={form.time} onChange={e=>set("time",e.target.value)} placeholder="e.g. 6pm–11pm" /></div>
      </FormRow>
      <FormRow>
        <div style={{flex:1}}><label style={{display:"block",fontSize:13,fontWeight:500,marginBottom:4,textTransform:"uppercase",letterSpacing:.5,color:G.softGrey}}>Cuisine Required</label><select className="input" value={form.cuisine} onChange={e=>set("cuisine",e.target.value)}>{CUISINES.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={{flex:1}}><label style={{display:"block",fontSize:13,fontWeight:500,marginBottom:4,textTransform:"uppercase",letterSpacing:.5,color:G.softGrey}}>Work Type</label><select className="input" value={form.workType} onChange={e=>set("workType",e.target.value)}>{WORK_TYPES.map(w=><option key={w}>{w}</option>)}</select></div>
      </FormRow>
      <div style={{marginBottom:14}}><label style={{display:"block",fontSize:13,fontWeight:500,marginBottom:4,textTransform:"uppercase",letterSpacing:.5,color:G.softGrey}}>Notes</label><textarea className="input" rows={4} value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Describe the event, kitchen, number of covers, any specific requirements..." style={{resize:"vertical"}} /></div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}><input type="checkbox" id="urgent" checked={form.urgent} onChange={e=>set("urgent",e.target.checked)} style={{width:16,height:16}} /><label htmlFor="urgent" style={{fontSize:14,color:G.charcoal,cursor:"pointer"}}>This is an urgent request (within 48 hours)</label></div>
      <button onClick={submit} className="btn btn-primary" style={{padding:"14px 40px",fontSize:15}}>Send Inquiry</button>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminPage({ chefs, setChefs }) {
  const [tab, setTab] = useState("chefs");
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [exportMsg, setExportMsg] = useState("");

  const update = (id, key, val) => {
    const updated = chefs.map(c => c.id===id ? {...c,[key]:val} : c);
    setChefs(updated); saveDB(updated);
  };
  const remove = (id) => { if (!window.confirm("Delete this chef?")) return; const updated=chefs.filter(c=>c.id!==id); setChefs(updated); saveDB(updated); };
  const startEdit = (chef) => { setEditing(chef.id); setEditForm({...chef, restaurants: chef.restaurants?.join(", ")||""}); };
  const saveEdit = () => {
    const updated = chefs.map(c => c.id===editForm.id ? {...editForm, restaurants:editForm.restaurants.split(",").map(s=>s.trim()).filter(Boolean)} : c);
    setChefs(updated); saveDB(updated); setEditing(null);
  };
  const exportJSON = () => { const blob=new Blob([JSON.stringify(chefs,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="cheflink_chefs.json"; a.click(); setExportMsg("Exported!"); setTimeout(()=>setExportMsg(""),2000); };
  const importJSON = (e) => { const file=e.target.files[0]; if (!file) return; const r=new FileReader(); r.onload=ev=>{try{const d=JSON.parse(ev.target.result);setChefs(d);saveDB(d);}catch{alert("Invalid JSON");}}; r.readAsText(file); };

  const pending = chefs.filter(c=>!c.approved);
  const all = chefs;

  return (
    <div style={{display:"flex",minHeight:"100vh"}}>
      {/* Sidebar */}
      <div style={{width:220,background:G.charcoal,padding:"28px 0",flexShrink:0}}>
        <div style={{padding:"0 24px 28px",borderBottom:"1px solid rgba(255,255,255,.1)"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:G.gold,fontWeight:700}}>ChefLink</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.4)",letterSpacing:2,textTransform:"uppercase",marginTop:2}}>Admin Panel</div>
        </div>
        {[["chefs","👨‍🍳 All Chefs"],["pending","⏳ Pending ("+(pending.length)+")"],["export","📤 Import / Export"]].map(([t,l])=>(
          <div key={t} onClick={()=>setTab(t)} style={{padding:"12px 24px",cursor:"pointer",fontSize:13,color:tab===t?"#fff":"rgba(255,255,255,.5)",background:tab===t?"rgba(255,255,255,.08)":"transparent",borderLeft:tab===t?`3px solid ${G.gold}`:"3px solid transparent",transition:"all .2s"}}>{l}</div>
        ))}
      </div>

      {/* Main */}
      <div style={{flex:1,padding:"36px 40px",overflowY:"auto",background:G.ivory}}>
        {tab==="chefs" && (
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28}}>
              <h2 style={{fontSize:28}}>All Chefs <span style={{fontSize:16,color:G.softGrey,fontFamily:"'Jost',sans-serif",fontWeight:300}}>({all.length})</span></h2>
            </div>
            <div style={{display:"grid",gap:12}}>
              {all.map(c=>(
                <div key={c.id} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:2,padding:"16px 20px",display:"flex",gap:14,alignItems:"center"}}>
                  <img src={c.photo} alt={c.name} style={{width:52,height:52,borderRadius:"50%",objectFit:"cover",border:`2px solid ${G.border}`}} />
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                      <span style={{fontWeight:600,fontSize:16}}>{c.name}</span>
                      {c.approved && <span className="badge badge-green">Approved</span>}
                      {!c.approved && <span className="badge badge-orange">Pending</span>}
                      {c.featured && <span className="badge badge-gold">Featured</span>}
                      <span className="badge" style={{background:G.cream,color:G.softGrey}}>{c.plan}</span>
                    </div>
                    <p style={{fontSize:13,color:G.softGrey}}>{c.title} · {c.location} · {c.cuisine?.join(", ")}</p>
                  </div>
                  <div style={{display:"flex",gap:8,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <button onClick={()=>update(c.id,"approved",!c.approved)} className="btn btn-outline" style={{fontSize:11,padding:"6px 12px"}}>{c.approved?"Unapprove":"Approve"}</button>
                    <button onClick={()=>update(c.id,"featured",!c.featured)} className="btn btn-outline" style={{fontSize:11,padding:"6px 12px"}}>{c.featured?"Unfeature":"Feature"}</button>
                    <button onClick={()=>startEdit(c)} className="btn btn-gold" style={{fontSize:11,padding:"6px 12px"}}>Edit</button>
                    <button onClick={()=>remove(c.id)} style={{fontSize:11,padding:"6px 12px",background:"#fff",color:"#C0392B",border:"1px solid #C0392B",borderRadius:2,cursor:"pointer"}}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab==="pending" && (
          <>
            <h2 style={{fontSize:28,marginBottom:28}}>Pending Approval</h2>
            {pending.length===0 ? <p style={{color:G.softGrey,fontSize:16}}>No chefs pending approval.</p> : (
              <div style={{display:"grid",gap:12}}>
                {pending.map(c=>(
                  <div key={c.id} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:2,padding:"20px"}}>
                    <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:12}}>
                      <img src={c.photo} alt="" style={{width:56,height:56,borderRadius:"50%",objectFit:"cover"}} />
                      <div>
                        <div style={{fontWeight:600,fontSize:17}}>{c.name}</div>
                        <div style={{fontSize:13,color:G.softGrey}}>{c.email} · {c.location}</div>
                        <div style={{fontSize:13,color:G.softGrey,marginTop:2}}>{c.cuisine?.join(", ")}</div>
                      </div>
                    </div>
                    <p style={{fontSize:14,color:G.textMuted,marginBottom:16,lineHeight:1.6}}>{c.bio}</p>
                    <div style={{display:"flex",gap:10}}>
                      <button onClick={()=>update(c.id,"approved",true)} className="btn btn-primary" style={{fontSize:12}}>Approve</button>
                      <button onClick={()=>remove(c.id)} style={{fontSize:12,padding:"9px 20px",background:"#fff",color:"#C0392B",border:"1px solid #C0392B",borderRadius:2,cursor:"pointer"}}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab==="export" && (
          <div>
            <h2 style={{fontSize:28,marginBottom:28}}>Import / Export</h2>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
              <div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:2,padding:28}}>
                <h3 style={{fontSize:18,marginBottom:8}}>Export Data</h3>
                <p style={{fontSize:14,color:G.softGrey,marginBottom:20,lineHeight:1.6}}>Download all chef data as a JSON file. Use this to back up your database or migrate to Supabase/Firebase.</p>
                <button onClick={exportJSON} className="btn btn-primary">{exportMsg||"Export JSON"}</button>
              </div>
              <div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:2,padding:28}}>
                <h3 style={{fontSize:18,marginBottom:8}}>Import Data</h3>
                <p style={{fontSize:14,color:G.softGrey,marginBottom:20,lineHeight:1.6}}>Import chefs from a JSON file. This will replace the current database.</p>
                <input type="file" accept=".json" onChange={importJSON} />
              </div>
            </div>
            <div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:2,padding:28,marginTop:20}}>
              <h3 style={{fontSize:18,marginBottom:12}}>Backend Integration Notes</h3>
              <p style={{fontSize:14,color:G.softGrey,lineHeight:1.8}}>This prototype uses <strong>localStorage</strong> as the database. To deploy to production, replace the <code style={{background:G.cream,padding:"1px 6px",borderRadius:2}}>saveDB</code> / <code style={{background:G.cream,padding:"1px 6px",borderRadius:2}}>defaultDB</code> functions with API calls to <strong>Supabase</strong>, <strong>Firebase Firestore</strong>, <strong>Airtable</strong>, or any REST backend. All data is structured as clean JSON — ready for migration.</p>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && editForm && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
          <div style={{background:"#fff",borderRadius:4,padding:36,width:"90%",maxWidth:600,maxHeight:"85vh",overflowY:"auto"}}>
            <h3 style={{fontSize:22,marginBottom:20}}>Edit Chef: {editForm.name}</h3>
            {[["name","Name"],["title","Title"],["email","Email"],["phone","Phone"],["rate","Rate"],["availability","Availability"],["summary","Summary"],["photo","Photo URL"],["heroPhoto","Hero Photo URL"]].map(([k,l])=>(
              <div key={k} style={{marginBottom:12}}>
                <label style={{display:"block",fontSize:12,fontWeight:500,marginBottom:4,textTransform:"uppercase",letterSpacing:.5,color:G.softGrey}}>{l}</label>
                {k==="summary"?<textarea className="input" rows={2} value={editForm[k]||""} onChange={e=>setEditForm(p=>({...p,[k]:e.target.value}))} style={{resize:"vertical"}} />:<input className="input" value={editForm[k]||""} onChange={e=>setEditForm(p=>({...p,[k]:e.target.value}))} />}
              </div>
            ))}
            <div style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:12,fontWeight:500,marginBottom:4,textTransform:"uppercase",letterSpacing:.5,color:G.softGrey}}>Plan</label>
              <select className="input" value={editForm.plan} onChange={e=>setEditForm(p=>({...p,plan:e.target.value}))}>
                {["free","basic","premium"].map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:12,marginTop:20}}>
              <button onClick={saveEdit} className="btn btn-primary">Save Changes</button>
              <button onClick={()=>setEditing(null)} className="btn btn-outline">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [chefs, setChefs] = useState(defaultDB);
  const [view, setView] = useState("home");
  const [selectedChef, setSelectedChef] = useState(null);

  return (
    <>
      <style>{css}</style>
      <style>{`.fl{display:block;font-size:12px;font-weight:500;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;color:${G.softGrey}}`}</style>
      <Nav view={view} setView={setView} />
      {view==="home" && <HomePage chefs={chefs} setView={setView} setSelectedChef={setSelectedChef} />}
      {view==="directory" && <DirectoryPage chefs={chefs} setView={setView} setSelectedChef={setSelectedChef} />}
      {view==="portfolio" && <PortfolioPage chef={selectedChef} setView={setView} />}
      {view==="upload" && <UploadPage chefs={chefs} setChefs={setChefs} setView={setView} />}
      {view==="inquiry" && <InquiryPage />}
      {view==="admin" && <AdminPage chefs={chefs} setChefs={setChefs} />}
    </>
  );
}
