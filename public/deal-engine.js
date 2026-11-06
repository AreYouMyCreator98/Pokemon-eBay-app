// No price source is fetched, guessed, scraped or redistributed here.
// Benchmarks must come from an explicitly licensed/approved server-side feed.
import {collectorKind,listingWarning} from "./collector-quality.js";
import {amountFor} from "./market-v2.js";

export const SOURCES=["TCGplayer","PriceCharting","Collectr"];
const compact=s=>String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const validNumber=n=>typeof n==="number"&&Number.isFinite(n)&&n>0;
const validTime=date=>Number.isFinite(Date.parse(date));
export const DAYS_7=7*24*60*60*1000;
function hasPhrase(title,phrase){return (" "+compact(title)+" ").includes(" "+compact(phrase)+" ");}
export function validateBenchmark(row,now=Date.now()){
 if(!row||typeof row!=="object"||!SOURCES.includes(row.source))return null;
 if(!row.approved||!["AUD","USD"].includes(row.currency)||!validNumber(row.value)||!validTime(row.asOf))return null;
 if(Date.parse(row.asOf)>now+5*60000||now-Date.parse(row.asOf)>DAYS_7)return null;
 if(!["RAW","GRADED","SEALED"].includes(row.productType))return null;
 if(!["SOLD","GUIDE","MARKET"].includes(row.basis))return null;
 if(!row.productName||!Array.isArray(row.matchPhrases)||row.matchPhrases.length<2||row.matchPhrases.length>6)return null;
 if(row.matchPhrases.some(x=>typeof x!=="string"||compact(x).length<3||compact(x).length>80))return null;
 if(!row.matchPhrases.some(x=>compact(x).length>=5))return null;
 if(row.productType==="GRADED"&&(!["PSA","BGS","CGC","SGC","ACE"].includes(row.grader)||!String(row.grade||"").match(/^(?:[1-9]|10)(?:\.5)?$/)))return null;
 if(row.productType==="RAW"&&!["NM","LP","MP","HP","DAMAGED"].includes(row.condition))return null;
 if(row.productType==="SEALED"&&!Number.isInteger(row.units??1))return null;
 return {
  source:row.source,basis:row.basis,productName:String(row.productName).slice(0,100),
  productType:row.productType,asOf:new Date(row.asOf).toISOString(),currency:row.currency,value:row.value,
  matchPhrases:row.matchPhrases.map(compact),negativePhrases:(row.negativePhrases||[]).filter(x=>typeof x==="string").slice(0,12).map(compact),
  grader:row.grader||null,grade:row.grade||null,condition:row.condition||null,
  language:row.language||null,units:row.units??1,referenceUrl:row.referenceUrl||null,
  // Provenance families help prevent double-counting TCGplayer data re-used by Collectr.
  family:row.family|| (row.source==="PriceCharting"?"pricecharting":"tcgplayer-derived")
 };
}
export function exactMatch(item,ref){
 if(!item||!ref)return false;
 if(item.productType!==ref.productType)return false;
 if(collectorKind(item)==="LOT"||listingWarning(item))return false;
 const title=item.title||"";
 if(!ref.matchPhrases.every(phrase=>hasPhrase(title,phrase)))return false;
 if(ref.negativePhrases.some(phrase=>hasPhrase(title,phrase)))return false;
 if(/\b(?:lot|bundle of|sets? of|assorted|proxy|replica|reprint|orica|custom card|box only|empty|unsealed)\b/i.test(title))return false;
 if(ref.language){
  // An unspecified listing language is not proof of English or Japanese.
  if(!hasPhrase(title,ref.language))return false;
 }
 if(ref.productType==="GRADED"){
  const re=new RegExp("\\b"+ref.grader+"\\s*(?:gem\\s*mint\\s*)?"+String(ref.grade).replace(".","\\.")+"\\b","i");
  if(!re.test(title))return false;
 }
 if(ref.productType==="RAW"){
  const codes={NM:/\b(?:near mint|nm)\b/i,LP:/\b(?:lightly played|lp)\b/i,MP:/\b(?:moderately played|mp)\b/i,HP:/\b(?:heavily played|hp)\b/i,DAMAGED:/\b(?:damaged|dmg)\b/i};
  const condition=String(item.condition||"")+" "+title;
  if(!codes[ref.condition].test(condition))return false;
 }
 if(ref.productType==="SEALED"){
  if(!/\b(?:sealed|new|factory sealed)\b/i.test(String(item.condition||"")+" "+title))return false;
  if(ref.units!==1)return false; // sealed case/displays need separately validated pack quantities
 }
 return true;
}
export function calculateDeal(item,rawQuotes,{marketplace="AU",minDiscount=15,now=Date.now()}={}){
 const moneyCode=marketplace==="US"?"USD":"AUD";
 if(!item||!["FIXED_PRICE"].some(x=>(item.buyingOptions||[]).includes(x))||(item.buyingOptions||[]).includes("AUCTION"))return null;
 const price=amountFor(item,"total",moneyCode);
 if(price===null||price<=0)return null;
 const references=(rawQuotes||[]).map(x=>validateBenchmark(x,now)).filter(x=>x&&x.currency===moneyCode&&exactMatch(item,x));
 if(!references.length)return null;
 // Lower reference guards against overstating a discount when vendors disagree.
 const benchmark=Math.min(...references.map(x=>x.value));
 if(!validNumber(benchmark))return null;
 const percent=Math.round((1-price/benchmark)*1000)/10;
 if(percent<Math.max(5,Math.min(80,Number(minDiscount)||15)))return null;
 const independent=new Set(references.map(r=>r.family)).size;
 const range=Math.max(...references.map(r=>r.value))/benchmark;
 return {
  item,listedTotal:price,reference:benchmark,currency:moneyCode,discountPercent:percent,
  confidence:independent>=2&&range<=1.15?"Higher":"Review",
  sources:references.map(r=>({source:r.source,basis:r.basis,asOf:r.asOf,referenceUrl:r.referenceUrl,value:r.value,
   productName:r.productName,condition:r.condition,grader:r.grader,grade:r.grade})),
  detail:"Automated comparison only: seller title/condition may be wrong; check photos, authenticity, postage, taxes, returns and completed sales."
 };
}
export function evaluateDeals(items,quotes,options={}){
 const seen=new Set(),deals=[];
 for(const item of items||[]){
  const id=String(item.id||item.url||"");
  if(!id||seen.has(id))continue;
  seen.add(id);
  const deal=calculateDeal(item,quotes,options);
  if(deal)deals.push(deal);
 }
 return deals.sort((a,b)=>b.discountPercent-a.discountPercent).slice(0,30);
}
