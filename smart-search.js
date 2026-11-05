// Relevance-aware keyword plans for eBay. Actual prices and listings come only from eBay.
export function norm(text){return String(text||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim().replace(/\byu gi oh\b/g,"yugioh").replace(/\bmagic the gathering\b/g,"mtg").replace(/\b(op|sv)\s+0?(\d{1,3})\b/g,(_,prefix,n)=>prefix+n.padStart(2,"0"));}
const TYPOS={prsimatic:"prismatic",prismtic:"prismatic",prismatics:"prismatic",evolutons:"evolutions",boster:"booster",booser:"booster",bundel:"bundle",bunlde:"bundle",dispay:"display",diplay:"display",dispaly:"display",pokmon:"pokemon",pokeman:"pokemon",poekmon:"pokemon",chraizard:"charizard",charzard:"charizard",umbrean:"umbreon",boosterbox:"booster box"};
const STOP=new Set(["the","a","an","for","of","with","and","in","from","on","card","cards","tcg","trading","game","new","sealed"]);
const PRODUCT=new Set(["bundle","bundles","booster","boosters","box","boxes","pack","packs","etb","tin","tins","collection","deck","decks","blister","case","cases","display","raw","graded","slab","slabbed","psa","bgs","cgc","sgc","ace"]);
const OPTIONAL=new Set(["display","brand","factory","fresh","genuine","authentic","listing","product","item"]);
function fixTypos(text){return norm(text).split(" ").map(x=>TYPOS[x]||x).join(" ");}
function simplify(text){return fixTypos(text).replace(/^(?:please\s+)?(?:can\s+you\s+)?(?:show\s+me|find\s+me|give\s+me|i\s+want|i\s+need|looking\s+for|search\s+for|search|find|prices?\s+(?:for|of|on)|listings?\s+(?:for|of))\s+/,"").trim();}
function canon(text){
 let s=simplify(text).replace(/\b(yu gi oh|yugioh)\b/g,"yugioh").replace(/\bmtg\b/g,"magic the gathering").replace(/\betb\b/g,"elite trainer box");
 s=s.replace(/\bprismatic\s+(?:evo|evos)\b/g,"prismatic evolutions").replace(/\bevo\s+skies\b/g,"evolving skies");
 if(/\bprismatic\b/.test(s)&&!/\bevolutions\b/.test(s))s=s.replace(/\bprismatic\b/,"prismatic evolutions");
 if(/\bop\s*0?(\d{1,2})\b/.test(s)&&!/\bone piece\b/.test(s))s="one piece "+s;
 if(/\b151\b/.test(s)&&!/\bpokemon\b/.test(s)&&!/\bscarlet\b/.test(s))s="pokemon "+s;
 if(/\bbundle\b/.test(s)&&!/\bbooster bundle\b/.test(s))s=s.replace(/\bbundle\b/,"booster bundle");
 return s.replace(/\s+/g," ").trim();
}
export function makeSearchPlan(input){
 const original=String(input||"").trim().slice(0,100).replace(/[<>*]/g," ");
 const basic=simplify(original),canonical=canon(original);
 const variants=[original];
 if(basic!==norm(original))variants.push(basic);
 if(canonical!==basic)variants.push(canonical);
 const noDisplay=canonical.replace(/\bdisplays?\b/g," ").replace(/\s+/g," ").trim();
 if(noDisplay!==canonical)variants.push(noDisplay);
 if(/\bbooster bundle\b/.test(canonical)){
  variants.push(noDisplay.replace(/\bbooster bundle\b/,"bundle"));
  variants.push(noDisplay.replace(/\bbooster bundle\b/,"booster bundles"));
 }else if(/\belite trainer box\b/.test(canonical)){
  variants.push(canonical.replace(/\belite trainer box\b/,"etb"));
 }else if(/\bbooster box\b/.test(canonical)){
  variants.push(canonical.replace(/\bbooster box\b/,"display box"));
 }else if(/\byugioh\b/.test(canonical)){
  variants.push(canonical.replace(/\byugioh\b/,"yu gi oh"));
 }else if(/\bmagic the gathering\b/.test(canonical)){
  variants.push(canonical.replace(/\bmagic the gathering\b/,"mtg"));
 }
 const stripped=noDisplay.replace(/\b(new|sealed|mint|factory|original|genuine|authentic)\b/g," ").replace(/\s+/g," ").trim();
 if(stripped!==noDisplay)variants.push(stripped);
 const words=noDisplay.split(" ").filter(Boolean);
 if(words.length>=3){
  const reduced=words.filter(w=>!OPTIONAL.has(w));
  if(reduced.length>=2&&reduced.length<words.length)variants.push(reduced.join(" "));
  else variants.push(words.slice(0,-1).join(" "));
 }
 const queries=[...new Set(variants.map(x=>x.replace(/\s+/g," ").trim()).filter(x=>x&&x.length<=100))].slice(0,6);
 return {original,canonical,queries};
}
const has=(text,word)=>new RegExp("\\b"+norm(word)+"(?:s|es)?\\b").test(text);
export function scoreSearchItem(item,plan){
 const title=norm(item.title||""),original=norm(plan.original);
 if(!title)return -1;
 const words=[...new Set(simplify(original).split(" ").filter(Boolean))];
 const core=words.filter(w=>!STOP.has(w)&&!OPTIONAL.has(w)&&!PRODUCT.has(w)&&!/^\d{1,2}$/.test(w));
 const matched=core.filter(w=>has(title,w));
 if(core.length&&!matched.length)return -1;
 if(core.length>1&&matched.length<Math.ceil(core.length*.6))return -1;
 if(/\bprismatic\b/.test(original)&&!/\bprismatic\b/.test(title))return -1;
 if(/\bbundle\b/.test(original)&&!/\bbundles?\b/.test(title))return -1;
 if(/\betb\b/.test(original)&&!(/\betb\b|\belite trainer box\b/.test(title)))return -1;
 if(/\bbox\b/.test(original)&&!/\bbox\b/.test(title)&&!/\bdisplay\b/.test(title))return -1;
 for(const grader of ["psa","bgs","cgc","sgc"])if(has(original,grader)&&!has(title,grader))return -1;
 const grade=original.match(/\b(psa|bgs|cgc|sgc)\s*(10|9|8)\b/);
 if(grade&&!new RegExp("\\b"+grade[1]+"\\s*(?:gem\\s*mint\\s*)?"+grade[2]+"\\b").test(title))return -1;
 const numbers=words.filter(w=>/^(?:op|sv)\d{2,3}$|^\d{3,4}$/.test(w));
 if(numbers.length&&!numbers.some(w=>has(title,w)))return -1;
 let score=matched.length*14+Math.round(matched.length/Math.max(1,core.length)*35);
 if(original&&title.includes(original))score+=65;
 if(plan.canonical&&title.includes(norm(plan.canonical)))score+=42;
 if(/\bdisplay\b/.test(original)&&/\bdisplay\b/.test(title))score+=16;
 if(/\bbooster\b/.test(original)&&/\bbooster\b/.test(title))score+=11;
 if(/\bbundle\b/.test(original)&&/\bbooster bundle\b/.test(title))score+=15;
 if(/\bsealed\b/.test(original)&&/\bsealed\b/.test(title))score+=8;
 if(/\bgraded\b/.test(original)&&/\b(psa|bgs|cgc|sgc|graded)\b/.test(title))score+=8;
 if(/\braw\b/.test(original)&&/\braw\b/.test(title))score+=8;
 if(/\b(proxy|custom|digital|empty box|empty pack|wrapper only|code cards|replica|orica|non official|fan art)\b/.test(title)&&!/\b(proxy|custom|digital|empty|wrapper|code card|replica|orica|fan art)\b/.test(original))return -1;
 if(/\b(bundle|booster|etb|pack|box|sealed)\b/.test(original)&&/\b(single|single card|loose card)\b/.test(title))score-=25;
 return score;
}
