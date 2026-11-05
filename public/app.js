const $=s=>document.querySelector(s);
const state={tab:"discover",items:[],query:"",watchlist:load("pokemarket-watchlist",[])};
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,value){localStorage.setItem(key,JSON.stringify(value));}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(v,c){return v==null?"Price unavailable":new Intl.NumberFormat(undefined,{style:"currency",currency:c||"AUD",maximumFractionDigits:2}).format(v);}
function remaining(end){if(!end)return"Time not supplied";const ms=new Date(end).getTime()-Date.now();if(!Number.isFinite(ms))return"Time not supplied";if(ms<=0)return"Ended";const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);return d?d+"d "+h+"h left":h?h+"h "+m+"m left":m+"m "+s+"s left";}
function visibleItems(){if(state.tab==="watchlist")return state.items.filter(x=>state.watchlist.includes(x.id));if(state.tab==="ending")return [...state.items].sort((a,b)=>new Date(a.endTime||8640000000000000)-new Date(b.endTime||8640000000000000));return state.items;}
function render(){
 $("#watchCount").textContent=state.watchlist.length;
 const sold=state.tab==="sold";$("#soldNotice").classList.toggle("hidden",!sold);$("#listingGrid").classList.toggle("hidden",sold);
 const labels={discover:["LIVE MARKETPLACE","Featured listings"],ending:["AUCTION RADAR","Ending soon"],watchlist:["YOUR COLLECTION","Watchlist"],sold:["MARKET HISTORY","Recently sold"]};
 $("#sectionEyebrow").textContent=labels[state.tab][0];$("#sectionTitle").textContent=labels[state.tab][1];
 if(sold){$("#resultCount").textContent="Verified data pending";return;}
 const items=visibleItems();$("#resultCount").textContent=state.items.length?state.items.length+" listings found":"No listings loaded";
 if(!items.length){$("#listingGrid").innerHTML='<div class="empty"><strong>'+(state.tab==="watchlist"?"Your watchlist is empty":"Nothing to show yet")+'</strong>'+(state.tab==="watchlist"?"Tap the ☆ on a listing to save it here.":"Search for a Pokémon, card, set or sealed product to get started.")+'</div>';return;}
 $("#listingGrid").innerHTML=items.map(item=>{
  const saved=state.watchlist.includes(item.id),auction=(item.buyingOptions||[]).includes("AUCTION");
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
 try{const response=await fetch("/api/search?"+p);const data=await response.json();if(!response.ok)throw new Error(data.error||"Search failed");state.items=data.items||[];$("#status").textContent=data.source?"Live results supplied by eBay Browse API · Updated "+new Date(data.fetchedAt).toLocaleTimeString():"No live results returned. Check server-side eBay credentials.";render();}
 catch(error){state.items=[];$("#status").textContent=error.message+" Add eBay production API credentials to the hosting environment to enable live listings." ;$("#status").classList.add("error");render();}
 finally{$("#searchBtn").disabled=false;$("#searchBtn").innerHTML='Search <span>↗</span>';}
}
document.addEventListener("click",event=>{
 const tab=event.target.closest("[data-tab]");if(tab){state.tab=tab.dataset.tab;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===tab));if(state.tab==="sold")$("#status").textContent="Sold-history access is not enabled until an approved eBay data source is connected.";render();return;}
 const watch=event.target.closest("[data-watch]");if(watch){const id=watch.dataset.watch;state.watchlist=state.watchlist.includes(id)?state.watchlist.filter(x=>x!==id):[...state.watchlist,id];save("pokemarket-watchlist",state.watchlist);render();return;}
 const tag=event.target.closest("[data-query]");if(tag){$("#searchInput").value=tag.dataset.query;search();}
});
$("#searchBtn").addEventListener("click",search);$("#searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")search();});
["marketplace","listingType","sortBy"].forEach(id=>$("#"+id).addEventListener("change",()=>{if(state.query)search();}));
$("#notifyBtn").addEventListener("click",async()=>{if(!("Notification"in window)){ $("#status").textContent="This browser does not support notifications.";return;}const permission=await Notification.requestPermission();$("#status").textContent=permission==="granted"?"Notifications enabled. Auction alert scheduling is a next-step feature.":"Notifications were not enabled.";});
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
render();
setInterval(()=>document.querySelectorAll("[data-end]").forEach(el=>el.textContent=remaining(el.dataset.end)),1000);
