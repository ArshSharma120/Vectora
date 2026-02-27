// background.js - Standalone service worker for Vectora AI Check Extension
// ULTRA USELESS CONCEPT OF USING SERVER TO USE A EXTENSION.
// No backend server required - makes direct API calls to AI providers

// Settings
let settings = {
  selection_mode: 'auto', // 'auto' or 'manual'
  provider: 'gemini',
  cerebras_api_key: '',
  cerebras_model: 'llama-3.3-70b',
  gemini_api_key: '',
  gemini_model: 'gemini-2.0-flash-exp',
  groq_api_key: '',
  groq_model: 'llama-3.3-70b-versatile'
};

// Load settings on startup
loadSettings();

function loadSettings() {
  chrome.storage.sync.get([
    'selection_mode',
    'provider',
    'cerebras_api_key',
    'cerebras_model',
    'gemini_api_key',
    'gemini_model',
    'groq_api_key',
    'groq_model'
  ], (result) => {
    settings = { ...settings, ...result };
    console.log('Settings loaded:', { ...settings, cerebras_api_key: '***', gemini_api_key: '***', groq_api_key: '***' });
  });
}

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    loadSettings();
    sendResponse({ success: true });
  }

  // Handle text analysis from popup/content script
  else if (message.action === 'analyzeText') {
    console.log('Text analysis requested:', message.text.substring(0, 50) + '...');

    const apiKey = settings[`${settings.provider}_api_key`];
    if (!apiKey) {
      const errorMsg = 'Please configure API key in settings';
      sendResponse({ success: false, message: errorMsg });

      // Show error notification
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) showNotification(tabs[0].id, 0, errorMsg);
      });

      return true;
    }

    console.log('Calling analyzeText with provider:', settings.provider);

    // Immediate Feedback: Analyzing...
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) showNotification(tabs[0].id, -1, 'Analyzing text context...');
    });

    analyzeText(message.text).then(result => {
      console.log('Analysis result:', result);
      sendResponse({ success: true, ...result });

      // Show notification on active tab and save history
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          showNotification(tabs[0].id, result.ai_percent, result.message);
          saveToHistory(tabs[0].url, 'text', result);
        }
      });
    }).catch(error => {
      console.error('Text analysis error:', error);
      const errorMsg = `Error: ${error.message}`;
      sendResponse({ success: false, message: errorMsg });

      // Show error notification
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) showNotification(tabs[0].id, 0, errorMsg);
      });
    });

    return true; // Keep channel open for async response
  }

  // Handle image analysis from content script
  else if (message.action === 'analyzeImage') {
    const apiKey = settings[`${settings.provider}_api_key`];

    // Immediate Feedback: Validating...
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) showNotification(tabs[0].id, -1, 'Analyzing image...');
    });

    if (!apiKey) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) showNotification(tabs[0].id, 0, 'Please configure API key in settings');
      });
      return true;
    }

    analyzeImage(message.imageUrl).then(result => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          showNotification(tabs[0].id, result.ai_percent, result.message);
          chrome.storage.local.set({ lastCheck: result });
          saveToHistory(tabs[0].url, 'image', result);
        }
      });
    }).catch(error => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) showNotification(tabs[0].id, 0, `Error: ${error.message}`);
      });
    });

    return true;
  }

  // Handle screen capture
  else if (message.action === 'captureVisibleTab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Capture error:', chrome.runtime.lastError);
        return;
      }

      // Crop and analyze
      cropAndAnalyze(dataUrl, message);
    });

    return true;
  }

  // Get model capabilities (for popup validation)
  else if (message.action === 'getModelCapabilities') {
    const provider = message.provider || settings.provider;
    const model = message.model || settings[`${provider}_model`];

    // Determine capabilities based on provider and model (matching main.py)
    let capabilities = ['text']; // All models support text

    if (provider === 'gemini') {
      // Gemini 1.5+ supports everything
      capabilities.push('image', 'web_search');
    }
    else if (provider === 'groq') {
      // Groq models: EITHER image OR web_search, not both

      // Vision models (TEXT + IMAGE)
      if (model && (
        model.includes('llama-guard') ||
        model.includes('llama-4-maverick') ||
        model.includes('llama-4-scout') ||
        model.includes('vision')
      )) {
        capabilities.push('image');
      }

      // Compound & OSS models (TEXT + WEB SEARCH)
      else if (model && (
        model.includes('compound') ||
        model.includes('gpt-oss')
      )) {
        capabilities.push('web_search');
      }
    }
    // Cerebras is text-only (no additional capabilities)

    sendResponse({ capabilities });
    return true;
  }

  return false;
});

