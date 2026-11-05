import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const supabase=createClient("https://prxvxomflqzviqiktcgr.supabase.co","sb_publishable_WrQ8yUaSj-z6nsx_-r9FGw_e1CkhXtc");
const $=s=>document.querySelector(s);
// Do not persist eBay seller identifiers or seller location in saved listing snapshots.
function safeSnapshot(item){if(!item||typeof item!=="object")return null;const {seller,sellerFeedback,location,...safe}=item;return safe;}
let cloudUser=null,cloudReady=false,authMode="signin",syncBusy=false;
function setAccountMessage(message,error=false){$("#accountMessage").textContent=message;$("#accountMessage").classList.toggle("error",error);}
function openAccount(){$("#accountPanel").classList.remove("hidden");}
function closeAccount(){$("#accountPanel").classList.add("hidden");}
async function syncCollection(key,value){
 if(!cloudUser||!cloudReady||syncBusy)return;syncBusy=true;
 try{
  if(key==="pokemarket-watchlist"){
   const rows=value.filter(x=>x&&typeof x==="object"&&x.id).map(x=>({user_id:cloudUser.id,item_id:String(x.id),item_url:x.url||null,item_title:x.title||"",item_snapshot:safeSnapshot(x)}));
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
 const [w,s]=await Promise.all([supabase.from("user_watchlist").select("item_id,item_snapshot,created_at").eq("user_id",user.id).order("created_at",{ascending:false}),supabase.from("user_saved_searches").select("search_key,query,marketplace,listing_type,sort_by,min_price,max_price,created_at").eq("user_id",user.id).order("created_at",{ascending:false})]);
 if(w.error)throw w.error;if(s.error)throw s.error;
 const localWatch=state.watchlist.filter(x=>x&&typeof x==="object"),localSearch=state.savedSearches;
 if(!w.data.length&&localWatch.length){const rows=localWatch.map(x=>({user_id:user.id,item_id:String(x.id),item_url:x.url||null,item_title:x.title||"",item_snapshot:x}));const m=await supabase.from("user_watchlist").upsert(rows,{onConflict:"user_id,item_id"});if(m.error)throw m.error;}
 if(!s.data.length&&localSearch.length){const rows=localSearch.map(x=>({user_id:user.id,search_key:String(x.id),query:x.query,marketplace:x.marketplace,listing_type:x.type,sort_by:x.sort,min_price:x.minPrice===""?null:Number(x.minPrice),max_price:x.maxPrice===""?null:Number(x.maxPrice)}));const m=await supabase.from("user_saved_searches").upsert(rows,{onConflict:"user_id,search_key"});if(m.error)throw m.error;}
 const [wr,sr]=await Promise.all([supabase.from("user_watchlist").select("item_snapshot").eq("user_id",user.id).order("created_at",{ascending:false}),supabase.from("user_saved_searches").select("search_key,query,marketplace,listing_type,sort_by,min_price,max_price").eq("user_id",user.id).order("created_at",{ascending:false})]);
 if(wr.error)throw wr.error;if(sr.error)throw sr.error;
 state.watchlist=wr.data.map(x=>safeSnapshot(x.item_snapshot)).filter(Boolean);state.savedSearches=sr.data.map(x=>({id:x.search_key,query:x.query,marketplace:x.marketplace,type:x.listing_type,sort:x.sort_by,minPrice:x.min_price==null?"":String(x.min_price),maxPrice:x.max_price==null?"":String(x.max_price)}));
 localStorage.setItem("pokemarket-watchlist",JSON.stringify(state.watchlist));localStorage.setItem("pokemarket-searches",JSON.stringify(state.savedSearches));
 cloudReady=true;render();$("#accountTitle").textContent="Collector account";$("#accountEmail").textContent=user.email||"Signed in";$("#authForm").classList.add("hidden");$("#signedInActions").classList.remove("hidden");$("#accountBtn").textContent="My account";setAccountMessage("Your watchlist and saved searches are syncing across devices.");
}
async function handleAuthSession(session){
 if(session?.user){try{await loadCloudData(session.user);}catch(error){cloudUser=session.user;cloudReady=false;setAccountMessage("Signed in, but cloud data could not load: "+error.message,true);}}
 else{cloudUser=null;cloudReady=false;state.watchlist=[];state.savedSearches=[];localStorage.removeItem("pokemarket-watchlist");localStorage.removeItem("pokemarket-searches");$("#authForm").classList.remove("hidden");$("#signedInActions").classList.add("hidden");$("#accountTitle").textContent="Your account";$("#accountBtn").textContent="Sign in";setAccountMessage("Sign in to sync your watchlist and saved searches across devices.");render();}
}
const state={tab:"discover",items:[],query:"",watchlist:load("pokemarket-watchlist",[]),savedSearches:load("pokemarket-searches",[]).map(x=>typeof x==="string"?{id:x,query:x,marketplace:"AU",type:"ALL",sort:"endingSoonest",minPrice:"",maxPrice:""}:x),alerted:load("pokemarket-alerted",[])};
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,value){localStorage.setItem(key,JSON.stringify(value));if(key==="pokemarket-watchlist"||key==="pokemarket-searches")void syncCollection(key,value);}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(v,c){return v==null?"Price unavailable":new Intl.NumberFormat(undefined,{style:"currency",currency:c||"AUD",maximumFractionDigits:2}).format(v);}
function remaining(end){if(!end)return"Time not supplied";const ms=new Date(end).getTime()-Date.now();if(!Number.isFinite(ms))return"Time not supplied";if(ms<=0)return"Ended";const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);return d?d+"d "+h+"h left":h?h+"h "+m+"m left":m+"m "+s+"s left";}
function isSaved(item){return state.watchlist.some(x=>x&&typeof x==="object"&&x.id===item.id);}
function visibleItems(){if(state.tab==="watchlist")return state.watchlist.filter(x=>x&&typeof x==="object");if(state.tab==="ending")return [...state.items].sort((a,b)=>new Date(a.endTime||8640000000000000)-new Date(b.endTime||8640000000000000));return state.items;}
function renderSavedSearches(){
 const host=$("#savedSearchTags");if(!host)return;
 host.innerHTML=state.savedSearches.map((s,i)=>'<button class="tag" data-saved-index="'+i+'">'+esc(s.query)+' · '+esc(s.marketplace)+' · '+esc(s.type)+' ↗</button>').join("");
}
function render(){
 $("#watchCount").textContent=state.watchlist.length;renderSavedSearches();
 const sold=state.tab==="sold";$("#soldNotice").classList.toggle("hidden",!sold);$("#listingGrid").classList.toggle("hidden",sold);
 const labels={discover:["LIVE MARKETPLACE","Featured listings"],ending:["AUCTION RADAR","Ending soon"],watchlist:["YOUR COLLECTION","Watchlist"],sold:["MARKET HISTORY","Recently sold"]};
 $("#sectionEyebrow").textContent=labels[state.tab][0];$("#sectionTitle").textContent=labels[state.tab][1];
 if(sold){$("#resultCount").textContent="Verified data pending";return;}
 const items=visibleItems();$("#resultCount").textContent=items.length?items.length+" listings":"No listings loaded";
 if(!items.length){$("#listingGrid").innerHTML='<div class="empty"><strong>'+(state.tab==="watchlist"?"Your watchlist is empty":"Nothing to show yet")+'</strong>'+(state.tab==="watchlist"?"Save listings with the ☆ button.":"Search for a Pokémon, card, set or sealed product to get started.")+'</div>';return;}
 $("#listingGrid").innerHTML=items.map(item=>{
  const saved=isSaved(item),auction=(item.buyingOptions||[]).includes("AUCTION");
  const image=item.image?'<img src="'+esc(item.image)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="image-fallback">✦</span>';
  const url=/^https:\/\/www\.ebay\.(com\.au|com)\//i.test(item.url||"")?item.url:"";
  return '<article class="listing-card"><div class="listing-image">'+image+'<span class="condition-badge">'+esc(item.condition)+'</span><button class="watch-button '+(saved?"saved":"")+'" data-watch="'+esc(item.id)+'" aria-label="'+(saved?"Remove from":"Add to")+' watchlist">'+(saved?"★":"☆")+'</button></div><div class="listing-body"><h3 class="listing-title">'+esc(item.title)+'</h3><div class="price-row"><span class="price">'+money(item.price,item.currency)+'</span><span class="listing-type">'+(auction?"AUCTION":"BUY IT NOW")+'</span></div><div class="meta-row"><span>'+(item.bids==null?"Bids n/a":item.bids+" bids")+'</span><span class="countdown" data-end="'+esc(item.endTime||"")+'">'+esc(remaining(item.endTime))+'</span></div><div class="meta-row"><span>'+esc(item.location)+'</span><span>'+esc(item.marketplace)+'</span></div><div class="seller">Seller: '+esc(item.seller)+(item.sellerFeedback?" · "+esc(item.sellerFeedback)+"% feedback":"")+'</div><div class="card-actions">'+(url?'<a class="ebay-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">View this item on eBay ↗</a>':'<span class="ebay-link">Original eBay link unavailable</span>')+'</div></div></article>';
 }).join("");
}
async function search(){
 const q=$("#searchInput").value.trim();if(!q){$("#status").textContent="Enter a Pokémon, card name, set or product to search eBay.";return;}
 state.query=q;$("#searchBtn").disabled=true;$("#searchBtn").textContent="Searching…";$("#status").classList.remove("error");$("#status").textContent="Connecting to eBay Browse API…";
 const p=new URLSearchParams({q,marketplace:$("#marketplace").value,type:$("#listingType").value,sort:$("#sortBy").value,limit:"36"});
 if($("#minPrice").value)p.set("minPrice",$("#minPrice").value);if($("#maxPrice").value)p.set("maxPrice",$("#maxPrice").value);
 try{const response=await fetch("/api/search?"+p);const data=await response.json();if(!response.ok)throw new Error(data.error||"Search failed");state.items=data.items||[];save("pokemarket-last-items",state.items);$("#status").textContent=data.source?"Live results supplied by eBay Browse API · Updated "+new Date(data.fetchedAt).toLocaleTimeString():"No live results returned. Check server-side eBay credentials.";render();}
 catch(error){state.items=[];$("#status").textContent=error.message+" Add eBay production API credentials to the hosting environment to enable live listings." ;$("#status").classList.add("error");render();}
 finally{$("#searchBtn").disabled=false;$("#searchBtn").innerHTML='Search <span>↗</span>';}
}
document.addEventListener("click",event=>{
 const tab=event.target.closest("[data-tab]");if(tab){state.tab=tab.dataset.tab;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===tab));if(state.tab==="sold")$("#status").textContent="Sold-history access is not enabled until an approved eBay data source is connected.";render();return;}
 const watch=event.target.closest("[data-watch]");if(watch){const id=watch.dataset.watch;const existing=state.watchlist.find(x=>x&&typeof x==="object"&&x.id===id);if(existing)state.watchlist=state.watchlist.filter(x=>!x||typeof x!=="object"||x.id!==id);else{const item=[...state.items,...state.watchlist].find(x=>x&&x.id===id);if(item)state.watchlist.push(safeSnapshot(item));}save("pokemarket-watchlist",state.watchlist);render();return;}
 const saved=event.target.closest("[data-saved-index]");if(saved){const s=state.savedSearches[Number(saved.dataset.savedIndex)];if(s){$("#searchInput").value=s.query;$("#marketplace").value=s.marketplace;$("#listingType").value=s.type;$("#sortBy").value=s.sort;$("#minPrice").value=s.minPrice;$("#maxPrice").value=s.maxPrice;state.tab="discover";document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab==="discover"));search();}return;}
 const tag=event.target.closest("[data-query]");if(tag){$("#searchInput").value=tag.dataset.query;search();}
});
$("#searchBtn").addEventListener("click",search);$("#searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")search();});
["marketplace","listingType","sortBy","minPrice","maxPrice"].forEach(id=>$("#"+id).addEventListener("change",()=>{if(state.query)search();}));
$("#saveSearchBtn").addEventListener("click",()=>{const q=$("#searchInput").value.trim();if(!q){$("#status").textContent="Search for something first, then save that search.";return;}const item={id:[q,$("#marketplace").value,$("#listingType").value,$("#sortBy").value,$("#minPrice").value,$("#maxPrice").value].join("|"),query:q,marketplace:$("#marketplace").value,type:$("#listingType").value,sort:$("#sortBy").value,minPrice:$("#minPrice").value,maxPrice:$("#maxPrice").value};state.savedSearches=state.savedSearches.filter(s=>s.id!==item.id);state.savedSearches.unshift(item);state.savedSearches=state.savedSearches.slice(0,12);save("pokemarket-searches",state.savedSearches);renderSavedSearches();$("#status").textContent="Saved complete search and filters on this device: "+q;});
$("#notifyBtn").addEventListener("click",async()=>{if(!("Notification"in window)){ $("#status").textContent="This browser does not support notifications.";return;}const permission=await Notification.requestPermission();$("#status").textContent=permission==="granted"?"Auction alerts enabled while POKÉMARKET is open. Watchlisted auctions ending within 10 minutes will trigger a reminder.":"Notifications were not enabled.";});
function checkAlerts(){
 if(!("Notification"in window)||Notification.permission!=="granted")return;
 for(const item of state.watchlist){if(!item||!item.endTime)continue;const ms=new Date(item.endTime).getTime()-Date.now();if(ms>0&&ms<=10*60*1000&&!state.alerted.includes(item.id)){new Notification("Auction ending soon",{body:(item.title||"Your watched listing")+" · "+remaining(item.endTime)});state.alerted.push(item.id);}}
 state.alerted=state.alerted.slice(-300);save("pokemarket-alerted",state.alerted);
}
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
state.items=load("pokemarket-last-items",[]);render();setInterval(()=>{document.querySelectorAll("[data-end]").forEach(el=>el.textContent=remaining(el.dataset.end));checkAlerts();},15000);

