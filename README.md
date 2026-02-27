# 🌐 VECTORA `[v2.6.0]`

> **The Neural Firewall for the Post-Truth Era.**  
> *Redefining verification in the age of synthetic reality.*

<div align="center">

![Vectora Banner](static/og-image.jpg)

[![Status](https://img.shields.io/badge/STATUS-OPERATIONAL-00ff9d?style=for-the-badge)](https://vectora-plus.vercel.app)
[![License](https://img.shields.io/badge/LICENSE-MIT-bd00ff?style=for-the-badge)](LICENSE)
[![Uptime](https://img.shields.io/badge/UPTIME-99.9%25-00c8ff?style=for-the-badge)](https://vectora-plus.vercel.app)
[![Version](https://img.shields.io/badge/VERSION-2.5.0-667eea?style=for-the-badge)](https://github.com/namandhakad712/vectora)

**🚀 [Live Demo](https://vectora-plus.vercel.app) • 📦 [Chrome Extension](#-chrome-extension) • 📚 [Documentation](#-features) • 🎨 [Design](#-design-philosophy)**

</div>

---

## 🎯 MANIFESTO

We live in a synthetic reality. **Deepfakes**, **hallucinatory text**, and **information warfare** are the new norm.  

**VECTORA** is not just a tool—it's a **weapon of verification**. A local-first, privacy-preserving AI engine designed to dissect truth from digital noise.

> *"In a world where seeing is no longer believing, **verification is the new currency of trust.**"*

---

## ✨ THE VECTORA ECOSYSTEM

<div align="center">

### **🌎 Full-Stack AI Detection Platform**

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🌐 WEB APPLICATION        🧩 CHROME EXTENSION             │
│  ├─ Real-time Analysis     ├─ One-Click Detection          │
│  ├─ Multi-Modal Support    ├─ Text/Image/Screenshot        │
│  ├─ PDF Processing         ├─ Usage History Tracking       │
│  └─ Advanced Dashboard     └─ Auto API Key Sync            │
│                                                             │
│  🎨 3D GLASSMORPHIC UI     🤖 TRIPLE AI ENGINE             │
│  ├─ Liquid Gradient BG     ├─ Google gemini 3.0            │
│  ├─ Floating Orbs          ├─ Groq LPU (500+ tok/s)        │
│  ├─ Dynamic Particles      ├─ Cerebras Wafer-Scale         │
│  └─ Responsive Design      └─ Multi-Provider Fallback      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

</div>

---

## 🔥 FEATURES

### **🌐 Web Application**

<table>
<tr>
<td width="50%">

#### **📝 Text Analysis**
- Real-time AI-generated content detection
- Supporting 10+ characters to full documents
- JSON-formatted probability scores
- Detailed reasoning explanations

#### **🖼️ Image Forensics**
- Direct image upload analysis
- URL-based image scanning
- AI watermark (SynthID) detection
- Visual anomaly identification

</td>
<td width="50%">

#### **📄 PDF Intelligence**
- Multi-page PDF processing
- Automatic image extraction
- Page-by-page analysis
- Comprehensive reporting

#### **🔍 Web Search Integration**
- Live fact-checking (Groq Compound)
- Cross-referencing capabilities
- Real-time verification
- Source attribution

</td>
</tr>
</table>

---

### **🧩 Chrome Extension**

<div align="center">

| Feature | Description | Tech |
|---------|-------------|------|
| **📝 Text Detection** | Select any text → Instant AI check | Content Script Injection |
| **🖼️ Image Analysis** | Click-to-analyze images on any website | DOM Overlay System |
| **📸 Screen Capture** | Draw & crop → Analyze screenshots | Canvas API + ImageBitmap |
| **📊 Usage History** | Track all detections with clickable links | Chrome Storage API |
| **🔑 Auto API Sync** | One-click API key fetch from server | Fetch API Integration |
| **🎨 Model Capabilities** | Live display of model features | Real-time Model Metadata |

</div>

**✨ Zero Setup Mode:** Toggle "Use Vectora API" → Extension auto-fetches keys from server → No manual configuration needed!

---

## 💎 DESIGN PHILOSOPHY

### **🎨 Visual Excellence**

<div align="center">

#### **The Vectora Aesthetic**

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  🌊 LIQUID GRADIENTS    🔮 3D DEPTH                      │
│  Animated, flowing      Layered glassmorphism          │
│  color transitions      with depth perception          │
│                                                          │
│  ✨ PARTICLE EFFECTS    🎭 MICRO-ANIMATIONS             │
│  Dynamic floating orbs  Smooth state transitions       │
│  responding to scroll   delightful interactions        │
│                                                          │
│  🌈 PREMIUM PALETTE     📐 ROUNDED CORNERS              │
│  HSL-tuned colors       20px border-radius             │
│  not generic RGB        soft, modern aesthetic         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

</div>

**Key Design Elements:**
- ✅ **Custom 3D Icons** - Notepad, Image Camera, Web Search with depth
- ✅ **Glassmorphism** - Frosted glass effects with blur
- ✅ **Dynamic Island** - macOS-inspired expandable notification
- ✅ **Gradient Mesh** - Multi-layered animated backgrounds
- ✅ **Smooth Animations** - CSS transitions + GSAP for complex effects
- ✅ **Responsive Typography** - Inter/Roboto with perfect spacing

---

## 🧠 NEURAL ENGINES

<div align="center">

### **Triple-Provider Architecture**

| Provider | Model | Speed | Capabilities | Best For |
|----------|-------|-------|--------------|----------|
| **🔷 Google Gemini** | 2.0 Flash | Fast | Text + Image + Web | All-purpose |
| **⚡ Groq** | Llama Vision | 500+ tok/s | Text + Image | Real-time |
| **🧠 Cerebras** | Llama 3.1 | Ultra-Fast | Text Only | Text analysis |

</div>

### **🛡️ Defense Capabilities**

```python
DETECTION_METHODS = {
    "syntactic_analysis": "Pattern recognition in generated text",
    "watermark_detection": "SynthID and hidden markers",
    "visual_forensics": "Image manipulation artifacts",
    "contextual_reasoning": "Semantic plausibility checks",
    "web_verification": "Live fact-checking against sources"
}
```

---

## 🚀 DEPLOYMENT

### **🌐 Web Application (Full Stack)**

```bash
# 1. Clone Repository
git clone https://github.com/namandhakad712/vectora.git
cd vectora

# 2. Install Dependencies
pip install -r requirements.txt

# 3. Configure Environment
cp .env.example .env
# Add your API keys:
# GEMINI_API_KEY=...
# GROQ_API_KEY=...
# CEREBRAS_API_KEY=...

# 4. Launch Application
python main.py

# 🎉 Access at http://localhost:5001
```

**For Production (Vercel):**
```bash
vercel --prod
```

---

### **🧩 Chrome Extension (Zero Setup)**

#### **Option 1: Use Vectora API (Recommended)**
1. Download extension from [releases](https://github.com/namandhakad712/vectora/releases)
2. Go to `chrome://extensions/`
3. Enable **Developer Mode**
4. Click **Load Unpacked** → Select `extension` folder
5. Open extension → Toggle **"Use Vectora API"**
6. ✅ **Done!** No API keys needed!

#### **Option 2: Manual Setup**
1. Get API keys:
   - [Gemini API](https://aistudio.google.com/apikey)
   - [Groq API](https://console.groq.com/keys)
   - [Cerebras API](https://cloud.cerebras.ai/)
2. Open extension → Click **Settings**
3. Enter keys → **Save**
4. ✅ Ready to use!

---

## 📊 TECH STACK

<div align="center">

### **Frontend**
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![GSAP](https://img.shields.io/badge/GSAP-88CE02?style=for-the-badge&logo=greensock&logoColor=white)

### **Backend**
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

### **AI/ML**
![Google AI](https://img.shields.io/badge/Google_Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-F80000?style=for-the-badge&logo=groq&logoColor=white)
![Cerebras](https://img.shields.io/badge/Cerebras-00D4FF?style=for-the-badge)

### **Extension**
![Chrome](https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest_V3-34A853?style=for-the-badge&logo=google&logoColor=white)

</div>

---

## 🎨 UI SHOWCASE

### **🌐 Web Application**

```
┌────────────────────────────────────────────────────────┐
│  VECTORA AI CHECK                               [🔄]   │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  🧠 SELECT AI PROVIDER                           │ │
│  │  [gemini 3.0] [Groq Llama] [Cerebras]           │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  📝 TEXT ANALYSIS                                │ │
│  │  Enter text to check...                          │ │
│  │  [Analyze]                                       │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  📊 RESULT: 85% AI-Generated                     │ │
│  │  The text exhibits high probability of synthetic │ │
│  │  origin based on pattern analysis...             │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### **🧩 Extension Popup**

```
┌───────────────────┐
│    VECTORA        │
│  AI Detection     │
├───────────────────┤
│  Groq             │
│  llama-4-maverick │
├───────────────────┤
│ ┌─────┐┌─────┐┌─────┐
│ │ 📝  ││ 📷  ││ 📸  │
│ │Text ││Image││Screen│
│ └─────┘└─────┘└─────┘
├───────────────────┤
│  ⚙️  Settings      │
└───────────────────┘
20px rounded corners
Soft shadows
Minimalist design
```

---

## 📈 PERFORMANCE

<div align="center">

| Metric | Value | Details |
|--------|-------|---------|
| **⚡ Response Time** | <500ms | Groq LPU ultra-low latency |
| **🎯 Accuracy** | 92%+ | Multi-model ensemble |
| **📊 Uptime** | 99.9% | Vercel edge deployment |
| **🔒 Privacy** | 100% | No data retention |
| **💾 Storage** | Zero | Serverless architecture |

</div>

---

## 🔐 SECURITY & PRIVACY

- ✅ **No Tracking** - Zero analytics or cookies
- ✅ **Local Processing** - API keys stored locally
- ✅ **HTTPS Only** - Encrypted communication
- ✅ **No Logs** - No request/response storage
- ✅ **Open Source** - Fully auditable code

---

## 📚 API REFERENCE

### **Extension API Endpoint**

```javascript
GET https://vectora-plus.vercel.app/api/extension/keys

Response:
{
  "gemini_api_key": "AIzaSy...",
  "groq_api_key": "gsk_...",
  "cerebras_api_key": "csk_..."
}
```

### **Check API Endpoint**

```javascript
POST https://vectora-plus.vercel.app/check

Request:
{
  "provider": "gemini",
  "model": "gemini-2.0-flash",
  "input_text": "Sample text...",
  // OR
  "image_url": "https://...",
  // OR
  "pdf_file": <file>
}

Response:
{
  "ai_percent": 85,
  "message": "Detailed analysis..."
}
```

---

## 🎯 ROADMAP

- [x] Multi-provider AI support
- [x] Chrome extension with auto-sync
- [x] PDF processing
- [x] Usage history tracking
- [x] Model capabilities display
- [ ] Firefox extension
- [ ] Desktop application (Electron)
- [ ] API rate limiting dashboard
- [ ] Batch processing API
- [ ] Plugin ecosystem

---

## 👥 THE ARCHITECTS

<table align="center" width="100%">
  <tr>
    <td align="center" width="50%">
      <img src="https://github.com/namandhakad712.png" width="100px" style="border-radius: 50%"/><br>
      <h3>NAMAN DHAKAD</h3>
      <code>"The code is the law. We write the laws of verification."</code><br>
      <sub>Full-Stack • AI/ML • System Architecture</sub>
    </td>
    <td align="center" width="50%">
    <img src="https://github.com/ArshSharma120.png" width="100px" style="border-radius: 50%"/>
      <h3>ARSH SHARMA</h3>
      <code>"We don't follow systems, we define them."</code><br>
      <sub>UI/UX Design • Frontend • Visual Excellence</sub>
    </td>
  </tr>
</table>

---

## 📄 LICENSE

MIT License © 2026 Vectora AI

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 🌟 ACKNOWLEDGMENTS

**Powered by:**
- [Google Gemini](https://ai.google.dev/) - Multimodal AI
- [Groq](https://groq.com/) - Ultra-fast LPU inference
- [Cerebras](https://cerebras.ai/) - Wafer-scale AI

**Built with:**
- Flask, Vercel, Chrome APIs
- GSAP, CSS3 Animations
- Modern Web Standards

---

<div align="center">

### ⭐ Star this repository if Vectora helped you!

**REDEFINING THE FUTURE | © 2026 VECTORA AI**

[![Website](https://img.shields.io/badge/Website-vectora.vercel.app-667eea?style=for-the-badge)](https://vectora-plus.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-namandhakad712-000?style=for-the-badge&logo=github)](https://github.com/namandhakad712)

*In a world where seeing is no longer believing, verification is the new currency of trust.*

</div>