// Save usage history
async function saveToHistory(url, feature, result) {
  try {
    const history = await chrome.storage.local.get('usageHistory');
    const historyList = history.usageHistory || [];

    // Add new entry
    historyList.unshift({
      url: url,
      feature: feature, // 'text', 'image', or 'screen'
      ai_percent: result.ai_percent,
      message: result.message,
      timestamp: Date.now(),
      provider: settings.provider,
      model: settings[`${settings.provider}_model`]
    });

    // Keep only last 50 entries
    if (historyList.length > 50) {
      historyList.splice(50);
    }

    await chrome.storage.local.set({ usageHistory: historyList });
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}


// Crop captured image and analyze
async function cropAndAnalyze(dataUrl, params) {
  try {
    const crop = params.crop;
    console.log('Cropping screenshot with scaling...', crop);

    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create ImageBitmap
    const imageBitmap = await createImageBitmap(blob);

    // Scaling Calculation (Critical for High-DPI screens)
    // If capture is 2x larger than window, scale factor is 2.
    let scale = 1;
    if (params.windowWidth && imageBitmap.width) {
      scale = imageBitmap.width / params.windowWidth;
      console.log(`Scaling Factor: ${scale} (Img: ${imageBitmap.width}px / Win: ${params.windowWidth}px)`);
    }

    // Apply scale to crop coordinates
    const scaledX = crop.x * scale;
    const scaledY = crop.y * scale;
    const scaledWidth = crop.width * scale;
    const scaledHeight = crop.height * scale;

    // Validate bounds
    const finalWidth = Math.min(scaledWidth, imageBitmap.width - scaledX);
    const finalHeight = Math.min(scaledHeight, imageBitmap.height - scaledY);

    if (finalWidth <= 0 || finalHeight <= 0) {
      throw new Error('Invalid crop dimensions after scaling');
    }

    // Create canvas (use final scaled dimensions for high validity)
    const canvas = new OffscreenCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext('2d');

    // Disable smoothing to keep pixels sharp
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(
      imageBitmap,
      scaledX, scaledY, finalWidth, finalHeight,
      0, 0, finalWidth, finalHeight
    );

    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    const croppedDataUrl = await blobToDataUrl(croppedBlob);

    console.log('Cropped image created, using SAME flow as image analysis...');

    // USE THE SAME FLOW AS IMAGE ANALYSIS - just call analyzeImage with data URL!
    const result = await analyzeImage(croppedDataUrl);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        showNotification(tabs[0].id, result.ai_percent, result.message);
        saveToHistory(tabs[0].url, 'screen', result);
      }
    });
  } catch (error) {
    console.error('Screen capture error:', error);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        showNotification(tabs[0].id, 0, `Error: ${error.message}`);
      }
    });
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}


// Initialize context menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    // Text selection menu
    chrome.contextMenus.create({
      id: 'vectora-check-text',
      title: 'Check AI Authenticity',
      contexts: ['selection']
    });

    // Image menu
    chrome.contextMenus.create({
      id: 'vectora-check-image',
      title: 'Check AI Authenticity',
      contexts: ['image']
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'vectora-check-text') {
      const selectedText = info.selectionText || '';

      if (!selectedText.trim()) {
        showNotification(tab.id, 0, 'Please select text to analyze');
        return;
      }

      // Check if API key is configured
      const apiKey = settings[`${settings.provider}_api_key`];
      if (!apiKey) {
        showNotification(tab.id, 0, 'Please configure API key in extension settings');
        return;
      }

      showNotification(tab.id, 0, 'Analyzing text...');

      const result = await analyzeText(selectedText);

      showNotification(tab.id, result.ai_percent, result.message);
      chrome.storage.local.set({ lastCheck: result });
    }

    else if (info.menuItemId === 'vectora-check-image') {
      const srcUrl = info.srcUrl || '';

      if (!srcUrl) {
        showNotification(tab.id, 0, 'Could not extract image URL');
        return;
      }

      const apiKey = settings[`${settings.provider}_api_key`];
      if (!apiKey) {
        showNotification(tab.id, 0, 'Please configure API key in extension settings');
        return;
      }

      showNotification(tab.id, 0, 'Analyzing image...');

      const result = await analyzeImage(srcUrl);

      showNotification(tab.id, result.ai_percent, result.message);
      chrome.storage.local.set({ lastCheck: result });
    }
  } catch (error) {
    console.error('Context menu error:', error);
    showNotification(tab.id, 0, `Error: ${error.message}`);
  }
});

