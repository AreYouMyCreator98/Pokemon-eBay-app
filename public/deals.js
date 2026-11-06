// Read-only POKÉMARKET Good Deals front-end; all comparisons are computed on the server.
const $=q=>document.querySelector(q);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=(v,c="AUD")=>Number.isFinite(Number(v))&&v!==null?new Intl.NumberFormat("en-AU",{style:"currency",currency:c,maximumFractionDigits:2}).format(v):"—";
const ebayURL=raw=>{try{const u=new URL(raw);return u.protocol==="https:"&&["www.ebay.com.au","www.ebay.com"].includes(u.hostname)?u.href:"";}catch{return "";}};
let requestId=0;
function imageTag(item){
 if(/^https:\/\//i.test(item.image||""))return '<img src="'+esc(item.image)+'" loading="lazy" referrerpolicy="no-referrer" alt="">';
 return '<span aria-hidden="true">No image available</span>';
}
function renderCard(item,deal=null){
 const url=ebayURL(item.url),currency=deal?.currency||item.currency||"AUD";
 const itemPrice=deal?item.price:item.itemPrice,postage=deal?item.shipping:item.shipping;
 const total=deal?deal.listedTotal:item.total;
 const postageKnown=postage!==null&&postage!==undefined&&item.shippingCurrency===currency;
 let extra="";
 if(deal){
  const refs=deal.sources.map(x=>esc(x.source)+" ("+esc(x.basis.toLowerCase())+", "+esc(x.asOf.slice(0,10))+")").join(" · ");
  extra='<div class="deal-ref"><div><span>Conservative licensed reference</span><strong>'+money(deal.reference,currency)+'</strong></div><span class="deal-saving">−'+esc(deal.discountPercent)+'%</span></div>'+
   '<div class="deal-sources"><b>Evidence:</b> '+refs+' · '+esc(deal.confidence)+' confidence. Not a guarantee.</div>';
 }else{
  extra='<div class="deal-sources"><b>Unverified candidate.</b> Cannot calculate a market discount without an approved exact-product price reference.</div>';
 }
 return '<article class="deal-card"><div class="deal-card-image">'+imageTag(item)+'<span class="deal-kind">'+esc((item.productType||item.category||"TCG").toUpperCase())+'</span></div>'+
  '<div class="deal-card-body"><h3 class="deal-card-title" title="'+esc(item.title)+'">'+esc(item.title)+'</h3><span class="deal-card-condition">'+esc(item.condition||"Condition not provided")+'</span>'+
  '<div class="deal-price-grid"><div><span>'+(deal?"Listed price":"eBay asking price")+'</span><strong>'+money(itemPrice,currency)+'</strong></div><div><span>Including postage</span><strong>'+money(total,currency)+'</strong></div></div>'+
  '<div class="deal-postage">'+(postageKnown?(postage===0?"Free known postage":"Known postage: "+money(postage,currency)):"Postage not reliably supplied — total unknown")+'</div>'+
  extra+(url?'<a class="deal-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">View listing on eBay ↗</a>':'<div class="deal-help">Listing link unavailable</div>')+'</div></article>';
}
async function loadDeals(){
 const serial=++requestId,button=$("#dealRefresh");
 button.disabled=true;
 $("#dealsState").textContent="Checking eBay listings and approved market-price references…";
 try{
  const p=new URLSearchParams({marketplace:$("#dealMarketplace").value,category:$("#dealCategory").value,minDiscount:$("#dealDiscount").value});
  const response=await fetch("/api/deals?"+p,{cache:"no-store"});
  const data=await response.json();
  if(serial!==requestId)return;
  if(!response.ok)throw Error(data.error||"Unable to load live listings");
  $("#dealsState").classList.toggle("no-data",!data.benchmarksConnected);
  $("#dealsState").textContent=data.benchmarksConnected?
   "Approved market references connected. "+data.checkedListings+" candidate listings examined. Only confirmed exact matches can earn a below-reference percentage.":
   "Market references not connected: "+data.sourceStatus+" You can review live eBay candidates below, but none are labelled a bargain without an approved benchmark.";
  $("#dealCount").textContent=(data.deals||[]).length+" eligible";
  $("#candidateCount").textContent=(data.preview||[]).length+" shown";
  $("#confirmedDeals").innerHTML=data.deals?.length?data.deals.map(deal=>renderCard(deal.item,deal)).join(""):'<div class="deal-placeholder">'+
   (data.benchmarksConnected?"No listings passed the exact-product and discount checks in this sample. This does not mean there are no bargains on eBay.":"No market-value discounts can be calculated yet. Provider permission and current price data are required before this section can show verified comparisons.")+'</div>';
  $("#dealCandidates").innerHTML=data.preview?.length?data.preview.map(item=>renderCard(item)).join(""):'<div class="deal-placeholder">No collector listings available for this selection.</div>';
 }catch(error){
  if(serial!==requestId)return;
  $("#dealsState").classList.add("no-data");
  $("#dealsState").textContent=error.message||"Deal discovery is unavailable.";
  $("#dealCount").textContent="Unavailable";
  $("#candidateCount").textContent="Unavailable";
  $("#confirmedDeals").innerHTML='<div class="deal-placeholder">Unable to verify market-price comparisons right now.</div>';
  $("#dealCandidates").innerHTML='<div class="deal-placeholder">Unable to retrieve current eBay listings right now.</div>';
 }finally{if(serial===requestId)button.disabled=false;}
}
for(const id of ["dealMarketplace","dealCategory","dealDiscount"])$("#"+id).addEventListener("change",loadDeals);
$("#dealRefresh").addEventListener("click",loadDeals);
void loadDeals();
