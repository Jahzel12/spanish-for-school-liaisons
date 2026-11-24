// Bump VERSION when you change app files so phones pick up the update.
var VERSION = 'v3';
var CACHE = 'sls-' + VERSION;
var SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json',
  'data/cards.json', 'data/phrases.json', 'data/tips.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// Cache first, refresh in the background (so JSON edits show up on the next open).
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
