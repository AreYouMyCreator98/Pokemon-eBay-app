import http from "node:http";
import { deletionChallenge } from "./ebay-deletion.js";
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
const mime = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".webmanifest":"application/manifest+json", ".svg":"image/svg+xml" };
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
    if(!response.ok||!data.access_token)throw new Error(data.error_description||"Could not authenticate with eBay.");
    tokenCache={value:data.access_token,expiresAt:Date.now()+Number(data.expires_in||7200)*1000};
    return tokenCache.value;
  })();
  try{return await tokenPromise;}finally{tokenPromise=undefined;}
}
async function searchEbay(params) {
  const key=clean(params.get("marketplace")||"AU",2).toUpperCase(),market=MARKETPLACES[key];
  if(!market)throw new Error("Unsupported marketplace. Choose AU or US.");
  const q=clean(params.get("q"));
  if(!q)return {items:[],total:0,marketplace:key,currency:market.currency};
  const limit=Math.min(50,Math.max(1,Number(params.get("limit")||24)));
  const type=clean(params.get("type")||"ALL",20).toUpperCase();
  const sort=params.get("sort")==="newlyListed"?"newlyListed":"endingSoonest";
  const filters=[];
  if(type==="AUCTION")filters.push("buyingOptions:{AUCTION}");
  if(type==="FIXED")filters.push("buyingOptions:{FIXED_PRICE}");
  const min=Number(params.get("minPrice")),max=Number(params.get("maxPrice"));
  if(Number.isFinite(min)&&params.has("minPrice")&&min>=0)filters.push("price:["+min+".."+(Number.isFinite(max)&&params.has("maxPrice")&&max>=min?max:"")+"]");
  else if(Number.isFinite(max)&&params.has("maxPrice")&&max>=0)filters.push("price:[.."+max+"]");
  const query=new URLSearchParams({q,limit:String(limit),sort});
  if(filters.length)query.set("filter",filters.join(","));
  const token=await ebayToken();
  const response=await fetch("https://api.ebay.com/buy/browse/v1/item_summary/search?"+query,{headers:{Authorization:"Bearer "+token,"X-EBAY-C-MARKETPLACE-ID":market.id,Accept:"application/json"}});
  const data=await response.json();
  if(!response.ok)throw new Error(data.errors?.[0]?.message||"eBay search request failed ("+response.status+").");
  const items=(data.itemSummaries||[]).map(item=>({id:item.itemId,title:item.title,image:item.image?.imageUrl||item.thumbnailImages?.[0]?.imageUrl||"",price:item.price?.value?Number(item.price.value):null,currency:item.price?.currency||market.currency,condition:item.condition||"Condition not supplied",location:item.itemLocation?.city||item.itemLocation?.country||"Location not supplied",seller:item.seller?.username||"Seller details on eBay",sellerFeedback:item.seller?.feedbackPercentage||null,endTime:item.itemEndDate||null,bids:item.bidCount??null,buyingOptions:item.buyingOptions||[],url:item.itemWebUrl||"",marketplace:key}));
  return {items,total:data.total||items.length,marketplace:key,currency:market.currency,source:"eBay Browse API",fetchedAt:new Date().toISOString()};
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if (await deletionChallenge(req,res,url)) return;
  if(req.method==="GET"&&url.pathname==="/api/health")return send(res,200,{ok:true,ebayConfigured:Boolean(process.env.EBAY_CLIENT_ID&&process.env.EBAY_CLIENT_SECRET)});
  if(req.method==="GET"&&url.pathname==="/api/search"){try{return send(res,200,await searchEbay(url.searchParams));}catch(error){return send(res,502,{error:error.message||"Search unavailable"});}}
  if(req.method==="GET"&&url.pathname==="/api/sold")return send(res,200,{available:false,items:[],message:"Verified sold-history access is not connected. eBay Marketplace Insights access is restricted; no sold prices are fabricated or scraped."});
  if(req.method!=="GET")return send(res,405,{error:"Method not allowed"});
  const requested=url.pathname==="/"? "index.html":decodeURIComponent(url.pathname.slice(1));
  const safePath=normalize(requested).replace(/^([.][.][/\\])+/, ""),file=join(PUBLIC,safePath);
  if(!file.startsWith(PUBLIC))return send(res,403,{error:"Forbidden"});
  try{const body=await readFile(file);res.writeHead(200,{"Content-Type":mime[extname(file)]||"application/octet-stream","X-Content-Type-Options":"nosniff"});res.end(body);}catch{send(res,404,"Not found","text/plain; charset=utf-8");}
});
server.listen(PORT,()=>console.log("POKÉMARKET running on port "+PORT));
