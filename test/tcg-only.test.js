import test from "node:test";
import assert from "node:assert/strict";
import { classifyTCGListing, isTCGListing } from "../tcg-only.js";
import { makeSearchPlan, scoreSearchItem } from "../smart-search.js";

const supported=[
 ["Pokemon Prismatic Evolutions Booster Bundle Display Case","SEALED"],
 ["Prismatic Evolutions Booster Bundle Display","SEALED"],
 ["Pokemon 151 Collection Box","SEALED"],
 ["One Piece OP06 Booster Box Sealed","SEALED"],
 ["Magic The Gathering Final Fantasy Play Booster Box","SEALED"],
 ["Evolving Skies ETB","SEALED"],
 ["Miraidon 062/128 Holo Rare","RAW"],
 ["Pikachu Holo Card","RAW"],
 ["Blue Eyes White Dragon Holo Rare","RAW"],
 ["Pokemon Umbreon BGS 9.5 Holo","GRADED"],
 ["YuGiOh Blue Eyes White Dragon PSA 10","GRADED"],
 ["Pokemon TCG Zipper Binder 480 cards","ACCESSORIES"],
 ["360 Cards Pocket Trading Card Binder 9 Pocket Album","ACCESSORIES"],
 ["Ultra Pro Penny Sleeves Card Protectors","ACCESSORIES"],
 ["ONE PIECE Card Game Official Sleeve Vol 5","ACCESSORIES"],
 ["Palms Off Gaming Toploader Binder 9 Pocket","ACCESSORIES"],
 ["Pokemon TCG Collectible Coin Set","ACCESSORIES"],
 ["Dragon Shield Card Sleeves 100ct","ACCESSORIES"],
 ["Pikachu card holder slab display","ACCESSORIES"],
 ["Digimon TCG Card Starter Deck","SEALED"]
];
const rejected=[
 "Prismatic Crystal Geode Display Bundle",
 "Healing Amethyst Quartz Crystals Natural Prismatic Display",
 "Pokemon Crystal Healing Crystal Ball",
 "Prismatic Crystal Set Bundle",
 "Diamond Crystal Prism Art Display",
 "Pokemon Switch Video Game Cartridge",
 "One Piece Anime Hoodie T Shirt",
 "Nintendo Gameboy Games Pokemon Emerald",
 "Crystal Obsidian Quartz Mineral Specimen",
 "YuGiOh Blu Ray DVD box",
 "Pokémon Plush Toy Stuffed Animal",
 "Acrylic Prismatic Display Stand Art",
 "pokemon phone case anime",
 "Pokemon Keychain Pikachu",
 "Generic 3 Ring Office Binder",
 "Crystals with Pokemon stickers collectible"
];

test("accepts actual TCG cards, sealed items, binders and accessories",()=>{
 for(const [title,type] of supported){
  assert.equal(classifyTCGListing({title}),type,title);
  assert.equal(isTCGListing({title}),true,title);
 }
});
test("rejects minerals, crystals, clothes, video games and other false positives",()=>{
 for(const title of rejected){
  assert.equal(classifyTCGListing({title}),null,title);
  assert.equal(isTCGListing({title}),false,title);
 }
});
test("keeps prismatic bundle search relevant while excluding unrelated products",()=>{
 const plan=makeSearchPlan("prismatic bundle display");
 assert.ok(plan.queries.includes("prismatic evolutions booster bundle"));
 assert.ok(scoreSearchItem({title:"Pokemon Prismatic Evolutions Booster Bundle Display Case"},plan)>0);
 assert.ok(scoreSearchItem({title:"Prismatic Evolutions Elite Trainer Box"},plan)<0);
 assert.equal(classifyTCGListing({title:"Prismatic Crystal Geode Display Bundle"}),null);
});
test("retains cards named after crystals when they are genuine trading cards",()=>{
 assert.equal(classifyTCGListing({title:"Pokemon Crystal Guardians Charizard 4/100 Holo Card"}),"RAW");
});
