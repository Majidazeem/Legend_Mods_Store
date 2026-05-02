module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body || {};
  const PASS = process.env.ADMIN_PASSWORD || 'Legend@#$&';
  const TOKEN = process.env.ADMIN_SECRET_TOKEN || 'ma_legend_token';

  if (password === PASS) {
    return res.status(200).json({ success: true, token: TOKEN });
  }
  return res.status(401).json({ success: false, error: 'Wrong password' });
};
