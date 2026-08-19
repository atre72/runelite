// Service worker de RunElite — necesario para que el navegador permita
// "Instalar app". Cachea el shell visual (HTML/íconos) para que abra rápido
// incluso con mala señal; la API (/api/...) siempre va directo a la red,
// nunca a caché, para que el ranking y el perfil sean siempre los reales.

const CACHE_NAME = "runelite-shell-v1";
const SHELL_FILES = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // La API nunca se sirve desde caché: siempre datos reales y frescos.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request).catch(() =>
      new Response(JSON.stringify({ error: "Sin conexión" }), {
        status: 503, headers: { "Content-Type": "application/json" },
      })
    ));
    return;
  }

  // El resto (shell visual): caché primero, con la red como respaldo.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
    })
  );
});
