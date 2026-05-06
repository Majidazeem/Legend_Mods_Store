// ============================================================
//  MA LEGEND  —  Serverless API  (Vercel)
//  Firebase URL aur credentials sirf yahan hain — client ko
//  kabhi nahi jaate, inspect se nahi dikhte.
// ============================================================

const https = require("https");

// ─── Firebase config (environment variables se aata hai) ────
// Vercel Dashboard → Settings → Environment Variables mein daalein:
//   FIREBASE_DB_URL   =  https://my-website-store-e3428-default-rtdb.firebaseio.com
//   FIREBASE_SECRET   =  aapka database secret / service account token
//   ADMIN_API_KEY     =  koi bhi random strong string, admin panel isay use karega
// ─────────────────────────────────────────────────────────────
const DB_URL      = process.env.FIREBASE_DB_URL;
const DB_SECRET   = process.env.FIREBASE_SECRET;
const ADMIN_KEY   = process.env.ADMIN_API_KEY;

// ── Simple CORS headers ──────────────────────────────────────
function cors(req, res) {
  var origin = req.headers.origin || "";
  // Allow: your Vercel site + localhost (for local admin panel)
  var allowed = [
    "https://legend-mods-store.vercel.app",
    "http://localhost",
    "http://127.0.0.1",
    "null"   // local file:// open
  ];
  var ok = allowed.some(function(a){ return origin.startsWith(a); }) || origin === "";
  res.setHeader("Access-Control-Allow-Origin",  ok ? (origin || "*") : "https://legend-mods-store.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-admin-key");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

// ── Firebase REST helper ─────────────────────────────────────
function fbReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const sep   = path.includes("?") ? "&" : "?";
    const url   = new URL(`${DB_URL}/${path}${sep}auth=${DB_SECRET}`);
    const data  = body ? JSON.stringify(body) : null;
    const opts  = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers:  { "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) }
    };
    const req = https.request(opts, r => {
      let s = "";
      r.on("data", c => s += c);
      r.on("end",  () => {
        try { resolve(JSON.parse(s)); }
        catch { resolve(s); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Auth helpers ─────────────────────────────────────────────
function isAdmin(req) {
  return req.headers["x-admin-key"] === ADMIN_KEY;
}

// ── Main handler ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action } = req.query;
  const body       = req.body || {};

  try {

    // ════════════════════════════════════════════
    //  PUBLIC  ROUTES  (no auth needed)
    // ════════════════════════════════════════════

    // GET /api/data?action=apps
    if (action === "apps" && req.method === "GET") {
      const data = await fbReq("GET", "apps.json");
      if (!data || typeof data !== "object") return res.json({ apps: [] });
      const apps = Object.entries(data).map(([k, v]) => ({ firebaseKey: k, ...v }));
      apps.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
      return res.json({ apps });
    }

    // GET /api/data?action=settings
    if (action === "settings" && req.method === "GET") {
      const [site, contact] = await Promise.all([
        fbReq("GET", "siteSettings.json"),
        fbReq("GET", "contactSettings.json")
      ]);
      return res.json({ site: site || {}, contact: contact || {} });
    }

    // GET /api/data?action=reports
    if (action === "reports" && req.method === "GET") {
      const data = await fbReq("GET", "reportTexts.json");
      if (!data || typeof data !== "object") return res.json({ texts: [] });
      const texts = Object.entries(data).map(([k, v]) => ({ firebaseKey: k, ...v }));
      return res.json({ texts });
    }

    // POST /api/data?action=verify-key   { key, deviceId }
    if (action === "verify-key" && req.method === "POST") {
      const { key, deviceId } = body;
      if (!key) return res.status(400).json({ ok: false, msg: "Key missing" });

      const data = await fbReq("GET", "proKeys.json");
      if (!data) return res.status(400).json({ ok: false, msg: "Invalid key!" });

      let found = null, foundFk = null;
      for (const [k, v] of Object.entries(data)) {
        if ((v.key || "").trim().toUpperCase() === key.trim().toUpperCase()) {
          found = v; foundFk = k; break;
        }
      }
      if (!found)                            return res.json({ ok: false, msg: "Wrong key! Admin se lein." });
      if (found.status === "revoked")        return res.json({ ok: false, msg: "Yeh key block ho chuki hai!" });
      if (new Date(found.expiresAt) < new Date()) return res.json({ ok: false, msg: "Key expire ho gayi! Nai key lein." });
      if (found.status === "used" && found.usedBy && found.usedBy !== deviceId)
                                             return res.json({ ok: false, msg: "Key dusray device pe active hai!" });

      // Mark used
      await fbReq("PATCH", `proKeys/${foundFk}.json`, { status: "used", usedBy: deviceId });
      return res.json({ ok: true, plan: found.plan, expiresAt: found.expiresAt });
    }

    // ════════════════════════════════════════════
    //  ADMIN  ROUTES  (x-admin-key header required)
    // ════════════════════════════════════════════
    if (!isAdmin(req)) {
      return res.status(403).json({ ok: false, msg: "Unauthorized" });
    }

    // ── APPS ─────────────────────────────────────────────────

    // POST /api/data?action=add-app
    if (action === "add-app" && req.method === "POST") {
      const { app } = body;
      if (!app || !app.name) return res.status(400).json({ ok: false, msg: "App data missing" });
      app.uploadDate = new Date().toISOString();
      const result = await fbReq("POST", "apps.json", app);
      return res.json({ ok: true, firebaseKey: result.name });
    }

    // POST /api/data?action=update-app   { firebaseKey, app }
    if (action === "update-app" && req.method === "POST") {
      const { firebaseKey, app } = body;
      if (!firebaseKey) return res.status(400).json({ ok: false });
      await fbReq("PUT", `apps/${firebaseKey}.json`, app);
      return res.json({ ok: true });
    }

    // DELETE /api/data?action=delete-app   { firebaseKey }
    if (action === "delete-app" && req.method === "DELETE") {
      const { firebaseKey } = body;
      await fbReq("DELETE", `apps/${firebaseKey}.json`);
      return res.json({ ok: true });
    }

    // ── PRO KEYS ──────────────────────────────────────────────

    // GET /api/data?action=keys
    if (action === "keys" && req.method === "GET") {
      const data = await fbReq("GET", "proKeys.json");
      if (!data || typeof data !== "object") return res.json({ keys: [] });
      const keys = Object.entries(data).map(([k, v]) => ({ fk: k, ...v }));
      keys.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.json({ keys });
    }

    // POST /api/data?action=add-key   { key: {...keyData} }
    if (action === "add-key" && req.method === "POST") {
      const result = await fbReq("POST", "proKeys.json", body.key);
      return res.json({ ok: true, fk: result.name });
    }

    // POST /api/data?action=update-key   { fk, data }
    if (action === "update-key" && req.method === "POST") {
      const { fk, data } = body;
      await fbReq("PATCH", `proKeys/${fk}.json`, data);
      return res.json({ ok: true });
    }

    // DELETE /api/data?action=delete-key   { fk }
    if (action === "delete-key" && req.method === "DELETE") {
      await fbReq("DELETE", `proKeys/${body.fk}.json`);
      return res.json({ ok: true });
    }

    // ── REPORT TEXTS ─────────────────────────────────────────

    // POST /api/data?action=add-report   { text }
    if (action === "add-report" && req.method === "POST") {
      body.text.updatedAt = new Date().toISOString();
      const result = await fbReq("POST", "reportTexts.json", body.text);
      return res.json({ ok: true, fk: result.name });
    }

    // POST /api/data?action=update-report   { fk, text }
    if (action === "update-report" && req.method === "POST") {
      body.text.updatedAt = new Date().toISOString();
      await fbReq("PUT", `reportTexts/${body.fk}.json`, body.text);
      return res.json({ ok: true });
    }

    // DELETE /api/data?action=delete-report   { fk }
    if (action === "delete-report" && req.method === "DELETE") {
      await fbReq("DELETE", `reportTexts/${body.fk}.json`);
      return res.json({ ok: true });
    }

    // ── SETTINGS ─────────────────────────────────────────────

    // POST /api/data?action=save-settings   { site, contact }
    if (action === "save-settings" && req.method === "POST") {
      const tasks = [];
      if (body.site)    tasks.push(fbReq("PUT", "siteSettings.json",    body.site));
      if (body.contact) tasks.push(fbReq("PUT", "contactSettings.json", body.contact));
      await Promise.all(tasks);
      return res.json({ ok: true });
    }

    // ── ADMIN STATS ───────────────────────────────────────────

    // GET /api/data?action=stats
    if (action === "stats" && req.method === "GET") {
      const [apps, keys, reports] = await Promise.all([
        fbReq("GET", "apps.json"),
        fbReq("GET", "proKeys.json"),
        fbReq("GET", "reportTexts.json")
      ]);

      const appList = apps && typeof apps === "object" ? Object.values(apps) : [];
      const keyList = keys && typeof keys === "object" ? Object.values(keys) : [];
      const now     = new Date();

      const getKSt = k => {
        if (k.status === "revoked") return "revoked";
        if (new Date(k.expiresAt) < now) return "expired";
        if (k.status === "used") return "used";
        return "active";
      };

      return res.json({
        apps: {
          total:    appList.length,
          whatsapp: appList.filter(a => a.category === "whatsapp").length,
          apps:     appList.filter(a => a.category === "apps").length,
          tools:    appList.filter(a => a.category === "tools").length,
          bancheck: appList.filter(a => a.category === "bancheck").length,
        },
        keys: {
          total:   keyList.length,
          active:  keyList.filter(k => getKSt(k) === "active").length,
          used:    keyList.filter(k => getKSt(k) === "used").length,
          expired: keyList.filter(k => getKSt(k) === "expired").length,
          revoked: keyList.filter(k => getKSt(k) === "revoked").length,
        },
        reports: reports && typeof reports === "object" ? Object.keys(reports).length : 0
      });
    }

    return res.status(404).json({ ok: false, msg: "Unknown action" });

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
};
