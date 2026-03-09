/**
 * Popup Script for Chrome Extension
 * Handles UI interactions and configuration
 */

document.addEventListener('DOMContentLoaded', () => {
  const serverUrlInput = document.getElementById('serverUrl') as HTMLInputElement;
  const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
  const saveConfigBtn = document.getElementById('saveConfig') as HTMLButtonElement;
  const configStatus = document.getElementById('configStatus') as HTMLDivElement;
  const extractNowBtn = document.getElementById('extractNow') as HTMLButtonElement;
  const testConnectionBtn = document.getElementById('testConnection') as HTMLButtonElement;
  const actionStatus = document.getElementById('actionStatus') as HTMLDivElement;

  // Load saved configuration
  chrome.storage.local.get(['mcpServerUrl', 'mcpApiKey'], (result) => {
    if (result.mcpServerUrl) {
      serverUrlInput.value = result.mcpServerUrl;
    }
    if (result.mcpApiKey) {
      apiKeyInput.value = result.mcpApiKey;
    }
  });

  // Save configuration
  saveConfigBtn.addEventListener('click', () => {
    const serverUrl = serverUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!serverUrl) {
      showStatus(configStatus, 'Server URL is required', 'error');
      return;
    }

    chrome.storage.local.set({ mcpServerUrl: serverUrl, mcpApiKey: apiKey }, () => {
      showStatus(configStatus, 'Configuration saved successfully!', 'success');
    });
  });

  // Extract keywords from current page
  extractNowBtn.addEventListener('click', async () => {
    showStatus(actionStatus, 'Extracting keywords...', 'info');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });

      if (response?.keywords && response.keywords.length > 0) {
        // Send to server
        const config = await chrome.storage.local.get(['mcpServerUrl', 'mcpApiKey']);

        const sendResult = await chrome.runtime.sendMessage({
          action: 'sendToServer',
          data: {
            keywords: response.keywords,
            source: 'Google Ads Keyword Planner'
          }
        });

        if (sendResult.success) {
          showStatus(actionStatus, `Extracted and sent ${response.keywords.length} keywords!`, 'success');
        } else {
          showStatus(actionStatus, `Sent ${response.keywords.length} keywords, but server error: ${sendResult.error}`, 'error');
        }
      } else {
        showStatus(actionStatus, 'No keywords found on this page. Make sure you\'re on Google Ads Keyword Planner.', 'error');
      }
    } catch (error) {
      showStatus(actionStatus, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  });

  // Test server connection
  testConnectionBtn.addEventListener('click', async () => {
    const serverUrl = serverUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!serverUrl) {
      showStatus(actionStatus, 'Please enter server URL first', 'error');
      return;
    }

    showStatus(actionStatus, 'Testing connection...', 'info');

    try {
      const response = await fetch(`${serverUrl}/api/health`, {
        headers: {
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        }
      });

      if (response.ok) {
        const data = await response.json();
        showStatus(actionStatus, `Connection successful! Server status: ${data.status}`, 'success');
      } else {
        showStatus(actionStatus, `Connection failed: HTTP ${response.status}`, 'error');
      }
    } catch (error) {
      showStatus(actionStatus, `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  });

  function showStatus(element: HTMLDivElement, message: string, type: 'success' | 'error' | 'info') {
    element.textContent = message;
    element.className = `status ${type}`;

    setTimeout(() => {
      element.className = 'status';
      element.textContent = '';
    }, 5000);
  }
});
