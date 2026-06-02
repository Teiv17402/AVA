/* Vercel serverless function for /api/submit
 * Wraps the same logic from server/index.js but in Vercel format.
 */

const { analyzeInterview } = require('../server/gemini');
const { appendInterview } = require('../server/supabase');

// Scoring system 0-100 — cộng điểm từ 5 yếu tố, threshold 50 → intermediate
// Returns { segment, score, breakdown } để admin review
function classifySegment(answers) {
  const aiLevel = String(answers.ai_level || '').toLowerCase();
  const goal = String(answers.goal || '').toLowerCase();
  const budget = String(answers.budget || '').toLowerCase();
  const time = String(answers.time_commit || '').toLowerCase();
  const pain = String(answers.pain_point || '').toLowerCase();

  // 1. AI Level (max 30)
  let aiScore = 0;
  if (aiLevel.includes('thành thạo')) aiScore = 30;
  else if (aiLevel.includes('thường xuyên') || aiLevel.includes('thuong xuyen')) aiScore = 20;
  else if (aiLevel.includes('thử qua') || aiLevel.includes('thu qua') || aiLevel.includes('vài lần')) aiScore = 10;
  // else (chưa bao giờ) = 0

  // 2. Goal (max 25)
  let goalScore = 0;
  if (goal.includes('tự động hoá') || goal.includes('tu dong hoa') || goal.includes('doanh nghiệp')) goalScore = 25;
  else if (goal.includes('kiếm thêm') || goal.includes('kiem them') || goal.includes('freelance')) goalScore = 22;
  else if (goal.includes('chuyển nghề') || goal.includes('chuyen nghe') || goal.includes('cơ hội nghề')) goalScore = 15;
  else if (goal.includes('tăng năng suất') || goal.includes('tang nang suat')) goalScore = 5;
  // else (học cho biết) = 0

  // 3. Budget (max 25)
  let budgetScore = 0;
  if (budget.includes('trên 10') || budget.includes('tren 10') || budget.includes('nghiêm túc')) budgetScore = 25;
  else if (budget.includes('5 - 10') || budget.includes('5-10')) budgetScore = 22;
  else if (budget.includes('3 - 5') || budget.includes('3-5')) budgetScore = 16;
  else if (budget.includes('1 - 3') || budget.includes('1-3')) budgetScore = 8;
  // else (dưới 1 triệu) = 0

  // 4. Time commit (max 10)
  let timeScore = 0;
  if (time.includes('trên 2') || time.includes('tren 2')) timeScore = 10;
  else if (time.includes('1 - 2') || time.includes('1-2')) timeScore = 7;
  else if (time.includes('30 - 60') || time.includes('30-60')) timeScore = 4;
  // else (<30p) = 0

  // 5. Pain point keywords (max 10) — bonus điểm nếu nhắc tới kiếm tiền/video/kênh
  let painScore = 0;
  const painKeywords = ['kiếm tiền', 'thu nhập', 'video', 'kênh', 'viral', 'affiliate', 'doanh thu', 'khách hàng', 'bán hàng'];
  painKeywords.forEach(k => {
    if (pain.includes(k)) painScore += 2;
  });
  if (painScore > 10) painScore = 10;

  const total = aiScore + goalScore + budgetScore + timeScore + painScore;
  const segment = total >= 50 ? 'intermediate' : 'newbie';

  return {
    segment,
    score: total,
    breakdown: { ai: aiScore, goal: goalScore, budget: budgetScore, time: timeScore, pain: painScore }
  };
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

  // Scoring 0-100 (deterministic, không phụ thuộc Gemini)
  const scoring = classifySegment(answers);
  let segment = scoring.segment;
  console.log('[segment]', scoring);

  let analysis = null;
  let analysisError = null;
  try {
    const result = await analyzeInterview(answers);
    if (typeof result === 'string') {
      analysis = result;
    } else {
      analysis = result.analysis;
      // Gemini hint chỉ override khi score sát ranh giới (45-54) — vùng "không chắc"
      if (scoring.score >= 45 && scoring.score < 50 && result.segment === 'intermediate') {
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
    await appendInterview({ answers, submittedAt, analysis, segment, score: scoring.score, scoreBreakdown: scoring.breakdown });
    savedToSupabase = true;
  } catch (err) {
    supabaseError = err.message;
    console.error('[supabase]', err.message);
  }

  return res.status(200).json({
    ok: true,
    analysis,
    segment,
    score: scoring.score,
    scoreBreakdown: scoring.breakdown,
    savedToSupabase,
    analysisError,
    supabaseError,
  });
};