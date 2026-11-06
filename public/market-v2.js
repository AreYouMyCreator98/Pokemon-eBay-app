// Pure marketplace calculations, shared between browser and Node tests.
// eBay prices, bids and shipping estimates retain their original currency.
export function minutesUntil(end,now=Date.now()){
 const endMs=Date.parse(String(end||""));
 return Number.isFinite(endMs)?(endMs-now)/60000:NaN;
}
export function closingWithin(items,minutes=10,now=Date.now()){
 const window=Number(minutes);
 if(!Number.isFinite(window)||window<=0)return [];
 return (items||[]).filter(item=>
  (item?.buyingOptions||[]).includes("AUCTION") &&
  item.url && Number.isFinite(minutesUntil(item.endTime,now)) &&
  minutesUntil(item.endTime,now)>0 && minutesUntil(item.endTime,now)<=window
 ).sort((a,b)=>Date.parse(a.endTime)-Date.parse(b.endTime));
}
export function amountFor(item,mode="item",currency=null){
 const price=item?.price;
 if(price===null||price===undefined||price===""||!Number.isFinite(Number(price))||Number(price)<0)return null;
 if(currency && item.currency!==currency)return null;
 let cents=Math.round(Number(price)*100);
 if(mode==="total"){
  const shipping=item?.shipping;
  if(shipping===null||shipping===undefined||shipping===""||!Number.isFinite(Number(shipping))||Number(shipping)<0)return null;
  if(item.shippingCurrency!==item.currency)return null;
  cents+=Math.round(Number(shipping)*100);
 }
 return Number.isSafeInteger(cents)?cents/100:null;
}
export function withinBudget(item,bounds,currency,mode="item"){
 if(!bounds?.active)return true;
 const amount=amountFor(item,mode,currency);
 if(amount===null)return false;
 const cents=Math.round(amount*100);
 return (bounds.minCents===null||cents>=bounds.minCents) &&
   (bounds.maxCents===null||cents<=bounds.maxCents);
}
export function sampleMedian(items,currency,mode="item"){
 const values=(items||[]).map(item=>amountFor(item,mode,currency)).filter(v=>v!==null).sort((a,b)=>a-b);
 if(!values.length)return {count:0,median:null,min:null,max:null};
 const mid=Math.floor(values.length/2);
 return {count:values.length,median:values.length%2?values[mid]:(values[mid-1]+values[mid])/2,min:values[0],max:values[values.length-1]};
}
export function isFilterMatch(item,filters={},category="ALL"){
 const title=String(item?.title||"").toLowerCase(),cat=String(item?.productType||"RAW").toUpperCase(),condition=String(item?.condition||"").toUpperCase();
 const set=String(filters.setFilter||"").toLowerCase(),grade=String(filters.gradeFilter||"").toLowerCase(),language=String(filters.languageFilter||"").toLowerCase(),number=String(filters.cardNumberFilter||"").trim().toLowerCase();
 if(category!=="ALL"&&cat!==category)return false;
 if(set&&!title.includes(set))return false;
 if(number&&!title.includes(number))return false;
 if(grade){
  if(grade==="raw"){if(cat!=="RAW")return false;}
  else if(!title.includes(grade))return false;
 }
 if(language){
  const known={ENGLISH:/\benglish\b|\beng\b/i,JAPANESE:/\bjapanese\b|\bjapan\b|\bjp\b/i,KOREAN:/\bkorean\b|\bkorea\b|\bkr\b/i,CHINESE:/\bchinese\b|\bchina\b|\bcn\b/i};
  if(!known[language.toUpperCase()]?.test(title))return false;
 }
 const cf=String(filters.conditionFilter||"");
 if(cf==="FACTORY" && !/factory sealed|sealed/i.test(title))return false;
 if(cf&&cf!=="FACTORY"&&!condition.includes(cf))return false;
 return true;
}

export function sortListingsByCost(items,sort,currency,mode="item"){
 if(!["priceAsc","priceDesc"].includes(sort))return items;
 const direction=sort==="priceDesc"?-1:1;
 return [...items].sort((a,b)=>{
  const av=amountFor(a,mode,currency),bv=amountFor(b,mode,currency);
  if(av===null||bv===null)return av===null?(bv===null?0:1):-1;
  return direction*(Math.round(av*100)-Math.round(bv*100));
 });
}
