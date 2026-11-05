import test from "node:test";
import assert from "node:assert/strict";
import {priceBounds,itemInPriceRange,sortByListingPrice} from "../public/price-range.js";

test("AUD 220–280 is strictly inclusive and never displays 300+",()=>{
 const bounds=priceBounds({minPrice:"220",maxPrice:"280"});
 for(const amount of [220,229.99,250,279.99,280])assert.equal(itemInPriceRange({price:amount,currency:"AUD"},bounds,"AUD"),true,String(amount));
 for(const amount of [0,199,219.99,280.01,300,319.99,999])assert.equal(itemInPriceRange({price:amount,currency:"AUD"},bounds,"AUD"),false,String(amount));
});
test("filters out missing prices and unconverted currencies when price limits are active",()=>{
 const bounds=priceBounds({minPrice:"220",maxPrice:"280"});
 for(const price of [null,undefined,"",NaN,Infinity,"unavailable"])assert.equal(itemInPriceRange({price,currency:"AUD"},bounds,"AUD"),false,String(price));
 assert.equal(itemInPriceRange({price:245,currency:"USD"},bounds,"AUD"),false);
 assert.equal(itemInPriceRange({price:245,currency:"AUD"},bounds,"AUD"),true);
});
test("single-sided price limits also work",()=>{
 assert.equal(itemInPriceRange({price:550,currency:"AUD"},priceBounds({minPrice:"500"}),"AUD"),true);
 assert.equal(itemInPriceRange({price:499.99,currency:"AUD"},priceBounds({minPrice:"500"}),"AUD"),false);
 assert.equal(itemInPriceRange({price:100,currency:"AUD"},priceBounds({maxPrice:"100"}),"AUD"),true);
 assert.equal(itemInPriceRange({price:100.01,currency:"AUD"},priceBounds({maxPrice:"100"}),"AUD"),false);
});
test("invalid, negative and inverted prices are rejected instead of silently ignored",()=>{
 for(const range of [{minPrice:"300",maxPrice:"220"},{minPrice:"-1"},{maxPrice:"45.999"},{minPrice:"abc"},{maxPrice:"Infinity"}])assert.throws(()=>priceBounds(range));
});
test("listing-price sort is numeric and puts unknown/wrong-currency amounts last",()=>{
 const items=[{id:"A",price:400,currency:"AUD"},{id:"B",price:245,currency:"AUD"},{id:"C",price:null,currency:"AUD"},{id:"D",price:280,currency:"AUD"},{id:"E",price:100,currency:"USD"}];
 assert.deepEqual(sortByListingPrice(items,"priceAsc","AUD").map(x=>x.id),["B","D","A","C","E"]);
 assert.deepEqual(sortByListingPrice(items,"priceDesc","AUD").map(x=>x.id),["A","D","B","C","E"]);
});
