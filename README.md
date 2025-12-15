# Vectora

Vectora is a web-based platform and browser extension for fact-checking and AI content detection, powered by Google Gemini.

## Features
- **Web App**: Verify text and links for misinformation.
- **Browser Extension**: Right-click to check if text or images are AI-generated.
- **Multilingual**: Supports English and Hindi.

## Setup

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

3. **Run Locally**:
   ```bash
   python main.py
   ```
   The app will run at `http://127.0.0.1:5001`.

## Deployment (Vercel)

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel`.
3. Set the `GEMINI_API_KEY` environment variable in the Vercel dashboard project settings.

## Browser Extension

1. Go to `chrome://extensions/`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the `extension` folder.
