const { db } = require('./_firebase');

function isAdmin(req) {
  return req.headers['x-admin-token'] === (process.env.ADMIN_SECRET_TOKEN || 'ma_legend_token');
}

function genKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = n => Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  return `W-MALG-${seg(4)}-${seg(4)}-${seg(4)}`;
}

function getStatus(k) {
  if (k.status === 'revoked') return 'revoked';
  if (new Date(k.expiresAt) < new Date()) return 'expired';
  if (k.status === 'used') return 'used';
  return 'active';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  try {
    // Website: Key verify
    if (req.method === 'POST' && action === 'verify') {
      const { key, deviceId } = req.body || {};
      if (!key || !deviceId) return res.status(400).json({ error: 'Key and deviceId required' });

      const snap = await db.ref('proKeys').once('value');
      const data = snap.val() || {};
      const entry = Object.entries(data).find(([, v]) => (v.key||'').trim().toUpperCase() === key.trim().toUpperCase());

      if (!entry) return res.json({ valid: false, reason: 'invalid' });

      const [fk, keyData] = entry;
      const status = getStatus(keyData);

      if (status === 'revoked') return res.json({ valid: false, reason: 'revoked' });
      if (status === 'expired') return res.json({ valid: false, reason: 'expired' });
      if (status === 'used' && keyData.usedBy && keyData.usedBy !== deviceId) {
        return res.json({ valid: false, reason: 'device_locked' });
      }

      if (status === 'active') {
        await db.ref(`proKeys/${fk}/status`).set('used');
        await db.ref(`proKeys/${fk}/usedBy`).set(deviceId);
      }

      return res.json({ valid: true, plan: keyData.plan, expiresAt: keyData.expiresAt });
    }

    // Admin: sab keys
    if (req.method === 'GET') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const snap = await db.ref('proKeys').once('value');
      const data = snap.val() || {};
      const keys = Object.entries(data).map(([id, v]) => ({ id, ...v, status: getStatus(v) }));
      keys.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.json({ success: true, keys });
    }

    // Admin: key generate
    if (req.method === 'POST' && action === 'generate') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { plan, note } = req.body || {};
      const days = plan === 'monthly' ? 30 : 7;
      const exp = new Date();
      exp.setDate(exp.getDate() + days);
      const keyData = {
        key: genKey(), plan: plan || 'weekly', note: note || '',
        createdAt: new Date().toISOString(), expiresAt: exp.toISOString(),
        status: 'active', usedBy: ''
      };
      const ref = db.ref('proKeys').push();
      await ref.set(keyData);
      return res.json({ success: true, key: keyData.key, id: ref.key });
    }

    // Admin: revoke
    if (req.method === 'POST' && action === 'revoke') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id } = req.body || {};
      await db.ref(`proKeys/${id}/status`).set('revoked');
      return res.json({ success: true });
    }

    // Admin: device reset
    if (req.method === 'POST' && action === 'reset') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id } = req.body || {};
      await db.ref(`proKeys/${id}`).update({ status: 'active', usedBy: '' });
      return res.json({ success: true });
    }

    // Admin: delete
    if (req.method === 'DELETE') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id } = req.query;
      await db.ref(`proKeys/${id}`).remove();
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('keys error:', e);
    return res.status(500).json({ error: e.message });
  }
};
