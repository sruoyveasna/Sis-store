/* ===== Sis Store: grid + cart (with quantities) + Telegram + copy ===== */

const CFG = window.APP_CONFIG || {};
const SHEETS_URL = CFG.SHEETS_JSON_URL;
const TG = CFG.TELEGRAM || { SELLER_USERNAME: "", MODE: "share" };

let PRODUCTS = [];
let state = { query: "", categoryKey: "all", sort: "popular", cart: [] };

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const money = (n) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(+n || 0);

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

/* ---------- Sheets Load ---------- */
async function loadProducts() {
  try {
    const res = await fetch(SHEETS_URL, { cache: "no-store" });
    const data = await res.json();
    PRODUCTS = (data.products || data || []).map((p, idx) => ({
      id: makeStableId(p, idx),
      name: String(p.name || "").trim(),
      code: String(p.code || "").trim(),
      price: +p.price || 0,
      category: normCat(p.category),
      img: String(p.img || "").trim(),
      desc: String(p.desc || "").trim(),
    }));
  } catch (e) {
    console.error("Sheets load failed:", e);
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
  }
}

/* ---------- Toast ---------- */
function showToast(msg) {
  const box = document.createElement("div");
  box.className =
    "mb-3 rounded-xl bg-brand-600 text-white shadow-soft px-4 py-2 text-sm transition";
  box.textContent = msg;
  const wrap = $("#toast");
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

/* ---------- Render: categories & grid ---------- */
function renderCategories() {
  const wrap = $("#categories");
  wrap.innerHTML = "";
  for (const { key, label } of categoriesList()) {
    const btn = document.createElement("button");
    btn.className =
      // smaller chip on mobile, normal on >=sm
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
    default:
      break;
  }
  return list;
}

/* ---------- Card (compact mobile footer: left column info + right plus btn) ---------- */
function card(p) {
  return `
  <article class="group rounded-2xl bg-white border border-ink-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition overflow-hidden min-w-0">
    <div class="relative" data-quick-img="${p.id}">
      <div class="aspect-[3/2] sm:aspect-[4/3] bg-gradient-to-br from-ink-100 via-white to-brand-50 overflow-hidden">
        ${
          p.img
            ? `<img src="${p.img}" alt="${p.name}" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]">`
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

      <!-- MOBILE: two columns -> left (code+price), right (compact add) -->
      <div class="mt-2 grid grid-cols-[1fr_auto] items-center gap-2 sm:hidden">
        <div class="min-w-0">
          <div class="flex items-baseline gap-1 text-[11px] text-ink-500">
            <span>Code :</span>
            <span class="text-ink-800 font-semibold tracking-wide">${
              p.code
            }</span>
          </div>
          <div class="mt-0.5 flex items-baseline gap-1 text-[11px] text-ink-500">
            <span>Price :</span>
            <span class="text-brand-800 font-semibold text-sm">${money(
              p.price
            )}</span>
          </div>
        </div>
        <button
          class="h-9 w-11 rounded-lg bg-brand-600 text-white inline-grid place-items-center shadow-sm hover:bg-brand-700 active:scale-[.98] focus:outline-none focus:ring-2 focus:ring-brand-300"
          data-add="${p.id}"
          aria-label="Add ${p.name}"
          title="Add"
        >
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

/* ---------- Grid Render ---------- */
function renderGrid() {
  const list = filterList();
  $("#resultsInfo").textContent =
    `${list.length} product${list.length !== 1 ? "s" : ""} found` +
    (state.categoryKey !== "all"
      ? ` • ${
          categoriesList().find((c) => c.key === state.categoryKey)?.label || ""
        }`
      : "") +
    (state.query ? ` • “${state.query}”` : "");
  $("#grid").innerHTML = list.map(card).join("");
}

/* ---------- Modal ---------- */
function openModal(p) {
  $("#modalImg").src = p.img || "";
  $("#modalImg").alt = p.name;
  $("#modalCategory").textContent = p.category;
  $("#modalName").textContent = p.name;
  $("#modalCode").textContent = p.code;
  $("#modalDesc").textContent = p.desc;
  $("#modalPrice").textContent = money(p.price);
  $("#modalAddQuote").onclick = () => addToCart(p);
  $("#modal").classList.remove("hidden");
}
$$("#modal [data-modal-close]").forEach((btn) =>
  btn.addEventListener("click", () => $("#modal").classList.add("hidden"))
);
$("#modal").addEventListener("click", (e) => {
  if (e.target.dataset.modalClose !== undefined)
    $("#modal").classList.add("hidden");
});

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
  const item = state.cart.find((x) => x.id === id);
  if (!item) return;
  item.qty += 1;
  updateCartUI();
}
function decQty(id) {
  const item = state.cart.find((x) => x.id === id);
  if (!item) return;
  item.qty -= 1;
  if (item.qty <= 0) {
    state.cart = state.cart.filter((x) => x.id !== id);
  }
  updateCartUI();
}
function removeFromCart(id) {
  state.cart = state.cart.filter((x) => x.id !== id);
  updateCartUI();
}
function updateCartUI() {
  // badge shows total quantity
  $("#quoteCount").textContent = totalQty();

  const empty = $("#quoteEmpty"),
    listWrap = $("#quoteItems"),
    ul = $("#quoteList");
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
      return `
      <li class="flex gap-3 p-3">
        <img src="${p.img || ""}" alt="${
        p.name
      }" class="h-16 w-16 rounded-lg object-cover ring-1 ring-ink-200"/>
        <div class="flex-1">
          <div class="flex items-start justify-between">
            <div>
              <p class="font-medium leading-tight">${p.name}</p>
              <p class="text-xs text-ink-500">${p.code} • ${p.category}</p>
            </div>
            <button class="rounded-md p-2 hover:bg-ink-100" data-remove="${
              p.id
            }" aria-label="Remove">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M6 18L18 6" stroke="#334155" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>

          <div class="mt-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <button class="h-8 w-8 rounded-md border border-ink-200 grid place-items-center" data-dec="${
                p.id
              }">−</button>
              <span class="min-w-[1.5rem] text-center">${p.qty}</span>
              <button class="h-8 w-8 rounded-md border border-ink-200 grid place-items-center" data-inc="${
                p.id
              }">+</button>
            </div>
            <div class="text-sm font-semibold text-brand-800">${lineTotal}</div>
          </div>
        </div>
      </li>`;
    })
    .join("");
}