$("#accountBtn").addEventListener("click",openAccount);$("#accountClose").addEventListener("click",closeAccount);
$("#authToggle").addEventListener("click",()=>{authMode=authMode==="signin"?"signup":"signin";$("#authSubmit").textContent=authMode==="signin"?"Sign in":"Create account";$("#authToggle").textContent=authMode==="signin"?"Create account":"Back to sign in";$("#authPassword").setAttribute("autocomplete",authMode==="signin"?"current-password":"new-password");setAccountMessage(authMode==="signup"?"Create an account with your email and a password. Check your email if confirmation is required.":"Sign in to sync your collector data.");});
$("#authForm").addEventListener("submit",async event=>{event.preventDefault();const email=$("#authEmail").value.trim(),password=$("#authPassword").value;$("#authSubmit").disabled=true;try{const result=authMode==="signup"?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(authMode==="signup"&&!result.data.session){setAccountMessage("Account created. Check your email for the confirmation link, then come back and sign in.");}else if(result.data.session){await handleAuthSession(result.data.session);}}catch(error){setAccountMessage(error.message||"Authentication failed.",true);}finally{$("#authSubmit").disabled=false;}});
$("#signOutBtn").addEventListener("click",async()=>{const result=await supabase.auth.signOut();if(result.error){setAccountMessage(result.error.message,true);return;}await handleAuthSession(null);closeAccount();});
supabase.auth.onAuthStateChange((_event,session)=>{Promise.resolve().then(()=>handleAuthSession(session));});
