/* ===== Sis Store: fast render (cache-first + progressive fetch) =====
   - Skeleton cards while loading
   - Cache in localStorage (TTL)
   - First page fast, then background pages with limit/offset
   - Cloudinary images: f_auto,q_auto,w_*, srcset, lazy
   - All existing features preserved (cart, Telegram, copy)
*/

const CFG = window.APP_CONFIG || {};
const SHEETS_URL = CFG.SHEETS_JSON_URL;
const TG = CFG.TELEGRAM || { SELLER_USERNAME: "", MODE: "share" };

// ---- Tunables ----
const CACHE_KEY = "sisstore_products_v2";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PAGE_SIZE = 24; // first page items
const PAGE_STEP = 60; // subsequent pages
const RENDER_CHUNK = 32; // cards per render chunk

let PRODUCTS = [];
let state = { query: "", categoryKey: "all", sort: "popular", cart: [] };

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const $on = (sel, evt, fn, el = document) => {
  const node = typeof sel === "string" ? el.querySelector(sel) : sel;
  if (!node) {
    console.warn("[bind]", sel, "not found");
    return;
  }
  node.addEventListener(evt, fn, { passive: true });
};
const money = (n) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(+n || 0);

/* ---------- Image resolver (Drive/filenames/URLs) + Cloudinary optimizer ---------- */
function isAbsoluteUrl(s) {
  return /^https?:\/\//i.test(s) || /^data:/i.test(s);
}
function driveIdFrom(s) {
  if (!s) return "";
  s = String(s);
  let m = s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m && m[1]) return m[1];
  m = s.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m && m[1]) return m[1];
  m = s.match(/\/uc\?[^#?]*\bid=([a-zA-Z0-9_-]{20,})/);
  if (m && m[1]) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return "";
}
function resolveImgRef(ref) {
  const base = (CFG.ASSET_BASE || "./assets/img/").replace(/\/+$/, "") + "/";
  const drv = CFG.DRIVE || { MODE: "direct", WEB_APP_URL: "" };
  if (!ref) return "";
  // Cloudinary: return as-is; we'll optimize later
  if (/^https?:\/\/res\.cloudinary\.com\//i.test(ref)) return ref;
  if (isAbsoluteUrl(ref)) return ref;
  const id = driveIdFrom(ref);
  if (id) {
    if (drv.MODE === "proxy" && drv.WEB_APP_URL) {
      return `${drv.WEB_APP_URL}?img=${encodeURIComponent(id)}`;
    }
    return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(
      id
    )}`;
  }
  return base + ref.replace(/^\/+/, "");
}
// Insert Cloudinary transforms like /upload/f_auto,q_auto,w_640/...
function cloudinarySized(url, w) {
  const m = url.match(
    /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/i
  );
  if (!m) return url;
  const base = m[1],
    rest = m[2];
  // Keep any existing transforms at the start of "rest"
  // We insert our transforms first so they apply
  const t = `f_auto,q_auto,w_${w}`;
  return `${base}${t}/${rest}`;
}

/* ---------- Helpers ---------- */
function makeStableId(p, idx) {
  const raw = (p.id ?? p.code ?? p.name ?? `row-${idx}`).toString().trim();
  return raw
    ? raw.toLowerCase()
    : `row-${idx}-${Math.random().toString(36).slice(2, 8)}`;
}
function normCat(s) {
  return String(s || "General").trim();
}
function catKey(s) {
  return normCat(s).toLowerCase();
}
function categoriesList() {
  const seen = new Set();
  const out = [{ key: "all", label: "All" }];
  for (const p of PRODUCTS) {
    const key = catKey(p.category);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ key, label: normCat(p.category) });
    }
  }
  return out;
}
const totalQty = () => state.cart.reduce((t, i) => t + i.qty, 0);
const totalCost = () =>
  state.cart.reduce((t, i) => t + i.qty * (+i.price || 0), 0);

/* ---------- Skeletons ---------- */
function skeletonCard() {
  return `
  <article class="rounded-2xl bg-white border border-ink-100 shadow-sm overflow-hidden">
    <div class="animate-pulse">
      <div class="aspect-[3/2] bg-ink-100"></div>
      <div class="p-3">
        <div class="h-4 bg-ink-100 rounded w-5/6 mb-2"></div>
        <div class="h-3 bg-ink-100 rounded w-1/2 mb-1.5"></div>
        <div class="h-8 bg-ink-100 rounded mt-3"></div>
      </div>
    </div>
  </article>`;
}
function showSkeleton(n = 8) {
  const grid = $("#grid");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: n }).map(skeletonCard).join("");
}

/* ---------- Cache ---------- */
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (!ts || !Array.isArray(data)) return null;
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}
function writeCache(arr) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ts: Date.now(), data: arr })
    );
  } catch {}
}

/* ---------- Data load (progressive) ---------- */
async function fetchPage(limit, offset) {
  const url = new URL(SHEETS_URL);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();
  const arr = (json.products || json || []).map((p, idx) => ({
    id: makeStableId(p, idx + offset),
    name: String(p.name || "").trim(),
    code: String(p.code || "").trim(),
    price: +p.price || 0,
    category: normCat(p.category),
    img: String(p.img || "").trim(),
    desc: String(p.desc || "").trim(),
  }));
  return { arr, total: json.total ?? arr.length };
}

let renderScheduled = false;
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderCategories();
    renderGrid();
    renderScheduled = false;
  });
}

async function loadProductsProgressive() {
  // 1) Try cache (instant paint)
  const cached = readCache();
  if (cached && cached.length) {
    PRODUCTS = cached;
    scheduleRender();
  } else {
    showSkeleton(8);
  }

  // 2) Fetch first page fast
  let offset = 0;
  try {
    const { arr, total } = await fetchPage(PAGE_SIZE, offset);
    if (!cached || !cached.length) {
      PRODUCTS = arr.slice(); // first paint from network
      scheduleRender();
    } else {
      // merge new over cache (dedupe by id)
      const seen = new Set(PRODUCTS.map((x) => x.id));
      for (const p of arr) if (!seen.has(p.id)) PRODUCTS.push(p);
      scheduleRender();
    }
    writeCache(PRODUCTS);

    // 3) Fetch the rest in background
    offset += PAGE_SIZE;
    while (offset < (total || 100000)) {
      const step = PAGE_STEP;
      const { arr: more } = await fetchPage(step, offset);
      if (!more.length) break;
      const seen = new Set(PRODUCTS.map((x) => x.id));
      const startLen = PRODUCTS.length;
      for (const p of more) if (!seen.has(p.id)) PRODUCTS.push(p);
      if (PRODUCTS.length !== startLen) {
        writeCache(PRODUCTS);
        scheduleRender();
      }
      offset += step;
      // Yield to UI a bit
      await new Promise((r) => setTimeout(r, 0));
    }
  } catch (e) {
    console.error("Fetch failed:", e);
    if (!PRODUCTS.length) {
      // last resort fallback sample
      PRODUCTS = [
        {
          id: "e001",
          name: "Digital Thermometer",
          code: "E001",
          price: 7.5,
          category: "Diagnostics",
          img: "",
          desc: "Thermometer.",
        },
        {
          id: "e003",
          name: "Pulse Oximeter",
          code: "E003",
          price: 29,
          category: "Diagnostics",
          img: "",
          desc: "SpO₂ monitor.",
        },
      ];
      scheduleRender();
    }
  }
}

/* ---------- Toast ---------- */
function showToast(msg) {
  const box = document.createElement("div");
  box.className =
    "mb-3 rounded-xl bg-brand-600 text-white shadow-soft px-4 py-2 text-sm transition";
  box.textContent = msg;
  const wrap = $("#toast");
  if (!wrap) return;
  wrap.classList.remove("hidden");
  wrap.appendChild(box);
  setTimeout(() => {
    box.style.opacity = "0";
  }, 1600);
  setTimeout(() => {
    box.remove();
    if (!wrap.children.length) wrap.classList.add("hidden");
  }, 2300);
}

/* ---------- Render: categories & grid (chunked) ---------- */
function renderCategories() {
  const wrap = $("#categories");
  if (!wrap) return;
  const curKeys = new Set(Array.from(wrap.children).map((b) => b.dataset.key));
  const all = categoriesList();
  // Only re-render if categories changed
  const newKeys = new Set(all.map((c) => c.key));
  if (
    curKeys.size === newKeys.size &&
    [...curKeys].every((k) => newKeys.has(k))
  ) {
    // just toggle active state
    wrap.querySelectorAll("button[data-key]").forEach((btn) => {
      btn.classList.toggle(
        "bg-brand-600",
        btn.dataset.key === state.categoryKey
      );
      btn.classList.toggle("text-white", btn.dataset.key === state.categoryKey);
      btn.classList.toggle(
        "border-brand-600",
        btn.dataset.key === state.categoryKey
      );
      btn.classList.toggle(
        "shadow-soft",
        btn.dataset.key === state.categoryKey
      );
      btn.classList.toggle("bg-white", btn.dataset.key !== state.categoryKey);
      btn.classList.toggle(
        "border-ink-200",
        btn.dataset.key !== state.categoryKey
      );
      btn.classList.toggle(
        "text-ink-700",
        btn.dataset.key !== state.categoryKey
      );
    });
    return;
  }
  // full rebuild if changed
  wrap.innerHTML = "";
  for (const { key, label } of all) {
    const btn = document.createElement("button");
    btn.className =
      "shrink-0 rounded-full border px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-medium transition " +
      (state.categoryKey === key
        ? "bg-brand-600 text-white border-brand-600 shadow-soft"
        : "bg-white border-ink-200 text-ink-700 hover:border-brand-400 hover:text-brand-700");
    btn.textContent = label;
    btn.dataset.key = key;
    wrap.appendChild(btn);
  }
}

function filterList() {
  let list = PRODUCTS.filter((p) => {
    const q = state.query.trim().toLowerCase();
    const matchQ =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q);
    const matchC =
      state.categoryKey === "all" || catKey(p.category) === state.categoryKey;
    return matchQ && matchC;
  });
  switch (state.sort) {
    case "price-asc":
      list.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      list.sort((a, b) => b.price - a.price);
      break;
    case "name-asc":
      list.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name-desc":
      list.sort((a, b) => b.name.localeCompare(a.name));
      break;
  }
  return list;
}

function card(p) {
  const raw = resolveImgRef(p.img);
  // If Cloudinary → build src/srcset with sizes
  const src = /^https?:\/\/res\.cloudinary\.com\//i.test(raw)
    ? cloudinarySized(raw, 480)
    : raw;
  const src320 = /^https?:\/\/res\.cloudinary\.com\//i.test(raw)
    ? cloudinarySized(raw, 320)
    : raw;
  const src480 = /^https?:\/\/res\.cloudinary\.com\//i.test(raw)
    ? cloudinarySized(raw, 480)
    : raw;
  const src640 = /^https?:\/\/res\.cloudinary\.com\//i.test(raw)
    ? cloudinarySized(raw, 640)
    : raw;
  const sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw";
  return `
  <article class="group rounded-2xl bg-white border border-ink-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition overflow-hidden min-w-0">
    <div class="relative" data-quick-img="${p.id}">
      <div class="aspect-[3/2] sm:aspect-[4/3] bg-gradient-to-br from-ink-100 via-white to-brand-50 overflow-hidden">
        ${
          src
            ? `<img
          src="${src}"
          srcset="${src320} 320w, ${src480} 480w, ${src640} 640w"
          sizes="${sizes}"
          alt="${p.name}"
          class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          loading="lazy" decoding="async" fetchpriority="low">`
            : ""
        }
      </div>
      <span class="absolute left-2 top-2 sm:left-3 sm:top-3 inline-flex items-center rounded-full bg-white/90 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs font-semibold ring-1 ring-brand-200 text-brand-700">${
        p.category
      }</span>
      <span class="hidden sm:inline-flex absolute right-3 top-3 rounded-full bg-ink-900/90 text-white px-2.5 py-1 text-[11px] font-semibold tracking-wide">${
        p.code
      }</span>
    </div>

    <div class="p-3 sm:p-4">
      <h3 class="text-sm sm:text-base font-semibold leading-snug line-clamp-2 min-w-0">${
        p.name
      }</h3>

      <!-- MOBILE: left (code+price), right (compact add) -->
      <div class="mt-2 grid grid-cols-[1fr_auto] items-center gap-2 sm:hidden">
        <div class="min-w-0">
          <div class="flex items-baseline gap-1 text-[11px] text-ink-500">
            <span>Code :</span><span class="text-ink-800 font-semibold tracking-wide">${
              p.code
            }</span>
          </div>
          <div class="mt-0.5 flex items-baseline gap-1 text-[11px] text-ink-500">
            <span>Price :</span><span class="text-brand-800 font-semibold text-sm">${money(
              p.price
            )}</span>
          </div>
        </div>
        <button class="h-9 w-11 rounded-lg bg-brand-600 text-white inline-grid place-items-center shadow-sm hover:bg-brand-700 active:scale-[.98] focus:outline-none focus:ring-2 focus:ring-brand-300"
          data-add="${p.id}" aria-label="Add ${p.name}" title="Add">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>

      <!-- DESKTOP/TABLET actions -->
      <div class="mt-3 hidden sm:flex sm:items-center sm:justify-between">
        <div class="text-lg font-semibold text-brand-800">${money(
          p.price
        )}</div>
        <div class="flex gap-2">
          <button class="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium hover:shadow-sm" data-quick="${
            p.id
          }">Quick view</button>
          <button class="rounded-lg bg-brand-600 text-white px-3 py-2 text-sm font-medium hover:bg-brand-700" data-add="${
            p.id
          }">Add</button>
        </div>
      </div>
    </div>
  </article>`;
}

function renderGrid() {
  const list = filterList();
  const info = $("#resultsInfo");
  if (info) {
    info.textContent =
      `${list.length} product${list.length !== 1 ? "s" : ""} found` +
      (state.categoryKey !== "all"
        ? ` • ${
            categoriesList().find((c) => c.key === state.categoryKey)?.label ||
            ""
          }`
        : "") +
      (state.query ? ` • “${state.query}”` : "");
  }
  const grid = $("#grid");
  if (!grid) return;

  // Chunked render to keep UI smooth
  grid.innerHTML = "";
  let i = 0;
  function chunk() {
    const slice = list.slice(i, i + RENDER_CHUNK);
    if (!slice.length) return;
    const html = slice.map(card).join("");
    const frag = document.createElement("div");
    frag.innerHTML = html;
    while (frag.firstChild) grid.appendChild(frag.firstChild);
    i += RENDER_CHUNK;
    if (i < list.length) requestAnimationFrame(chunk);
  }
  requestAnimationFrame(chunk);
}

/* ---------- Modal ---------- */
function lockScroll(lock) {
  document.documentElement.style.overflow = lock ? "hidden" : "";
  document.body.style.overflow = lock ? "hidden" : "";
}
function openModal(p) {
  $on("#modalAddQuote", "click", () => addToCart(p));
  const img = $("#modalImg");
  if (img) {
    const raw = resolveImgRef(p.img);
    img.src = /^https?:\/\/res\.cloudinary\.com\//i.test(raw)
      ? cloudinarySized(raw, 800)
      : raw || "";
    img.alt = p.name;
    img.loading = "eager";
    img.decoding = "async";
    img.fetchPriority = "high";
  }
  const set = (id, v) => {
    const el = $(id);
    if (el) el.textContent = v;
  };
  set("#modalCategory", p.category);
  set("#modalName", p.name);
  set("#modalCode", p.code);
  set("#modalDesc", p.desc);
  set("#modalPrice", money(p.price));
  const modal = $("#modal");
  if (modal) {
    modal.classList.remove("hidden");
    lockScroll(true);
  }
}

/* ---------- Cart (with quantities) ---------- */
function addToCart(p) {
  if (!p) return;
  const item = state.cart.find((x) => x.id === p.id);
  if (item) {
    item.qty += 1;
    showToast(`${p.name} ×${item.qty}`);
  } else {
    state.cart.push({ ...p, qty: 1 });
    showToast(`${p.name} added to cart`);
  }
  updateCartUI();
}
function incQty(id) {
  const it = state.cart.find((x) => x.id === id);
  if (it) {
    it.qty++;
    updateCartUI();
  }
}
function decQty(id) {
  const it = state.cart.find((x) => x.id === id);
  if (!it) return;
  if (--it.qty <= 0) state.cart = state.cart.filter((x) => x.id !== id);
  updateCartUI();
}
function removeFromCart(id) {
  state.cart = state.cart.filter((x) => x.id !== id);
  updateCartUI();
}

function updateCartUI() {
  const badge = $("#quoteCount");
  if (badge) badge.textContent = totalQty();
  const empty = $("#quoteEmpty"),
    listWrap = $("#quoteItems"),
    ul = $("#quoteList");
  if (!empty || !listWrap || !ul) return;

  if (!state.cart.length) {
    empty.classList.remove("hidden");
    listWrap.classList.add("hidden");
    ul.innerHTML = "";
    return;
  }
  empty.classList.add("hidden");
  listWrap.classList.remove("hidden");

  ul.innerHTML = state.cart
    .map((p) => {
      const lineTotal = money(p.qty * (+p.price || 0));
      const raw = resolveImgRef(p.img);
      const src = /^https?:\/\/res\.cloudinary\.com\//i.test(raw)
        ? cloudinarySized(raw, 160)
        : raw || "";
      return `
      <li class="flex gap-3 p-3">
        <img src="${src}" alt="${p.name}" class="h-16 w-16 rounded-lg object-cover ring-1 ring-ink-200" loading="lazy" decoding="async" />
        <div class="flex-1">
          <div class="flex items-start justify-between">
            <div>
              <p class="font-medium leading-tight">${p.name}</p>
              <p class="text-xs text-ink-500">${p.code} • ${p.category}</p>
            </div>
            <button class="rounded-md p-2 hover:bg-ink-100" data-remove="${p.id}" aria-label="Remove">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M6 18L18 6" stroke="#334155" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>
          <div class="mt-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <button class="h-8 w-8 rounded-md border border-ink-200 grid place-items-center" data-dec="${p.id}">−</button>
              <span class="min-w-[1.5rem] text-center">${p.qty}</span>
              <button class="h-8 w-8 rounded-md border border-ink-200 grid place-items-center" data-inc="${p.id}">+</button>
            </div>
            <div class="text-sm font-semibold text-brand-800">${lineTotal}</div>
          </div>
        </div>
      </li>`;
    })
    .join("");
}

/* ---------- Share / Copy ---------- */
function buildCartMessage() {
  if (!state.cart.length) return "Cart is empty.";
  const lines = [
    "🛍️ Sis Store Cart",
    ...state.cart.map(
      (p, i) =>
        `${i + 1}. ${p.name} (${p.code})  x${p.qty}  — ${money(
          p.price
        )} each = ${money(p.qty * (+p.price || 0))}`
    ),
    `Items: ${totalQty()}`,
    `Total: ${money(totalCost())}`,
  ];
  return lines.join("\n");
}
function openTelegramShare() {
  const text = buildCartMessage();
  const encText = encodeURIComponent(text);
  const seller = (TG.SELLER_USERNAME || "").trim();
  const url =
    TG.MODE === "dm" && seller
      ? `https://t.me/${seller}?text=${encText}`
      : `https://t.me/share/url?url=${encodeURIComponent(
          location.href
        )}&text=${encText}`;
  window.open(url, "_blank");
}
async function copyCartToClipboard() {
  const text = buildCartMessage();
  try {
    await navigator.clipboard.writeText(text);
    showToast("Cart copied to clipboard");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast("Cart copied to clipboard");
    } finally {
      ta.remove();
    }
  }
}