// Analyze text using selected AI provider
async function analyzeText(text) {
  const mode = settings.selection_mode || 'auto';

  // Prompt construction
  const prompt = `Analyze this text and determine the likelihood it was generated by AI.

Text to analyze:
${text}

Respond with ONLY a JSON object (no markdown, no extra text):
{"ai_percent": <0-100>, "reason": "<brief explanation>"}

Consider: writing style, unusual patterns, perfect grammar, repetitive phrases, lack of human emotion/opinions, generic content.
Return a percentage 0-100 where:
- 0-20%: Clearly human written
- 21-40%: Likely human with possible AI assistance
- 41-60%: Mixed or unclear
- 61-80%: Likely AI-generated
- 81-100%: Almost certainly AI-generated`;


  if (mode === 'manual') {
    const provider = settings.provider;
    const apiKey = settings[`${provider}_api_key`];
    const model = settings[`${provider}_model`];

    if (!apiKey) throw new Error(`API Key for ${provider} is missing.`);

    try {
      let response;
      if (provider === 'cerebras') response = await callCerebrasAPI(apiKey, model, prompt);
      else if (provider === 'gemini') response = await callGeminiAPI(apiKey, model, prompt);
      else if (provider === 'groq') response = await callGroqAPI(apiKey, model, prompt);
      return parseAIResponse(response);
    } catch (e) {
      throw e;
    }
  } else {
    // ✅ AUTO STRATEGY (Cascade)
    // Text Priority: Groq Compound -> Gemini 3 -> Gemini 2.5 -> GLM 4.7

    // 1. Groq Compound
    if (settings.groq_api_key) {
      try {
        console.log('Auto: Trying Groq Compound...');
        const res = await callGroqAPI(settings.groq_api_key, 'groq/compound', prompt);
        return parseAIResponse(res);
      } catch (e) { console.warn('Groq Compound failed:', e); }

      // 1b. Groq Compound Mini (Faster fallback)
      try {
        console.log('Auto: Trying Groq Compound Mini...');
        const res = await callGroqAPI(settings.groq_api_key, 'groq/compound-mini', prompt);
        return parseAIResponse(res);
      } catch (e) { console.warn('Groq Mini failed:', e); }
    }

    // 2. Gemini Series
    if (settings.gemini_api_key) {
      try {
        console.log('Auto: Trying Gemini 3 Flash Preview...');
        const res = await callGeminiAPI(settings.gemini_api_key, 'gemini-3-flash-preview', prompt);
        return parseAIResponse(res);
      } catch (e) { console.warn('Gemini 3 failed:', e); }

      try {
        console.log('Auto: Trying Gemini 2.5 Flash...');
        const res = await callGeminiAPI(settings.gemini_api_key, 'gemini-2.5-flash', prompt);
        return parseAIResponse(res);
      } catch (e) { console.warn('Gemini 2.5 failed:', e); }
    }

    // 3. GLM 4.7 (Cerebras) - Reasoning
    if (settings.cerebras_api_key) {
      try {
        console.log('Auto: Trying ZAI GLM 4.7...');
        const res = await callCerebrasAPI(settings.cerebras_api_key, 'zai-glm-4.7', prompt);
        return parseAIResponse(res);
      } catch (e) { console.warn('GLM 4.7 failed:', e); }
    }

    throw new Error('Auto-Selection failed: All providers/models failed or no keys configured.');
  }
}

