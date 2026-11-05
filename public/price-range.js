// Shared listing-price validation for eBay searches and the mobile display.
// Boundaries are inclusive, specified in the selected marketplace currency.
// Shipping, tax and currency conversion are NOT silently added to listing prices.
function parsePrice(raw,field){
 const value=raw==null?"":String(raw).trim();
 if(!value)return null;
 if(!/^(?:\d+)(?:\.\d{1,2})?$/.test(value))throw new Error(field+" must be a valid non-negative amount with up to 2 decimals.");
 const cents=Math.round(Number(value)*100);
 if(!Number.isSafeInteger(cents)||cents<0||cents>100000000000)throw new Error(field+" is outside the supported price range.");
 return cents;
}
export function priceBounds(input={}){
 const minCents=parsePrice(input.minPrice,"Minimum price");
 const maxCents=parsePrice(input.maxPrice,"Maximum price");
 if(minCents!=null&&maxCents!=null&&minCents>maxCents)throw new Error("Minimum price cannot be higher than maximum price.");
 return {minCents,maxCents,active:minCents!==null||maxCents!==null};
}
export function itemInPriceRange(item,bounds,currency){
 if(!bounds.active)return true;
 if(item?.price===null||item?.price===undefined||item?.price==="")return false;
 const actual=Number(item.price);
 if(!Number.isFinite(actual)||actual<0||item.currency!==currency)return false;
 const cents=Math.round(actual*100);
 return (bounds.minCents===null||cents>=bounds.minCents)&&(bounds.maxCents===null||cents<=bounds.maxCents);
}
export function sortByListingPrice(items,sort,currency){
 if(sort!=="priceAsc"&&sort!=="priceDesc")return items;
 const direction=sort==="priceDesc"?-1:1;
 return [...items].sort((a,b)=>{
  const valid=x=>x.price!==null&&x.price!==undefined&&x.price!==""&&Number.isFinite(Number(x.price))&&x.currency===currency;
  const av=valid(a),bv=valid(b);
  if(!av||!bv)return av?-1:bv?1:0;
  return direction*(Math.round(Number(a.price)*100)-Math.round(Number(b.price)*100));
 });
}
