/* Vercel serverless function for /api/submit
 * Wraps the same logic from server/index.js but in Vercel format.
 */

const { analyzeInterview } = require('../server/gemini');
const { appendInterview } = require('../server/supabase');

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

  let analysis = null;
  let segment = 'newbie'; // default
  let analysisError = null;
  try {
    const result = await analyzeInterview(answers);
    // result là object { segment, analysis } hoặc string (backward compat)
    if (typeof result === 'string') {
      analysis = result;
    } else {
      analysis = result.analysis;
      segment = result.segment || 'newbie';
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