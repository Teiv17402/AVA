/* Gemini API client - generates personalized interview analysis */

const QUESTION_LABELS = {
  name: 'Tên',
  email: 'Email',
  phone: 'SĐT',
  occupation: 'Nghề nghiệp',
  ai_level: 'Mức độ sử dụng AI hiện tại',
  goal: 'Mục tiêu học AI',
  pain_point: 'Khó khăn lớn nhất',
  time_commit: 'Thời gian học/ngày',
  budget: 'Ngân sách dự kiến',
  expectation: 'Mong muốn sau 21 ngày',
  channel: 'Biết đến qua kênh',
};

function formatAnswersForPrompt(answers) {
  return Object.entries(answers)
    .map(([k, v]) => `- ${QUESTION_LABELS[k] || k}: ${v}`)
    .join('\n');
}

const SYSTEM_PROMPT = `Bạn là cố vấn học AI cao cấp của khóa "21D AI Challenge" - chương trình 21 ngày làm chủ AI cho người Việt.

Nhiệm vụ: Đọc thông tin phỏng vấn của một học viên tiềm năng. Trả về CHỈ JSON hợp lệ (không có code fence, không có text thừa) theo format chính xác:

{
  "segment": "newbie" | "intermediate",
  "analysis": "<markdown analysis text>"
}

QUY TẮC PHÂN LOẠI segment:
- "newbie" — Chưa từng dùng AI HOẶC mới thử qua vài lần HOẶC ngân sách dưới 3 triệu HOẶC mục tiêu "Học cho biết, theo trend"/"Tăng năng suất công việc hiện tại"
- "intermediate" — Đã dùng AI thường xuyên/khá thành thạo VÀ mục tiêu "Kiếm thêm thu nhập"/"Tự động hoá kinh doanh"/"Chuyển nghề" VÀ ngân sách 3 triệu trở lên

Khi không chắc → ưu tiên "newbie".

Cấu trúc bắt buộc trong field "analysis" (markdown nhẹ với **bold**, KHÔNG dùng heading #, dùng \\n cho xuống dòng):

**🎯 Hồ sơ của bạn:** (1-2 câu tóm tắt người này là ai, đang ở đâu trên hành trình AI)

**💡 Lộ trình đề xuất:** (Đề xuất 3 ngày đầu tiên cụ thể họ nên học gì, dựa trên nghề nghiệp + mục tiêu)

**⚡ Lý do bạn phù hợp với 21D AI Challenge:** (1-2 câu nối ngân sách/thời gian/mong muốn của họ với giá trị khoá học)

**🎁 Quà tặng cá nhân:** (Gợi ý 1 công cụ AI miễn phí cụ thể họ có thể thử ngay hôm nay phù hợp với nghề của họ)

YÊU CẦU:
- "analysis" tổng độ dài: 150-220 từ
- Xưng "bạn", không xưng "anh/chị"
- Cụ thể, không nói chung chung
- Không hứa hẹn quá đà về thu nhập

CHÚ Ý: Output PHẢI là JSON đơn lẻ hợp lệ, KHÔNG có text trước/sau, KHÔNG có \`\`\`. Field "analysis" là 1 string duy nhất chứa markdown (escape \\n cho xuống dòng).`;

async function analyzeInterview(answers) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  // Mặc định dùng 2.5-flash (1.5 đã deprecated trên v1beta API từ 2024)
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const isThinkingModel = /^gemini-2\./.test(model);

  const userPrompt = `Thông tin học viên tiềm năng:\n${formatAnswersForPrompt(answers)}\n\nHãy phân tích và đưa ra lộ trình cá nhân hoá theo cấu trúc đã hướng dẫn.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig = {
    temperature: 0.8,
    maxOutputTokens: 2048,
    topP: 0.95,
  };
  // Tắt thinking budget cho Gemini 2.x để không tốn tokens vào reasoning, dồn cho output
  if (isThinkingModel) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  // Ghép TẤT CẢ các parts (Gemini 2.x đôi khi trả về nhiều parts: thinking + answer)
  const text = parts.map(p => p?.text || '').filter(Boolean).join('').trim();

  if (!text) {
    console.error('[gemini] empty response, finishReason:', candidate?.finishReason, 'parts:', JSON.stringify(parts));
    throw new Error('Gemini returned no text (finishReason: ' + (candidate?.finishReason || 'unknown') + ')');
  }
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    console.warn('[gemini] truncated, finishReason:', candidate.finishReason, 'length:', text.length);
  }

  // Parse JSON output: { segment, analysis }
  let cleaned = text.trim();
  // Strip markdown code fence if Gemini included it
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Fallback: try extract JSON object from anywhere in text
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch (_) {}
    }
  }
  if (!parsed || typeof parsed.analysis !== 'string') {
    console.warn('[gemini] JSON parse fail, returning raw text. Snippet:', cleaned.slice(0, 200));
    return { segment: 'newbie', analysis: cleaned };
  }
  const segment = (parsed.segment === 'intermediate') ? 'intermediate' : 'newbie';
  return { segment, analysis: parsed.analysis };
}

module.exports = { analyzeInterview, QUESTION_LABELS };
