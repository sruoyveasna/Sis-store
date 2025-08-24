/** JSON & Image API
 *  - Images:  ?img=<DRIVE_FILE_ID>
 *  - JSON:    optional query params:
 *      ?sheet=Products
 *      ?q=search
 *      ?category=Diagnostics
 *      ?sort=price:asc | price:desc | name:asc | name:desc
 *      ?limit=50&offset=0
 */
function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};

  // 1) Serve Drive image if requested
  if (params.img) {
    try {
      var file = DriveApp.getFileById(params.img);
      var blob = file.getBlob(); // detects content type
      return ContentService.createBinaryOutput(blob.getBytes()).setMimeType(
        blob.getContentType()
      );
    } catch (err) {
      return ContentService.createTextOutput("Not found").setMimeType(
        ContentService.MimeType.TEXT
      );
    }
  }

  // 2) Otherwise, return JSON products
  var tabHint = String(params.sheet || "Products");
  var q = (params.q || "").toString().trim().toLowerCase();
  var category = (params.category || "").toString().trim();
  var sortStr = (params.sort || "").toString().trim();
  var limit = Math.min(parseInt(params.limit || "500", 10), 1000);
  var offset = Math.max(parseInt(params.offset || "0", 10), 0);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh =
    ss.getSheetByName(tabHint) ||
    ss.getSheetByName("Sheet1") ||
    ss.getSheets()[0];
  if (!sh) return jsonOut({ products: [], error: "No sheet found" });

  var values = sh.getDataRange().getValues();
  if (!values.length) return jsonOut({ products: [] });

  var headersRaw = values.shift();
  var rows = values;
  var headers = headersRaw.map(function (h) {
    return String(h).trim().toLowerCase();
  });

  // Map header aliases
  var aliases = {
    id: ["id"],
    name: ["name", "title", "product", "product name"],
    code: ["code", "sku"],
    price: ["price", "cost", "amount"],
    category: ["category", "cat"],
    img: ["img", "image", "image url", "image_url", "photo", "picture"],
    desc: ["desc", "description", "details"],
  };
  function col(key) {
    var list = aliases[key] || [];
    for (var i = 0; i < list.length; i++) {
      var idx = headers.indexOf(list[i]);
      if (idx !== -1) return idx;
    }
    return -1;
  }
  var ix = {};
  for (var k in aliases) ix[k] = col(k);

  var products = rows
    .filter(function (r) {
      return (r || []).some(function (c) {
        return c !== "";
      });
    })
    .map(function (r) {
      return {
        id: Number(ix.id >= 0 ? r[ix.id] : ""),
        name: String(ix.name >= 0 ? r[ix.name] : ""),
        code: String(ix.code >= 0 ? r[ix.code] : ""),
        price: Number(ix.price >= 0 ? r[ix.price] : 0),
        category: String(ix.category >= 0 ? r[ix.category] : "General"),
        img: String(ix.img >= 0 ? r[ix.img] : ""),
        desc: String(ix.desc >= 0 ? r[ix.desc] : ""),
      };
    });

  if (q) {
    products = products.filter(function (p) {
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q)
      );
    });
  }
  if (category)
    products = products.filter(function (p) {
      return p.category === category;
    });

  if (sortStr) {
    var parts = sortStr.split(":");
    var field = parts[0];
    var dir = (parts[1] || "asc").toLowerCase() === "desc" ? -1 : 1;
    var allowed = { price: 1, name: 1, code: 1, category: 1, id: 1 };
    if (allowed[field]) {
      products.sort(function (a, b) {
        var A = a[field],
          B = b[field];
        if (A < B) return -1 * dir;
        if (A > B) return 1 * dir;
        return 0;
      });
    }
  }

  var total = products.length;
  products = products.slice(offset, offset + limit);

  return jsonOut({
    products: products,
    total: total,
    limit: limit,
    offset: offset,
    sheet: sh.getName(),
  });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
