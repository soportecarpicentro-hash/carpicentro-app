// CARPICENTRO Service Worker — Cache offline
const CACHE = 'carpicentro-v13';

// Archivos a cachear para uso offline
const ASSETS = [
  '/',
  '/index.html',
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(cache){
      return cache.addAll(ASSETS);
    })
  );
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

  // Supabase y API de Anthropic: siempre en red (necesitan internet)
  if(url.includes('supabase.co') || url.includes('anthropic.com') || url.includes('/api/')){
    e.respondWith(fetch(e.request).catch(function(){
      return new Response(JSON.stringify({error:'Sin conexión a internet. Esta función requiere conexión.'}),
        {headers:{'Content-Type':'application/json'}});
    }));
    return;
  }

  // Para el resto: Cache-first con fallback a red
  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached) return cached;
      return fetch(e.request).then(function(resp){
        // Cachear respuestas exitosas de assets estáticos
        if(resp.ok && e.request.method==='GET'){
          var clone = resp.clone();
          caches.open(CACHE).then(function(cache){ cache.put(e.request, clone); });
        }
        return resp;
      }).catch(function(){
        // Sin red y sin cache — devolver página principal
        return caches.match('/index.html');
      });
    })
  );
});