// Analyze image using selected AI provider
async function analyzeImage(imageUrl) {
  const mode = settings.selection_mode || 'auto';

  // Prompt
  const prompt = `Analyze this image and determine the likelihood it was AI-generated.

Respond with ONLY a JSON object (no markdown, no extra text):
{"ai_percent": <0-100>, "reason": "<brief explanation>"}

Consider: artifacts, unnatural patterns, weird textures, impossible physics, watermarks, AI tool signatures.
Return 0-100 where 0=clearly real, 100=certainly AI-generated.`;

  // Download image (common)
  const imageData = await downloadImage(imageUrl);

  if (mode === 'manual') {
    const provider = settings.provider;
    const apiKey = settings[`${provider}_api_key`];
    const model = settings[`${provider}_model`];

    if (!apiKey) throw new Error(`API Key for ${provider} is missing.`);

    try {
      let response;
      if (provider === 'gemini') response = await callGeminiVisionAPI(apiKey, model, prompt, imageData);
      else if (provider === 'groq') response = await callGroqVisionAPI(apiKey, model, prompt, imageData);
      else throw new Error('Selected provider does not support images.');
      return parseAIResponse(response);
    } catch (e) { throw e; }
  } else {
    // ✅ AUTO STRATEGY (Cascade)
    // Image Priority: Llama-4 Maverick -> Scout -> Gemini 3 -> Gemini 2.5

    // 1. Groq (Llama 4 Maverick/Scout)
    if (settings.groq_api_key) {
      try {
        console.log('Auto: Trying Llama 4 Maverick...');
        const res = await callGroqVisionAPI(settings.groq_api_key, 'meta-llama/llama-4-maverick-17b-128e-instruct', prompt, imageData);
        return parseAIResponse(res);
      } catch (e) { console.warn('Maverick failed:', e); }

      try {
        console.log('Auto: Trying Llama 4 Scout...');
        const res = await callGroqVisionAPI(settings.groq_api_key, 'meta-llama/llama-4-scout-17b-16e-instruct', prompt, imageData);
        return parseAIResponse(res);
      } catch (e) { console.warn('Scout failed:', e); }
    }

    // 2. Gemini Series (Vision)
    if (settings.gemini_api_key) {
      try {
        console.log('Auto: Trying Gemini 3 Flash Preview...');
        const res = await callGeminiVisionAPI(settings.gemini_api_key, 'gemini-3-flash-preview', prompt, imageData);
        return parseAIResponse(res);
      } catch (e) { console.warn('Gemini 3 failed:', e); }

      try {
        console.log('Auto: Trying Gemini 2.5 Flash...');
        const res = await callGeminiVisionAPI(settings.gemini_api_key, 'gemini-2.5-flash', prompt, imageData);
        return parseAIResponse(res);
      } catch (e) { console.warn('Gemini 2.5 failed:', e); }

      try {
        console.log('Auto: Trying Gemini 2.5 Flash Lite...');
        const res = await callGeminiVisionAPI(settings.gemini_api_key, 'gemini-2.5-flash-lite', prompt, imageData);
        return parseAIResponse(res);
      } catch (e) { console.warn('Gemini Lite failed:', e); }
    }

    throw new Error('Auto-Selection failed: All Vision providers failed.');
  }
}

// Download image and convert to base64
async function downloadImage(url) {
  try {
    console.log('Downloading image from:', url);
    const response = await fetch(url);
    const blob = await response.blob();
    console.log('Image downloaded, size:', blob.size, 'bytes, type:', blob.type);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        console.log('Image converted to base64, length:', base64.length, 'chars');
        resolve({ data: base64, mimeType: blob.type });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Image download failed:', error);
    throw new Error(`Failed to download image: ${error.message}`);
  }
}


// API Calls