/* Event delegation for cart list */
$("#quoteList").addEventListener("click", (e) => {
  const t = e.target.closest("[data-remove],[data-inc],[data-dec]");
  if (!t) return;
  if (t.dataset.remove) return removeFromCart(t.dataset.remove);
  if (t.dataset.inc) return incQty(t.dataset.inc);
  if (t.dataset.dec) return decQty(t.dataset.dec);
});

/* Drawer */
$("#quoteBtn").addEventListener("click", () => {
  $("#modal").classList.add("hidden");
  updateCartUI();
  $("#drawer").classList.toggle("translate-x-full");
});
$("#closeDrawer").addEventListener("click", () =>
  $("#drawer").classList.add("translate-x-full")
);

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
$("#shareTelegram").addEventListener("click", openTelegramShare);

async function copyCartToClipboard() {
  const text = buildCartMessage();
  try {
    await navigator.clipboard.writeText(text);
    showToast("Cart copied to clipboard");
  } catch (err) {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast("Cart copied to clipboard");
    } catch (e) {
      alert(text);
    }
    ta.remove();
  }
}
$("#copyCart").addEventListener("click", copyCartToClipboard);

/* ---------- Grid interactions ---------- */
$("#grid").addEventListener("click", (e) => {
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) {
    const id = addBtn.dataset.add;
    const p = PRODUCTS.find((x) => x.id === id);
    return addToCart(p);
  }

  // image area quick view for mobile
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

/* Categories click */
$("#categories").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-key]");
  if (!btn) return;
  state.categoryKey = btn.dataset.key;
  renderCategories();
  renderGrid();
});

/* Search & Sort */
const searchInput = $("#search"),
  clearSearchBtn = $("#clearSearch");
let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = searchInput.value;
    clearSearchBtn.classList.toggle("hidden", !state.query);
    renderGrid();
  }, 120);
});
clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  state.query = "";
  clearSearchBtn.classList.add("hidden");
  renderGrid();
});
$("#sort").addEventListener("change", (e) => {
  state.sort = e.target.value;
  renderGrid();
});

/* ---------- Init ---------- */
(async function init() {
  await loadProducts();
  renderCategories();
  renderGrid();
})();
