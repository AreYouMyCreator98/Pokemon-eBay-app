import http from "node:http";
import { deletionChallenge } from "./ebay-deletion.js";
import { makeSearchPlan, scoreSearchItem } from "./smart-search.js";
import { classifyTCGListing } from "./tcg-only.js";
import { priceBounds, itemInPriceRange, sortByListingPrice } from "./public/price-range.js";
import { withinBudget } from "./public/market-v2.js";
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
    filters.push("priceCurrency:"+market.currency);
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
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if (await deletionChallenge(req,res,url)) return;
  if(req.method==="GET"&&url.pathname==="/api/health")return send(res,200,{ok:true,ebayConfigured:Boolean(process.env.EBAY_CLIENT_ID&&process.env.EBAY_CLIENT_SECRET)});
  if(req.method==="GET"&&url.pathname==="/api/version")return send(res,200,{ui:"clean-20261106-2",commit:process.env.RENDER_GIT_COMMIT?.slice(0,12)||null});
  if(req.method==="GET"&&url.pathname==="/api/search"){try{return send(res,200,await searchEbay(url.searchParams));}catch(error){return send(res,502,{error:error.message||"Search unavailable"});}}
  if(req.method==="GET"&&url.pathname==="/api/sold")return send(res,200,{available:false,items:[],message:"Verified sold-history access is not connected. eBay Marketplace Insights access is restricted; no sold prices are fabricated or scraped."});
  if(req.method!=="GET")return send(res,405,{error:"Method not allowed"});
  const requested=url.pathname==="/"? "index.html":decodeURIComponent(url.pathname.slice(1));
  const safePath=normalize(requested).replace(/^([.][.][/\\])+/, ""),file=join(PUBLIC,safePath);
  if(!file.startsWith(PUBLIC))return send(res,403,{error:"Forbidden"});
  try{const body=await readFile(file);res.writeHead(200,{"Content-Type":mime[extname(file)]||"application/octet-stream","X-Content-Type-Options":"nosniff","Cache-Control":"no-store, max-age=0, must-revalidate","X-TCG-UI-Version":"clean-20261106-2"});res.end(body);}catch{send(res,404,"Not found","text/plain; charset=utf-8");}
});
server.listen(PORT,()=>console.log("TCG Bid Buy Watch running on port "+PORT));
