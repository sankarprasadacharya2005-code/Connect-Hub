const { google } = require("googleapis");
require("dotenv").config();

const auth = new google.auth.GoogleAuth({
  keyFile: "service-account.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function appendUserToSheet(user) {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) return;

    const createdDate = new Date().toLocaleString();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A:F",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          user.phone,
          user.name || "",
          user.role || "user",
          "Yes", // isVerified doesn't exist anymore
          createdDate,
          ""
        ]],
      },
    });
    console.log('User appended to Google Sheet');
  } catch (err) {
    console.error('Sheet append error:', err.message);
  }
}

async function updateLastLogin(phone) {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) return;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:F",
    });

    const rows = response.data.values;
    if (!rows) return;

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === phone) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Sheet1!F${i + 1}`,
          valueInputOption: "RAW",
          requestBody: {
            values: [[new Date().toLocaleString()]],
          },
        });
        console.log('Last login updated in Google Sheet');
        break;
      }
    }
  } catch (err) {
    console.error('Sheet update error:', err.message);
  }
}

module.exports = { appendUserToSheet, updateLastLogin };