// Retry helper with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = i === maxRetries - 1;
      if (isLastAttempt) throw error;

      const delay = baseDelay * Math.pow(2, i);
      console.warn(`Attempt ${i + 1} failed, retrying in ${delay}ms...`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function callCerebrasAPI(apiKey, model, prompt) {
  console.log('Calling Cerebras API with model:', model);

  return retryWithBackoff(async () => {
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1, // Lower temp for more consistent JSON
        max_tokens: 300,  // Increased for detailed responses
        response_format: { type: "text" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cerebras API error response:', errorText);
      throw new Error(`Cerebras API error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from Cerebras API');
    }

    console.log('Cerebras API success');
    return content;
  });
}

async function callGeminiAPI(apiKey, model, prompt, imageData = null) {
  console.log('Calling Gemini API with model:', model);

  return retryWithBackoff(async () => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const parts = [{ text: prompt }];

    const payload = {
      contents: [{ parts }],
      tools: [{ googleSearch: {} }], // Enable Google Search for grounding
      generationConfig: {
        temperature: 0.1,  // Lower for consistent JSON
        maxOutputTokens: 500,
        topP: 0.95,
        topK: 40
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error response:', errorText);
      throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.candidates || !data.candidates[0]) {
      throw new Error('Invalid Gemini API response structure');
    }

    const content = data.candidates[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Empty content from Gemini API');
    }

    console.log('Gemini API success');
    return content;
  });
}

async function callGeminiVisionAPI(apiKey, model, prompt, imageData) {
  console.log('Calling Gemini Vision API with model:', model);
  console.log('Image data mimeType:', imageData.mimeType);
  console.log('Image data length:', imageData.data.length, 'chars');
  console.log('Prompt preview:', prompt.substring(0, 100) + '...');

  // Validate image data
  if (!imageData.data || imageData.data.length === 0) {
    throw new Error('Invalid image data: empty base64 string');
  }

  // Validate base64 format (basic check)
  const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!base64Pattern.test(imageData.data.substring(0, 100))) {
    throw new Error('Invalid image data: not valid base64 format');
  }

  // Check image size (Gemini has limits)
  const imageSizeBytes = (imageData.data.length * 3) / 4; // Approximate decoded size
  const maxSizeBytes = 20 * 1024 * 1024; // 20MB limit

  if (imageSizeBytes > maxSizeBytes) {
    throw new Error(`Image too large: ${(imageSizeBytes / 1024 / 1024).toFixed(2)}MB (max 20MB)`);
  }

  return retryWithBackoff(async () => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const parts = [
      { text: prompt },
      {
        inline_data: {
          mime_type: imageData.mimeType,
          data: imageData.data
        }
      }
    ];

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500
      }
    };

    console.log('Sending request to Gemini Vision API...');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini Vision API error response:', errorText);
      throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.candidates || !data.candidates[0]) {
      throw new Error('Invalid Gemini Vision API response structure');
    }

    const content = data.candidates[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Empty content from Gemini Vision API');
    }

    console.log('Gemini Vision API success, response received');
    return content;
  });
}

async function callGroqAPI(apiKey, model, prompt) {
  console.log(`Calling Groq API with model: ${model}`);

  return retryWithBackoff(async () => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error response:', errorText);
      throw new Error(`Groq API error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from Groq API');
    }

    console.log('Groq API success');
    return content;
  });
}

async function callGroqVisionAPI(apiKey, model, prompt, imageData) {
  console.log('Calling Groq Vision API with model:', model);

  // Validate image data
  if (!imageData.data || imageData.data.length === 0) {
    throw new Error('Invalid image data: empty base64 string');
  }

  // Check image size (Groq has limits)
  const imageSizeBytes = (imageData.data.length * 3) / 4;
  const maxSizeBytes = 10 * 1024 * 1024; // 10MB limit for Groq

  if (imageSizeBytes > maxSizeBytes) {
    throw new Error(`Image too large: ${(imageSizeBytes / 1024 / 1024).toFixed(2)}MB (max 10MB for Groq)`);
  }

  return retryWithBackoff(async () => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${imageData.mimeType};base64,${imageData.data}`
              }
            }
          ]
        }],
        temperature: 0.1,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq Vision API error response:', errorText);
      throw new Error(`Groq API error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from Groq Vision API');
    }

    console.log('Groq Vision API success, response received');
    return content;
  });
}

// Parse AI response to extract percentage and reason
function parseAIResponse(text) {
  try {
    console.log('Parsing AI response:', text); // DEBUG LOG

    // Clean markdown code blocks and extra whitespace
    let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Try multiple JSON extraction strategies
    let json = null;

    // Strategy 1: Try to parse the entire cleaned response as JSON

    try {
      json = JSON.parse(cleaned);
    } catch (e) {
      // Strategy 2: Find the LAST complete JSON object (not first, which might be incomplete)
      // This regex finds all {...} blocks and we'll use the last one
      const allMatches = cleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
      if (allMatches && allMatches.length > 0) {
        // Try parsing from last to first (most complete usually at end)
        for (let i = allMatches.length - 1; i >= 0; i--) {
          try {
            const candidate = JSON.parse(allMatches[i]);
            if (candidate.ai_percent !== undefined) {
              json = candidate;
              break;
            }
          } catch (parseErr) {
            continue;
          }
        }
      }
    }

    // If we found valid JSON with ai_percent
    if (json && (json.ai_percent !== undefined && json.ai_percent !== null)) {
      console.log('Successfully parsed JSON:', json); // DEBUG LOG
      return {
        ai_percent: Math.min(100, Math.max(0, parseInt(json.ai_percent))),
        message: json.reason || json.message || 'Analysis complete'
      };
    }

    // Fallback Strategy 3: Extract from natural language
    console.warn('JSON parsing failed, trying natural language extraction'); // DEBUG LOG

    // Look for patterns like "75%" or "ai_percent: 75" or "75 percent"
    const percentPatterns = [
      /(?:ai_percent|percentage|confidence)[:\s]+(\d+)/i,
      /(\d+)\s*%/,
      /(\d+)\s+percent/i
    ];

    for (const pattern of percentPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const percent = parseInt(match[1]);
        console.log('Extracted percentage from text:', percent); // DEBUG LOG
        return {
          ai_percent: Math.min(100, Math.max(0, percent)),
          message: text.substring(0, 200).replace(/\s+/g, ' ').trim()
        };
      }
    }

    // If all strategies fail
    throw new Error(`Could not extract ai_percent from response. Raw response: ${text.substring(0, 300)}`);

  } catch (error) {
    console.error('Failed to parse AI response (full text):', text);
    console.error('Parse error:', error);
    throw new Error(`Failed to parse AI response: ${error.message}`);
  }
}

