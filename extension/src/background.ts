/**
 * Background Service Worker for Chrome Extension
 * Handles communication with MCP Server
 */

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[MCP Background] Extension installed:', details.reason);

  // Set default values
  chrome.storage.local.get(['mcpServerUrl'], (result) => {
    if (!result.mcpServerUrl) {
      chrome.storage.local.set({
        mcpServerUrl: 'https://seo.modalhp.com'
      });
    }
  });
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[MCP Background] Received message:', message);

  if (message.action === 'sendToServer') {
    handleSendToServer(message.data)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'getConfig') {
    chrome.storage.local.get(['mcpServerUrl', 'mcpApiKey'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === 'saveConfig') {
    chrome.storage.local.set(message.data, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function handleSendToServer(data: {
  keywords: any[];
  source?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    // Get configuration from storage
    const config = await chrome.storage.local.get(['mcpServerUrl', 'mcpApiKey']);
    const serverUrl = config.mcpServerUrl || 'https://seo.modalhp.com';
    const apiKey = config.mcpApiKey || '';

    console.log('[MCP Background] Sending to:', serverUrl);

    const response = await fetch(`${serverUrl}/api/keywords`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        keywords: data.keywords,
        source: data.source || 'Google Ads Keyword Planner',
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log('[MCP Background] Server response:', result);

    return {
      success: true,
      message: `Successfully sent ${result.count || data.keywords.length} keywords`
    };
  } catch (error) {
    console.error('[MCP Background] Error sending data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Handle context menu (optional feature)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sendToMcp',
    title: 'Send to MCP Server',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sendToMcp' && info.selectionText) {
    // Send selected text as keyword
    chrome.tabs.sendMessage(tab?.id || 0, {
      action: 'sendSelection',
      text: info.selectionText
    });
  }
});

console.log('[MCP Background] Service worker initialized');
