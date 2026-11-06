// TCG collector discovery labels are heuristics based only on seller titles.
// Never claim that a listing is authentic, safe, fairly priced or verified.
const lotsPattern=/\b(?:bulk\s+(?:lots?|cards?)|card\s+lots?|lots?\s+of\s+\d+|mixed\s+(?:card|tcg)|random\s+(?:cards?|lots?)|mystery\s+(?:cards?|lots?|pack)|assorted\s+(?:cards?|lot)|\d{2,4}\s*(?:x\s*)?(?:cards?|pcs?|pieces)|(?:\d+)\s*card\s+(?:sets?|lots?|bundles?|collections?)|(?:tcg|trading cards?)\s+sets?\s+of\s+\d+|complete\s+(?:master\s+)?sets?)\b/i;
const proxyPattern=/\b(?:proxy|replica|orica|unofficial|fan[\s-]*made|reprint|reproduction|counterfeit|custom\s*(?:art|print|card)|fake\s+(?:card|tcg))\b/i;
const genericPattern=/\b(?:anime\s+trading|mixed\s+random|mystery|random\s+lot|generic\s+tcg)\b/i;
export function collectorKind(item){
 const category=String(item?.productType||"RAW").toUpperCase();
 if(category==="SEALED"||category==="GRADED"||category==="ACCESSORIES")return category;
 const title=String(item?.title||"");
 if(lotsPattern.test(title))return "LOT";
 return "SINGLE";
}
export function listingWarning(item){
 const title=String(item?.title||"");
 if(proxyPattern.test(title))return "Seller title mentions reprints, replicas or custom cards — verify the description.";
 if(genericPattern.test(title))return "Generic or mixed-card listing — inspect the exact contents.";
 return "";
}
export function collectorScore(item){
 const kind=collectorKind(item);
 let score={GRADED:7,SEALED:6,SINGLE:5,ACCESSORIES:3,LOT:0}[kind]??0;
 const title=String(item?.title||"");
 if(/\b\d{1,4}\s*\/\s*\d{1,4}\b|\b1st\s*edition\b|\bfirst\s*edition\b/i.test(title))score+=2;
 if(/\b(?:psa|bgs|cgc|sgc)\s*(?:10|9\.5|9|8\.5|8|7|6)\b/i.test(title))score+=1;
 if(listingWarning(item))score-=8;
 return score;
}
export function filterCollectorListings(items,mode="COLLECTOR"){
 const all=Array.isArray(items)?items:[];
 if(mode==="ALL")return all;
 if(mode==="LOTS")return all.filter(x=>collectorKind(x)==="LOT");
 if(mode==="SINGLES")return all.filter(x=>collectorKind(x)==="SINGLE"&&!listingWarning(x));
 if(mode==="COLLECTOR")return all.filter(x=>collectorKind(x)!=="LOT"&&!listingWarning(x));
 return all;
}
export function sortCollectorListings(items){
 return [...(items||[])].sort((a,b)=>collectorScore(b)-collectorScore(a));
}