// Show notification overlay
function showNotification(tabId, aiPercent, message) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: injectNotification,
    args: [aiPercent, message]
  }).catch(err => console.error('Notification error:', err));
}

// Injected notification function
// Injected notification function
function injectNotification(percent, msg) {
  const existing = document.getElementById('vectora-notification');
  if (existing) existing.remove();

  if (!document.getElementById('vectora-styles')) {
    const style = document.createElement('style');
    style.id = 'vectora-styles';
    style.textContent = `
      #vectora-notification {
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 999999;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(0, 243, 255, 0.3);
        border-radius: 12px;
        padding: 16px 20px;
        min-width: 280px;
        max-width: 400px;
        box-shadow: 0 8px 32px rgba(0, 243, 255, 0.15), 0 0 20px rgba(0, 0, 0, 0.5);
        font-family: 'Segoe UI', Tahoma, Geneva, sans-serif;
        color: #e0e0e0;
        backdrop-filter: blur(8px);
        animation: vectoraSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      @keyframes vectoraSlideIn {
        from { opacity: 0; transform: translateX(50px); }
        to { opacity: 1; transform: translateX(0); }
      }
      .vectora-ai-percent {
        font-size: 32px;
        font-weight: 900;
        color: #00f3ff;
        text-shadow: 0 0 10px rgba(0, 243, 255, 0.5);
        margin-bottom: 6px;
        letter-spacing: -1px;
      }
      .vectora-loader {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(0,243,255,0.2);
        border-top-color: #00f3ff;
        border-radius: 50%;
        animation: vectoraSpin 1s linear infinite;
        margin-bottom: 12px;
      }
      @keyframes vectoraSpin { 100% { transform: rotate(360deg); } }
      .vectora-label {
        font-size: 11px;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 10px;
        font-weight: 600;
        align-self: flex-start;
      }
      .vectora-message {
        font-size: 13px;
        color: #b0b0b0;
        margin-bottom: 12px;
        line-height: 1.4;
        word-break: break-word;
        text-align: center;
      }
      .vectora-powered {
        font-size: 10px;
        color: #666;
        text-align: right;
        font-weight: 500;
        letter-spacing: 0.5px;
        align-self: flex-end;
      }
    `;
    document.head.appendChild(style);
  }

  const notif = document.createElement('div');
  notif.id = 'vectora-notification';

  let contentHtml = '';

  if (percent === -1) {
    // LOADING STATE
    contentHtml = `
        <div class="vectora-label">Processing Request...</div>
        <div class="vectora-loader"></div>
        <div class="vectora-message" style="color: #fff;">${msg}</div>
      `;
  } else {
    // RESULT STATE
    let color = '#00f3ff';
    if (percent < 30) color = '#10b981'; // Green for Human
    else if (percent > 70) color = '#ef4444'; // Red for AI

    contentHtml = `
        <div class="vectora-label">AI Analysis Logic</div>
        <div class="vectora-ai-percent" style="color: ${color}; text-shadow: 0 0 15px ${color}40;">${Math.round(percent)}%</div>
        <div class="vectora-message">${msg}</div>
        <div class="vectora-powered">Powered by Vectora</div>
      `;
  }

  notif.innerHTML = contentHtml;
  document.body.appendChild(notif);

  // Auto-remove only if it's a Result (percent >= 0)
  // Loading state persists until replaced by Result logic
  if (percent !== -1) {
    setTimeout(() => {
      notif.style.opacity = '0';
      notif.style.transition = 'opacity 0.3s ease-out';
      setTimeout(() => {
        if (notif.parentNode) notif.remove();
      }, 300);
    }, 7000); // 7 seconds for results
  }
}
