# Vectora AI Check - Chrome Extension

> Detect AI-generated content in text, images, and screenshots with multi-provider AI analysis

## 🚀 Quick Start

1. **Get API Keys** (at least one):
   - [Gemini API Key](https://aistudio.google.com/apikey)
   - [Groq API Key](https://console.groq.com/keys)
   - [Cerebras API Key](https://cloud.cerebras.ai/)

2. **Install Extension**:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select this `extension` folder

3. **Configure**:
   - Click extension icon
   - Click "Settings"
   - Enter your API key
   - Select a model
   - Save

## 📋 Features

- ✅ **Text Analysis** - Right-click text or use selection popup
- ✅ **Image Detection** - Click images to check if AI-generated
- ✅ **Screen Capture** - Analyze any area of your screen
- ✅ **Multi-Provider** - Gemini, Groq, Cerebras support
- ✅ **Real-time Results** - No fake data, only real AI analysis
- ✅ **Usage History** - Track all your detections

## 🎯 Model Capabilities

| Provider | Text | Image | Web Search |
|----------|------|-------|------------|
| Gemini | ✅ | ✅ | ✅ |
| Groq (Vision) | ✅ | ✅ | ❌ |
| Groq (Compound) | ✅ | ❌ | ✅ |
| Cerebras | ✅ | ❌ | ❌ |

## 📁 Files

```
extension/
├── manifest.json       # Extension config
├── background.js       # Service worker (AI analysis)
├── content.js          # Page interaction
├── popup.html/js       # Extension popup UI
├── options.html/js     # Settings page
└── icons/             # Extension icons
```

## 🔒 Privacy

- API keys stored locally (chrome.storage.sync)
- No external tracking
- No data collection
- Direct API calls only

## 📄 License

MIT License - See LICENSE file

---

**REDEFINING THE FUTURE | @ 2026 VECTORA AI**
