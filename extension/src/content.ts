/**
 * Content Script for Google Ads Keyword Planner
 * Extracts keyword data from tables and injects send button
 */

interface KeywordData {
  keyword: string;
  monthlySearches?: number;
  competition?: string;
  competitionIndex?: number;
  lowTopPageBid?: number;
  highTopPageBid?: number;
  adImpressionShare?: string;
  searchTrend?: string;
  category?: string;
}

let buttonInjected = false;

// Try to inject button periodically until found
const injectButtonInterval = setInterval(() => {
  if (buttonInjected) {
    clearInterval(injectButtonInterval);
    return;
  }
  injectSendButton();
}, 1000);

// Stop after 30 seconds
setTimeout(() => {
  clearInterval(injectButtonInterval);
}, 30000);

function injectSendButton() {
  // Look for table containers in Google Ads Keyword Planner
  const tableContainers = document.querySelectorAll('[role="table"], table[aria-label*="keyword" i], table[aria-label*="Keyword" i]');

  if (tableContainers.length === 0) {
    return;
  }

  // Find the first visible table
  const targetTable = Array.from(tableContainers).find(
    table => table.checkVisibility() && table.querySelectorAll('tr, [role="row"]').length > 1
  ) as HTMLElement;

  if (!targetTable) {
    return;
  }

  // Check if button already exists
  if (document.getElementById('mcp-send-button')) {
    buttonInjected = true;
    return;
  }

  // Create button container
  const container = document.createElement('div');
  container.id = 'mcp-button-container';
  container.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    z-index: 9999;
    display: flex;
    gap: 10px;
  `;

  // Create Send to MCP Server button
  const sendButton = document.createElement('button');
  sendButton.id = 'mcp-send-button';
  sendButton.textContent = '📤 Send to MCP Server';
  sendButton.style.cssText = `
    padding: 10px 20px;
    background: #1a73e8;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    transition: background 0.2s;
  `;

  sendButton.addEventListener('mouseover', () => {
    sendButton.style.background = '#1557b0';
  });

  sendButton.addEventListener('mouseout', () => {
    sendButton.style.background = '#1a73e8';
  });

  sendButton.addEventListener('click', async () => {
    sendButton.disabled = true;
    sendButton.textContent = '⏳ Sending...';

    try {
      const keywords = extractKeywordData();
      await sendToMcpServer(keywords);
      sendButton.textContent = '✅ Sent!';
    } catch (error) {
      console.error('Error sending keywords:', error);
      sendButton.textContent = '❌ Error';
    }

    setTimeout(() => {
      sendButton.disabled = false;
      sendButton.textContent = '📤 Send to MCP Server';
    }, 3000);
  });

  container.appendChild(sendButton);
  document.body.appendChild(container);
  buttonInjected = true;

  console.log('[MCP Extractor] Button injected successfully');
}

function extractKeywordData(): KeywordData[] {
  const keywords: KeywordData[] = [];

  // Try multiple selectors for table rows
  const rowSelectors = [
    'table[aria-label*="keyword" i] tbody tr',
    'table[aria-label*="Keyword" i] tbody tr',
    '[role="table"] [role="row"]',
    'tbody tr',
    '[data-row="true"]'
  ];

  let rows: Element[] = [];
  for (const selector of rowSelectors) {
    rows = Array.from(document.querySelectorAll(selector));
    if (rows.length > 0) {
      break;
    }
  }

  // Filter out header rows
  const dataRows = rows.filter(row => {
    const text = row.textContent?.toLowerCase() || '';
    return !text.includes('keyword') && !text.includes('avg. monthly');
  });

  for (const row of dataRows) {
    const cells = row.querySelectorAll('[role="cell"], td, [data-cell="true"]');
    if (cells.length < 2) continue;

    const cellTexts = Array.from(cells).map(cell =>
      cell.textContent?.trim() || cell.getAttribute('aria-label') || ''
    );

    // Parse keyword data from cells
    const keywordData: KeywordData = {
      keyword: cellTexts[0] || ''
    };

    // Try to extract numeric values from other cells
    for (let i = 1; i < cellTexts.length; i++) {
      const cell = cellTexts[i];
      if (!cell) continue;

      // Monthly searches
      const searchMatch = cell.replace(/,/g, '').match(/^(\d+(?:\.\d+)?[KMBkmb]?)$/);
      if (searchMatch && !keywordData.monthlySearches) {
        keywordData.monthlySearches = parseSearchVolume(cell);
        continue;
      }

      // Competition level
      if (/^(low|medium|high)$/i.test(cell)) {
        keywordData.competition = cell;
        keywordData.competitionIndex = getCompetitionIndex(cell);
        continue;
      }

      // CPC/Bid values
      const bidMatch = cell.match(/[\$€£¥]?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      if (bidMatch) {
        const bidValue = parseFloat(bidMatch[1].replace(/,/g, ''));
        if (!keywordData.lowTopPageBid) {
          keywordData.lowTopPageBid = bidValue;
        } else if (!keywordData.highTopPageBid) {
          keywordData.highTopPageBid = bidValue;
        }
      }

      // Ad impression share
      if (cell.includes('%') && !keywordData.adImpressionShare) {
        keywordData.adImpressionShare = cell;
      }
    }

    if (keywordData.keyword) {
      keywords.push(keywordData);
    }
  }

  console.log(`[MCP Extractor] Extracted ${keywords.length} keywords`);
  return keywords;
}

function parseSearchVolume(text: string): number {
  text = text.toLowerCase().replace(/,/g, '');

  const multipliers: Record<string, number> = {
    'k': 1000,
    'm': 1000000,
    'b': 1000000000
  };

  for (const [suffix, multiplier] of Object.entries(multipliers)) {
    if (text.endsWith(suffix)) {
      return Math.round(parseFloat(text.slice(0, -1)) * multiplier);
    }
  }

  return parseInt(text, 10) || 0;
}

function getCompetitionIndex(competition: string): number {
  const lower = competition.toLowerCase();
  if (lower === 'low') return 30;
  if (lower === 'medium') return 60;
  if (lower === 'high') return 90;
  return 50;
}

async function sendToMcpServer(keywords: KeywordData[]) {
  if (keywords.length === 0) {
    throw new Error('No keywords to send');
  }

  // Get server URL from storage
  const result = await chrome.storage.local.get(['mcpServerUrl', 'mcpApiKey']);
  const serverUrl = result.mcpServerUrl || 'https://seo.modalhp.com';
  const apiKey = result.mcpApiKey || '';

  const response = await fetch(`${serverUrl}/api/keywords`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      keywords,
      source: 'Google Ads Keyword Planner',
      timestamp: new Date().toISOString()
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extract') {
    const keywords = extractKeywordData();
    sendResponse({ keywords, count: keywords.length });
  } else if (message.action === 'checkStatus') {
    sendResponse({
      hasTable: document.querySelectorAll('table, [role="table"]').length > 0,
      buttonInjected
    });
  }
});

console.log('[MCP Extractor] Content script loaded');
