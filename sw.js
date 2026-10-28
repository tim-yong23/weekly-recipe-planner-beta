// Emilio (beta): offline helper (service worker).
//
// Keeps a copy of the app on the phone so it opens with no signal, and fetches
// the latest version whenever there is signal, so updates arrive on the next open.
// It never touches the shopping data itself: that goes to the server, and the page
// queues changes made offline (see "Offline" in index.html).

const CACHE = "emilio-beta-v1";
const APP_FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "./vendor/supabase-2.117.2.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Remove copies from older versions of this file.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // the API (POST) always goes straight to the server
  const url = new URL(req.url);

  // The app itself: newest version when online, the saved copy when offline.
  // "no-cache" makes the browser check with the server every time instead of reusing a copy
  // for up to 10 minutes (GitHub Pages' default), so a new version shows up straight away.
  if (req.mode === "navigate" || (url.origin === location.origin && url.pathname.endsWith(".html"))) {
    event.respondWith(
      fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  // Icons and fonts: use the saved copy, refresh it in the background.
  const cacheable = url.origin === location.origin ||
    url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!cacheable) return;
  event.respondWith(
    caches.match(req).then((saved) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok || res.type === "opaque") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => saved);
      return saved || fresh;
    }),
  );
});
