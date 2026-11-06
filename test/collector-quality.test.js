import test from "node:test";
import assert from "node:assert/strict";
import {collectorKind,listingWarning,filterCollectorListings,sortCollectorListings} from "../public/collector-quality.js";
const items=[
 {title:"Pokemon TCG 20 Card Set Japanese Anime Trading",productType:"RAW"},
 {title:"Pokemon Charizard ex 199/165",productType:"RAW"},
 {title:"Umbreon VMAX PSA 10",productType:"GRADED"},
 {title:"Pokemon Prismatic Evolutions Booster Bundle Display",productType:"SEALED"},
 {title:"Pokemon TCG 151 binder",productType:"ACCESSORIES"},
 {title:"One Piece Card Game 288 Card Lot Japanese Anime",productType:"RAW"},
 {title:"Yu-Gi-Oh Custom Reprint card",productType:"RAW"}
];
test("generic 20-card/288-card bundles are lots, not collector singles",()=>{
 assert.equal(collectorKind(items[0]),"LOT");
 assert.equal(collectorKind(items[5]),"LOT");
 assert.equal(collectorKind(items[3]),"SEALED");
 assert.equal(collectorKind(items[1]),"SINGLE");
});
test("collector picks avoid generic lots and flag seller-described reprints",()=>{
 const picks=filterCollectorListings(items,"COLLECTOR");
 assert.equal(picks.length,4);
 assert.equal(filterCollectorListings(items,"ALL").length,7);
 assert.deepEqual(filterCollectorListings(items,"LOTS").map(x=>x.title),[items[0].title,items[5].title]);
 assert.equal(filterCollectorListings(items,"SINGLES").length,1);
 assert.match(listingWarning(items[6]),/reprints/);
});
test("collector ordering favours identifiable graded and sealed products",()=>{
 const rows=sortCollectorListings(items);
 assert.ok(rows.indexOf(items[2])<rows.indexOf(items[0]));
 assert.ok(rows.indexOf(items[3])<rows.indexOf(items[5]));
});
