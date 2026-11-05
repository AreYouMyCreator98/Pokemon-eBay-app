import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const supabase=createClient("https://prxvxomflqzviqiktcgr.supabase.co","sb_publishable_WrQ8yUaSj-z6nsx_-r9FGw_e1CkhXtc");
const $=s=>document.querySelector(s);
// Do not persist eBay seller identifiers or seller location in saved listing snapshots.
function safeSnapshot(item){if(!item||typeof item!=="object")return null;const url=String(item.url||"");if(!/^https:\/\/www\.ebay\.(com\.au|com)\/itm\//i.test(url))return null;return {id:url,url};}
let cloudUser=null,cloudReady=false,authMode="signin",syncBusy=false;
function setAccountMessage(message,error=false){$("#accountMessage").textContent=message;$("#accountMessage").classList.toggle("error",error);}
function openAccount(){$("#accountPanel").classList.remove("hidden");}
function closeAccount(){$("#accountPanel").classList.add("hidden");}
async function syncCollection(key,value){
 if(!cloudUser||!cloudReady||syncBusy)return;syncBusy=true;
 try{
  if(key==="pokemarket-watchlist"){
   const rows=value.filter(x=>x&&typeof x==="object"&&x.id).map(x=>({user_id:cloudUser.id,item_id:String(x.id),item_url:x.url||null,item_title:"",item_snapshot:{}}));
   const del=await supabase.from("user_watchlist").delete().eq("user_id",cloudUser.id);if(del.error)throw del.error;
   if(rows.length){const ins=await supabase.from("user_watchlist").insert(rows);if(ins.error)throw ins.error;}
  }else if(key==="pokemarket-searches"){
   const rows=value.map(s=>({user_id:cloudUser.id,search_key:String(s.id),query:s.query,marketplace:s.marketplace,listing_type:s.type,sort_by:s.sort,min_price:s.minPrice===""?null:Number(s.minPrice),max_price:s.maxPrice===""?null:Number(s.maxPrice)}));
   const del=await supabase.from("user_saved_searches").delete().eq("user_id",cloudUser.id);if(del.error)throw del.error;
   if(rows.length){const ins=await supabase.from("user_saved_searches").insert(rows);if(ins.error)throw ins.error;}
  }
 }catch(error){setAccountMessage("Cloud sync issue: "+(error.message||"Please try again."),true);}finally{syncBusy=false;}
}
async function loadCloudData(user){
 cloudReady=false;cloudUser=user;
 const [s]=await Promise.all([supabase.from("user_saved_searches").select("search_key,query,marketplace,listing_type,sort_by,min_price,max_price,created_at").eq("user_id",user.id).order("created_at",{ascending:false})]);
 if(s.error)throw s.error;
 const localSearch=state.savedSearches;
 if(!s.data.length&&localSearch.length){const rows=localSearch.map(x=>({user_id:user.id,search_key:String(x.id),query:x.query,marketplace:x.marketplace,listing_type:x.type,sort_by:x.sort,min_price:x.minPrice===""?null:Number(x.minPrice),max_price:x.maxPrice===""?null:Number(x.maxPrice)}));const m=await supabase.from("user_saved_searches").upsert(rows,{onConflict:"user_id,search_key"});if(m.error)throw m.error;}
 const [sr]=await Promise.all([supabase.from("user_saved_searches").select("search_key,query,marketplace,listing_type,sort_by,min_price,max_price").eq("user_id",user.id).order("created_at",{ascending:false})]);
 if(sr.error)throw sr.error;
 state.watchlist=[];state.savedSearches=sr.data.map(x=>({id:x.search_key,query:x.query,marketplace:x.marketplace,type:x.listing_type,sort:x.sort_by,minPrice:x.min_price==null?"":String(x.min_price),maxPrice:x.max_price==null?"":String(x.max_price)}));
 localStorage.removeItem("pokemarket-watchlist");localStorage.setItem("pokemarket-searches",JSON.stringify(state.savedSearches));
 cloudReady=true;render();$("#accountTitle").textContent="Collector account";$("#accountEmail").textContent=user.email||"Signed in";$("#authForm").classList.add("hidden");$("#signedInActions").classList.remove("hidden");$("#accountBtn").setAttribute("aria-label","My account");$("#accountBtn").title="My account";setAccountMessage("Your saved searches are syncing across devices.");
}
async function handleAuthSession(session){
 if(session?.user){try{await loadCloudData(session.user);}catch(error){cloudUser=session.user;cloudReady=false;setAccountMessage("Signed in, but cloud data could not load: "+error.message,true);}}
 else{cloudUser=null;cloudReady=false;state.watchlist=[];state.savedSearches=[];localStorage.removeItem("pokemarket-watchlist");localStorage.removeItem("pokemarket-searches");$("#authForm").classList.remove("hidden");$("#signedInActions").classList.add("hidden");$("#accountTitle").textContent="Your account";$("#accountBtn").setAttribute("aria-label","Sign in");$("#accountBtn").title="Sign in";setAccountMessage("Sign in to sync your saved searches across devices.");render();}
}
const state={featured:[],featureIndex:0,tab:"discover",mode:"feed",view:"grid",tcgFocus:"ALL",discoverPage:0,discoverItems:[],endingItems:[],endingWindow:10,discoverFetchedAt:0,endingFetchedAt:0,discoverKey:"",endingKey:"",discoverRequestId:0,endingRequestId:0,discoverPaused:false,discoverHover:false,discoverLastInteraction:0,category:"ALL",items:[],query:"",watchlist:[],savedSearches:load("pokemarket-searches",[]).map(x=>typeof x==="string"?{id:x,query:x,marketplace:"AU",type:"ALL",sort:"endingSoonest",shipFrom:"ANY",shipsTo:"ANY",minPrice:"",maxPrice:""}:x),alerted:[]};
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
// Remove previously cached eBay seller details, including older watchlist snapshots.
for(const key of ["pokemarket-last-items","pokemarket-alerted","pokemarket-watchlist"])localStorage.removeItem(key);
// Rewrite older watchlists immediately, even if the user never edits them.
try{const old=localStorage.getItem("pokemarket-watchlist");if(old!==null){const parsed=JSON.parse(old);localStorage.setItem("pokemarket-watchlist",JSON.stringify(Array.isArray(parsed)?parsed.map(safeSnapshot).filter(Boolean):[]));}}catch{localStorage.removeItem("pokemarket-watchlist");}
function save(key,value){if(key==="pokemarket-watchlist")value=value.map(safeSnapshot).filter(Boolean);localStorage.setItem(key,JSON.stringify(value));if(key==="pokemarket-searches")void syncCollection(key,value);}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(v,c){return v==null?"Price unavailable":new Intl.NumberFormat(undefined,{style:"currency",currency:c||"AUD",maximumFractionDigits:2}).format(v);}
function remaining(end){if(!end)return"Time not supplied";const ms=new Date(end).getTime()-Date.now();if(!Number.isFinite(ms))return"Time not supplied";if(ms<=0)return"Ended";const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);return d?d+"d "+h+"h left":h?h+"h "+m+"m left":m+"m "+s+"s left";}
function isSaved(item){return state.watchlist.some(x=>x&&x.url===item.url);}
function visibleItems(){
 if(state.tab==="ending"){const now=Date.now(),limit=state.endingWindow*60000;return state.items.filter(x=>(x.buyingOptions||[]).includes("AUCTION")&&x.endTime&&new Date(x.endTime).getTime()>now&&new Date(x.endTime).getTime()-now<=limit).sort((a,b)=>new Date(a.endTime)-new Date(b.endTime));}
 if(state.tab==="discover"&&state.mode==="feed")return state.items.filter(x=>(x.buyingOptions||[]).includes("FIXED_PRICE"));
 return state.items;
}
function renderSavedSearches(){
 const host=$("#savedSearchTags");if(!host)return;
 host.innerHTML=state.savedSearches.map((s,i)=>'<button class="tag" data-saved-index="'+i+'">'+esc(s.query)+' · '+esc(s.marketplace)+' · '+esc(s.type)+' ↗</button>').join("");
}
function render(){
 renderSavedSearches();
 const sold=state.tab==="sold";$("#soldNotice").classList.toggle("hidden",!sold);$("#listingGrid").classList.toggle("hidden",sold);
 const isFeed=state.tab==="discover"&&state.mode==="feed",isEnding=state.tab==="ending";
 $("#discoveryControls").classList.toggle("hidden",!isFeed);$("#endingControls").classList.toggle("hidden",!isEnding);
 const labels={discover:isFeed?["ALL TCG DISCOVERY","Live Buy It Now listings"]:["LIVE MARKETPLACE","Search results"],ending:["LAST-MINUTE AUCTIONS","Ending within "+state.endingWindow+" minutes"],sold:["MARKET HISTORY","Recently sold"]};
 $("#sectionEyebrow").textContent=labels[state.tab][0];$("#sectionTitle").textContent=labels[state.tab][1];
 if(sold){$("#resultCount").textContent="Verified data pending";return;}
 const items=visibleItems();$("#resultCount").textContent=items.length?items.length+" live listings":"Ready to search";
 if(!items.length){
  $("#listingGrid").innerHTML='<div class="empty"><strong>'+(isEnding?"No auctions currently closing in the next "+state.endingWindow+" minutes":isFeed?"No Buy It Now listings loaded yet":"No listings loaded yet")+'</strong>'+(isEnding?"Try the 10-minute window or refresh. Only confirmed countdowns are shown.":isFeed?"eBay may be returning no matches right now. Try refreshing or choosing another marketplace.":"Search a card, set or sealed product above.")+'</div>';
  $("#resultCount").textContent="0 listings";
  if(isFeed)$("#discoverPageLabel").textContent="0 / 0";
  return;
 }
 let visible=items.filter(item=>{const title=String(item.title||"").toLowerCase(),cat=category(item).toLowerCase(),set=$("#setFilter").value.toLowerCase(),grade=$("#gradeFilter").value,condition=$("#conditionFilter").value;return (state.category==="ALL"||cat===state.category.toLowerCase())&&(!set||title.includes(set))&&(!grade||(grade==="RAW"?cat==="raw":title.includes(grade.toLowerCase())))&&(!condition||(condition==="FACTORY"?/factory sealed|sealed/.test(title):String(item.condition||"").toUpperCase().includes(condition)));});
 if(isFeed){
  if(state.tcgFocus!=="ALL")visible=visible.filter(item=>item.tcg===state.tcgFocus);
  const count=visible.length,pages=Math.max(1,Math.ceil(count/12));
  state.discoverPage=((state.discoverPage%pages)+pages)%pages;
  $("#discoverPageLabel").textContent=count?(state.discoverPage+1)+" / "+pages:"0 / 0";
  $("#discoverPrev").disabled=pages<2;$("#discoverNext").disabled=pages<2;
  visible=visible.slice(state.discoverPage*12,state.discoverPage*12+12);
  $("#resultCount").textContent=visible.length+" of "+count+" live Buy It Now listings";
 }else $("#resultCount").textContent=visible.length+(isEnding?" auctions closing within "+state.endingWindow+" minutes":" listings")+(state.mode==="search"&&state.query?' for “'+state.query+'”':"");
 $("#listingGrid").classList.toggle("list-view",state.view==="list");
 if(!visible.length){$("#listingGrid").innerHTML='<div class="empty"><strong>No matching listings</strong>'+(isEnding?"No live auctions match these filters within the next "+state.endingWindow+" minutes.":isFeed?"Try another TCG, card category or filter.":"Adjust your filters or search for a different card.")+"</div>";return;}
 $("#listingGrid").innerHTML=visible.map(item=>{
 const auction=(item.buyingOptions||[]).includes("AUCTION"),cat=category(item),condition=String(item.condition||"").trim();
 const url=/^https:\/\/www\.ebay\.(com\.au|com)\//i.test(item.url||"")?item.url:"";
 const image=item.image?'<img src="'+esc(item.image)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="image-fallback">✦</span>';
 const grade=(item.title||"").match(/\b(?:PSA|BGS|CGC|SGC|ACE)\s*(?:GEM\s*MINT\s*)?(?:10|9\.5|9|8\.5|8|7|6)\b/i);
 const time=auction?'<div class="auction-clock"><img class="countdown-overlay" src="/assets/overlays/time-left.webp" alt="Time left" loading="lazy"><strong class="countdown" data-end="'+esc(item.endTime||"")+'">'+esc(remaining(item.endTime))+'</strong></div>':'';
 const conditionText=/factory sealed/i.test(item.title||"")?"NEW FACTORY SEALED":condition.toUpperCase();
 const conditionPill=conditionText==="NEW FACTORY SEALED"?'<img class="condition-overlay" src="/assets/overlays/factory-sealed.webp" alt="New factory sealed" loading="lazy">':/^NEW\b/.test(conditionText)?'<img class="condition-overlay" src="/assets/overlays/new.webp" alt="New" loading="lazy">':'<span>'+esc(conditionText||"CONDITION NOT SUPPLIED")+'</span>';
 const gradeBrand=grade?grade[0].match(/^(PSA|BGS)\b/i):null;
 const gradePill=grade?(gradeBrand?'<span class="grade-badge grade-image-badge"><img src="/assets/overlays/'+gradeBrand[1].toLowerCase()+'.webp" alt="'+gradeBrand[1]+'" loading="lazy"><strong>'+esc(grade[0].replace(/^(PSA|BGS)\b\s*/i,""))+'</strong></span>':'<span class="grade-badge">'+esc(grade[0].toUpperCase())+'</span>'):'';
 return '<article class="listing-card type-'+cat.toLowerCase()+'"><div class="listing-image">'+image+'<div class="image-tags overlay-tags"><span class="category-badge asset-badge"><img src="/assets/overlays/'+cat.toLowerCase()+'.webp" alt="'+esc(cat)+'" loading="lazy"></span><span class="sale-badge asset-badge '+(auction?"is-auction":"")+'"><img src="/assets/overlays/'+(auction?"auction":"buy-now")+'.webp" alt="'+(auction?"Auction":"Buy now")+'" loading="lazy"></span></div>'+(url?'<a class="watch-button" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" title="Watch on eBay" aria-label="Watch on eBay">☆</a>':'')+gradePill+'</div><div class="listing-body">'+(item.tcgLabel?'<span class="tcg-product-label">'+esc(item.tcgLabel)+'</span>':"")+'<h3 class="listing-title" title="'+esc(item.title)+'">'+esc(item.title)+'</h3><p class="listing-condition">'+conditionPill+'</p><div class="price-row"><div><small>'+(auction?(item.bids===0?"STARTING BID":"CURRENT BID"):"LISTED PRICE")+'</small><span class="price">'+money(item.price,item.currency)+'</span></div><span class="currency-tag">'+esc(item.currency||"AUD")+'</span></div>'+time+'<div class="listing-meta"><span>⌖ '+esc(item.location||"Location unavailable")+'</span><span>'+esc(item.marketplace||"")+'</span></div><div class="card-actions">'+(url?'<a class="ebay-link custom-ebay-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" aria-label="View this item on eBay"><img src="/assets/controls/view-ebay.webp" alt="View eBay listing" loading="lazy"></a>':'<span class="ebay-link unavailable">eBay listing link unavailable</span>')+'</div></div></article>';
 }).join("");
}
function category(item){const t=String(item.title||"").toLowerCase();if(/\b(psa|bgs|cgc|sgc|ace)\s*(?:gem mint\s*)?(?:10|9\.5|9|8\.5|8|7|6)\b|graded|slabbed/.test(t))return "GRADED";if(/booster box|elite trainer box|\betb\b|booster pack|sealed|blister|collection box|tin\b|display box|case of|bundle/.test(t))return "SEALED";return "RAW";}
function spotlightCard(item){const url=/^https:\/\/www\.ebay\.(com\.au|com)\//i.test(item.url||"")?item.url:"";const image=item.image?'<img src="'+esc(item.image)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="spotlight-fallback">✦</span>';return '<article class="spotlight-item"><div class="spotlight-photo">'+image+'</div><div class="spotlight-info"><span class="spotlight-tag overlay-spotlight-tag"><img src="/assets/overlays/auction.webp" alt="Auction" loading="lazy"><img src="/assets/overlays/'+category(item).toLowerCase()+'.webp" alt="'+esc(category(item))+'" loading="lazy"></span><h3>'+esc(item.title)+'</h3><div class="spotlight-price"><small class="spotlight-price-caption">'+(item.bids===0?"STARTING BID":item.bids==null?"AUCTION PRICE":"CURRENT BID")+'</small>'+money(item.price,item.currency)+'</div><div class="spotlight-time overlay-spotlight-time"><img src="/assets/overlays/time-left.webp" alt="Time left" loading="lazy"><span class="countdown" data-end="'+esc(item.endTime||"")+'">'+esc(remaining(item.endTime))+'</span></div>'+(url?'<a class="spotlight-link custom-ebay-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" aria-label="View this item on eBay"><img src="/assets/controls/view-ebay.webp" alt="View eBay listing" loading="lazy"></a>':'')+'</div></article>';}
function moveSpotlight(direction=1){const count=state.featured.length;if(!count)return;state.featureIndex=(state.featureIndex+direction+count)%count;const track=$("#spotTrack");track.style.transform="translateX(-"+(state.featureIndex*100)+"%)";$("#spotProgress").innerHTML=state.featured.map((_,i)=>'<span class="'+(i===state.featureIndex?"active":"")+'"></span>').join("");}
async function loadSpotlight(){try{const p=new URLSearchParams({q:"pokemon trading card",marketplace:"AU",type:"AUCTION",sort:"endingSoonest",limit:"50",smart:"0"});if($("#shipFrom").value!=="ANY")p.set("shipFrom",$("#shipFrom").value);if($("#shipsTo").value!=="ANY")p.set("shipsTo",$("#shipsTo").value);const response=await fetch("/api/search?"+p);if(!response.ok)throw Error("Auction feed unavailable");const data=await response.json();state.featured=(data.items||[]).filter(x=>(x.buyingOptions||[]).includes("AUCTION")&&x.endTime&&new Date(x.endTime)>new Date()&&x.url).sort((a,b)=>new Date(a.endTime)-new Date(b.endTime)).slice(0,12);state.featureIndex=0;$("#spotTrack").innerHTML=state.featured.length?state.featured.map(spotlightCard).join(""):'<div class="spotlight-loading">No ending-soon auctions returned right now. Try searching below.</div>';$("#spotTrack").style.transform="translateX(0)";moveSpotlight(0);}catch(error){$("#spotTrack").innerHTML='<div class="spotlight-loading">Live auction highlights are temporarily unavailable. Search below for current listings.</div>';}}
// Auction highlights refresh only after the user applies country filters.
$("#spotPrev").addEventListener("click",()=>moveSpotlight(-1));$("#spotNext").addEventListener("click",()=>moveSpotlight(1));
$("#spotWindow").addEventListener("mouseenter",()=>state.spotPaused=true);$("#spotWindow").addEventListener("mouseleave",()=>state.spotPaused=false);$("#spotWindow").addEventListener("touchstart",event=>{state.spotTouchX=event.touches[0].clientX;state.spotPaused=true;},{passive:true});$("#spotWindow").addEventListener("touchend",event=>{if(state.spotTouchX!=null){const delta=event.changedTouches[0].clientX-state.spotTouchX;if(Math.abs(delta)>45)moveSpotlight(delta<0?1:-1);}state.spotTouchX=null;state.spotPaused=false;},{passive:true});
setInterval(()=>{if(!state.spotPaused&&!document.hidden)moveSpotlight(1);},6500);loadSpotlight();
// Four independent eBay discovery feeds, interleaved so one TCG cannot dominate the page.
const TCG_FEEDS=[
 {id:"POKEMON",label:"Pokémon",q:"pokemon trading card"},
 {id:"ONE_PIECE",label:"One Piece",q:"one piece card game"},
 {id:"YUGIOH",label:"Yu-Gi-Oh!",q:"yugioh trading card"},
 {id:"MTG",label:"Magic: The Gathering",q:"magic the gathering mtg card"}
];
function feedContext(){return {marketplace:$("#marketplace").value,shipFrom:$("#shipFrom").value,shipsTo:$("#shipsTo").value,minPrice:$("#minPrice").value,maxPrice:$("#maxPrice").value};}
function feedContextKey(type){return type+"|"+JSON.stringify(feedContext());}
function feedQuery(game,type){
 const f=feedContext(),p=new URLSearchParams({q:game.q,marketplace:f.marketplace,type,sort:type==="FIXED"?"newlyListed":"endingSoonest",limit:type==="FIXED"?"24":"50",smart:"0"});
 if(f.shipFrom!=="ANY")p.set("shipFrom",f.shipFrom);
 if(f.shipsTo!=="ANY")p.set("shipsTo",f.shipsTo);
 if(f.minPrice)p.set("minPrice",f.minPrice);
 if(f.maxPrice)p.set("maxPrice",f.maxPrice);
 return "/api/search?"+p.toString();
}
async function fetchTCGBuckets(type){
 const responses=await Promise.allSettled(TCG_FEEDS.map(async game=>{
  const response=await fetch(feedQuery(game,type));
  if(!response.ok)throw Error("eBay returned "+response.status);
  const payload=await response.json();
  return (payload.items||[]).filter(item=>item.url&&(
   type==="FIXED"?((item.buyingOptions||[]).includes("FIXED_PRICE")&&!(item.buyingOptions||[]).includes("AUCTION")):
   ((item.buyingOptions||[]).includes("AUCTION")&&item.endTime&&Number.isFinite(new Date(item.endTime).getTime()))
  )).map(item=>({...item,tcg:game.id,tcgLabel:game.label}));
 }));
 const failures=responses.filter(r=>r.status==="rejected").length;
 const buckets=responses.map(r=>r.status==="fulfilled"?r.value:[]);
 const seen=new Set(),interleaved=[],max=Math.max(0,...buckets.map(b=>b.length));
 for(let n=0;n<max;n++)for(const bucket of buckets){const item=bucket[n];if(!item)continue;const id=String(item.id||item.url);if(seen.has(id))continue;seen.add(id);interleaved.push(item);}
 return {items:interleaved,failures,successes:responses.length-failures};
}
async function loadDiscovery(force=false){
 const key=feedContextKey("FIXED");
 if(state.discoverLoadingKey===key)return;
 if(!force&&state.discoverKey===key&&Date.now()-state.discoverFetchedAt<4*60*1000){
  if(state.tab==="discover"&&state.mode==="feed"){state.items=state.discoverItems;$("#status").classList.remove("error");$("#status").textContent="Live Buy It Now picks across four TCGs · Updated "+new Date(state.discoverFetchedAt).toLocaleTimeString();render();}
  return;
 }
 const requestId=++state.discoverRequestId;
 state.discoverLoadingKey=key;
 if(state.tab==="discover"&&state.mode==="feed"){$("#status").classList.remove("error");$("#status").textContent="Finding fresh Buy It Now listings across Pokémon, One Piece, Yu-Gi-Oh! and Magic…";}
 try{
  const result=await fetchTCGBuckets("FIXED");
  if(requestId!==state.discoverRequestId)return;
  if(!result.successes)throw Error("All four eBay discovery feeds are temporarily unavailable.");
  const differentKey=state.discoverKey!==key;
  state.discoverItems=result.items;state.discoverKey=key;state.discoverFetchedAt=Date.now();
  if(differentKey)state.discoverPage=0;
  if(state.tab==="discover"&&state.mode==="feed"){
   state.items=state.discoverItems;
   $("#status").textContent=result.failures?"Showing "+result.items.length+" live Buy It Now listings; "+result.failures+" TCG feed"+(result.failures===1?" is":"s are")+" temporarily unavailable.":"Live eBay Buy It Now picks across four TCGs · Rotating every 20 seconds · Updated "+new Date().toLocaleTimeString();
   render();
  }
 }catch(error){
  if(requestId!==state.discoverRequestId)return;
  if(state.tab==="discover"&&state.mode==="feed"){
   $("#status").classList.add("error");$("#status").textContent=error.message||"The eBay discovery feed is unavailable.";
   state.items=state.discoverItems;render();
  }
 }finally{if(state.discoverLoadingKey===key)state.discoverLoadingKey="";}
}
async function loadEndingSoon(force=false){
 const key=feedContextKey("AUCTION");
 if(state.endingLoadingKey===key)return;
 if(!force&&state.endingKey===key&&Date.now()-state.endingFetchedAt<70*1000){
  if(state.tab==="ending"){state.items=state.endingItems;$("#status").classList.remove("error");$("#status").textContent="Last-minute eBay auctions · Countdown window: "+state.endingWindow+" minutes · Updated "+new Date(state.endingFetchedAt).toLocaleTimeString();render();}
  return;
 }
 const requestId=++state.endingRequestId;
 state.endingLoadingKey=key;
 if(state.tab==="ending"){$("#status").classList.remove("error");$("#status").textContent="Checking live auctions across Pokémon, One Piece, Yu-Gi-Oh! and Magic…";}
 try{
  const result=await fetchTCGBuckets("AUCTION");
  if(requestId!==state.endingRequestId)return;
  if(!result.successes)throw Error("All four eBay auction feeds are temporarily unavailable.");
  state.endingItems=result.items;state.endingKey=key;state.endingFetchedAt=Date.now();
  if(state.tab==="ending"){
   state.items=state.endingItems;
   const now=Date.now(),near=result.items.filter(item=>new Date(item.endTime).getTime()>now&&new Date(item.endTime).getTime()<=now+state.endingWindow*60000).length;
   $("#status").textContent=result.failures?"Found "+near+" auctions closing within "+state.endingWindow+" minutes; "+result.failures+" TCG feed"+(result.failures===1?" is":"s are")+" unavailable.":"Live eBay auctions · "+near+" ending in the next "+state.endingWindow+" minutes · Refreshed "+new Date().toLocaleTimeString();
   render();
  }
 }catch(error){
  if(requestId!==state.endingRequestId)return;
  if(state.tab==="ending"){$("#status").classList.add("error");$("#status").textContent=error.message||"Auction feed temporarily unavailable.";state.items=state.endingItems;render();}
 }finally{if(state.endingLoadingKey===key)state.endingLoadingKey="";}
}
function advanceDiscovery(direction){
 if(state.tab!=="discover"||state.mode!=="feed"||!state.discoverItems.length)return;
 state.discoverLastInteraction=Date.now();
 state.discoverPage+=direction;
 render();
}
$("#discoverPrev").addEventListener("click",()=>advanceDiscovery(-1));
$("#discoverNext").addEventListener("click",()=>advanceDiscovery(1));
document.querySelectorAll("[data-tcg]").forEach(button=>button.addEventListener("click",()=>{
 state.tcgFocus=button.dataset.tcg;state.discoverPage=0;state.discoverLastInteraction=Date.now();
 document.querySelectorAll("[data-tcg]").forEach(x=>{const selected=x===button;x.classList.toggle("active",selected);x.setAttribute("aria-pressed",String(selected));});
 render();
}));
document.querySelectorAll("[data-ending-minutes]").forEach(button=>button.addEventListener("click",()=>{
 state.endingWindow=Number(button.dataset.endingMinutes);
 document.querySelectorAll("[data-ending-minutes]").forEach(x=>{const selected=x===button;x.classList.toggle("active",selected);x.setAttribute("aria-pressed",String(selected));});
 render();
}));
$("#endingRefresh").addEventListener("click",()=>loadEndingSoon(true));
$("#listingGrid").addEventListener("mouseenter",()=>state.discoverHover=true);
$("#listingGrid").addEventListener("mouseleave",()=>state.discoverHover=false);
$("#listingGrid").addEventListener("touchstart",()=>{state.discoverLastInteraction=Date.now();},{passive:true});

let manualSearchSerial=0;
async function search(){
 const q=$("#searchInput").value.trim();
 if(!q){$("#status").textContent="Enter a Pokémon, card name, set or product to search eBay.";return;}
 const serial=++manualSearchSerial,queryChanged=state.query.toLowerCase()!==q.toLowerCase();
 state.mode="search";state.tab="discover";
 document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab==="discover"));
 if(queryChanged){state.category="ALL";document.querySelectorAll("[data-category]").forEach(x=>x.classList.toggle("active",x.dataset.category==="ALL"));}
 state.query=q;$("#searchBtn").disabled=true;$("#searchBtn").classList.add("searching");
 $("#searchBtn").setAttribute("aria-label","Searching listings");
 $("#status").classList.remove("error");
 $("#status").textContent="Searching eBay and checking related product names…";
 const p=new URLSearchParams({q,marketplace:$("#marketplace").value,type:$("#listingType").value,sort:$("#sortBy").value,limit:"36",smart:"1"});
 if($("#shipFrom").value!=="ANY")p.set("shipFrom",$("#shipFrom").value);
 if($("#shipsTo").value!=="ANY")p.set("shipsTo",$("#shipsTo").value);
 if($("#minPrice").value)p.set("minPrice",$("#minPrice").value);
 if($("#maxPrice").value)p.set("maxPrice",$("#maxPrice").value);
 try{
  const response=await fetch("/api/search?"+p);
  const data=await response.json();
  if(serial!==manualSearchSerial||state.mode!=="search")return;
  if(!response.ok)throw new Error(data.error||"Search failed");
  state.items=data.items||[];
  const meta=data.searchMeta||{};
  if(!state.items.length){
   $("#status").textContent="No live eBay matches for “"+q+"” after checking product variations. Try another marketplace, adjust your filters, or simplify the product name.";
  }else if(meta.expanded){
   $("#status").textContent="Smart search found "+state.items.length+" relevant listings for “"+q+"” using related product names"+(meta.corrected?" · eBay corrected to “"+meta.corrected+"”":"")+" · Updated "+new Date(data.fetchedAt).toLocaleTimeString();
  }else{
   $("#status").textContent="Found "+state.items.length+" live eBay listings for “"+q+"”"+(meta.corrected?" · eBay corrected to “"+meta.corrected+"”":"")+" · Updated "+new Date(data.fetchedAt).toLocaleTimeString();
  }
  render();
 }catch(error){
  if(serial!==manualSearchSerial||state.mode!=="search")return;
  state.items=[];
  $("#status").textContent=(error.message||"Search unavailable")+". Please try again.";
  $("#status").classList.add("error");
  render();
 }finally{
  if(serial===manualSearchSerial){$("#searchBtn").disabled=false;$("#searchBtn").classList.remove("searching");$("#searchBtn").setAttribute("aria-label","Search listings");}
 }
}
document.addEventListener("click",event=>{
 const categoryBtn=event.target.closest("[data-category]");if(categoryBtn){state.category=categoryBtn.dataset.category;state.discoverPage=0;document.querySelectorAll("[data-category]").forEach(x=>x.classList.toggle("active",x===categoryBtn));render();return;}const viewBtn=event.target.closest("[data-view]");if(viewBtn){state.view=viewBtn.dataset.view;document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("active",x===viewBtn));$(".custom-grid-list").dataset.active=state.view;render();return;}const tab=event.target.closest("[data-tab]");if(tab){
  manualSearchSerial++;$("#searchBtn").disabled=false;$("#searchBtn").classList.remove("searching");
  state.tab=tab.dataset.tab;
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===tab));
  if(state.tab==="discover"){
   state.mode="feed";state.query="";$("#searchInput").value="";state.items=state.discoverItems;state.discoverPage=0;
   render();void loadDiscovery();
  }else if(state.tab==="ending"){
   state.mode="ending";state.query="";state.items=state.endingItems;
   render();void loadEndingSoon();
  }else{
   $("#status").textContent="Sold-history access is not enabled until an approved eBay data source is connected.";render();
  }
  return;
 }

 const saved=event.target.closest("[data-saved-index]");if(saved){const s=state.savedSearches[Number(saved.dataset.savedIndex)];if(s){$("#searchInput").value=s.query;$("#marketplace").value=s.marketplace;$("#listingType").value=s.type;$("#sortBy").value=s.sort;$("#shipFrom").value=s.shipFrom||"ANY";$("#shipsTo").value=s.shipsTo||"ANY";$("#minPrice").value=s.minPrice;$("#maxPrice").value=s.maxPrice;["setFilter","gradeFilter","conditionFilter"].forEach(id=>$("#"+id).value="");appliedFilters=readFilterValues();updateFilterSummary();state.tab="discover";document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab==="discover"));search();}return;}
 const tag=event.target.closest("[data-query]");if(tag){$("#searchInput").value=tag.dataset.query;search();}
});
// Filter fields are staged in the dropdown and do not trigger requests until Apply is tapped.
$("#clearFilters").addEventListener("click",()=>{writeFilterValues(FILTER_DEFAULTS);resetCategoryOnApply=true;$("#filterError").classList.add("hidden");});
$("#searchBtn").addEventListener("click",search);$("#searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")search();});
// Apply Filters now performs one search instead of a separate fetch per dropdown change.
$("#saveSearchBtn").addEventListener("click",()=>{const q=$("#searchInput").value.trim();if(!q){$("#status").textContent="Search for something first, then save that search.";return;}const item={id:[q,$("#marketplace").value,$("#listingType").value,$("#sortBy").value,$("#shipFrom").value,$("#shipsTo").value,$("#minPrice").value,$("#maxPrice").value].join("|"),query:q,marketplace:$("#marketplace").value,type:$("#listingType").value,sort:$("#sortBy").value,shipFrom:$("#shipFrom").value,shipsTo:$("#shipsTo").value,minPrice:$("#minPrice").value,maxPrice:$("#maxPrice").value};state.savedSearches=state.savedSearches.filter(s=>s.id!==item.id);state.savedSearches.unshift(item);state.savedSearches=state.savedSearches.slice(0,12);save("pokemarket-searches",state.savedSearches);renderSavedSearches();$("#status").textContent="Saved complete search and filters on this device: "+q;});
$("#notifyBtn").addEventListener("click",async()=>{if(!("Notification"in window)){ $("#status").textContent="This browser does not support notifications.";return;}const permission=await Notification.requestPermission();$("#status").textContent=permission==="granted"?"Auction alerts enabled while TCG Bid Buy Watch is open. Alerts only work while the app is open and are based on currently displayed auctions.":"Notifications were not enabled.";});
function checkAlerts(){
 if(!("Notification"in window)||Notification.permission!=="granted")return;
 for(const item of state.items){if(!item||!item.endTime)continue;const ms=new Date(item.endTime).getTime()-Date.now();if(ms>0&&ms<=10*60*1000&&!state.alerted.includes(item.id)){new Notification("Auction ending soon",{body:(item.title||"Your watched listing")+" · "+remaining(item.endTime)});state.alerted.push(item.id);}}
 state.alerted=state.alerted.slice(-300);
}
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
state.items=[];render();setInterval(()=>{document.querySelectorAll("[data-end]").forEach(el=>el.textContent=remaining(el.dataset.end));checkAlerts();},15000);


