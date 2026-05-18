# 21D AI Challenge — Interview Bot

Website chatbot phỏng vấn khách hàng tiềm năng cho khoá học AI. Người dùng vào → bot hỏi 11 câu → AI Gemini phân tích cá nhân hoá → kết quả lưu Google Sheets.

## 🚀 Demo nhanh trên máy bạn

```bash
# 1. Cài Node.js >= 18 (https://nodejs.org)
# 2. Mở terminal trong thư mục interview-bot
npm install
cp .env.example .env
# 3. Mở .env, điền GEMINI_API_KEY (xem mục dưới)
#    Tạm thời chưa có Google Sheet cũng chạy được, chỉ là không lưu data
npm start
# 4. Mở http://localhost:3000
```

---

## 🔑 Bước 1 — Lấy Gemini API Key (MIỄN PHÍ)

1. Vào https://aistudio.google.com/app/apikey
2. Đăng nhập bằng tài khoản Google
3. Bấm **"Create API key"** → chọn project bất kỳ (hoặc tạo mới)
4. Copy chuỗi key dạng `AIzaSy...`
5. Mở file `.env`, dán vào:
   ```
   GEMINI_API_KEY=AIzaSy...
   ```

**Hạn mức free:** 15 requests/phút, 1 triệu tokens/ngày — quá đủ cho hàng nghìn lượt phỏng vấn/ngày.

---

## 📊 Bước 2 — Kết nối Google Sheets

### 2.1 Tạo Google Sheet
1. Vào https://sheets.new để tạo sheet mới
2. Đặt tên ví dụ: **"21D AI Challenge - Interview Leads"**
3. Copy **Sheet ID** từ URL:
   `https://docs.google.com/spreadsheets/d/`**`<SHEET_ID_Ở_ĐÂY>`**`/edit`
4. Dán vào `.env`:
   ```
   GOOGLE_SHEET_ID=1abc...xyz
   ```

### 2.2 Tạo Service Account (để code có quyền ghi sheet)

1. Vào https://console.cloud.google.com/projectcreate → tạo project tên gì cũng được
2. Vào https://console.cloud.google.com/apis/library/sheets.googleapis.com → bấm **Enable**
3. Vào https://console.cloud.google.com/iam-admin/serviceaccounts → **Create Service Account**
   - Tên: `interview-bot`
   - Role: bỏ qua (Continue → Done)
4. Bấm vào service account vừa tạo → tab **Keys** → **Add Key → Create new key → JSON** → tải file `.json` về máy
5. Mở file JSON đó, copy **toàn bộ nội dung**
6. **Quan trọng:** chuyển nội dung JSON thành 1 dòng (tools online: jsonformatter.org → Minify), rồi dán vào `.env`:
   ```
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...",...}
   ```

### 2.3 Chia sẻ Sheet cho Service Account
1. Mở file JSON, tìm trường `client_email` (dạng `interview-bot@xxx.iam.gserviceaccount.com`)
2. Mở Google Sheet của bạn → bấm **Share** → dán email đó → cấp quyền **Editor** → Send

✅ Xong! Mỗi lượt phỏng vấn sẽ tự thêm 1 dòng mới vào sheet (lần đầu tự tạo header).

---

## 🌐 Bước 3 — Deploy lên Internet

### Lựa chọn A: Render.com (RECOMMENDED — free tier, dễ nhất)

1. Đăng ký https://render.com (free, đăng nhập bằng GitHub)
2. Push code lên GitHub repo (private cũng được):
   ```bash
   cd interview-bot
   git init && git add . && git commit -m "init"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```
3. Trên Render → **New + → Web Service** → kết nối GitHub repo
4. Cấu hình:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variables:** copy từ `.env` vào (lần lượt từng biến)
5. Bấm **Create Web Service** → đợi 2-3 phút → có URL `https://your-app.onrender.com`

### Lựa chọn B: Railway.app

Tương tự Render. Vào railway.app → New Project → Deploy from GitHub → thêm env vars → done.

### Lựa chọn C: VPS riêng (DigitalOcean / Vultr / Hostinger VPS)

```bash
# Trên VPS Ubuntu
sudo apt update && sudo apt install nodejs npm nginx -y
git clone <repo> && cd interview-bot
npm install
# tạo file .env
nano .env
# chạy bằng PM2 để tự restart
npm i -g pm2
pm2 start server/index.js --name interview-bot
pm2 startup && pm2 save
# Cấu hình nginx reverse proxy + SSL (Let's Encrypt)
```

### Domain riêng?
Trỏ DNS A record về IP server (hoặc CNAME về `your-app.onrender.com`) → cấu hình trong dashboard hosting.

---

## 🎨 Tuỳ biến

| Cần đổi gì | Sửa file |
|---|---|
| Câu hỏi phỏng vấn | `public/questions.json` |
| Màu sắc, logo, font | `public/style.css` (đầu file có biến `--brand`, `--bg`) |
| Tên & logo header | `public/index.html` (tìm `21D AI Challenge`) |
| Cách AI phân tích | `server/gemini.js` (sửa `SYSTEM_PROMPT`) |
| URL bấm "Tham gia ngay" | `public/app.js` (tìm `theallinplan.com`) |
| Cột Google Sheet | `server/sheets.js` (sửa `HEADER_KEYS` + `HEADER_LABELS`) |

---

## 🏗️ Cấu trúc thư mục

```
interview-bot/
├── public/                # Frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── questions.json     # ← Sửa câu hỏi ở đây
├── server/                # Backend Node.js
│   ├── index.js           # Express server
│   ├── gemini.js          # Gọi Gemini API
│   └── sheets.js          # Ghi Google Sheets
├── .env.example
├── package.json
└── README.md
```

---

## ❓ Gặp lỗi?

| Lỗi | Cách fix |
|---|---|
| `GEMINI_API_KEY is not configured` | Chưa điền key vào `.env` |
| `Gemini API error 403` | Key sai hoặc chưa bật Generative Language API trong Google Cloud |
| `The caller does not have permission` (Sheets) | Quên chia sẻ sheet cho `client_email` của service account |
| `GOOGLE_SHEET_ID is not configured` | Chưa điền sheet ID vào `.env` |
| Trang trắng / không load | Mở DevTools (F12) → tab Console xem lỗi gì |

---

## 📞 Liên hệ

Nếu cần custom thêm (đổi flow, gắn Zalo OA, gửi email tự động, gắn pixel...), bạn cứ nói nhé.
