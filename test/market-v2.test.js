import test from "node:test";
import assert from "node:assert/strict";
import {closingWithin,amountFor,withinBudget,sampleMedian,isFilterMatch,sortListingsByCost} from "../public/market-v2.js";
import {priceBounds} from "../public/price-range.js";
const now=Date.parse("2026-11-06T02:30:00Z");
const auction=(min,props={})=>({id:String(min),url:"https://www.ebay.com.au/itm/"+min,endTime:new Date(now+min*60000).toISOString(),buyingOptions:["AUCTION"],...props});
test("auction radar respects 10-minute limit and drops expired entries",()=>{
 const entries=[auction(-1),auction(0),auction(4),auction(10),auction(11),auction(72),{...auction(2),endTime:"bad"}, {...auction(2),buyingOptions:["FIXED_PRICE"]}];
 assert.deepEqual(closingWithin(entries,10,now).map(i=>Number(i.id)),[4,10]);
 assert.deepEqual(closingWithin(entries,5,now).map(i=>Number(i.id)),[4]);
 assert.deepEqual(closingWithin(entries,10,now+5*60000).map(i=>Number(i.id)),[10,11]);
});
test("total-price filter counts known shipping and never assumes unknown shipping is free",()=>{
 const bounds=priceBounds({minPrice:"220",maxPrice:"280"});
 const base={price:215,currency:"AUD",shipping:10,shippingCurrency:"AUD"};
 assert.equal(amountFor(base,"total","AUD"),225);
 assert.equal(withinBudget(base,bounds,"AUD","total"),true);
 assert.equal(withinBudget(base,bounds,"AUD","item"),false);
 assert.equal(withinBudget({...base,shipping:null},bounds,"AUD","total"),false);
 assert.equal(withinBudget({...base,shippingCurrency:"USD"},bounds,"AUD","total"),false);
 assert.equal(withinBudget({...base,price:281},bounds,"AUD","total"),false);
 assert.equal(withinBudget({...base,shipping:null},priceBounds({}),"AUD","total"),true);
});
test("median uses same-currency listing prices only and handles even samples",()=>{
 const rows=[{price:10,currency:"AUD"},{price:30,currency:"AUD"},{price:100,currency:"USD"},{price:null,currency:"AUD"}];
 assert.deepEqual(sampleMedian(rows,"AUD"),{count:2,median:20,min:10,max:30});
});
test("filters combine card number language grade and categories",()=>{
 const item={productType:"GRADED",title:"Pokemon Charizard 199/165 English PSA 10",condition:"Used"};
 assert.equal(isFilterMatch(item,{gradeFilter:"PSA 10",languageFilter:"ENGLISH",cardNumberFilter:"199/165"},"GRADED"),true);
 assert.equal(isFilterMatch(item,{gradeFilter:"RAW"},"ALL"),false);
 assert.equal(isFilterMatch(item,{languageFilter:"JAPANESE"},"ALL"),false);
 assert.equal(isFilterMatch(item,{cardNumberFilter:"199/166"},"ALL"),false);
});

test("sorting total cost correctly includes known postage",()=>{
 const rows=[
  {id:"cheap-item",price:30,shipping:20,currency:"AUD",shippingCurrency:"AUD"},
  {id:"cheap-total",price:35,shipping:0,currency:"AUD",shippingCurrency:"AUD"},
  {id:"unknown",price:1,shipping:null,currency:"AUD",shippingCurrency:null}
 ];
 assert.deepEqual(sortListingsByCost(rows,"priceAsc","AUD","total").map(x=>x.id),["cheap-total","cheap-item","unknown"]);
 assert.deepEqual(sortListingsByCost(rows,"priceDesc","AUD","total").map(x=>x.id),["cheap-item","cheap-total","unknown"]);
});
