/* /api/leads — Admin xem danh sách leads từ bot phỏng vấn
 * Bảo vệ bằng query ?token=<ADMIN_TOKEN> (env var)
 */

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = (req.query && req.query.token) || (req.url && new URL(req.url, 'http://x').searchParams.get('token'));
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  if (!ADMIN_TOKEN) {
    return res.status(500).json({ ok: false, error: 'ADMIN_TOKEN env not configured' });
  }
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, error: 'Supabase env not configured' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ?limit=200 mặc định, ?days=30 lọc theo ngày
  const limit = Math.min(parseInt((req.query && req.query.limit) || '200', 10), 1000);
  const days = parseInt((req.query && req.query.days) || '0', 10);

  let q = supabase
    .from('interview_leads')
    .select('id, name, email, phone, answers, ai_analysis, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    q = q.gte('created_at', since);
  }

  const { data, error } = await q;
  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true, count: data.length, leads: data });
};
