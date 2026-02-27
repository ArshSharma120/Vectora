// popup.js - Clean minimalist popup with Auto/Manual Selection Strategy

const mainView = document.getElementById('main-view');
const textArea = document.getElementById('text-area');
const textInput = document.getElementById('text-input');
const status = document.getElementById('status');
const coreLogo = document.getElementById('core-logo');
const coreName = document.getElementById('core-model-name');

const pillText = document.getElementById('pill-text');
const pillImage = document.getElementById('pill-image');
const pillScreen = document.getElementById('pill-screen');

const btnBack = document.getElementById('btn-back');
const btnAnalyze = document.getElementById('btn-analyze');
const openSettings = document.getElementById('open-settings');

// Initialize UI with Selection Mode Logic
chrome.storage.sync.get([
  'selection_mode', 'provider',
  'groq_api_key', 'groq_model',
  'gemini_api_key', 'gemini_model',
  'cerebras_api_key', 'cerebras_model'
], (result) => {
  const mode = result.selection_mode || 'auto';
  let modelName = 'NO API KEYS';
  let logoFile = '';
  let provider = '';

  if (mode === 'manual') {
    // Manual Mode: Show User Selection
    provider = result.provider;
    const apiKey = result[`${provider}_api_key`];

    if (provider && apiKey) {
      const storedModel = result[`${provider}_model`] || '';
      // Clean up model name for display (e.g. "llama-3.3..." -> "LLAMA 3.3")
      modelName = storedModel.split('/').pop().toUpperCase().substring(0, 20);

      if (provider === 'groq') logoFile = 'powered-by-groq-light.svg';
      else if (provider === 'gemini') logoFile = 'gemini-light.svg';
      else if (provider === 'cerebras') logoFile = 'glm-4.7-light.jpg';
    } else {
      modelName = 'CONFIGURE KEY';
    }
  } else {
    // Auto Mode: Show Priority Logic (Groq -> Gemini -> Cerebras)
    if (result.groq_api_key) {
      modelName = 'GROQ OPTIMIZED'; // Indicates Auto
      logoFile = 'powered-by-groq-light.svg';
    } else if (result.gemini_api_key) {
      modelName = 'GEMINI FLASH';
      logoFile = 'gemini-light.svg';
    } else if (result.cerebras_api_key) {
      modelName = 'CEREBRAS INFERENCE';
      logoFile = 'glm-4.7-light.jpg';
    }
  }

  if (logoFile) {
    coreLogo.src = `model-images/${logoFile}`;
    coreLogo.style.display = 'block';
    coreName.textContent = modelName;
    coreName.style.color = '#718096';
  } else {
    coreLogo.style.display = 'none';
    coreName.textContent = 'CONFIGURE IN SETTINGS';
    coreName.style.color = '#e53e3e';
  }
});


// Text pill - expand to textarea
pillText.addEventListener('click', () => {
  mainView.style.display = 'none';
  textArea.classList.add('active');
  textInput.focus();
});

// Image pill - Auto-Selects Vision Model
pillImage.addEventListener('click', async () => {
  // No capability check needed - System auto-selects best vision model
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

// Screen pill - Auto-Selects Vision Model
pillScreen.addEventListener('click', async () => {
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
  showStatus('Processing...', '');

  chrome.runtime.sendMessage({
    action: 'analyzeText',
    text: text
  }, (response) => {
    btnAnalyze.disabled = false;
    btnAnalyze.textContent = 'Analyze';

    if (response && response.success) {
      showStatus(`AI Score: ${response.ai_percent}% - ${response.message}`, 'success');
    } else {
      showStatus(response?.message || 'Analysis failed.', 'error');
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
