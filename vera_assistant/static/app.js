'use strict';

// ── State ─────────────────────────────────────────────────────────
let sessionId = null;
let currentMode = 'content';
let isStreaming = false;

// ── DOM refs ──────────────────────────────────────────────────────
const chatMessages  = document.getElementById('chatMessages');
const userInput     = document.getElementById('userInput');
const sendBtn       = document.getElementById('sendBtn');
const resetBtn      = document.getElementById('resetBtn');
const contextBar    = document.getElementById('contextBar');
const contentType   = document.getElementById('contentType');
const modeBtns      = document.querySelectorAll('.mode-btn');

// ── Mode switching ────────────────────────────────────────────────
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (isStreaming) return;
    const newMode = btn.dataset.mode;
    if (newMode === currentMode) return;

    modeBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');

    currentMode = newMode;
    contextBar.classList.toggle('hidden', newMode !== 'content');

    // Mode change resets the server-side session automatically (handled in vera_agent.py)
    // but we also clear the UI and local session id so a fresh greeting appears
    sessionId = null;
    clearChat();
  });
});

// ── Markdown renderer (lightweight, no dependencies) ─────────────
function renderMarkdown(text) {
  // Escape HTML first to prevent XSS
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced code blocks  ```lang\n...\n```
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  );

  // Inline code `...`
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Headings ### ## #
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Bold **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g,     '<strong>$1</strong>');

  // Italic *text* or _text_
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_\n]+)_/g,   '<em>$1</em>');

  // Blockquote > ...
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rule ---
  html = html.replace(/^---+$/gm, '<hr>');

  // Unordered lists (- or *)
  html = html.replace(/^[*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');

  // Ordered lists (1. ...)
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs: split on double newlines, wrap non-block elements
  const blocks = html.split(/\n{2,}/);
  html = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (/^<(h[1-3]|ul|ol|li|pre|blockquote|hr)/.test(block)) return block;
    // Replace single newlines within a paragraph with <br>
    return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');

  return html;
}

// ── Chat helpers ──────────────────────────────────────────────────
function clearChat() {
  chatMessages.innerHTML = `
    <div class="msg assistant welcome-msg">
      <div class="msg-bubble">
        <p>Hi Vera! 🤍 I'm here to help you create content, connect with your audience, and plan your business — all in your authentic voice.</p>
        <p>Choose a mode above and tell me what you'd like to work on today.</p>
      </div>
    </div>`;
}

function appendMessage(role, htmlContent, extraClass = '') {
  const msgEl = document.createElement('div');
  msgEl.className = `msg ${role}${extraClass ? ' ' + extraClass : ''}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = htmlContent;

  msgEl.appendChild(bubble);
  chatMessages.appendChild(msgEl);
  scrollToBottom();
  return bubble;
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showThinking() {
  const msgEl = document.createElement('div');
  msgEl.className = 'msg assistant';
  msgEl.id = 'thinking-indicator';
  msgEl.innerHTML = `
    <div class="thinking-indicator">
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
      <span>Vera is thinking…</span>
    </div>`;
  chatMessages.appendChild(msgEl);
  scrollToBottom();
}

function removeThinking() {
  const el = document.getElementById('thinking-indicator');
  if (el) el.remove();
}

// ── Send message ──────────────────────────────────────────────────
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  // Render user message
  appendMessage('user', renderMarkdown(text));
  userInput.value = '';
  userInput.style.height = 'auto';

  isStreaming = true;
  sendBtn.disabled = true;
  showThinking();

  try {
    const body = {
      session_id:   sessionId,
      mode:         currentMode,
      message:      text,
      content_type: currentMode === 'content' ? contentType.value : null,
    };

    const response = await fetch('/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Server error ${response.status}`);
    }

    // SSE stream reading
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantBubble = null;
    let rawText = '';

    removeThinking();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        let event;
        try { event = JSON.parse(jsonStr); } catch { continue; }

        if (event.type === 'session_id') {
          sessionId = event.session_id;

        } else if (event.type === 'text') {
          if (!assistantBubble) {
            // Create the streaming bubble
            const msgEl = document.createElement('div');
            msgEl.className = 'msg assistant';
            const bubble = document.createElement('div');
            bubble.className = 'msg-bubble streaming-cursor';
            msgEl.appendChild(bubble);
            chatMessages.appendChild(msgEl);
            assistantBubble = bubble;
          }

          rawText += event.content;
          assistantBubble.innerHTML = renderMarkdown(rawText);
          scrollToBottom();

        } else if (event.type === 'done') {
          if (assistantBubble) {
            assistantBubble.classList.remove('streaming-cursor');
            // Final render
            assistantBubble.innerHTML = renderMarkdown(rawText);
          }
          scrollToBottom();

        } else if (event.type === 'error') {
          removeThinking();
          appendMessage('assistant', `<p>${escapeHtml(event.content)}</p>`, 'error');
        }
      }
    }

  } catch (err) {
    removeThinking();
    appendMessage('assistant',
      `<p>Something went wrong — please try again. (${escapeHtml(err.message)})</p>`,
      'error'
    );
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Reset / New Conversation ──────────────────────────────────────
resetBtn.addEventListener('click', async () => {
  if (isStreaming) return;

  if (sessionId) {
    try {
      await fetch('/reset', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: sessionId }),
      });
    } catch { /* fire-and-forget */ }
  }

  sessionId = null;
  clearChat();
  userInput.focus();
});

// ── Keyboard shortcuts ────────────────────────────────────────────
userInput.addEventListener('keydown', e => {
  // Shift+Enter = newline, Enter alone = send
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-grow textarea
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 240) + 'px';
});

sendBtn.addEventListener('click', sendMessage);

// ── Init ──────────────────────────────────────────────────────────
// Hide context bar for non-content modes on load (content is default so it shows)
contextBar.classList.toggle('hidden', currentMode !== 'content');
userInput.focus();
