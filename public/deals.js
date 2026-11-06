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
 let extra="";
 if(deal){
  extra='<div class="deal-ref"><div><span>Lower-quartile comparable asking price</span><strong>'+money(deal.reference,currency)+'</strong>'+
   '<span>Matching-listing median: '+money(deal.median,currency)+'</span></div>'+
   '<span class="deal-saving">−'+esc(deal.discountPercent)+'%</span></div>'+
   '<div class="deal-sources"><b>Potential deal · '+esc(deal.confidence)+' comparison sample</b> · '+esc(deal.peerCount)+
   ' other sellers · Checked '+esc(new Date(deal.comparedAt).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"}))+
   '. Not sold prices or guaranteed value.</div>'+peerEvidence(deal,currency);
 }else{
  extra='<div class="deal-sources"><b>Not a verified deal.</b> '+esc(item.note||"No reliable same-product comparison was available for this listing.")+'</div>';
 }
 return '<article class="deal-card"><div class="deal-card-image">'+imageTag(item)+
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
  $("#dealsState").classList.toggle("no-data",count===0);
  $("#dealsState").textContent=
   count+" potential price opportunity"+(count===1?"":"ies")+" found from "+data.checkedListings+" collector listings, "+
   data.comparableListings+" sampled live eBay listings and "+data.comparisonSearches+" targeted comparisons."+
   (data.failedSearches?" "+data.failedSearches+" comparison searches were unavailable; results are partial.":"")+
   " Prices are active asking prices, not completed sales. Updated "+new Date(data.refreshedAt).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"})+".";
  $("#dealCount").textContent=count+" potential";
  $("#candidateCount").textContent=(data.preview||[]).length+" shown";
  $("#confirmedDeals").innerHTML=count?data.deals.map(x=>renderCard(x.item,x)).join(""):
   '<div class="deal-placeholder">No listings met the selected price threshold with at least three matching sellers in this sample. This does not mean no bargains exist. Try 10% or select another category.</div>';
  $("#dealCandidates").innerHTML=data.preview?.length?data.preview.map(x=>renderCard(x)).join(""):
   '<div class="deal-placeholder">No other collector listings available for this selection.</div>';
 }catch(error){
  if(serial!==requestId)return;
  $("#dealsState").classList.add("no-data");
  $("#dealsState").textContent=error.message||"Live eBay comparisons are unavailable.";
  $("#dealCount").textContent="Unavailable";
  $("#candidateCount").textContent="Unavailable";
  $("#confirmedDeals").innerHTML='<div class="deal-placeholder">Could not validate comparable listing prices right now.</div>';
  $("#dealCandidates").innerHTML='<div class="deal-placeholder">Could not retrieve eBay listings right now.</div>';
 }finally{if(serial===requestId)button.disabled=false;}
}
for(const id of ["dealMarketplace","dealCategory","dealDiscount"])$("#"+id).addEventListener("change",loadDeals);
$("#dealRefresh").addEventListener("click",loadDeals);
void loadDeals();
