import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeSearchPlan,scoreSearchItem} from "../smart-search.js";
import {classifyTCGListing} from "../tcg-only.js";
import {priceBounds,itemInPriceRange,sortByListingPrice} from "../public/price-range.js";

const file=readFileSync(new URL("../server.js",import.meta.url),"utf8");
const searchFunction=file.slice(file.indexOf("async function searchEbay(params) {"),file.indexOf("const server=http.createServer"));
const fixture=(id,amount,currency="AUD",auction=false)=>({
 itemId:String(id),title:"Pokemon Prismatic Evolutions Booster Bundle Display "+id,
 itemWebUrl:"https://www.ebay.com.au/itm/"+id,
 buyingOptions:[auction?"AUCTION":"FIXED_PRICE"],
 ...(auction?{currentBidPrice:{value:String(amount),currency}}:{price:amount==null?null:{value:String(amount),currency}})
});
function createMockSearch(){
 const requests=[];
 const items=[
  fixture(1,219.99),fixture(2,220),fixture(3,245),fixture(4,280),
  fixture(5,280.01),fixture(6,319),fixture(7,250,"USD"),
  fixture(8,null),fixture(9,275,"AUD",true)
 ];
 const fakeFetch=async input=>{
  const url=new URL(input);
  requests.push(url.searchParams);
  return {ok:true,json:async()=>({itemSummaries:items,total:items.length})};
 };
 const make=new Function("makeSearchPlan","scoreSearchItem","classifyTCGListing",
  "priceBounds","itemInPriceRange","sortByListingPrice","MARKETPLACES",
  "clean","ebayToken","fetch","URLSearchParams",searchFunction+"return searchEbay;");
 const search=make(makeSearchPlan,scoreSearchItem,classifyTCGListing,
  priceBounds,itemInPriceRange,sortByListingPrice,
  {AU:{id:"EBAY_AU",currency:"AUD"}},(value,max=120)=>String(value||"").trim().slice(0,max),
  async()=>"mock-token",fakeFetch,URLSearchParams);
 return {search,requests};
}
test("eBay price range carries AUD and strictly excludes out-of-budget and unpriced results",async()=>{
 const {search,requests}=createMockSearch();
 const result=await search(new URLSearchParams({
  q:"pokemon prismatic evolutions booster bundle display",marketplace:"AU",type:"ALL",
  minPrice:"220",maxPrice:"280",smart:"0",sort:"priceAsc"
 }));
 assert.equal(requests.length,1);
 const filters=requests[0].get("filter");
 assert.match(filters,/price:\[220\.\.280\]/);
 assert.match(filters,/priceCurrency:AUD/);
 assert.equal(requests[0].get("sort"),"price");
 assert.deepEqual(result.items.map(item=>item.price),[220,245,275,280]);
 assert.ok(result.items.every(item=>item.currency==="AUD"));
});
test("descending budget sort respects current auction bids and eBay sort convention",async()=>{
 const {search,requests}=createMockSearch();
 const result=await search(new URLSearchParams({
  q:"pokemon prismatic evolutions booster bundle display",marketplace:"AU",type:"ALL",
  minPrice:"220",maxPrice:"280",smart:"0",sort:"priceDesc"
 }));
 assert.equal(requests[0].get("sort"),"-price");
 assert.deepEqual(result.items.map(item=>item.price),[280,275,245,220]);
});
test("invalid price range fails before contacting eBay",async()=>{
 const {search,requests}=createMockSearch();
 await assert.rejects(()=>search(new URLSearchParams({
  q:"pokemon trading card",marketplace:"AU",minPrice:"300",maxPrice:"220"
 })),/Minimum price cannot be higher/);
 assert.equal(requests.length,0);
});