// Holographic quick controls: separate Stats page and an accessible Info modal.
$("#searchNavBtn").addEventListener("click",()=>{$("#searchInput").scrollIntoView({behavior:"smooth",block:"center"});$("#searchInput").focus({preventScroll:true});});
const infoDialog=$("#infoDialog");
$("#infoNavBtn").addEventListener("click",()=>{if(!infoDialog.open)infoDialog.showModal();});
const dismissInfo=()=>{if(infoDialog.open)infoDialog.close();};
$("#infoClose").addEventListener("click",dismissInfo);
$("#infoGotIt").addEventListener("click",dismissInfo);
infoDialog.addEventListener("click",event=>{if(event.target===infoDialog)dismissInfo();});
// Keep filter selections private until Apply, so using the dropdown doesn't repeatedly fetch from eBay.
const FILTER_DEFAULTS=Object.freeze({shipFrom:"ANY",shipsTo:"ANY",marketplace:"AU",listingType:"ALL",sortBy:"endingSoonest",minPrice:"",maxPrice:"",setFilter:"",gradeFilter:"",conditionFilter:""});
const FILTER_FIELDS=Object.keys(FILTER_DEFAULTS);
function readFilterValues(){return Object.fromEntries(FILTER_FIELDS.map(id=>[id,$("#"+id).value]));}
function writeFilterValues(values){for(const id of FILTER_FIELDS)$("#"+id).value=values[id]??FILTER_DEFAULTS[id];}
let appliedFilters=readFilterValues();
let resetCategoryOnApply=false;
function updateFilterSummary(){
 const active=FILTER_FIELDS.filter(id=>appliedFilters[id]!==FILTER_DEFAULTS[id]);
 const names={shipFrom:"From",shipsTo:"Ships to",marketplace:"Market",listingType:"Type",sortBy:"Sort",minPrice:"Min",maxPrice:"Max",setFilter:"Set",gradeFilter:"Grade",conditionFilter:"Condition"};
 const chosen=active.map(id=>{
  const field=$("#"+id);
  const value=(field.tagName==="SELECT"?field.selectedOptions[0]?.textContent:field.value)||appliedFilters[id];
  return names[id]+": "+String(value).trim();
 });
 $("#filterSummaryText").textContent=active.length?active.length+" active filter"+(active.length===1?"":"s")+" · "+chosen.slice(0,2).join(" · ")+(chosen.length>2?" · +"+(chosen.length-2)+" more":""):"All listings · Worldwide · eBay Australia";
 $("#filterSummary").classList.toggle("has-active",active.length>0);
 $("#filterToggle").setAttribute("aria-label",active.length?"Open search filters, "+active.length+" active":"Open search filters");
}
function setFiltersOpen(open){
 const dialog=$("#filtersContent");
 if(open){
  writeFilterValues(appliedFilters);
  resetCategoryOnApply=false;
  $("#filterError").classList.add("hidden");
 }
 dialog.classList.toggle("hidden",!open);
 $("#filtersBackdrop").classList.toggle("hidden",!open);
 document.body.classList.toggle("filters-open",open);
 $("#filterToggle").setAttribute("aria-expanded",String(open));
 if(open)dialog.focus({preventScroll:true});
 else{writeFilterValues(appliedFilters);$("#filterToggle").focus({preventScroll:true});}
}
function applySearchFilters(){
 const next=readFilterValues();
 if(next.minPrice!==""&&next.maxPrice!==""&&Number(next.minPrice)>Number(next.maxPrice)){
  $("#filterError").textContent="Minimum price cannot be higher than maximum price.";
  $("#filterError").classList.remove("hidden");
  $("#minPrice").focus();
  return;
 }
 const previous=appliedFilters,resetCategory=resetCategoryOnApply;
 appliedFilters=next;
 updateFilterSummary();
 setFiltersOpen(false);
 resetCategoryOnApply=false;
 if(resetCategory){
  state.category="ALL";
  document.querySelectorAll("[data-category]").forEach(x=>x.classList.toggle("active",x.dataset.category==="ALL"));
 }
 if(state.tab==="ending")void loadEndingSoon(true);
 else if(state.mode==="feed")void loadDiscovery(true);
 else if(state.query)void search();
 else render();
 if(previous.shipFrom!==next.shipFrom||previous.shipsTo!==next.shipsTo)void loadSpotlight();
}
$("#filterToggle").addEventListener("click",()=>setFiltersOpen($("#filtersContent").classList.contains("hidden")));
$("#filterSummary").addEventListener("click",()=>setFiltersOpen(true));
$("#filtersBackdrop").addEventListener("click",()=>setFiltersOpen(false));
$("#filterClose").addEventListener("click",()=>setFiltersOpen(false));
$("#cancelFilters").addEventListener("click",()=>setFiltersOpen(false));
$("#applyFilters").addEventListener("click",applySearchFilters);
$("#filtersContent").addEventListener("keydown",event=>{
 if(event.key==="Enter"&&event.target.tagName==="INPUT"){event.preventDefault();applySearchFilters();}
 if(event.key!=="Tab")return;
 const focusable=[...$("#filtersContent").querySelectorAll("button:not([disabled]),select:not([disabled]),input:not([disabled])")].filter(el=>el.getClientRects().length);
 if(!focusable.length)return;
 const first=focusable[0],last=focusable[focusable.length-1];
 if(event.shiftKey&&(document.activeElement===first||document.activeElement===$("#filtersContent"))){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
document.addEventListener("keydown",event=>{if(event.key==="Escape"){if(!$("#filtersContent").classList.contains("hidden"))setFiltersOpen(false);if(infoDialog.open)dismissInfo();}});
updateFilterSummary();

$("#accountBtn").addEventListener("click",openAccount);$("#accountClose").addEventListener("click",closeAccount);
$("#authToggle").addEventListener("click",()=>{authMode=authMode==="signin"?"signup":"signin";$("#authSubmit").textContent=authMode==="signin"?"Sign in":"Create account";$("#authToggle").textContent=authMode==="signin"?"Create account":"Back to sign in";$("#authPassword").setAttribute("autocomplete",authMode==="signin"?"current-password":"new-password");setAccountMessage(authMode==="signup"?"Create an account with your email and a password. Check your email if confirmation is required.":"Sign in to sync your collector data.");});
$("#authForm").addEventListener("submit",async event=>{event.preventDefault();const email=$("#authEmail").value.trim(),password=$("#authPassword").value;$("#authSubmit").disabled=true;try{const result=authMode==="signup"?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(authMode==="signup"&&!result.data.session){setAccountMessage("Account created. Check your email for the confirmation link, then come back and sign in.");}else if(result.data.session){await handleAuthSession(result.data.session);}}catch(error){setAccountMessage(error.message||"Authentication failed.",true);}finally{$("#authSubmit").disabled=false;}});
$("#signOutBtn").addEventListener("click",async()=>{const result=await supabase.auth.signOut();if(result.error){setAccountMessage(result.error.message,true);return;}await handleAuthSession(null);closeAccount();});
supabase.auth.onAuthStateChange((_event,session)=>{Promise.resolve().then(()=>handleAuthSession(session));});
 // Initial discovery requires no search. Only refresh active sections to limit eBay API usage.
void loadDiscovery();
setInterval(()=>{
 if(document.hidden)return;
 if(state.tab==="discover"&&state.mode==="feed"){
  if(!state.discoverHover&&Date.now()-state.discoverLastInteraction>20000)advanceDiscovery(1);
  if(Date.now()-state.discoverFetchedAt>5*60*1000)void loadDiscovery(true);
 }else if(state.tab==="ending"&&Date.now()-state.endingFetchedAt>2*60*1000)void loadEndingSoon(true);
},20000);
setInterval(()=>{if(state.tab==="ending"&&!document.hidden)render();},60000);

