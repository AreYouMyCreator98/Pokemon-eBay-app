// Conservative same-currency eBay Buy It Now price comparisons.
// These are live ASKING prices, NOT sold transactions or appraised market values.
// Never imply a listing is authentic, actually in stock or guaranteed below market.
import {amountFor} from "./market-v2.js";
import {collectorKind,listingWarning} from "./collector-quality.js";

const SETS=[
 ["prismatic evolutions",/\bprismatic\s+evolutions\b/i],
 ["surging sparks",/\bsurging\s+sparks\b/i],
 ["evolving skies",/\bevolving\s+skies\b/i],
 ["paldean fates",/\bpaldean\s+fates\b/i],
 ["shining fates",/\bshining\s+fates\b/i],
 ["twilight masquerade",/\btwilight\s+masquerade\b/i],
 ["stellar crown",/\bstellar\s+crown\b/i],
 ["temporal forces",/\btemporal\s+forces\b/i],
 ["paradox rift",/\bparadox\s+rift\b/i],
 ["obsidian flames",/\bobsidian\s+flames\b/i],
 ["silver tempest",/\bsilver\s+tempest\b/i],
 ["lost origin",/\blost\s+origin\b/i],
 ["fusion strike",/\bfusion\s+strike\b/i],
 ["chilling reign",/\bchilling\s+reign\b/i],
 ["base set",/\bbase\s+set\b/i],
 ["jungle",/\bjungle\b/i],
 ["fossil",/\bfossil\b/i],
 ["pokemon 151",/\b(?:pokemon\s*)?151\b|\bsv2a\b|\bsv\s*151\b/i],
 ["op05",/\bop[\s-]?0?5\b|\bawakening\s+of\s+the\s+new\s+era\b/i],
 ["op06",/\bop[\s-]?0?6\b|\bwings\s+of\s+the\s+captain\b/i],
 ["op09",/\bop[\s-]?0?9\b|\bemperors\s+in\s+the\s+new\s+world\b/i],
 ["op13",/\bop[\s-]?13\b|\bcarrying\s+on\s+his\s+will\b/i],
 ["pokemon team rocket",/\bteam\s+rocket\b/i]
];
const NOISE=new Set([
 "pokemon","pokémon","tcg","card","cards","trading","game","psa","bgs","cgc","sgc","ace",
 "graded","grading","holo","foil","rare","mint","near","nm","lightly","played","lp",
 "new","used","raw","excellent","genuine","authentic","original","collectable","collectible",
 "japanese","english","korean","chinese","sealed","factory","edition","first","1st",
 "pack","booster","box","bundle","display","elite","trainer","etb","lot","sale","free",
 "shipping","mint","gem","ultra","cardboard","official","collectors","collection","single",
 "charizard" // removed only from generic token ID when it is the ONLY name? see below
]);
const normalize=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9/]+/g," ").trim().replace(/\s+/g," ");
const lang=s=>{
 const t=String(s||"");
 if(/\b(japanese|jp|jpn)\b/i.test(t))return "JP";
 if(/\b(english|eng)\b/i.test(t))return "EN";
 if(/\b(korean|kor)\b/i.test(t))return "KR";
 if(/\b(chinese|chn)\b/i.test(t))return "CN";
 return "UNSPECIFIED";
};
const slab=s=>{
 const m=String(s||"").match(/\b(PSA|BGS|CGC|SGC|ACE)\s*(?:gem\s*mint\s*)?(10|[1-9](?:\.5)?)\b/i);
 return m?m[1].toUpperCase()+" "+m[2]:"";
};
const setFrom=s=>SETS.find(([,pattern])=>pattern.test(s))?.[0]||"";
const cardNumber=s=>String(s||"").match(/\b\d{1,4}\s*\/\s*\d{1,4}\b/)?.[0].replace(/\s+/g,"")||"";
const edition=s=>{
 const t=String(s||"");
 return [
  /\b(1st|first)\s*edition\b/i.test(t)?"FIRST":"UNLIMITED",
  /\bshadowless\b/i.test(t)?"SHADOWLESS":"STANDARD",
  /\breverse\s+holo\b/i.test(t)?"REVERSE":/\bholo(?:foil|graphic)?\b/i.test(t)?"HOLO":"UNSPECIFIED"
 ].join("|");
};
const format=s=>{
 const t=String(s||"");
 if(/\bcase\s+of\b|\bbooster\s+case\b|\bmaster\s+case\b/i.test(t))return "CASE";
 if(/\bbooster\s+bundle\s+display\b/i.test(t))return "BUNDLE DISPLAY";
 if(/\bbooster\s+bundle\b/i.test(t))return "BUNDLE";
 if(/\bbooster\s+box\b|\b(?:bb|b\b)\s*box\b/i.test(t))return "BOOSTER BOX";
 if(/\b(elite\s+trainer\s+box|etb)\b/i.test(t))return "ETB";
 if(/\bbooster\s+pack\b/i.test(t))return "PACK";
 return "";
};
function nameTokens(s,identitySet){
 let t=normalize(s);
 t=t.replace(/\b\d{1,4}\s*\/\s*\d{1,4}\b/g," ").replace(/\b(?:psa|bgs|cgc|sgc|ace)\s*(?:gem\s*mint\s*)?(?:10|[1-9](?:\.5)?)\b/g," ");
 t=t.replace(/\b(?:pokemon|pokémon|one piece|yugioh|yu gi oh|magic the gathering)\b/g," ");
 if(identitySet)t=t.replace(normalize(identitySet)," ");
 const tokens=t.split(/\s+/).filter(v=>v.length>=3&&!/^\d+$/.test(v)&&!NOISE.has(v));
 return [...new Set(tokens)].slice(0,8);
}
const unsafe=s=>/\b(?:proxy|reprint|replica|custom|orica|fake|damaged|empty\s+box|box\s+only|not\s+sealed|unsealed|mystery|bulk|assorted|random|lot\s+of|joblot|lots?\s+of|case\s+of|preorder|pre-order)\b/i.test(s);
const multi=s=>/\b(?:[2-9]\d*\s*(?:x|pcs?|cards?|packs?|boxes)|[2-9]\d*\s*pack\s+lots?|sets?\s+of\s+[2-9]|lot\s+of\s+[2-9])\b/i.test(s);
const rawCondition=(item)=>{
 const t=String(item?.title||"")+" "+String(item?.condition||"");
 if(/\b(?:damaged|dmg|heavily played|hp)\b/i.test(t))return "BAD";
 if(/\b(?:moderately played|mp)\b/i.test(t))return "MP";
 if(/\b(?:lightly played|lp)\b/i.test(t))return "LP";
 if(/\b(?:near mint|nm|mint condition)\b/i.test(t))return "NM";
 return "UNKNOWN";
};
export function identityOf(item){
 if(!item||!["RAW","GRADED","SEALED"].includes(item.productType))return null;
 if(collectorKind(item)==="LOT"||listingWarning(item))return null;
 const title=String(item.title||"");
 if(unsafe(title)||multi(title))return null;
 const set=setFrom(title),language=lang(title);
 if(!set)return null;
 if(item.productType==="SEALED"){
  const productFormat=format(title);
  if(!productFormat||productFormat==="CASE")return null;
  if(!/\bnew\b|\bsealed\b/i.test(String(item.condition||"")+" "+title))return null;
  return {kind:"SEALED",set,productFormat,language,edition:edition(title)};
 }
 const num=cardNumber(title),grade=item.productType==="GRADED"?slab(title):"";
 if(!num||(item.productType==="GRADED"&&!grade))return null;
 // At least one distinct character/card name word must survive the generic words.
 // The name is validated by overlapping tokens, never by card number alone.
 const names=nameTokens(title,set);
 if(names.length<1)return null;
 const condition=item.productType==="RAW"?rawCondition(item):"SLAB";
 if(condition==="BAD"||condition==="UNKNOWN")return null;
 return {kind:item.productType,set,number:num,language,grade,condition,edition:edition(title),names};
}
export function sameProduct(a,b){
 const x=identityOf(a),y=identityOf(b);
 if(!x||!y)return false;
 for(const key of ["kind","set","language","edition","grade","condition","number","productFormat"]){
  if((x[key]||"")!==(y[key]||""))return false;
 }
 if(x.kind==="SEALED")return true;
 const shared=x.names.filter(t=>y.names.includes(t));
 return shared.length>=1;
}
const median=nums=>{
 const a=[...nums].sort((x,y)=>x-y);const m=Math.floor(a.length/2);
 return a.length%2?a[m]:(a[m-1]+a[m])/2;
};
export function evaluateAskingOpportunity(target,universe,{currency="AUD",minDiscount=15,minPeers=3,now=Date.now()}={}){
 if(!identityOf(target))return null;
 if(!(target.buyingOptions||[]).includes("FIXED_PRICE")||(target.buyingOptions||[]).includes("AUCTION"))return null;
 const total=amountFor(target,"total",currency);
 if(total===null||total<=0)return null;
 const peerBySeller=new Map();
 for(const other of universe||[]){
  if(!other||other.id===target.id||other.url===target.url||!sameProduct(target,other))continue;
  if(!(other.buyingOptions||[]).includes("FIXED_PRICE")||(other.buyingOptions||[]).includes("AUCTION"))continue;
  const cost=amountFor(other,"total",currency);
  if(cost===null||cost<=0)continue;
  const seller=String(other.seller||"").trim().toLowerCase();
  if(!seller||seller==="seller details on ebay"||seller===String(target.seller||"").toLowerCase())continue;
  const prev=peerBySeller.get(seller);
  if(!prev||cost<prev.total)peerBySeller.set(seller,{id:other.id,title:other.title,url:other.url,total:cost,seller:other.seller});
 }
 const peers=[...peerBySeller.values()].sort((a,b)=>a.total-b.total);
 if(peers.length<minPeers)return null;
 // Conservative lower quartile rather than claiming a median equals market value.
 // The lower quartile uses a discrete observed comparison, never an interpolated guess.
 const q1=peers[Math.floor((peers.length-1)*.25)].total;
 const med=median(peers.map(p=>p.total));
 const discount=Math.round((1-total/q1)*1000)/10;
 if(!Number.isFinite(discount)||discount<minDiscount||discount<=0)return null;
 const peerPreview=peers.slice(0,8).map(({title,url,total})=>({title,url,total}));
 return {
  item:target,currency,listedTotal:total,reference:q1,median:med,
  discountPercent:discount,peerCount:peers.length,comparables:peerPreview,
  confidence:peers.length>=6?"Moderate":"Limited",
  basis:"EBAY_ACTIVE_ASKING",comparedAt:new Date(now).toISOString(),
  detail:"Compared with other eBay Buy It Now asking prices for closely matching titles from distinct sellers. Not completed sales, a verified market value or a guarantee. Inspect item photos, attributes, grading, postage and authenticity before purchase."
 };
}
export function findAskingOpportunities(targets,comparables,options={}){
 const seen=new Set(),deals=[],inspected=[];
 for(const item of targets||[]){
  if(!item?.id||seen.has(item.id))continue;
  seen.add(item.id);
  const d=evaluateAskingOpportunity(item,comparables,options);
  if(d)deals.push(d);
  else if(identityOf(item))inspected.push(item);
 }
 return {deals:deals.sort((a,b)=>b.discountPercent-a.discountPercent),eligibleProducts:inspected.length+deals.length};
}
