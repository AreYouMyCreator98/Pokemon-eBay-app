// TCG Bid Buy Watch — live, read-only eBay market statistics.
// Figures represent current sampled listings. Never label them as sold prices or market returns.
const $=selector=>document.querySelector(selector);
const FEEDS=[
 {id:"POKEMON",label:"Pokémon",q:"pokemon trading card"},
 {id:"ONE_PIECE",label:"One Piece",q:"one piece card game"},
 {id:"YUGIOH",label:"Yu-Gi-Oh!",q:"yugioh trading card"},
 {id:"MTG",label:"Magic: The Gathering",q:"magic the gathering mtg card"},
 {id:"ACCESSORIES",label:"TCG Binders & Supplies",q:"trading card binder"}
];
const SEALED_PATTERN=/\b(?:sealed|booster\s*(?:box|pack|bundle|display)|elite\s*trainer\s*box|etb|blister|collection\s*(?:box|set)|display\s*box|collector\s*booster|starter\s*deck|structure\s*deck|theme\s*deck|sealed\s*deck|premium\s*collection|sealed\s*case|collector\s*box|tin|holiday\s*calendar|pre.?release\s*kit)\b/i;
const GRADED_PATTERN=/\b(?:PSA|BGS|CGC|SGC|ACE)\s*(?:GEM\s*MINT\s*)?(?:10|9\.5|9|8\.5|8|7|6)\b|\b(?:graded|slabbed)\b/i;
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isAccessory=item=>item.productType==="ACCESSORIES";
const isSealed=item=>item.productType?item.productType==="SEALED":SEALED_PATTERN.test(String(item.title||""));
const isGraded=item=>item.productType?item.productType==="GRADED":(!isSealed(item)&&GRADED_PATTERN.test(String(item.title||"")));
const isFixed=item=>(item.buyingOptions||[]).includes("FIXED_PRICE")&&!(item.buyingOptions||[]).includes("AUCTION");
const validPrice=item=>item?.price!=null&&Number.isFinite(Number(item.price))&&Number(item.price)>0;
const money=(value,currency)=>value==null?"—":new Intl.NumberFormat("en-AU",{style:"currency",currency:currency==="USD"?"USD":"AUD",maximumFractionDigits:2}).format(value);
function ebayUrl(raw){try{const u=new URL(String(raw||""));return u.protocol==="https:"&&["www.ebay.com.au","www.ebay.com","ebay.com.au","ebay.com"].includes(u.hostname)?u.href:"";}catch{return "";}}
function percent(n,denominator){return denominator?Math.round(100*n/denominator):0;}
function median(values){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),half=Math.floor(sorted.length/2);return sorted.length%2?sorted[half]:(sorted[half-1]+sorted[half])/2;}
function displayStatus(el,message,error=false){el.textContent=message;el.classList.toggle("stats-error",error);}
function paramsFor(query,marketplace,limit=40,smart=true){return new URLSearchParams({q:query,marketplace,type:"FIXED",sort:"newlyListed",limit:String(limit),smart:smart?"1":"0"}); }
async function fetchListings(query,marketplace,limit=40,smart=true){
 const response=await fetch("/api/search?"+paramsFor(query,marketplace,limit,smart));
 let data;try{data=await response.json();}catch{throw Error("Could not read the eBay search response.");}
 if(!response.ok)throw Error(data.error||"The eBay listing feed is unavailable.");
 return (data.items||[]).filter(item=>item&&isFixed(item)&&ebayUrl(item.url));
}
const SAMPLE_LABELS=[
 ["POKEMON","Pokémon"],
 ["ONE_PIECE","One Piece"],
 ["YUGIOH","Yu-Gi-Oh!"],
 ["MTG","Magic: The Gathering"],
 ["ACCESSORIES","TCG accessories"]
];
let sampleRequestId=0,priceRequestId=0;
async function loadMarketMix(){
 const requestId=++sampleRequestId,button=$("#refreshMix"),marketplace=$("#priceMarketplace").value;
 button.disabled=true;
 displayStatus($("#mixStatus"),"Sampling Buy It Now listings across four TCGs plus card-game accessories…");
 try{
  const responses=await Promise.allSettled(FEEDS.map(async feed=>({feed,items:await fetchListings(feed.q,marketplace,30,false)})));
  if(requestId!==sampleRequestId)return;
  const failures=responses.filter(r=>r.status==="rejected").length;
  if(failures===FEEDS.length)throw Error("No live eBay feeds are available. Check your connection and refresh.");
  const unique=new Set(),items=[],perTCG=new Map(SAMPLE_LABELS.map(([id])=>[id,0]));
  for(const result of responses){
   if(result.status!=="fulfilled")continue;
   for(const item of result.value.items){
    const key=String(item.id||item.url);
    if(unique.has(key))continue;
    unique.add(key);
    items.push({...item,tcg:result.value.feed.id});
    perTCG.set(result.value.feed.id,perTCG.get(result.value.feed.id)+1);
   }
  }
  const total=items.length,sealed=items.filter(isSealed).length,accessories=items.filter(isAccessory).length,cards=total-sealed-accessories,graded=items.filter(isGraded).length;
  $("#sampleSize").textContent=String(total);
  $("#cardShare").textContent=total?percent(cards,total)+"%":"—";
  $("#sealedShare").textContent=total?percent(sealed,total)+"%":"—";
  $("#accessoryShare").textContent=total?percent(accessories,total)+"%":"—";
  $("#cardCount").textContent=cards+" card listings sampled ("+graded+" graded)";
  $("#sealedCount").textContent=sealed+" sealed listings sampled";
  $("#accessoryCount").textContent=accessories+" binders, accessories and TCG collectibles";
  $("#mixCardsBar").style.width=percent(cards,total)+"%";
  $("#mixSealedBar").style.width=percent(sealed,total)+"%";
  $("#mixAccessoriesBar").style.width=percent(accessories,total)+"%";
  $("#mixBar").setAttribute("aria-label",total?percent(cards,total)+" percent cards, "+percent(sealed,total)+" percent sealed products and "+percent(accessories,total)+" percent accessories in "+total+" sampled listings":"No sampled listings");
  $("#mixTimestamp").textContent="Updated "+new Date().toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"});
  $("#tcgMixGrid").innerHTML=SAMPLE_LABELS.map(([id,label])=>{
   const count=perTCG.get(id)||0;
   const share=percent(count,total);
   return '<div class="stats-tcg-tile"><span>'+esc(label)+'</span><strong>'+count+' <small>listings</small></strong><div class="stats-tcg-track"><span style="width:'+share+'%"></span></div><p>'+share+'% of sampled listings</p></div>';
  }).join("");
  displayStatus($("#mixStatus"),total?total+" distinct live Buy It Now listings sampled on eBay "+(marketplace==="US"?"US":"Australia")+(failures?"; "+failures+" feed"+(failures===1?"":"s")+" unavailable":"")+".":"No relevant listings returned; percentages are unavailable.");
 }catch(error){
  if(requestId!==sampleRequestId)return;
  displayStatus($("#mixStatus"),error.message||"Could not load the live sample.",true);
 }finally{if(requestId===sampleRequestId)button.disabled=false;}
}
function listingCard(item,currency){
 const url=ebayUrl(item.url),title=esc(item.title||"Untitled listing");
 const image=/^https:\/\//i.test(item.image||"")?'<img src="'+esc(item.image)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="stats-listing-fallback" aria-hidden="true">✦</span>';
 const grade=isAccessory(item)?"TCG accessory / collectible":isGraded(item)?"Graded card":isSealed(item)?"Sealed product":"Trading card";
 return '<article class="stats-listing">'+
  '<div class="stats-listing-image">'+image+'</div>'+
  '<div class="stats-listing-details"><span class="stats-listing-type">'+esc(grade)+'</span>'+
  '<h4 title="'+title+'">'+title+'</h4>'+
  '<p>'+esc(item.condition||"Condition not provided")+'</p>'+
  '<div class="stats-listing-bottom"><strong>'+(validPrice(item)?money(Number(item.price),item.currency||currency):"Price unavailable")+'</strong>'+
  '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" aria-label="View '+title+' on eBay">View on eBay ↗</a></div></div></article>';
}
async function searchPrices(event){
 if(event)event.preventDefault();
 const query=$("#priceQuery").value.trim(),kind=$("#priceKind").value,marketplace=$("#priceMarketplace").value;
 const currency=marketplace==="US"?"USD":"AUD";
 if(!query){displayStatus($("#priceStatus"),"Type the name of a card or sealed product.",true);$("#priceQuery").focus();return;}
 const requestId=++priceRequestId;
 const button=$("#priceSearchBtn");
 button.disabled=true;
 button.textContent="Checking prices…";
 displayStatus($("#priceStatus"),"Checking current eBay listing prices for “"+query+"”…");
 $("#priceResults").innerHTML='<div class="stats-placeholder">Searching live eBay listings…</div>';
 for(const id of ["priceMin","priceMedian","priceAverage","priceMax"])$("#"+id).textContent="—";
 $("#priceResultCount").textContent="Loading";
 try{
  let items=await fetchListings(query,marketplace,50);
  if(requestId!==priceRequestId)return;
  const before=items.length;
  if(kind==="SEALED")items=items.filter(isSealed);
  else if(kind==="CARDS")items=items.filter(item=>!isSealed(item)&&!isAccessory(item));
  else if(kind==="ACCESSORIES")items=items.filter(isAccessory);
  // Never average USD with AUD or other currencies. Individual listings retain their own price labels.
  const matched=items.filter(item=>validPrice(item)&&item.currency===currency);
  const values=matched.map(item=>Number(item.price)),sum=values.reduce((a,b)=>a+b,0);
  $("#priceMin").textContent=values.length?money(Math.min(...values),currency):"—";
  $("#priceMedian").textContent=money(median(values),currency);
  $("#priceAverage").textContent=values.length?money(sum/values.length,currency):"—";
  $("#priceMax").textContent=values.length?money(Math.max(...values),currency):"—";
  $("#priceResultCount").textContent=items.length+" matches · "+matched.length+" priced in "+currency;
  $("#priceResults").innerHTML=items.length?items.slice(0,18).map(item=>listingCard(item,currency)).join(""):'<div class="stats-placeholder">No matching '+(kind==="SEALED"?"sealed products":kind==="CARDS"?"cards":"listings")+' found. Try a more specific name or change the product type.</div>';
  const typesFiltered=before-items.length;
  const excludedCurrency=items.filter(item=>validPrice(item)&&item.currency!==currency).length;
  displayStatus($("#priceStatus"),items.length+" listings match your search. "+matched.length+" have numeric prices in "+currency+" for comparison."+(typesFiltered?" "+typesFiltered+" excluded by product type.":"")+(excludedCurrency?" "+excludedCurrency+" listed in a different currency (not averaged).":"")+" These are asking prices, not completed sales.");
 }catch(error){
  if(requestId!==priceRequestId)return;
  $("#priceResults").innerHTML='<div class="stats-placeholder">Live prices are unavailable right now. Check your connection and try again.</div>';
  $("#priceResultCount").textContent="Unavailable";
  displayStatus($("#priceStatus"),error.message||"Could not load the product prices.",true);
 }finally{if(requestId===priceRequestId){button.disabled=false;button.textContent="⌕ Check prices";}}
}
$("#priceForm").addEventListener("submit",searchPrices);
$("#refreshMix").addEventListener("click",loadMarketMix);
document.querySelectorAll("[data-price-query]").forEach(button=>button.addEventListener("click",()=>{
 $("#priceQuery").value=button.dataset.priceQuery;
 $("#priceKind").value=button.dataset.priceKind||"ALL";
 void searchPrices();
}));
$("#priceMarketplace").addEventListener("change",()=>{void loadMarketMix();void searchPrices();});
const comparison=new URLSearchParams(location.search);
if(comparison.has("q")){
 const query=comparison.get("q")?.trim().slice(0,120);
 if(query)$("#priceQuery").value=query;
 const kind=comparison.get("kind");
 if(["ALL","CARDS","SEALED","ACCESSORIES"].includes(kind))$("#priceKind").value=kind;
 const marketplace=comparison.get("marketplace");
 if(["AU","US"].includes(marketplace))$("#priceMarketplace").value=marketplace;
}
void loadMarketMix();
void searchPrices();
