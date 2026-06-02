/* Vercel serverless function for /api/submit
 * Wraps the same logic from server/index.js but in Vercel format.
 */

const { analyzeInterview } = require('../server/gemini');
const { appendInterview } = require('../server/supabase');

// Rule-based segment classifier — deterministic, không phụ thuộc Gemini
function classifySegment(answers) {
  const goal = String(answers.goal || '').toLowerCase();
  const aiLevel = String(answers.ai_level || '').toLowerCase();
  const budget = String(answers.budget || '').toLowerCase();

  // Intermediate signals
  const goalIntermediate = (
    goal.includes('kiếm thêm thu nhập') ||
    goal.includes('làm freelance') ||
    goal.includes('tự động hoá') || goal.includes('tu dong hoa') ||
    goal.includes('chuyển nghề') || goal.includes('chuyen nghe') ||
    goal.includes('cơ hội nghề nghiệp')
  );
  const aiIntermediate = (
    aiLevel.includes('thường xuyên') || aiLevel.includes('thuong xuyen') ||
    aiLevel.includes('khá thành thạo') || aiLevel.includes('kha thanh thao') ||
    aiLevel.includes('thành thạo')
  );
  const budgetIntermediate = (
    budget.includes('3 - 5') || budget.includes('3-5') ||
    budget.includes('5 - 10') || budget.includes('5-10') ||
    budget.includes('trên 10') || budget.includes('tren 10') ||
    budget.includes('10 triệu') || budget.includes('10 trieu')
  );

  // Intermediate: cần goal Intermediate VÀ (ai HOẶC budget Intermediate)
  if (goalIntermediate && (aiIntermediate || budgetIntermediate)) {
    return 'intermediate';
  }
  return 'newbie';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { answers, submittedAt } = req.body || {};

  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ ok: false, error: 'answers is required' });
  }
  if (!answers.name || !answers.email) {
    return res.status(400).json({ ok: false, error: 'name and email required' });
  }

  // Rule-based segment (deterministic, không lệ thuộc Gemini)
  let segment = classifySegment(answers);

  let analysis = null;
  let analysisError = null;
  try {
    const result = await analyzeInterview(answers);
    if (typeof result === 'string') {
      analysis = result;
    } else {
      analysis = result.analysis;
      // Gemini segment chỉ override RULE nếu rule = newbie và Gemini = intermediate
      // (tránh trường hợp Gemini bị lệ thuộc fallback default newbie)
      if (result.segment === 'intermediate' && segment === 'newbie') {
        segment = 'intermediate';
      }
    }
  } catch (err) {
    analysisError = err.message;
    console.error('[gemini]', err.message);
  }

  let savedToSupabase = false;
  let supabaseError = null;
  try {
    await appendInterview({ answers, submittedAt, analysis, segment });
    savedToSupabase = true;
  } catch (err) {
    supabaseError = err.message;
    console.error('[supabase]', err.message);
  }

  return res.status(200).json({
    ok: true,
    analysis,
    segment,
    savedToSupabase,
    analysisError,
    supabaseError,
  });
};