// popup.js - Clean minimalist popup with capability checking

const mainView = document.getElementById('main-view');
const textArea = document.getElementById('text-area');
const textInput = document.getElementById('text-input');
const status = document.getElementById('status');
const providerInfo = document.getElementById('provider-info');

const pillText = document.getElementById('pill-text');
const pillImage = document.getElementById('pill-image');
const pillScreen = document.getElementById('pill-screen');

const btnBack = document.getElementById('btn-back');
const btnAnalyze = document.getElementById('btn-analyze');
const openSettings = document.getElementById('open-settings');

let currentProvider = 'gemini';
let currentModel = '';
let modelCapabilities = [];

// Load provider and model info
chrome.storage.sync.get(['provider', 'cerebras_model', 'gemini_model', 'groq_model'], async (result) => {
  currentProvider = result.provider || 'gemini';
  currentModel = result[`${currentProvider}_model`] || 'Not configured';

  // Display provider
  providerInfo.innerHTML = `
    <div class="provider-name">${capitalizeProvider(currentProvider)}</div>
    <div class="model-name">${truncateModel(currentModel)}</div>
  `;

  // Get model capabilities
  const message = await chrome.runtime.sendMessage({
    action: 'getModelCapabilities',
    provider: currentProvider,
    model: currentModel
  });

  if (message && message.capabilities) {
    modelCapabilities = message.capabilities;
  }
});

function capitalizeProvider(p) {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function truncateModel(model) {
  if (model.length > 35) {
    return model.substring(0, 32) + '...';
  }
  return model;
}

// Text pill - expand to textarea
pillText.addEventListener('click', () => {
  mainView.style.display = 'none';
  textArea.classList.add('active');
  textInput.focus();
});

// Image pill - check capability first
pillImage.addEventListener('click', async () => {
  // Check if model supports images
  if (!modelCapabilities.includes('image')) {
    alert(`MODEL INCOMPATIBLE:\n\nThe selected model [${currentModel}] does not support IMAGE analysis.\n\nPlease switch to a Multimodal model in Settings:\n• Gemini 2.0/1.5 (supports images)\n• Groq Llama Vision models`);
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    showStatus('Please open a webpage first', 'error');
    return;
  }

  // Inject content script if needed and activate image selector
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  }, () => {
    chrome.tabs.sendMessage(tab.id, { action: 'selectImage' });
    window.close();
  });
});

// Screen pill - check capability first
pillScreen.addEventListener('click', async () => {
  // Check if model supports images (screen capture is an image)
  if (!modelCapabilities.includes('image')) {
    alert(`MODEL INCOMPATIBLE:\n\nThe selected model [${currentModel}] does not support IMAGE analysis.\n\nScreen capture requires image analysis capability.\n\nPlease switch to a Multimodal model in Settings:\n• Gemini 2.0/1.5 (supports images)\n• Groq Llama Vision models`);
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    showStatus('Please open a webpage first', 'error');
    return;
  }

  // Inject content script and activate screen cropper
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  }, () => {
    chrome.tabs.sendMessage(tab.id, { action: 'cropScreen' });
    window.close();
  });
});

// Back to main view
btnBack.addEventListener('click', () => {
  textArea.classList.remove('active');
  mainView.style.display = 'block';
  textInput.value = '';
  status.textContent = '';
  status.className = 'status';
});

// Analyze text
btnAnalyze.addEventListener('click', async () => {
  const text = textInput.value.trim();

  if (!text) {
    showStatus('Please enter some text to analyze', 'error');
    return;
  }

  btnAnalyze.disabled = true;
  btnAnalyze.textContent = 'Analyzing...';
  showStatus('Processing your text...', '');

  chrome.runtime.sendMessage({
    action: 'analyzeText',
    text: text
  }, (response) => {
    btnAnalyze.disabled = false;
    btnAnalyze.textContent = 'Analyze';

    if (response && response.success) {
      showStatus(`AI Involvement: ${response.ai_percent}% - ${response.message}`, 'success');
    } else {
      showStatus(response?.message || 'Analysis failed. Check settings.', 'error');
    }
  });
});

// Open settings
openSettings.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

function showStatus(message, type) {
  status.textContent = message;
  status.className = `status ${type}`;
}
