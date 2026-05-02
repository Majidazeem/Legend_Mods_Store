const { db } = require('./_firebase');

function isAdmin(req) {
  return req.headers['x-admin-token'] === (process.env.ADMIN_SECRET_TOKEN || 'ma_legend_token');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET - sab apps
    if (req.method === 'GET') {
      const snap = await db.ref('apps').once('value');
      const data = snap.val() || {};
      const apps = Object.entries(data).map(([id, v]) => ({ id, ...v }));
      apps.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
      return res.status(200).json({ success: true, apps });
    }

    // POST - naya app
    if (req.method === 'POST') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const app = req.body;
      if (!app.name || !app.link) return res.status(400).json({ error: 'Name and link required' });
      app.uploadDate = app.uploadDate || new Date().toISOString();
      const ref = db.ref('apps').push();
      await ref.set(app);
      return res.status(200).json({ success: true, id: ref.key });
    }

    // PUT - app update
    if (req.method === 'PUT') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id, ...app } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      await db.ref(`apps/${id}`).set(app);
      return res.status(200).json({ success: true });
    }

    // DELETE - app hatao
    if (req.method === 'DELETE') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID required' });
      await db.ref(`apps/${id}`).remove();
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('apps error:', e);
    return res.status(500).json({ error: e.message });
  }
};
