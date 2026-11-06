// Read-only POKÉMARKET price opportunities: existing eBay Browse API, no extra keys.
// Figures compare ACTIVE BUY IT NOW ASKING prices, not transactions or verified value.
const $=q=>document.querySelector(q);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=(v,c="AUD")=>typeof v==="number"&&Number.isFinite(v)?new Intl.NumberFormat("en-AU",{style:"currency",currency:c,maximumFractionDigits:2}).format(v):"—";
const ebayURL=raw=>{try{const u=new URL(raw);return u.protocol==="https:"&&["www.ebay.com.au","www.ebay.com"].includes(u.hostname)?u.href:"";}catch{return "";}};
let requestId=0;
function imageTag(item){
 if(/^https:\/\//i.test(item.image||""))return '<img src="'+esc(item.image)+'" loading="lazy" referrerpolicy="no-referrer" alt="">';
 return '<span aria-hidden="true">Image unavailable</span>';
}
function peerEvidence(deal,currency){
 const matches=(deal.comparables||[]).map(peer=>{
  const url=ebayURL(peer.url);
  if(!url)return "";
  return '<li><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(peer.title)+'</a><strong>'+money(peer.total,currency)+'</strong></li>';
 }).filter(Boolean).join("");
 return '<details class="deal-comparables"><summary>Compare '+esc(deal.peerCount)+' other sellers</summary>'+
  '<p>Comparable live Buy It Now listings, using their item price + known shipping. This is a sample, not every eBay offer.</p>'+
  '<ul>'+matches+'</ul></details>';
}
function renderCard(item,deal=null){
 const url=ebayURL(item.url),currency=deal?.currency||item.currency||"AUD";
 const listed=deal?item.price:item.itemPrice,shipping=item.shipping;
 const total=deal?deal.listedTotal:item.total;
 const shippingKnown=shipping!==null&&shipping!==undefined&&item.shippingCurrency===currency;
 let extra="",tier=deal?.tier||"BROWSE";
 if(deal){
  const onePeer=tier==="WATCHLIST",twoPeers=tier==="POTENTIAL";
  const header=onePeer?"One other asking price":twoPeers?"Lowest of 2 matching asking prices":"Lower-quartile comparable asking price";
  const label=onePeer?"Watchlist only · 1 comparison":twoPeers?"Potential bargain · 2 comparisons":"Strong price signal · 3+ comparisons";
  const savings=onePeer?'<span class="deal-watch-label">No %</span>':
   '<span class="deal-saving">−'+esc(deal.discountPercent)+'%</span>';
  extra='<div class="deal-ref"><div><span>'+header+'</span><strong>'+money(deal.reference,currency)+'</strong>'+
   (!onePeer&&!twoPeers?'<span>Matching-listing median: '+money(deal.median,currency)+'</span>':'')+
   '</div>'+savings+'</div>'+
   '<div class="deal-sources"><b>'+label+'</b> · '+esc(deal.peerCount)+' independent seller'+(deal.peerCount===1?"":"s")+
   ' · Checked '+esc(new Date(deal.comparedAt).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"}))+
   '. '+(onePeer?"Too little evidence to infer a discount.":twoPeers?"Early signal only; not a reliable market benchmark.":"Asking-price comparison only; not proven below market.")+
   '</div>'+peerEvidence(deal,currency);
 }else{
  extra='<div class="deal-sources"><b>Not a validated price signal.</b> '+esc(item.note||"No reliable same-product comparison was available for this listing.")+'</div>';
 }
 return '<article class="deal-card deal-tier-'+tier.toLowerCase()+'"><div class="deal-card-image">'+imageTag(item)+
  '<span class="deal-kind">'+esc((item.productType||item.category||"TCG").toUpperCase())+'</span></div>'+
  '<div class="deal-card-body"><h3 class="deal-card-title" title="'+esc(item.title)+'">'+esc(item.title)+'</h3>'+
  '<span class="deal-card-condition">'+esc(item.condition||"Condition not provided")+'</span>'+
  '<div class="deal-price-grid"><div><span>eBay asking price</span><strong>'+money(listed,currency)+'</strong></div>'+
  '<div><span>With known shipping</span><strong>'+money(total,currency)+'</strong></div></div>'+
  '<div class="deal-postage">'+(shippingKnown?(shipping===0?"Free known shipping":"Known shipping: "+money(shipping,currency)):"Shipping not supplied — total unknown")+'</div>'+
  extra+(url?'<a class="deal-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">View this listing on eBay ↗</a>':
  '<div class="deal-help">Original eBay listing link unavailable</div>')+'</div></article>';
}
async function loadDeals(){
 const serial=++requestId,button=$("#dealRefresh");
 button.disabled=true;
 $("#dealsState").textContent="Searching eBay and comparing eligible products with other sellers…";
 try{
  const p=new URLSearchParams({marketplace:$("#dealMarketplace").value,category:$("#dealCategory").value,minDiscount:$("#dealDiscount").value});
  const response=await fetch("/api/deals?"+p,{cache:"no-store"});
  const data=await response.json();
  if(serial!==requestId)return;
  if(!response.ok)throw Error(data.error||"Unable to load live listings");
  const count=Number(data.deals?.length||0);
  const early=Number(data.potential?.length||0),watch=Number(data.watchlist?.length||0);
  $("#dealsState").classList.toggle("no-data",count+early+watch===0);
  $("#dealsState").textContent=
   count+" strong signal"+(count===1?"":"s")+", "+early+" potential bargain"+(early===1?"":"s")+" and "+
   watch+" watchlist lead"+(watch===1?"":"s")+" from "+data.checkedListings+" collector listings, "+
   data.comparableListings+" sampled live eBay listings and "+data.comparisonSearches+" targeted comparisons."+
   (data.failedSearches?" "+data.failedSearches+" comparison searches were unavailable; results are partial.":"")+
   " All comparisons use current asking prices, not completed sales. Updated "+new Date(data.refreshedAt).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"})+".";
  $("#dealCount").textContent=count+" strong";
  $("#potentialCount").textContent=early+" possible";
  $("#watchlistCount").textContent=watch+" leads";
  $("#candidateCount").textContent=(data.preview||[]).length+" shown";
  $("#confirmedDeals").innerHTML=count?data.deals.map(x=>renderCard(x.item,x)).join(""):
   '<div class="deal-placeholder">No listings passed the strict three-seller lower-quartile check at this discount threshold. Check potential bargains and watchlist leads below.</div>';
  $("#potentialDeals").innerHTML=early?data.potential.map(x=>renderCard(x.item,x)).join(""):
   '<div class="deal-placeholder">No two-seller price opportunities met your selected threshold in this sample.</div>';
  $("#watchlistDeals").innerHTML=watch?data.watchlist.map(x=>renderCard(x.item,x)).join(""):
   '<div class="deal-placeholder">No single-comparison leads met your selected threshold in this sample.</div>';
  $("#dealCandidates").innerHTML=data.preview?.length?data.preview.map(x=>renderCard(x)).join(""):
   '<div class="deal-placeholder">No other collector listings available for this selection.</div>';
 }catch(error){
  if(serial!==requestId)return;
  $("#dealsState").classList.add("no-data");
  $("#dealsState").textContent=error.message||"Live eBay comparisons are unavailable.";
  $("#dealCount").textContent="Unavailable";
  $("#candidateCount").textContent="Unavailable";
  $("#potentialCount").textContent="Unavailable";
  $("#watchlistCount").textContent="Unavailable";
  $("#confirmedDeals").innerHTML='<div class="deal-placeholder">Could not validate comparable listing prices right now.</div>';
  $("#potentialDeals").innerHTML='<div class="deal-placeholder">Comparison searches unavailable.</div>';
  $("#watchlistDeals").innerHTML='<div class="deal-placeholder">Comparison searches unavailable.</div>';
  $("#dealCandidates").innerHTML='<div class="deal-placeholder">Could not retrieve eBay listings right now.</div>';
 }finally{if(serial===requestId)button.disabled=false;}
}
for(const id of ["dealMarketplace","dealCategory","dealDiscount"])$("#"+id).addEventListener("change",loadDeals);
$("#dealRefresh").addEventListener("click",loadDeals);
void loadDeals();
