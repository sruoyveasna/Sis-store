// Rename this file to config.js
window.APP_CONFIG = {
  // 1) After you deploy your Google Apps Script Web App, paste its URL here:
  SHEETS_JSON_URL:
    "https://script.google.com/macros/s/AKfycbxgOl_u0NM8qzBNDP6exzXjDrjMfH9UwKToeyN5jGjkrXzXLEDtVNgUGJc7yb-4N0swJg/exec",

  // 2) Telegram settings:
  // - SELLER_USERNAME: Telegram username without "@"
  // - MODE: "dm" tries to open a DM to the seller; fallback is the share picker.
  TELEGRAM: {
    SELLER_USERNAME: "charynhor",
    MODE: "dm", // "dm" or "share"
  },
};
