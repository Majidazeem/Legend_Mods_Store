// api/keys.js
// POST /api/keys/verify  — website: key verify karo
// GET  /api/keys         — admin: sab keys dekho
// POST /api/keys/generate — admin: nai key banao
// POST /api/keys/revoke  — admin: key block karo
// POST /api/keys/reset   — admin: device reset karo
// DELETE /api/keys?id=X  — admin: key delete karo

const { db } = require('./_firebase');

const ADMIN_TOKEN = process.env.ADMIN_SECRET_TOKEN;
function isAdmin(req) {
  return req.headers['x-admin-token'] === ADMIN_TOKEN;
}

function genKeyStr() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = n => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `W-MALG-${seg(4)}-${seg(4)}-${seg(4)}`;
}

function getStatus(k) {
  if (k.status === 'revoked') return 'revoked';
  if (new Date(k.expiresAt) < new Date()) return 'expired';
  if (k.status === 'used') return 'used';
  return 'active';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  try {
    // ── Website: Key Verify ──
    if (req.method === 'POST' && action === 'verify') {
      const { key, deviceId } = req.body;
      if (!key || !deviceId) return res.status(400).json({ error: 'Key and deviceId required' });

      const snap = await db.ref('proKeys').once('value');
      const data = snap.val() || {};
      const entries = Object.entries(data);
      const found = entries.find(([, v]) => v.key === key.trim().toUpperCase());

      if (!found) return res.status(200).json({ valid: false, reason: 'invalid' });

      const [fk, keyData] = found;
      const status = getStatus(keyData);

      if (status === 'revoked') return res.status(200).json({ valid: false, reason: 'revoked' });
      if (status === 'expired') return res.status(200).json({ valid: false, reason: 'expired' });

      // Device lock check
      if (status === 'used' && keyData.usedBy && keyData.usedBy !== deviceId) {
        return res.status(200).json({ valid: false, reason: 'device_locked' });
      }

      // First time use — lock to device
      if (status === 'active') {
        await db.ref(`proKeys/${fk}/status`).set('used');
        await db.ref(`proKeys/${fk}/usedBy`).set(deviceId);
      }

      return res.status(200).json({
        valid: true,
        plan: keyData.plan,
        expiresAt: keyData.expiresAt
      });
    }

    // ── Admin: Sab Keys dekho ──
    if (req.method === 'GET') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const snap = await db.ref('proKeys').once('value');
      const data = snap.val() || {};
      const keys = Object.entries(data).map(([id, v]) => ({ id, ...v, status: getStatus(v) }));
      keys.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.status(200).json({ success: true, keys });
    }

    // ── Admin: Key Generate ──
    if (req.method === 'POST' && action === 'generate') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { plan, note } = req.body;
      const days = plan === 'weekly' ? 7 : 30;
      const exp = new Date();
      exp.setDate(exp.getDate() + days);
      const keyData = {
        key: genKeyStr(),
        plan: plan || 'weekly',
        note: note || '',
        createdAt: new Date().toISOString(),
        expiresAt: exp.toISOString(),
        status: 'active',
        usedBy: ''
      };
      const ref = db.ref('proKeys').push();
      await ref.set(keyData);
      return res.status(200).json({ success: true, key: keyData.key, id: ref.key });
    }

    // ── Admin: Key Revoke ──
    if (req.method === 'POST' && action === 'revoke') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id } = req.body;
      await db.ref(`proKeys/${id}/status`).set('revoked');
      return res.status(200).json({ success: true });
    }

    // ── Admin: Device Reset ──
    if (req.method === 'POST' && action === 'reset') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id } = req.body;
      await db.ref(`proKeys/${id}`).update({ status: 'active', usedBy: '' });
      return res.status(200).json({ success: true });
    }

    // ── Admin: Key Delete ──
    if (req.method === 'DELETE') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id } = req.query;
      await db.ref(`proKeys/${id}`).remove();
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('keys error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
