/** JSON API for products. Accepts:
 *  - ?sheet=Sheet1  (optional tab name; default "Products")
 *  - ?q=search
 *  - ?category=Diagnostics
 *  - ?sort=price:asc | price:desc | name:asc | name:desc
 *  - ?limit=50&offset=0
 */
function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const tabHint = String(params.sheet || "Products");
  const q = (params.q || "").toString().trim().toLowerCase();
  const category = (params.category || "").toString().trim();
  const sortStr = (params.sort || "").toString().trim();
  const limit = Math.min(parseInt(params.limit || "500", 10), 1000);
  const offset = Math.max(parseInt(params.offset || "0", 10), 0);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh =
    ss.getSheetByName(tabHint) ||
    ss.getSheetByName("Sheet1") ||
    ss.getSheets()[0];
  if (!sh) return jsonOut({ products: [], error: "No sheet found" });

  const values = sh.getDataRange().getValues();
  if (!values.length) return jsonOut({ products: [] });

  const [headersRaw, ...rows] = values;
  const headers = headersRaw.map((h) => String(h).trim().toLowerCase());

  // Map multiple possible header names to our canonical keys
  const aliases = {
    id: ["id"],
    name: ["name", "title", "product", "product name"],
    code: ["code", "sku"],
    price: ["price", "cost", "amount"],
    category: ["category", "cat"],
    img: ["img", "image", "image url", "image_url", "photo", "picture"],
    desc: ["desc", "description", "details"],
  };
  const col = (key) => {
    for (const h of aliases[key]) {
      const idx = headers.indexOf(h);
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const ix = Object.fromEntries(Object.keys(aliases).map((k) => [k, col(k)]));

  let products = rows
    .filter((r) => (r || []).some((c) => c !== "")) // skip empty lines
    .map((r) => ({
      id: Number(ix.id >= 0 ? r[ix.id] : ""),
      name: String(ix.name >= 0 ? r[ix.name] : ""),
      code: String(ix.code >= 0 ? r[ix.code] : ""),
      price: Number(ix.price >= 0 ? r[ix.price] : 0),
      category: String(ix.category >= 0 ? r[ix.category] : "General"),
      img: String(ix.img >= 0 ? r[ix.img] : ""),
      desc: String(ix.desc >= 0 ? r[ix.desc] : ""),
    }));

  // optional search & category filter
  if (q) {
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q)
    );
  }
  if (category) products = products.filter((p) => p.category === category);

  // optional sort
  if (sortStr) {
    const [field, dirRaw] = sortStr.split(":");
    const dir = (dirRaw || "asc").toLowerCase() === "desc" ? -1 : 1;
    const allowed = new Set(["price", "name", "code", "category", "id"]);
    if (allowed.has(field)) {
      products.sort((a, b) => {
        const A = a[field],
          B = b[field];
        if (A < B) return -1 * dir;
        if (A > B) return 1 * dir;
        return 0;
      });
    }
  }

  const total = products.length;
  products = products.slice(offset, offset + limit);

  return jsonOut({ products, total, limit, offset, sheet: sh.getName() });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
