# Chatbot Setup Guide

The Google credentials have been configured in `.env` and `public/app.js`.

## 1. Authorized JavaScript Origins (CRITICAL)
You **MUST** still add the following URLs to your Google Cloud Console for the login to work:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project.
3. Go to **APIs & Services** > **Credentials**.
4. Edit your OAuth 2.0 Client ID (`891192531005...`).
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000`
   - `http://localhost`
6. Click **Save**.

## 2. Run the App
1. Install dependencies: `npm install`
2. Start the server: `node server.js`
3. Open `http://localhost:3000` in your browser.

## Current Configuration
- **Client ID**: Configured ✅
- **Client Secret**: Configured ✅
- **Session Secret**: Configured ✅
- **MongoDB**: Ensure it's running at `mongodb://127.0.0.1:27017/chatbot`
