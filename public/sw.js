/* TCG Bid Buy Watch: clean UI release — immediate updates and no stale shell when online. */
const CACHE="tcg-bid-buy-watch-shell-v16";
const SHELL=[
  "/","/index.html","/styles.css","/clean-theme.css","/v2-polish.css","/market-v2.js","/app.js","/theme.js",
  "/stats.html","/stats.css","/stats.js","/price-range.js",
  "/manifest.webmanifest","/icon.svg",
  "/assets/ui/icons.svg","/assets/ui/tcg-logo-clean.svg","/assets/ui/tcg-logo-dark.svg",
  "/assets/ui/hero-clean.svg"
];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map(path => new Request(path,{cache:"reload"})));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request=event.request, url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
  const isDocument=request.mode==="navigate";
  event.respondWith((async()=>{
    try{
      // Online documents and scripts always come from the current deployment, not old PWA data.
      const fresh=await fetch(request,{cache:"no-store"});
      if(fresh.ok&&fresh.type==="basic"){
        const cache=await caches.open(CACHE);
        cache.put(request,fresh.clone()).catch(()=>{});
      }
      return fresh;
    }catch(error){
      const cached=await caches.match(request);
      if(cached)return cached;
      if(isDocument){
        const appShell=await caches.match("/index.html")||await caches.match("/");
        if(appShell)return appShell;
      }
      throw error;
    }
  })());
});
