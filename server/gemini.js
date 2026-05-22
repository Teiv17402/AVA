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

async function analyzeInterview(answers) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const userPrompt = `Thông tin học viên tiềm năng:\n${formatAnswersForPrompt(answers)}\n\nHãy phân tích và đưa ra lộ trình cá nhân hoá theo cấu trúc đã hướng dẫn.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 700,
      topP: 0.95,
    },
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
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned no text');
  }
  return text.trim();
}

module.exports = { analyzeInterview, QUESTION_LABELS };
