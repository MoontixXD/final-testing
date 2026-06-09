// ============================================================
//  RAKIB'S SSC — Backend Server
//  Deploy free on Render.com or Railway.app
//  Syncs posted status to/from Google Sheets
// ============================================================

const express = require('express');
const cors    = require('cors');
const { google } = require('googleapis');

const app  = express();
app.use(cors());
app.use(express.json());

// ── CONFIG — fill these in after deploying ───────────────────
const SHEET_ID   = process.env.SHEET_ID   || 'YOUR_GOOGLE_SHEET_ID';
const SHEET_NAME = process.env.SHEET_NAME || '📘 Facebook';

// Google Service Account credentials (set as env var on Render/Railway)
const GOOGLE_CREDS = process.env.GOOGLE_CREDS
  ? JSON.parse(process.env.GOOGLE_CREDS)
  : null;

// In-memory store (also syncs to Sheets)
let posted = {};

// ── GOOGLE SHEETS AUTH ───────────────────────────────────────
function getSheets() {
  if (!GOOGLE_CREDS) return null;
  const auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_CREDS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── ROUTES ───────────────────────────────────────────────────
app.get('/ping', (req, res) => {
  res.json({ ok: true, message: "Rakib's SSC backend running" });
});

app.get('/data', (req, res) => {
  res.json({ posted });
});

app.post('/update', async (req, res) => {
  const { date, platform, time, posted: val } = req.body;

  // Update in-memory store
  if (!posted[platform])       posted[platform] = {};
  if (!posted[platform][date]) posted[platform][date] = {};
  posted[platform][date][time] = val;

  // Sync to Google Sheets
  try {
    const sheets = getSheets();
    if (sheets && SHEET_ID !== 'YOUR_GOOGLE_SHEET_ID') {
      await updateSheet(sheets, platform, date, time, val);
    }
  } catch (e) {
    console.error('Sheets sync error:', e.message);
  }

  res.json({ ok: true });
});

// ── SHEETS SYNC ───────────────────────────────────────────────
async function updateSheet(sheets, platform, date, time, isPosted) {
  const sheetName = platform === 'fb' ? '📘 Facebook' : '▶️ YouTube';

  // Read all data to find the right row
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:G`,
  });

  const rows = response.data.values || [];
  let currentDate = '';
  let rowIndex = -1;

  rows.forEach((row, i) => {
    if (row[0] && row[0].trim()) currentDate = row[0].trim();
    const rowDate = normalizeDate(currentDate);
    const rowTime = (row[2] || '').trim();
    if (rowDate === date && rowTime === time) {
      rowIndex = i + 1; // 1-indexed
    }
  });

  if (rowIndex === -1) return;

  // Update Column E (Posted status)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!E${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[isPosted ? '✅ Yes' : '⬜ No']] },
  });
}

function normalizeDate(str) {
  // Convert "10 Jun 2025" → "2025-06-10"
  try {
    return new Date(str).toISOString().split('T')[0];
  } catch { return str; }
}

// ── START ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rakib's SSC backend running on port ${PORT}`));
