import http from "node:http";
import { deletionChallenge } from "./ebay-deletion.js";
import { makeSearchPlan, scoreSearchItem } from "./smart-search.js";
import { classifyTCGListing } from "./tcg-only.js";
import { priceBounds, itemInPriceRange, sortByListingPrice } from "./public/price-range.js";
import { withinBudget, amountFor } from "./public/market-v2.js";
import { evaluateDeals, validateBenchmark } from "./public/deal-engine.js";
import { identityOf, findTieredAskingOpportunities } from "./public/ebay-comparables.js";
import { filterCollectorListings, sortCollectorListings } from "./public/collector-quality.js";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
try {
  const envText = await readFile(join(ROOT, ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}
const MARKETPLACES = { AU: { id: "EBAY_AU", currency: "AUD" }, US: { id: "EBAY_US", currency: "USD" } };
let tokenCache = { value: "", expiresAt: 0 };
let tokenPromise;
const mime = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".webmanifest":"application/manifest+json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png", ".ico":"image/x-icon" };
function send(res,status,body,type="application/json; charset=utf-8") {
  res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  res.end(type.startsWith("application/json")?JSON.stringify(body):body);
}
function clean(value,max=120) { return String(value||"").replace(/[\u0000-\u001f<>]/g," ").trim().slice(0,max); }
async function ebayToken() {
  if(tokenCache.value&&Date.now()<tokenCache.expiresAt-60000)return tokenCache.value;
  if(tokenPromise)return tokenPromise;
  tokenPromise=(async()=>{
    const id=process.env.EBAY_CLIENT_ID,secret=process.env.EBAY_CLIENT_SECRET;
    if(!id||!secret)throw new Error("eBay API credentials have not been configured on the server.");
    const auth=Buffer.from(id+":"+secret).toString("base64");
    const response=await fetch("https://api.ebay.com/identity/v1/oauth2/token",{method:"POST",headers:{Authorization:"Basic "+auth,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"client_credentials",scope:"https://api.ebay.com/oauth/api_scope"})});
    const data=await response.json();
    if(!response.ok||!data.access_token){console.error("eBay OAuth token rejected",{status:response.status,errorCode:typeof data.error==="string"?data.error:"unknown"});throw new Error("eBay Production authentication failed (HTTP "+response.status+"). Check Production keyset activation and credential pairing.");}
    tokenCache={value:data.access_token,expiresAt:Date.now()+Number(data.expires_in||7200)*1000};
    return tokenCache.value;
  })();
  try{return await tokenPromise;}finally{tokenPromise=undefined;}
}
async function searchEbay(params) {
  const key=clean(params.get("marketplace")||"AU",2).toUpperCase(),market=MARKETPLACES[key];
  if(!market)throw new Error("Unsupported marketplace. Choose AU or US.");
  const q=clean(params.get("q"),100);
  if(!q)return {items:[],total:0,marketplace:key,currency:market.currency};
  const limit=Math.min(50,Math.max(1,Number(params.get("limit")||24)));
  const type=clean(params.get("type")||"ALL",20).toUpperCase();
  if(!["ALL","FIXED","AUCTION"].includes(type))throw new Error("Unsupported listing type.");
  const sort=["endingSoonest","newlyListed","priceAsc","priceDesc"].includes(params.get("sort"))?params.get("sort"):"endingSoonest";
  const ebaySort=sort==="priceAsc"?"price":sort==="priceDesc"?"-price":sort;
  const bounds=priceBounds({minPrice:params.get("minPrice"),maxPrice:params.get("maxPrice")});
  const priceMode=params.get("priceMode")==="total"?"total":"item";
  const smart=params.get("smart")!=="0";
  const filters=[];
  const shipFrom=clean(params.get("shipFrom")||"ANY",3).toUpperCase();
  const allowedOrigins=new Set(["ANY","AU","US","JP","GB","CA","NZ","DE","FR","KR","CN","IT","ES"]);
  if(!allowedOrigins.has(shipFrom))throw new Error("Unsupported shipping origin.");
  if(shipFrom!=="ANY")filters.push("itemLocationCountry:"+shipFrom);
  const shipsTo=clean(params.get("shipsTo")||"ANY",3).toUpperCase();
  if(!allowedOrigins.has(shipsTo))throw new Error("Unsupported delivery destination.");
  if(shipsTo!=="ANY")filters.push("deliveryCountry:"+shipsTo);
  if(type==="AUCTION")filters.push("buyingOptions:{AUCTION}");
  if(type==="FIXED")filters.push("buyingOptions:{FIXED_PRICE}");
  if(type==="ALL")filters.push("buyingOptions:{AUCTION|FIXED_PRICE}");
  if(bounds.active){
    // In total mode, item prices below the minimum can become eligible with shipping.
    // Never push the total-price minimum to an eBay item-price filter.
    const apiMin=priceMode==="total"?"":(bounds.minCents===null?"":bounds.minCents/100);
    const apiMax=bounds.maxCents===null?"":bounds.maxCents/100;
    if(priceMode==="item"||apiMax!=="")filters.push("price:["+apiMin+".."+apiMax+"]");
    if(priceMode==="item"||apiMax!=="")filters.push("priceCurrency:"+market.currency);
  }
  const plan=makeSearchPlan(q);
  const token=await ebayToken();
  const seen=new Set(),found=[],attempts=[],target=Math.min(limit,12);
  async function requestVariant(keywords){
    const query=new URLSearchParams({q:keywords,limit:String(limit),sort:ebaySort,auto_correct:"KEYWORD",category_ids:"2536"});
    if(filters.length)query.set("filter",filters.join(","));
    const response=await fetch("https://api.ebay.com/buy/browse/v1/item_summary/search?"+query,{headers:{Authorization:"Bearer "+token,"X-EBAY-C-MARKETPLACE-ID":market.id,Accept:"application/json"}});
    const data=await response.json();
    if(!response.ok)throw new Error(data.errors?.[0]?.message||"eBay search request failed ("+response.status+").");
    attempts.push(keywords);
    for(const item of data.itemSummaries||[]){
      const id=String(item.itemId||item.itemWebUrl||"");
      if(!id||seen.has(id))continue;
      // Mandatory on every feed, including smart:false discovery and Stats.
      // Category 2536 = CCG cards, sealed products and card-game supplies;
      // the classifier also rejects non-TCG items miscategorised by sellers.
      const productType=classifyTCGListing(item);
      if(!productType)continue;
      const relevance=scoreSearchItem(item,plan);
      if(smart&&relevance<0)continue;
      if(smart&&keywords!==plan.queries[0]&&relevance<25)continue;
      seen.add(id);
      const auction=(item.buyingOptions||[]).includes("AUCTION");
      const amount=auction?item.currentBidPrice||(item.bidCount===0?item.minimumPriceToBid:null)||item.price:item.price||item.currentBidPrice;
      const value=amount?.value;
      const price=value!==undefined&&value!==null&&value!==""&&Number.isFinite(Number(value))?Number(value):null;
      const listingCurrency=amount?.currency||market.currency;
      const delivery=(item.shippingOptions||[]).find(option=>option?.shippingCost?.value!=null);
      const rawShipping=delivery?.shippingCost?.value;
      const shipping=rawShipping!==undefined&&rawShipping!==null&&Number.isFinite(Number(rawShipping))&&Number(rawShipping)>=0?Number(rawShipping):null;
      const shippingCurrency=shipping===null?null:delivery.shippingCost.currency||null;
      if(!withinBudget({price,currency:listingCurrency,shipping,shippingCurrency},bounds,market.currency,priceMode))continue;
      found.push({id:item.itemId,title:item.title,productType,image:item.image?.imageUrl||item.thumbnailImages?.[0]?.imageUrl||"",price,currency:listingCurrency,shipping,shippingCurrency,condition:item.condition||"Condition not supplied",location:item.itemLocation?.city||item.itemLocation?.country||"Location not supplied",shipFrom:item.itemLocation?.country||"",seller:item.seller?.username||"Seller details on eBay",sellerFeedback:item.seller?.feedbackPercentage||null,endTime:item.itemEndDate||null,bids:item.bidCount??null,buyingOptions:item.buyingOptions||[],url:item.itemWebUrl||"",marketplace:key,_relevance:relevance,_variant:attempts.length-1});
    }
    return data;
  }
  const primary=await requestVariant(plan.queries[0]);
  if(smart&&found.length<target){
    // The official API treats space-separated words as AND. Try related queries
    // only if the exact keywords returned too few relevant results.
    for(const variant of plan.queries.slice(1,5)){
      if(found.length>=target)break;
      try{await requestVariant(variant);}catch(error){console.warn("eBay fallback query unavailable",error.message);}
    }
  }
  if(smart&&attempts.length>1&&sort!=="priceAsc"&&sort!=="priceDesc"){
    found.sort((a,b)=>b._relevance-a._relevance||a._variant-b._variant||
     (sort==="newlyListed"?0:new Date(a.endTime||8640000000000000)-new Date(b.endTime||8640000000000000)));
  }
  const items=sortByListingPrice(found,sort,market.currency).slice(0,limit).map(({_relevance,_variant,...item})=>item);
  return {items,total:items.length,marketplace:key,currency:market.currency,source:"eBay Browse API",fetchedAt:new Date().toISOString(),
   searchMeta:{query:q,corrected:primary.autoCorrections?.q||null,interpretedAs:plan.spellingChanged?plan.canonical:null,expanded:attempts.length>1,alternatives:attempts.length>1?attempts.slice(1):[],matches:items.length}};
}
// Cache only publicly available, read-only search responses briefly to reduce
// duplicate eBay API calls across open dashboard sessions.
const searchCache=new Map();
async function cachedSearch(params){
 const key=params.toString(),now=Date.now();
 const ttl=params.get("type")==="AUCTION"?20000:55000;
 const cached=searchCache.get(key);
 if(cached&&now-cached.time<ttl)return cached.promise;
 if(cached)searchCache.delete(key);
 const promise=searchEbay(params);
 searchCache.set(key,{time:now,promise});
 if(searchCache.size>200){
   for(const [k,v] of searchCache){if(now-v.time>60000)searchCache.delete(k);}
   while(searchCache.size>200)searchCache.delete(searchCache.keys().next().value);
 }
 try{return await promise;}catch(error){searchCache.delete(key);throw error;}
}
// Market references must be supplied by a licensed, approved data provider.
// Do not use scraping, unlicensed external feeds, or fabricated benchmark values.
function loadApprovedMarketReferences(){
 const licensed=process.env.MARKET_REFERENCE_LICENSE_CONFIRMED==="true";
 if(!licensed)return {ready:false,refs:[],note:"Market-source permissions and approved reference prices are not configured."};
 const raw=process.env.MARKET_REFERENCE_DATA_JSON;
 if(!raw)return {ready:false,refs:[],note:"Licensed market price reference feed has not been configured."};
 try{
  const quotes=JSON.parse(raw);
  if(!Array.isArray(quotes)||quotes.length>3000)throw new Error("Invalid reference format");
  const validated=quotes.filter(row=>validateBenchmark(row)!==null);
  if(!validated.length)return {ready:false,refs:[],note:"No recent, precisely matched, approved price references are available."};
  return {ready:true,refs:validated,note:"Approved, current market benchmarks supplied by operator."};
 }catch{return {ready:false,refs:[],note:"Market benchmark configuration is invalid."};}
}
// Distinct discovery searches cover grades, popular sets, raw singles and
// individual sealed formats. Some price-sorted searches locate cheap offers
// that would not appear in a newly-listed-only feed.
const dealFeedQueries=[
 ["pokemon psa 10","newlyListed"],["pokemon psa 9","newlyListed"],
 ["pokemon cgc 10","newlyListed"],["pokemon graded charizard","newlyListed"],
 ["pokemon graded umbreon","newlyListed"],["pokemon graded pikachu","newlyListed"],
 ["pokemon 151 trading card","newlyListed"],["pokemon prismatic evolutions","newlyListed"],
 ["pokemon surging sparks","newlyListed"],["pokemon evolving skies","newlyListed"],
 ["pokemon booster box sealed","newlyListed"],["pokemon booster bundle sealed","newlyListed"],
 ["pokemon elite trainer box","newlyListed"],["pokemon alternate art card","newlyListed"],
 ["pokemon illustration rare card","newlyListed"],["one piece card game graded","newlyListed"],
 ["pokemon psa 10","priceAsc"],["pokemon booster box sealed","priceAsc"],
 ["pokemon booster bundle sealed","priceAsc"],["pokemon 151 trading card","priceAsc"]
];
let dealsCache={};
async function collectDealCandidates(marketplace){
 const key=marketplace,now=Date.now(),cached=dealsCache[key];
 if(cached&&now-cached.timestamp<210000)return cached.promise;
 const promise=(async()=>{
  const items=[];
  for(let i=0;i<dealFeedQueries.length;i+=4){
   const batch=await Promise.allSettled(dealFeedQueries.slice(i,i+4).map(([q,sort])=>
    cachedSearch(new URLSearchParams({q,marketplace,type:"FIXED",sort,limit:"50",smart:"0"}))));
   for(const response of batch)if(response.status==="fulfilled")items.push(...(response.value.items||[]));
  }
  const unique=new Map();
  for(const item of items)if(item?.id&&!unique.has(item.id)&&item.url)unique.set(item.id,item);
  const clean=filterCollectorListings([...unique.values()],"COLLECTOR");
  // Prevent graded listings monopolising the pool before raw and sealed items
  // have a chance to be examined. This is a bounded sample, not the entire market.
  return ["GRADED","SEALED","RAW"].flatMap(kind=>
   sortCollectorListings(clean.filter(item=>item.productType===kind)).slice(0,100));
 })();
 dealsCache[key]={timestamp:now,promise};
 try{return await promise;}catch(error){delete dealsCache[key];throw error;}
}
function comparisonQuery(identity){
 if(identity.kind==="SEALED")return [identity.set,identity.productFormat,"sealed"].join(" ").slice(0,100);
 return [identity.names.slice(0,2).join(" "),identity.number,identity.set,
  identity.grade||""].join(" ").replace(/\s+/g," ").trim().slice(0,100);
}
function comparisonGroups(candidates,category="ALL"){
 const all=candidates.filter(item=>(category==="ALL"||item.productType===category)&&identityOf(item));
 const groups=new Map();
 all.sort((a,b)=>(amountFor(a,"total",a.currency)??Infinity)-(amountFor(b,"total",b.currency)??Infinity));
 for(const item of all){
  const identity=identityOf(item);
  // Titles with different word order should share one targeted search.
  const key=[identity.kind,identity.set,identity.number||"",identity.grade||"",
   identity.language,identity.condition||"",identity.edition,identity.productFormat||""].join("|");
  if(!groups.has(key))groups.set(key,{identity,item});
 }
 const selected=[],counts={RAW:0,GRADED:0,SEALED:0};
 for(const group of groups.values()){
  const kind=group.identity.kind;
  if(counts[kind]>=(category==="ALL"?12:26)||selected.length>=30)continue;
  selected.push(group);counts[kind]++;
 }
 return selected;
}
let comparableCache=new Map();
async function collectComparableUniverse(marketplace,candidates,category="ALL"){
 const now=Date.now(),cacheKey=marketplace+"|"+category;
 const cache=comparableCache.get(cacheKey);
 if(cache&&now-cache.timestamp<240000)return cache.promise;
 const promise=(async()=>{
  const groups=comparisonGroups(candidates,category);
  const listings=[...candidates],errors=[];
  let completed=0;
  for(let i=0;i<groups.length;i+=3){
   const current=groups.slice(i,i+3);
   const responses=await Promise.allSettled(current.map(g=>
    cachedSearch(new URLSearchParams({q:comparisonQuery(g.identity),type:"FIXED",
     marketplace,sort:"priceAsc",limit:"50",smart:"0"}))));
   for(let j=0;j<responses.length;j++){
    const result=responses[j];completed++;
    if(result.status==="fulfilled")listings.push(...(result.value.items||[]));
    else errors.push({query:current[j].identity.set,error:"eBay comparison search unavailable"});
   }
  }
  const unique=new Map();
  for(const item of listings)if(item?.id&&!unique.has(item.id)&&item.url)unique.set(item.id,item);
  return {items:[...unique.values()],groups:groups.length,completed,failed:errors.length};
 })();
 comparableCache.set(cacheKey,{timestamp:now,promise});
 if(comparableCache.size>8)comparableCache.delete(comparableCache.keys().next().value);
 try{return await promise;}catch(error){comparableCache.delete(cacheKey);throw error;}
}
async function getMarketDeals(params){
 const marketplace=params.get("marketplace")==="US"?"US":"AU";
 const category=["ALL","RAW","GRADED","SEALED"].includes(params.get("category"))?params.get("category"):"ALL";
 const threshold=[10,15,20,25,30].includes(Number(params.get("minDiscount")))?Number(params.get("minDiscount")):15;
 const currency=marketplace==="AU"?"AUD":"USD";
 const candidates=await collectDealCandidates(marketplace);
 const universe=await collectComparableUniverse(marketplace,candidates,category);
 const target=candidates.filter(item=>(category==="ALL"||item.productType===category)&&identityOf(item));
 const result=findTieredAskingOpportunities(target,universe.items,{currency,minDiscount:threshold,minPeers:3});
 const chosen=result.deals.slice(0,24),potential=result.potential.slice(0,24),watchlist=result.watchlist.slice(0,18);
 const exclude=new Set([...result.deals,...result.potential,...result.watchlist].map(d=>d.item.id));
 const preview=candidates.filter(item=>(category==="ALL"||item.productType===category)&&!exclude.has(item.id)).slice(0,18).map(item=>({
  id:item.id,title:item.title,category:item.productType,condition:item.condition,image:item.image,
  url:item.url,currency:item.currency,itemPrice:item.price,shipping:item.shipping,
  shippingCurrency:item.shippingCurrency,total:amountFor(item,"total",currency),
  note:identityOf(item)
   ?"No qualifying price signal was established at this threshold, or there were not enough matched sellers."
   :"Exact card, condition, language or sealed format could not be reliably matched from seller details."
 }));
 return {
  basis:"EBAY_ACTIVE_ASKING",ready:true,sourceStatus:"Live eBay Buy It Now asking-price comparison",
  currency,category,checkedListings:candidates.length,comparableListings:universe.items.length,
  comparisonSearches:universe.completed,failedSearches:universe.failed,
  matchedIdentityCandidates:result.eligibleProducts,
  discountThreshold:threshold,deals:chosen,potential,watchlist,preview,
  warning:"The strong, potential and watchlist sections compare ACTIVE ASKING prices only, not completed sales or independently verified market value. One-peer leads never receive an estimated percentage. Check seller, exact product, postage, taxes and authenticity.",
  sources:["eBay active Buy It Now listings"],refreshedAt:new Date().toISOString()
 };
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if (await deletionChallenge(req,res,url)) return;
  if(req.method==="GET"&&url.pathname==="/api/health")return send(res,200,{ok:true,ebayConfigured:Boolean(process.env.EBAY_CLIENT_ID&&process.env.EBAY_CLIENT_SECRET)});
  if(req.method==="GET"&&url.pathname==="/api/version")return send(res,200,{ui:"v3-early-signals-20261106-2",commit:process.env.RENDER_GIT_COMMIT?.slice(0,12)||null});
  if(req.method==="GET"&&url.pathname==="/api/search"){try{return send(res,200,await cachedSearch(url.searchParams));}catch(error){return send(res,502,{error:error.message||"Search unavailable"});}}
  if(req.method==="GET"&&url.pathname==="/api/deals"){try{return send(res,200,await getMarketDeals(url.searchParams));}catch(error){console.warn("Deal discovery unavailable",error.message);return send(res,502,{error:"Live deal discovery is temporarily unavailable. Try again."});}}
  if(req.method==="GET"&&url.pathname==="/api/sold")return send(res,200,{available:false,items:[],message:"Verified sold-history access is not connected. eBay Marketplace Insights access is restricted; no sold prices are fabricated or scraped."});
  if(req.method!=="GET")return send(res,405,{error:"Method not allowed"});
  const requested=url.pathname==="/"? "index.html":decodeURIComponent(url.pathname.slice(1));
  const safePath=normalize(requested).replace(/^([.][.][/\\])+/, ""),file=join(PUBLIC,safePath);
  if(!file.startsWith(PUBLIC))return send(res,403,{error:"Forbidden"});
  try{const body=await readFile(file);res.writeHead(200,{"Content-Type":mime[extname(file)]||"application/octet-stream","X-Content-Type-Options":"nosniff","Cache-Control":"no-store, max-age=0, must-revalidate","X-TCG-UI-Version":"v3-early-signals-20261106-2"});res.end(body);}catch{send(res,404,"Not found","text/plain; charset=utf-8");}
});
server.listen(PORT,()=>console.log("TCG Bid Buy Watch running on port "+PORT));