/* ---------- Events ---------- */
function bindStaticEvents() {
  // Drawer
  $on("#quoteBtn", "click", () => {
    const modal = $("#modal");
    if (modal) {
      modal.classList.add("hidden");
      lockScroll(false);
    }
    updateCartUI();
    const d = $("#drawer");
    if (d) d.classList.toggle("translate-x-full");
  });
  $on("#closeDrawer", "click", () => {
    const d = $("#drawer");
    if (d) d.classList.add("translate-x-full");
  });

  // Cart actions
  $on("#quoteList", "click", (e) => {
    const t = e.target.closest("[data-remove],[data-inc],[data-dec]");
    if (!t) return;
    if (t.dataset.remove) return removeFromCart(t.dataset.remove);
    if (t.dataset.inc) return incQty(t.dataset.inc);
    if (t.dataset.dec) return decQty(t.dataset.dec);
  });

  // Share / copy
  $on("#shareTelegram", "click", openTelegramShare);
  $on("#copyCart", "click", copyCartToClipboard);

  // Grid (delegated)
  $on("#grid", "click", (e) => {
    const addBtn = e.target.closest("[data-add]");
    if (addBtn) {
      const id = addBtn.dataset.add;
      const p = PRODUCTS.find((x) => x.id === id);
      return addToCart(p);
    }
    const quickImg = e.target.closest("[data-quick-img]");
    if (quickImg) {
      const id = quickImg.dataset.quickImg;
      const p = PRODUCTS.find((x) => x.id === id);
      return openModal(p);
    }
    const quickBtn = e.target.closest("[data-quick]");
    if (quickBtn) {
      const id = quickBtn.dataset.quick;
      const p = PRODUCTS.find((x) => x.id === id);
      return openModal(p);
    }
  });

  // Categories
  $on("#categories", "click", (e) => {
    const btn = e.target.closest("[data-key]");
    if (!btn) return;
    state.categoryKey = btn.dataset.key;
    renderCategories();
    renderGrid();
  });

  // Search & Sort
  const searchInput = $("#search"),
    clearSearchBtn = $("#clearSearch");
  let timer;
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.query = searchInput.value;
          if (clearSearchBtn)
            clearSearchBtn.classList.toggle("hidden", !state.query);
          renderGrid();
        }, 120);
      },
      { passive: true }
    );
  }
  $on("#clearSearch", "click", () => {
    if (searchInput) searchInput.value = "";
    state.query = "";
    const clearBtn = $("#clearSearch");
    if (clearBtn) clearBtn.classList.add("hidden");
    renderGrid();
  });
  $on("#sort", "change", (e) => {
    state.sort = e.target.value;
    renderGrid();
  });

  // Modal close
  $$("#modal [data-modal-close]").forEach((btn) =>
    btn.addEventListener(
      "click",
      () => {
        const modal = $("#modal");
        if (modal) {
          modal.classList.add("hidden");
          lockScroll(false);
        }
      },
      { passive: true }
    )
  );
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  bindStaticEvents();
  // Show skeleton immediately
  showSkeleton(8);
  // Start progressive load (uses cache if present)
  loadProductsProgressive();
});
