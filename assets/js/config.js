// Rename this file to config.js
window.APP_CONFIG = {
  // Products JSON (Apps Script Web App)
  SHEETS_JSON_URL:
    "https://script.google.com/macros/s/AKfycbxgOl_u0NM8qzBNDP6exzXjDrjMfH9UwKToeyN5jGjkrXzXLEDtVNgUGJc7yb-4N0swJg/exec",

  // Optional: if you ever use filenames in your sheet (e.g., "mug.jpg"),
  // they'll be resolved as "./assets/img/mug.jpg"
  ASSET_BASE: "./assets/img/",

  // Drive image handling
  // MODE "proxy" -> use your Apps Script (same web app) to serve images by ID (no public sharing needed)
  // MODE "direct" -> build Drive "uc?export=view&id=" URLs (files must be public)
  DRIVE: {
    MODE: "proxy",
    WEB_APP_URL:
      "https://script.google.com/macros/s/AKfycbxgOl_u0NM8qzBNDP6exzXjDrjMfH9UwKToeyN5jGjkrXzXLEDtVNgUGJc7yb-4N0swJg/exec",
  },

  // Telegram settings
  TELEGRAM: {
    SELLER_USERNAME: "charynhor", // without "@"
    MODE: "dm", // "dm" or "share"
  },
};
