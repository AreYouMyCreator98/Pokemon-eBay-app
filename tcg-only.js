// Shared server-side TCG safety gate. All eBay queries remain inside CCG category 2536.
// Do not infer authenticity: this only filters listing relevance, never verifies a seller.
const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
const TCG_FRANCHISE=/\b(?:pokemon|pok mon|pok mon tcg|ptcg|yugioh|yu gi oh|one piece|magic the gathering|mtg|lorcana|digimon|flesh and blood|fab tcg|dragon ball super|dragon ball fusion world|dragon ball masters|weiss schwarz|cardfight vanguard|vanguard tcg|star wars unlimited|star wars destiny|grand archive|riftbound|union arena|sorcery contested realm|final fantasy tcg|fire emblem cipher|metazoo|gundam card game|battle spirits saga|shadowverse evolve|altered tcg|force of will tcg)\b/;
const TCG_TERMS=/\b(?:tcg|ccg|collectible card game|collectable card game|trading card game|trading cards|trading card|game cards|card game)\b/;
const KNOWN_SETS=/\b(?:prismatic evolutions|evolving skies|surging sparks|destined rivals|terastal festival|stellar crown|obsidian flames|scarlet violet|paldea evolved|paradox rift|crown zenith|brilliant stars|fusion strike|lost origin|silver tempest|shining fates|hidden fates|base set|team rocket|black bolt|white flare|phantasmal flames|twilight masquerade|pokemon 151|journey together|chaos rising|ascended heroes|mega evolution|perfect order|chaos rising|pitch black|chaos rising|op0[1-9]|op1[0-9]|eb0[1-9]|st[0-3][0-9]|mh3|modern horizons|duskmourn|bloomburrow|phyrexia all will be one|dominaria|jumpstart)\b/;
const CARD_SIGNALS=/\b(?:single card|card single|cards|card|holo|reverse holo|holographic|secret rare|ultra rare|hyper rare|illustration rare|art rare|special illustration|full art|alt art|alternate art|promo|vmax|vstar|ex card|gx card|trainer card|energy card|land card|graded|slabbed|gem mint|near mint|nm mt|first edition|1st edition|unlimited edition|foil card|don card)\b/;
const CARD_NUMBER=/\b\d{1,3}\s*\/\s*\d{1,3}\b|\b(?:sv|swsh|sm|xy|bw)\d{2,4}\b|\b[A-Z]{3,6}-[A-Z0-9]{3,7}\b/i;
const GRADER=/\b(?:psa|bgs|cgc|sgc|ace)\s*(?:gem mint\s*)?(?:10|9\.5|9|8\.5|8|7|6)\b/;
const SEALED=/\b(?:booster|etb|elite trainer box|bundle|blister|booster box|display box|collector box|sealed box|sealed case|sealed pack|starter deck|structure deck|theme deck|battle deck|pre release|prerelease|premium collection|collection box|collection set|trainer toolkit|deck build|display case of boosters|tin|tins|upc ultra premium collection|ultra premium collection)\b/;
const ACCESSORY=/\b(?:binder|folio|portfolio|album|toploader|top loader|toploaders|top loaders|sleeves|sleeve|card holder|card storage|card case|deck box|deckbox|deck protector|card protector|penny sleeves|slab case|slab holder|acrylic case|display case|card display|slab display|display stand|card stand|playmat|play mat|sorting tray|card dividers|binder pages|9 pocket|4 pocket|12 pocket|pocket pages|card wallet|grading holder|grading submission|magnetic holder|magnetic case|ultra pro|dragon shield|gamegenic|vault x|ultimate guard|palms off gaming|palms off|card guard)\b/;
const COLLECTIBLE=/\b(?:collectible pin|collectable pin|enamel pin|promo pin|promo coin|collectible coin|collectable coin|coin set|collector coin|card game coin|pin collection|collector badge|collectible keychain|collectable keychain|card game keychain|sealed collectible|collectible figurine|collectable figurine)\b/;
const COLLECTION_WITH_CARDS=/\b(?:collectibles?|collectables?|collection)\b.*\b(?:cards?|tcg|ccg|binder|deck|promo|sealed)\b|\b(?:cards?|tcg|ccg|binder|deck)\b.*\b(?:collectibles?|collectables?)\b/;
const EXCLUDED=/\b(?:healing crystals?|crystal healing|crystal balls?|raw crystal|crystal cluster|natural crystal|gemstones?|geodes?|quartz|amethyst|obsidian stone|minerals? specimen|reiki|tarot|chakra|necklace|earrings?|bracelets?|jewellery|jewelry|bath bombs?|incense|candles?|soaps?|prism lamps?|prismatic crystals?|geode slice|crystal towers?|crystal points?|kitchen decor|wall decor|wallpaper|car parts?|phone cases?|mobile cases?|laptop cases?|shoes?|sneakers?|t shirts?|t shirt|hoodies?|sweatshirts?|cosplay costumes?|dvd|blu ray|video game cartridge|nintendo switch games?|playstation games?|gameboy games?|digital download|nfts?|proxy cards?|replica cards?|orica|empty boxes?|empty packs?|empty wrappers?|wrapper only|code only|code cards?|online codes?)\b/;
const CARDS_EXPLICIT=/\b(?:trading cards?|card game|tcg|ccg|booster|deck|binder|card sleeves?|toploaders?|card storage|graded cards?|sealed cards?|psa|bgs|cgc)\b/;

export function classifyTCGListing(item){
 const raw=String(item?.title||""),title=norm(raw);
 if(!title)return null;
 // A misleading "prismatic" adjective is not a TCG identifier.
 if(EXCLUDED.test(title))return null;
 const franchise=TCG_FRANCHISE.test(title),tcgLabel=TCG_TERMS.test(title),knownSet=KNOWN_SETS.test(title);
 const grade=GRADER.test(title),accessory=ACCESSORY.test(title),collectible=COLLECTIBLE.test(title);
 const sealed=SEALED.test(title),card=CARD_SIGNALS.test(title),number=CARD_NUMBER.test(raw);
 const cardContext=franchise||tcgLabel||knownSet||grade||(number&&card);
 const accessoryContext=franchise||tcgLabel||/\b(?:cards?|deck|slab|grading|pocket|protectors?|collectors?)\b/.test(title)||
   /\b(?:ultra pro|dragon shield|gamegenic|vault x|ultimate guard|palms off gaming|palms off|bcw)\b/.test(title);
 // Explicit TCG goods can have short seller titles, but generic descriptive
 // words ("sealed", "display", "crystal") alone are never enough.
 const protectiveDisplay=/\b(?:acrylic|protector|protective|magnetic|card holder|card stand|storage case|outer case|outer box)\b/.test(title);
 if(sealed&&(cardContext||/\b(?:trading cards?|card game|tcg|ccg)\b/.test(title))&&!protectiveDisplay)return "SEALED";
 if(accessory&&accessoryContext)return "ACCESSORIES";
 if(collectible&&(franchise||tcgLabel||knownSet))return "ACCESSORIES";
 if(COLLECTION_WITH_CARDS.test(title)&&(franchise||tcgLabel||knownSet))return "ACCESSORIES";
 if(grade&&cardContext)return "GRADED";
 if(card&&(cardContext||number))return "RAW";
 if(franchise&&number)return "RAW";
 if(tcgLabel&&/\b(?:packs?|boxes?|lots?|sets?|singles?|sealed|cards?)\b/.test(title))return "RAW";
 // A very short brand/character-only search can be ambiguous: fail closed.
 return null;
}
export function isTCGListing(item){return classifyTCGListing(item)!==null;}
