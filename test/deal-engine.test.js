import test from "node:test";
import assert from "node:assert/strict";
import {calculateDeal,evaluateDeals,exactMatch,validateBenchmark} from "../public/deal-engine.js";
const now=Date.parse("2026-11-06T03:00:00Z");
const quote={approved:true,source:"PriceCharting",family:"pricecharting",productName:"Charizard ex #199/165",productType:"GRADED",currency:"AUD",value:400,asOf:"2026-11-05T00:00:00Z",basis:"GUIDE",grader:"PSA",grade:"10",matchPhrases:["Charizard","199/165","151"]};
const listing={id:"1",title:"Pokemon 151 Charizard ex 199/165 PSA 10 graded",productType:"GRADED",condition:"USED",price:260,shipping:20,currency:"AUD",shippingCurrency:"AUD",buyingOptions:["FIXED_PRICE"],url:"https://www.ebay.com.au/itm/1"};
test("zero authorised benchmarks means zero manufactured deals",()=>{
 assert.deepEqual(evaluateDeals([listing],[],{marketplace:"AU",now}),[]);
 assert.equal(validateBenchmark({...quote,approved:false},now),null);
 assert.equal(validateBenchmark({...quote,asOf:"2024-01-01T00:00:00Z"},now),null);
});
test("exact same card number and grade required",()=>{
 const q=validateBenchmark(quote,now);
 assert.equal(exactMatch(listing,q),true);
 assert.equal(exactMatch({...listing,title:"Pokemon 151 Charizard ex 198/165 PSA 10"},q),false);
 assert.equal(exactMatch({...listing,title:"Pokemon 151 Charizard ex 199/165 PSA 9"},q),false);
 assert.equal(exactMatch({...listing,productType:"RAW"},q),false);
});
test("total eBay cost, same currency and fresh approved quote determine discount",()=>{
 const d=calculateDeal(listing,[quote],{marketplace:"AU",now,minDiscount:15});
 assert.equal(d.discountPercent,30);
 assert.equal(d.listedTotal,280);
 assert.equal(d.confidence,"Review");
 assert.equal(calculateDeal({...listing,shipping:null},[quote],{marketplace:"AU",now}),null);
 assert.equal(calculateDeal({...listing,price:390},[quote],{marketplace:"AU",now}),null);
 assert.equal(calculateDeal(listing,[quote],{marketplace:"US",now}),null);
});
test("auction current bids must not be marketed as guaranteed deals",()=>{
 assert.equal(calculateDeal({...listing,buyingOptions:["AUCTION"]},[quote],{marketplace:"AU",now}),null);
});
test("seller-described lots/proxies cannot be considered exact matches",()=>{
 const q=validateBenchmark(quote,now);
 assert.equal(exactMatch({...listing,title:listing.title+" Lot of 10"},q),false);
 assert.equal(exactMatch({...listing,title:listing.title+" replica"},q),false);
});
test("two independent aligned benchmark families increase confidence, not guarantee",()=>{
 const quotes=[quote,{...quote,source:"Collectr",family:"tcgplayer-derived",value:410},{...quote,source:"TCGplayer",family:"tcgplayer-derived",value:405}];
 const deals=evaluateDeals([listing,listing],quotes,{marketplace:"AU",now});
 assert.equal(deals.length,1);
 assert.equal(deals[0].confidence,"Higher");
 assert.equal(deals[0].reference,400);
});
