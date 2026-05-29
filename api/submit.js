/* Vercel serverless function for /api/submit - SELF-CONTAINED (no ../server/ require)
 * Inlines analyzeInterview() + appendInterview() to avoid Vercel bundling issues.
 */

const { createClient } = require('@supabase/supabase-js');

const QUESTION_LABELS = {
  name: 'Tên', email: 'Email', phone: 'SĐT',
  occupation: 'Nghề nghiệp', ai_level: 'Mức độ sử dụng AI hiện tại',
  goal: 'Mục tiêu học AI', pain_point: 'Khó khăn lớn nhất',
  time_commit: 'Thời gian học/ngày', budget: 'Ngân sách dự kiến',
  expectation: 'Mong muốn sau 21 ngày', channel: 'Biết đến qua kênh',
};

const SYSTEM_PROMPT = `Bạn là cố vấn học AI cao cấp của khóa "21D AI Challenge" - chương trình 21 ngày làm chủ AI cho người Việt.

Nhiệm vụ: Đọc thông tin phỏng vấn của một học viên tiềm năng và đưa ra phân tích cá nhân hoá NGẮN GỌN, CỤ THỂ, ẤM ÁP bằng tiếng Việt.

Cấu trúc bắt buộc của câu trả lời (dùng markdown nhẹ với **bold**, không dùng heading #):

**🎯 Hồ sơ của bạn:** (1-2 câu tóm tắt người này là ai, đang ở đâu trên hành trình AI)

**💡 Lộ trình đề xuất:** (Đề xuất 3 ngày đầu tiên cụ thể họ nên học gì, dựa trên nghề nghiệp + mục tiêu)

**⚡ Lý do bạn phù hợp với 21D AI Challenge:** (1-2 câu nối ngân sách/thời gian/mong muốn của họ với giá trị khoá học)

**🎁 Quà tặng cá nhân:** (Gợi ý 1 công cụ AI miễn phí cụ thể họ có thể thử ngay hôm nay phù hợp với nghề của họ)

YÊU CẦU:
- Tổng độ dài: 150-220 từ
- Xưng "bạn", không xưng "anh/chị"
- Cụ thể, không nói chung chung
- Không hứa hẹn quá đà về thu nhập
- Nếu họ chọn "Học cho biết, theo trend" - vẫn nhiệt tình, không phán xét
- Nếu ngân sách "Dưới 1 triệu" - đề xuất gói khởi đầu, không ép buộc`;

function formatAnswersForPrompt(answers) {
  return Object.entries(answers).map(([k, v]) => `- ${QUESTION_LABELS[k] || k}: ${v}`).join('\n');
}

async function analyzeInterview(answers) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const isThinkingModel = /^gemini-2\./.test(model);
  const userPrompt = `Thông tin học viên tiềm năng:\n${formatAnswersForPrompt(answers)}\n\nHãy phân tích và đưa ra lộ trình cá nhân hoá theo cấu trúc đã hướng dẫn.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const generationConfig = { temperature: 0.8, maxOutputTokens: 2048, topP: 0.95 };
  if (isThinkingModel) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const body = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig,
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.substring(0, 300)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p?.text || '').filter(Boolean).join('').trim();
  if (!text) throw new Error('Gemini empty response');
  return text;
}

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env missing');
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

async function appendInterview({ answers, submittedAt, analysis }) {
  const sb = getSupabase();
  const row = {
    name: answers?.name || null,
    email: answers?.email || null,
    phone: answers?.phone || null,
    answers: answers || null,
    ai_analysis: analysis || null,
    metadata: { submittedAt: submittedAt || new Date().toISOString() },
  };
  const { data, error } = await sb.from('interview_leads').insert([row]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const { answers, submittedAt } = req.body || {};
  if (!answers || typeof answers !== 'object') return res.status(400).json({ ok: false, error: 'answers is required' });
  if (!answers.name || !answers.email) return res.status(400).json({ ok: false, error: 'name and email required' });

  let analysis = null, analysisError = null;
  try { analysis = await analyzeInterview(answers); }
  catch (err) { analysisError = err.message; console.error('[gemini]', err.message); }

  let savedToSupabase = false, supabaseError = null;
  try { await appendInterview({ answers, submittedAt, analysis }); savedToSupabase = true; }
  catch (err) { supabaseError = err.message; console.error('[supabase]', err.message); }

  return res.status(200).json({ ok: true, analysis, savedToSupabase, analysisError, supabaseError });
};
