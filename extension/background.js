// background.js - Manifest V3 service worker for Vectora AI Check Extension

// Initialize context menus on installation/update
chrome.runtime.onInstalled.addListener(() => {
  // Remove any existing menu items to prevent duplicates
  chrome.contextMenus.removeAll(() => {
    // Create context menu for selected text
    chrome.contextMenus.create({
      id: 'vectora-check-text',
      title: 'Check AI Authenticity',
      contexts: ['selection']
    }, () => {
      if(chrome.runtime.lastError) {
        console.error('Error creating text menu:', chrome.runtime.lastError);
      }
    });

    // Create context menu for images
    chrome.contextMenus.create({
      id: 'vectora-check-image',
      title: 'Check AI Authenticity',
      contexts: ['image']
    }, () => {
      if(chrome.runtime.lastError) {
        console.error('Error creating image menu:', chrome.runtime.lastError);
      }
    });
  });
});

// Send request to backend API for AI analysis
async function postToBackend(payload) {
  try {
    // Try production first, fallback to localhost
    const endpoints = [
      'https://vectora.vercel.app/ai-check',
      'http://127.0.0.1:5001/ai-check'
    ];
    
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (resp.ok) {
          const data = await resp.json();
          return data || { ai_percent: 50, message: 'Analysis complete' };
        }
      } catch (e) {
        lastError = e;
        continue; // Try next endpoint
      }
    }
    
    // All endpoints failed
    console.error('All endpoints failed:', lastError);
    return { ai_percent: 50, message: 'Unable to reach analysis server' };
  } catch (e) {
    console.error('Backend error:', e);
    return { ai_percent: 50, message: 'Network error' };
  }
}

// Show notification overlay on the page
function showNotification(tabId, aiPercent, message) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: injectNotification,
    args: [aiPercent, message]
  }).catch(err => console.error('Script injection error:', err));
}

// Injected function that runs on the webpage
function injectNotification(percent, msg) {
  // Remove any existing notification to prevent duplicates
  const existing = document.getElementById('vectora-notification');
  if (existing) existing.remove();
  
  // Create styles if not already present
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
        max-width: 320px;
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
      @media (max-width: 480px) {
        #vectora-notification {
          top: 12px;
          right: 12px;
          min-width: 240px;
          padding: 12px 14px;
        }
        .vectora-ai-percent {
          font-size: 28px;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Create notification element
  const notif = document.createElement('div');
  notif.id = 'vectora-notification';
  notif.innerHTML = `
    <div class="vectora-label">AI Involvement</div>
    <div class="vectora-ai-percent">${Math.round(percent)}%</div>
    <div class="vectora-message">${String(msg).substring(0, 100)}</div>
    <div class="vectora-powered">Powered by Vectora</div>
  `;
  document.body.appendChild(notif);
  
  // Auto-remove after 5 seconds with fade-out
  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transition = 'opacity 0.3s ease-out';
    setTimeout(() => {
      if (notif.parentNode) notif.remove();
    }, 300);
  }, 5000);
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'vectora-check-text') {
      const selectedText = info.selectionText || '';
      
      if (!selectedText || !selectedText.trim()) {
        showNotification(tab.id, 0, 'Please select text to analyze');
        return;
      }
      
      showNotification(tab.id, 0, 'Analyzing...');
      const result = await postToBackend({ text: selectedText });
      
      const ai_percent = result.ai_percent || 50;
      const message = result.message || 'Analysis complete';
      
      showNotification(tab.id, ai_percent, message);
      chrome.storage.local.set({ lastCheck: result });
    }
    
    if (info.menuItemId === 'vectora-check-image') {
      const srcUrl = info.srcUrl || '';
      
      if (!srcUrl) {
        showNotification(tab.id, 0, 'Could not extract image URL');
        return;
      }
      
      showNotification(tab.id, 0, 'Analyzing image...');
      const result = await postToBackend({ image_url: srcUrl });
      
      const ai_percent = result.ai_percent || 50;
      const message = result.message || 'Analysis complete';
      
      showNotification(tab.id, ai_percent, message);
      chrome.storage.local.set({ lastCheck: result });
    }
  } catch (error) {
    console.error('Context menu error:', error);
    showNotification(tab.id, 0, 'Error processing request');
  }
});
