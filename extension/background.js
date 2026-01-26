// background.js - Standalone service worker for Vectora AI Check Extension
// ULTRA USELESS CONCEPT OF USING SERVER TO USE A EXTENSION.
// No backend server required - makes direct API calls to AI providers

// Settings
let settings = {
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
      cropAndAnalyze(dataUrl, message.crop);
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
async function cropAndAnalyze(dataUrl, crop) {
  try {
    console.log('Cropping screenshot...', crop);

    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create ImageBitmap (works in service worker)
    const imageBitmap = await createImageBitmap(blob);

    // Validate crop dimensions
    const actualWidth = Math.min(crop.width, imageBitmap.width - crop.x);
    const actualHeight = Math.min(crop.height, imageBitmap.height - crop.y);

    console.log('Image dimensions:', imageBitmap.width, imageBitmap.height);
    console.log('Crop area:', crop.x, crop.y, actualWidth, actualHeight);

    // Create canvas and crop
    const canvas = new OffscreenCanvas(actualWidth, actualHeight);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(
      imageBitmap,
      crop.x, crop.y, actualWidth, actualHeight,
      0, 0, actualWidth, actualHeight
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
  const provider = settings.provider;
  const apiKey = settings[`${provider}_api_key`];
  const model = settings[`${provider}_model`];

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

  try {
    let response;

    if (provider === 'cerebras') {
      response = await callCerebrasAPI(apiKey, model, prompt);
    } else if (provider === 'gemini') {
      response = await callGeminiAPI(apiKey, model, prompt);
    } else if (provider === 'groq') {
      response = await callGroqAPI(apiKey, model, prompt);
    }

    return parseAIResponse(response);
  } catch (error) {
    console.error('Analysis error:', error);
    throw error; // NO FAKE DATA - throw real error
  }
}

// Analyze image using selected AI provider
async function analyzeImage(imageUrl) {
  const provider = settings.provider;
  const apiKey = settings[`${provider}_api_key`];
  const model = settings[`${provider}_model`];

  const prompt = `Analyze this image and determine the likelihood it was AI-generated.

Respond with ONLY a JSON object (no markdown, no extra text):
{"ai_percent": <0-100>, "reason": "<brief explanation>"}

Consider: artifacts, unnatural patterns, weird textures, impossible physics, watermarks, AI tool signatures.
Return 0-100 where 0=clearly real, 100=certainly AI-generated.`;

  try {
    // Download image and convert to base64
    const imageData = await downloadImage(imageUrl);

    let response;

    if (provider === 'gemini') {
      response = await callGeminiVisionAPI(apiKey, model, prompt, imageData);
    } else if (provider === 'groq') {
      // Check if model supports vision (TEXT + IMAGE models from main.py)
      const isVisionModel =
        model.includes('llama-guard') ||
        model.includes('llama-4-maverick') ||
        model.includes('llama-4-scout') ||
        model.includes('vision'); // Keep this for any future vision models

      if (!isVisionModel) {
        throw new Error(`Selected Groq model "${model}" does not support image analysis.\n\nSupported models:\n• llama-guard-4-12b\n• llama-4-maverick-17b-128e-instruct\n• llama-4-scout-17b-16e-instruct`);
      }
      response = await callGroqVisionAPI(apiKey, model, prompt, imageData);
    } else {
      throw new Error('Cerebras does not support image analysis. Please select Gemini or Groq with a vision model.');
    }

    return parseAIResponse(response);
  } catch (error) {
    console.error('Image analysis error:', error);
    throw error; // NO FAKE DATA - throw real error
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
  async function callGroqAPI(apiKey, model, prompt) {
    console.log('Calling Groq API with model:', model);

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
      console.log('Calling Groq API with model:', model);

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
        console.log('Image data mimeType:', imageData.mimeType);
        console.log('Image data length:', imageData.data.length, 'chars');

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
      }
      @keyframes vectoraSlideIn {
        from {
          opacity: 0;
          transform: translateX(360px) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateX(0) translateY(0);
        }
      }
      .vectora-ai-percent {
        font-size: 32px;
        font-weight: 900;
        color: #00f3ff;
        text-shadow: 0 0 10px rgba(0, 243, 255, 0.5);
        margin-bottom: 6px;
        letter-spacing: -1px;
      }
      .vectora-label {
        font-size: 11px;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 10px;
        font-weight: 600;
      }
      .vectora-message {
        font-size: 13px;
        color: #b0b0b0;
        margin-bottom: 12px;
        line-height: 1.4;
        word-break: break-word;
      }
      .vectora-powered {
        font-size: 10px;
        color: #666;
        text-align: right;
        font-weight: 500;
        letter-spacing: 0.5px;
      }
    `;
            document.head.appendChild(style);
          }

          const notif = document.createElement('div');
          notif.id = 'vectora-notification';
          notif.innerHTML = `
    <div class="vectora-label">AI Involvement</div>
    <div class="vectora-ai-percent">${Math.round(percent)}%</div>
    <div class="vectora-message">${msg}</div>
    <div class="vectora-powered">Powered by Vectora</div>
  `;
          document.body.appendChild(notif);

          setTimeout(() => {
            notif.style.opacity = '0';
            notif.style.transition = 'opacity 0.3s ease-out';
            setTimeout(() => {
              if (notif.parentNode) notif.remove();
            }, 300);
          }, 5000);
        }
