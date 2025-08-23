/* Tiny store app: fetch from Google Sheets JSON, render grid, cart + Telegram share */

const CFG = window.APP_CONFIG || {};
const SHEETS_URL = CFG.SHEETS_JSON_URL;
const TG = CFG.TELEGRAM || { SELLER_USERNAME: "", MODE: "share" };

let PRODUCTS = [];
let state = { query: "", category: "All", sort: "popular", cart: [] };

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const money = (n) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(+n || 0);

// ---------------- Sheets Load ----------------
async function loadProducts() {
  try {
    const res = await fetch(SHEETS_URL, { cache: "no-store" });
    const data = await res.json(); // expects { products: [...] }
    PRODUCTS = (data.products || data || []).map((p) => ({
      id: +p.id || Date.now() + Math.random(),
      name: String(p.name || "").trim(),
      code: String(p.code || "").trim(),
      price: +p.price || 0,
      category: String(p.category || "").trim() || "General",
      img: String(p.img || "").trim(),
      desc: String(p.desc || "").trim(),
    }));
  } catch (e) {
    console.error("Sheets load failed:", e);
    // Fallback sample
    PRODUCTS = [
      {
        id: 1,
        name: "Digital Thermometer",
        code: "E001",
        price: 7.5,
        category: "Diagnostics",
        img: "",
        desc: "Thermometer.",
      },
      {
        id: 2,
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

// ---------------- UI Helpers ----------------
function showToast(msg) {
  const box = document.createElement("div");
  box.className =
    "mb-3 rounded-xl bg-brand-600 text-white shadow-soft px-4 py-2 text-sm";
  box.textContent = msg;
  const wrap = $("#toast");
  wrap.classList.remove("hidden");
  wrap.appendChild(box);
  setTimeout(() => {
    box.classList.add("opacity-0");
    box.addEventListener("transitionend", () => box.remove(), { once: true });
  }, 1800);
  setTimeout(() => {
    if (!wrap.children.length) wrap.classList.add("hidden");
  }, 2400);
}
function uniqueCategories() {
  const cats = Array.from(new Set(PRODUCTS.map((p) => p.category))).filter(
    Boolean
  );
  return ["All", ...cats];
}

// ---------------- Render ----------------
function renderCategories() {
  const wrap = $("#categories");
  wrap.innerHTML = "";
  uniqueCategories().forEach((cat) => {
    const btn = document.createElement("button");
    btn.className =
      "shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition " +
      (state.category === cat
        ? "bg-brand-600 text-white border-brand-600 shadow-soft"
        : "bg-white border-ink-200 text-ink-700 hover:border-brand-400 hover:text-brand-700");
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      state.category = cat;
      renderCategories();
      renderGrid();
    });
    wrap.appendChild(btn);
  });
}
function filterList() {
  let list = PRODUCTS.filter((p) => {
    const q = state.query.trim().toLowerCase();
    const mq =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q);
    const mc = state.category === "All" || p.category === state.category;
    return mq && mc;
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
      /* featured */ break;
  }
  return list;
}
function card(p) {
  const el = document.createElement("article");
  el.className =
    "group rounded-2xl bg-white border border-ink-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition overflow-hidden";
  el.innerHTML = `
    <div class="relative">
      <div class="aspect-[4/3] bg-gradient-to-br from-ink-100 via-white to-brand-50 overflow-hidden">
        ${
          p.img
            ? `<img src="${p.img}" alt="${p.name}" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]">`
            : ""
        }
      </div>
      <span class="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold ring-1 ring-brand-200 text-brand-700">${
        p.category
      }</span>
      <span class="absolute right-3 top-3 inline-flex items-center rounded-full bg-ink-900/90 text-white px-2.5 py-1 text-[11px] font-semibold tracking-wide">${
        p.code
      }</span>
    </div>
    <div class="p-4">
      <h3 class="font-semibold leading-snug line-clamp-2">${p.name}</h3>
      <div class="mt-1 text-sm text-ink-500">${p.code}</div>
      <div class="mt-3 flex items-center justify-between">
        <div class="text-lg font-semibold text-brand-800">${money(
          p.price
        )}</div>
        <div class="flex gap-2">
          <button class="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium hover:shadow-sm" data-quick>Quick view</button>
          <button class="rounded-lg bg-brand-600 text-white px-3 py-2 text-sm font-medium hover:bg-brand-700" data-add>Add</button>
        </div>
      </div>
    </div>`;
  el.querySelector("[data-quick]").addEventListener("click", () =>
    openModal(p)
  );
  el.querySelector("[data-add]").addEventListener("click", () => addToCart(p));
  return el;
}
function renderGrid() {
  const list = filterList();
  $("#resultsInfo").textContent =
    `${list.length} product${list.length !== 1 ? "s" : ""} found` +
    (state.category !== "All" ? ` • ${state.category}` : "") +
    (state.query ? ` • “${state.query}”` : "");
  const grid = $("#grid");
  grid.innerHTML = "";
  list.forEach((p) => grid.appendChild(card(p)));
}

// ---------------- Modal ----------------
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

// ---------------- Cart ----------------
function addToCart(p) {
  if (!state.cart.find((x) => x.id === p.id)) state.cart.push(p);
  updateCartUI();
  showToast(`${p.name} added to cart`);
}
function removeFromCart(id) {
  state.cart = state.cart.filter((x) => x.id !== id);
  updateCartUI();
}
function updateCartUI() {
  $("#quoteCount").textContent = state.cart.length;
  const empty = $("#quoteEmpty"),
    listWrap = $("#quoteItems"),
    ul = $("#quoteList");
  if (!state.cart.length) {
    empty.classList.remove("hidden");
    listWrap.classList.add("hidden");
    ul.innerHTML = "";
  } else {
    empty.classList.add("hidden");
    listWrap.classList.remove("hidden");
    ul.innerHTML = "";
    state.cart.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "flex gap-3 p-3";
      li.innerHTML = `
        <img src="${p.img || ""}" alt="${
        p.name
      }" class="h-16 w-16 rounded-lg object-cover ring-1 ring-ink-200"/>
        <div class="flex-1">
          <div class="flex items-start justify-between">
            <div><p class="font-medium leading-tight">${
              p.name
            }</p><p class="text-xs text-ink-500">${p.code} • ${
        p.category
      }</p></div>
            <button class="rounded-md p-2 hover:bg-ink-100" aria-label="Remove"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M6 18L18 6" stroke="#334155" stroke-width="2" stroke-linecap="round"/></svg></button>
          </div>
          <div class="mt-1 text-sm font-semibold text-brand-800">${money(
            p.price
          )}</div>
        </div>`;
      li.querySelector("button[aria-label=Remove]").addEventListener(
        "click",
        () => removeFromCart(p.id)
      );
      ul.appendChild(li);
    });
  }
}

// Drawer + print
$("#quoteBtn").addEventListener("click", () => {
  updateCartUI();
  $("#drawer").classList.toggle("translate-x-full");
});
$("#closeDrawer").addEventListener("click", () =>
  $("#drawer").classList.add("translate-x-full")
);
$("#printQuote").addEventListener("click", () => {
  const tpl = document.getElementById("printTpl").content.cloneNode(true);
  const tbody = tpl.querySelector("#printRows");
  state.cart.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="p-2 border">${idx + 1}</td>
      <td class="p-2 border">${p.name}</td>
      <td class="p-2 border">${p.code}</td>
      <td class="p-2 border">${p.category}</td>
      <td class="p-2 border text-right">${money(p.price)}</td>`;
    tbody.appendChild(tr);
  });
  const w = window.open("", "_blank");
  w.document.write("<!doctype html><title>Cart</title>");
  w.document.body.appendChild(tpl);
  w.document.close();
  w.focus();
  w.print();
});

// Telegram share (from user's own account)
function buildCartMessage() {
  if (!state.cart.length) return "Cart is empty.";
  const lines = [
    "🛍️ Sis Store Cart",
    ...state.cart.map(
      (p, i) => `${i + 1}. ${p.name} (${p.code}) – ${money(p.price)}`
    ),
    `Total items: ${state.cart.length}`,
  ];
  return lines.join("\n");
}
function openTelegramShare() {
  const text = buildCartMessage();
  const encText = encodeURIComponent(text);
  const seller = TG.SELLER_USERNAME?.trim();

  // Try direct DM if seller username exists; fall back to share picker
  let url;
  if (TG.MODE === "dm" && seller) {
    // Many clients support prefilled text via this pattern; if not, Telegram will still open the chat.
    url = `https://t.me/${seller}?text=${encText}`;
  } else {
    // generic share picker; user chooses the recipient (can pick the seller)
    url = `https://t.me/share/url?url=${encodeURIComponent(
      location.href
    )}&text=${encText}`;
  }
  window.open(url, "_blank");
}
$("#shareTelegram").addEventListener("click", openTelegramShare);

// Search & Sort
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

// Init
(async function init() {
  await loadProducts();
  renderCategories();
  renderGrid();
})();
