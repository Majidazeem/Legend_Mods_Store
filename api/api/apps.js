// api/apps.js
// GET  /api/apps        — website: sab apps load karo
// POST /api/apps        — admin: naya app add karo
// PUT  /api/apps        — admin: app update karo
// DELETE /api/apps?id=X — admin: app delete karo

const { db } = require('./_firebase');

// Admin token verify — sirf admin panel write kar sakta hai
const ADMIN_TOKEN = process.env.ADMIN_SECRET_TOKEN;

function isAdmin(req) {
  return req.headers['x-admin-token'] === ADMIN_TOKEN;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET: sab apps — website aur admin dono ke liye ──
    if (req.method === 'GET') {
      const snap = await db.ref('apps').once('value');
      const data = snap.val() || {};
      const apps = Object.keys(data).map(k => ({ id: k, ...data[k] }));
      return res.status(200).json({ success: true, apps });
    }

    // ── POST: naya app add karo — sirf admin ──
    if (req.method === 'POST') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const app = req.body;
      if (!app.name || !app.link) return res.status(400).json({ error: 'Name and link required' });
      app.uploadDate = app.uploadDate || new Date().toISOString();
      const ref = db.ref('apps').push();
      await ref.set(app);
      return res.status(200).json({ success: true, id: ref.key });
    }

    // ── PUT: app update karo — sirf admin ──
    if (req.method === 'PUT') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id, ...app } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      await db.ref(`apps/${id}`).set(app);
      return res.status(200).json({ success: true });
    }

    // ── DELETE: app hatao — sirf admin ──
    if (req.method === 'DELETE') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID required' });
      await db.ref(`apps/${id}`).remove();
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('apps error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
