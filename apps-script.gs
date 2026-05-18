/**
 * Google Apps Script - Webhook nhận data từ website Interview Bot
 *
 * Cách setup:
 *  1. Mở Google Sheet bạn muốn ghi data vào
 *  2. Menu: Extensions → Apps Script
 *  3. Xóa code mặc định, dán toàn bộ file này vào
 *  4. Bấm Save (icon đĩa mềm)
 *  5. Bấm Deploy → New deployment
 *  6. Bấm icon bánh răng (Select type) → chọn "Web app"
 *  7. Cấu hình:
 *     - Description: "Interview Bot Webhook"
 *     - Execute as: Me (chính bạn)
 *     - Who has access: "Anyone"  ← QUAN TRỌNG
 *  8. Bấm Deploy → cấp quyền (Authorize) → chọn tài khoản → Advanced → Go to ... (unsafe) → Allow
 *  9. Copy "Web app URL" (dạng https://script.google.com/macros/s/AKfycb.../exec)
 * 10. Dán URL này vào biến môi trường GOOGLE_SHEETS_WEBHOOK_URL
 */

const HEADER_LABELS = [
  'Thời gian',
  'Tên',
  'Email',
  'SĐT',
  'Nghề nghiệp',
  'Mức độ AI',
  'Mục tiêu',
  'Khó khăn',
  'Thời gian/ngày',
  'Ngân sách',
  'Mong muốn',
  'Kênh biết đến',
  'Phân tích AI',
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const row = body.row;

    if (!Array.isArray(row)) {
      return jsonResponse({ ok: false, error: 'row must be an array' });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Tự thêm header row nếu sheet trống
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADER_LABELS);
      // tô đậm header
      sheet.getRange(1, 1, 1, HEADER_LABELS.length)
        .setFontWeight('bold')
        .setBackground('#f0f0f0');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow(row);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doGet(e) {
  return jsonResponse({
    ok: true,
    message: 'Interview Bot Webhook is alive. Use POST to submit data.',
  });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
