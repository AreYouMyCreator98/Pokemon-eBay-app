import test from "node:test";
import assert from "node:assert/strict";
import {identityOf,sameProduct,evaluateAskingOpportunity,evaluateEarlySignal,findAskingOpportunities,findTieredAskingOpportunities} from "../public/ebay-comparables.js";
const now=Date.parse("2026-11-06T07:00:00Z");
const base={productType:"GRADED",title:"Pokemon 151 Charizard ex 199/165 PSA 10",condition:"Used",
 price:200,shipping:10,shippingCurrency:"AUD",currency:"AUD",buyingOptions:["FIXED_PRICE"],seller:"target",url:"https://www.ebay.com.au/itm/1",id:"1"};
const peer=(n,p,title=base.title)=>({...base,title,id:String(n),url:"https://www.ebay.com.au/itm/"+n,seller:"shop"+n,price:p,shipping:10});
test("exact graded card matches independent of title word order",()=>{
 assert.deepEqual(identityOf(base)?.grade,"PSA 10");
 assert.equal(sameProduct(base,peer(2,300,"PSA 10 Charizard ex Pokemon 151 199/165")),true);
 assert.equal(sameProduct(base,peer(2,300,base.title.replace("PSA 10","PSA 9"))),false);
 assert.equal(sameProduct(base,peer(2,300,base.title.replace("199/165","198/165"))),false);
 assert.equal(sameProduct(base,peer(2,300,base.title.replace("151","Base Set"))),false);
 assert.equal(sameProduct(base,peer(2,300,base.title+" Japanese")),false);
});
test("strict rule excludes unknown grade, collector lots, unknown sets or condition",()=>{
 assert.equal(identityOf({...base,title:"Pokemon rare Charizard card PSA 10"}),null);
 assert.equal(identityOf({...base,title:base.title+" lot of 10"}),null);
 assert.equal(identityOf({...base,productType:"RAW"}),null);
});
test("sealed booster bundle display is not a booster bundle or a booster box",()=>{
 const b={...base,productType:"SEALED",title:"Pokemon Prismatic Evolutions Booster Bundle Display sealed",condition:"New"};
 assert.ok(identityOf(b));
 assert.equal(sameProduct(b,{...b,title:"Pokemon Prismatic Evolutions Booster Bundle sealed"}),false);
 assert.equal(sameProduct(b,{...b,title:"Pokemon Prismatic Evolutions Booster Box sealed"}),false);
 assert.equal(sameProduct(b,{...b,title:"Pokemon Prismatic Evolutions Booster Bundle Display Japanese sealed"}),false);
});
test("three distinct sellers, postage-inclusive AUD peers, lower quartile",()=>{
 const d=evaluateAskingOpportunity(base,[peer(2,310),peer(3,340),peer(4,360),peer(5,380)],{currency:"AUD",now,minDiscount:15});
 assert.equal(d.peerCount,4);
 assert.equal(d.listedTotal,210);
 assert.equal(d.reference,320);
 assert.equal(d.discountPercent,34.4);
 assert.equal(d.confidence,"Limited");
 assert.equal(d.comparables.length,4);
});
test("unknown postage, no seller, unrelated card and duplicate seller cannot inflate samples",()=>{
 const refs=[peer(2,310),peer(3,340),peer(4,360)];
 assert.equal(evaluateAskingOpportunity({...base,shipping:null},refs,{currency:"AUD",now}),null);
 assert.equal(evaluateAskingOpportunity(base,refs.slice(0,2),{currency:"AUD",now}),null);
 assert.equal(evaluateAskingOpportunity(base,[refs[0],{...refs[1],seller:"shop2"},refs[2]],{currency:"AUD",now}),null);
 assert.equal(evaluateAskingOpportunity(base,refs.map(x=>({...x,currency:"USD"})),{currency:"AUD",now}),null);
 assert.equal(evaluateAskingOpportunity(base,refs.map(x=>({...x,shipping:null})),{currency:"AUD",now}),null);
});
test("an auction current bid must never be shown as a good deal",()=>{
 assert.equal(evaluateAskingOpportunity({...base,buyingOptions:["AUCTION"]},[peer(2,310),peer(3,340),peer(4,360)],{currency:"AUD",now}),null);
});
test("a listing below median but above lower quartile does not get a deal badge",()=>{
 const t={...base,price:315};
 assert.equal(evaluateAskingOpportunity(t,[peer(2,300),peer(3,500),peer(4,750)],{currency:"AUD",minDiscount:15,now}),null);
});
test("only one opportunity survives repeated target listings",()=>{
 const peers=[peer(2,310),peer(3,340),peer(4,360)];
 const found=findAskingOpportunities([base,base],peers,{currency:"AUD",now});
 assert.equal(found.deals.length,1);
});

test("two independent peers can create a potential bargain, never a strong signal",()=>{
 const universe=[peer(2,310),peer(3,340)];
 const signals=findTieredAskingOpportunities([base],universe,{currency:"AUD",now,minDiscount:15});
 assert.equal(signals.deals.length,0);
 assert.equal(signals.potential.length,1);
 assert.equal(signals.watchlist.length,0);
 assert.equal(signals.potential[0].tier,"POTENTIAL");
 assert.equal(signals.potential[0].peerCount,2);
 assert.equal(signals.potential[0].reference,320); // lowest asking price, not a market quote
 assert.equal(signals.potential[0].discountPercent,34.4);
});
test("single peer is watchlist-only with no invented discount percentage",()=>{
 const lead=evaluateEarlySignal(base,[peer(2,310)],{currency:"AUD",minDiscount:15,now});
 assert.equal(lead.tier,"WATCHLIST");
 assert.equal(lead.discountPercent,null);
 assert.equal(lead.peerCount,1);
 assert.equal(evaluateAskingOpportunity(base,[peer(2,310)],{currency:"AUD",now}),null);
});
test("one seller cannot be counted twice and unknown postage cannot make a bargain",()=>{
 assert.equal(evaluateEarlySignal(base,[peer(2,310),{...peer(3,350),seller:"shop2"}],{currency:"AUD",now})?.tier,"WATCHLIST");
 assert.equal(evaluateEarlySignal({...base,shipping:null},[peer(2,310),peer(3,340)],{currency:"AUD",now}),null);
 assert.equal(evaluateEarlySignal(base,[peer(2,310),{...peer(3,340),currency:"USD"}],{currency:"AUD",now})?.tier,"WATCHLIST");
 assert.equal(evaluateEarlySignal(base,[peer(2,310),peer(3,340),peer(4,370)],{currency:"AUD",now}),null);
});
test("strong tier never reappears as a potential or watchlist result",()=>{
 const matches=[peer(2,310),peer(3,340),peer(4,370)];
 const result=findTieredAskingOpportunities([base,base],matches,{currency:"AUD",now,minDiscount:15});
 assert.equal(result.deals.length,1);
 assert.equal(result.potential.length,0);
 assert.equal(result.watchlist.length,0);
});
test("an apparently cheap but unrelated slab cannot become an early signal",()=>{
 const different=peer(2,310,"Pokemon 151 Charizard ex 199/165 PSA 9");
 assert.equal(evaluateEarlySignal(base,[different],{currency:"AUD",now}),null);
 assert.equal(evaluateEarlySignal({...base,buyingOptions:["AUCTION"]},[peer(2,310)],{currency:"AUD",now}),null);
});
