// api/settings.js
// GET  /api/settings?type=site       — website: site settings
// GET  /api/settings?type=contact    — website: contact info
// GET  /api/settings?type=reports    — website: report texts
// POST /api/settings?type=site       — admin: save site settings
// POST /api/settings?type=contact    — admin: save contact settings
// POST /api/settings?type=report     — admin: add/edit report text
// DELETE /api/settings?type=report&id=X — admin: delete report text

const { db } = require('./_firebase');

const ADMIN_TOKEN = process.env.ADMIN_SECRET_TOKEN;
function isAdmin(req) {
  return req.headers['x-admin-token'] === ADMIN_TOKEN;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query.type;

  try {
    // ── GET: Public data (website parhta hai) ──
    if (req.method === 'GET') {
      if (type === 'site') {
        const snap = await db.ref('siteSettings').once('value');
        return res.status(200).json({ success: true, data: snap.val() || {} });
      }
      if (type === 'contact') {
        const snap = await db.ref('contactSettings').once('value');
        return res.status(200).json({ success: true, data: snap.val() || {} });
      }
      if (type === 'reports') {
        const snap = await db.ref('reportTexts').once('value');
        const data = snap.val() || {};
        const texts = Object.entries(data).map(([id, v]) => ({ id, ...v }));
        return res.status(200).json({ success: true, texts });
      }
      return res.status(400).json({ error: 'Invalid type' });
    }

    // ── POST: Admin write operations ──
    if (req.method === 'POST') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });

      if (type === 'site') {
        await db.ref('siteSettings').set(req.body);
        return res.status(200).json({ success: true });
      }
      if (type === 'contact') {
        await db.ref('contactSettings').set(req.body);
        return res.status(200).json({ success: true });
      }
      if (type === 'report') {
        const { id, ...data } = req.body;
        data.updatedAt = new Date().toISOString();
        if (id) {
          await db.ref(`reportTexts/${id}`).set(data);
        } else {
          const ref = db.ref('reportTexts').push();
          await ref.set(data);
        }
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Invalid type' });
    }

    // ── DELETE: Report text hatao ──
    if (req.method === 'DELETE') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      if (type === 'report') {
        const { id } = req.query;
        await db.ref(`reportTexts/${id}`).remove();
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Invalid type' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('settings error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
