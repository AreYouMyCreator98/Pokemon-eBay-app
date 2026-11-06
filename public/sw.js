const CACHE="tcg-bid-buy-watch-shell-v13";
const SHELL=["/","/styles.css","/app.js","/price-range.js","/stats.html","/stats.css","/stats.js","/manifest.webmanifest","/assets/ui/tcg-logo-clean.svg","/assets/ui/icons.svg","/assets/ui/hero-clean.svg","/clean-theme.css","/theme.js","/icon.svg","/assets/overlays/accessories.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener("fetch",event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
 event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(cached=>cached||caches.match("/"))));
});