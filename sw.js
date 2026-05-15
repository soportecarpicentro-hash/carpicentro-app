// CARPICENTRO Service Worker — Cache offline
const CACHE = 'carpicentro-v15';

// Solo assets estáticos pesados (NO index.html — siempre se trae fresco)
const ASSETS = [
  '/xlsx.full.min.js',
];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(cache){ return cache.addAll([]); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  var url = e.request.url;

  // Supabase, Anthropic y APIs: siempre red
  if(url.includes('supabase.co') || url.includes('anthropic.com') || url.includes('/api/')){
    e.respondWith(fetch(e.request).catch(function(){
      return new Response(JSON.stringify({error:'Sin conexión a internet.'}),
        {headers:{'Content-Type':'application/json'}});
    }));
    return;
  }

  // index.html y raíz: siempre red primero, caché como fallback offline
  if(url.endsWith('/') || url.endsWith('/index.html') || url.endsWith('.html')){
    e.respondWith(
      fetch(e.request).then(function(resp){
        var clone = resp.clone();
        caches.open(CACHE).then(function(cache){ cache.put(e.request, clone); });
        return resp;
      }).catch(function(){
        return caches.match(e.request);
      })
    );
    return;
  }

  // Resto de assets estáticos: caché primero
  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached) return cached;
      return fetch(e.request).then(function(resp){
        if(resp.ok && e.request.method==='GET'){
          var clone = resp.clone();
          caches.open(CACHE).then(function(cache){ cache.put(e.request, clone); });
        }
        return resp;
      }).catch(function(){
        return caches.match('/index.html');
      });
    })
  );
});
