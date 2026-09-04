/**
 * Transaction Risk Investigation Assistant (PS06)
 * Vanilla JavaScript Frontend Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const backendStatusEl = document.getElementById('backend-status');
  const modelDisplayEl = document.getElementById('model-name-display');
  const customerSelectEl = document.getElementById('customer-select');
  const runBtnEl = document.getElementById('run-btn');
  const runBtnTextEl = document.getElementById('run-btn-text');
  
  // Containers
  const welcomeCardEl = document.getElementById('welcome-card');
  const profileBannerEl = document.getElementById('customer-profile-banner');
  const loadingSpinnerEl = document.getElementById('loading-spinner');
  const resultsAreaEl = document.getElementById('investigation-results');
  
  // Profile Elements
  const avatarInitialsEl = document.getElementById('avatar-initials');
  const custNameEl = document.getElementById('cust-name');
  const custIdEl = document.getElementById('cust-id');
  const custAccEl = document.getElementById('cust-acc');
  const custTxCountEl = document.getElementById('cust-tx-count');
  const custRiskTagEl = document.getElementById('cust-risk-tag');
  const custNotesEl = document.getElementById('cust-notes');
  
  // Status Hero Elements
  const statusCardEl = document.getElementById('status-card');
  const statusHeadlineEl = document.getElementById('status-headline');
  const statusSubtextEl = document.getElementById('status-subtext');
  const statusIconEl = document.getElementById('status-icon');
  
  // Baseline Metric Elements
  const statMedianEl = document.getElementById('stat-median');
  const statChannelEl = document.getElementById('stat-channel');
  const statChannelPctEl = document.getElementById('stat-channel-pct');
  const statHoursEl = document.getElementById('stat-hours');
  const statHoursDescEl = document.getElementById('stat-hours-desc');
  const statFlaggedCountEl = document.getElementById('stat-flagged-count');
  const statRulesTriggeredEl = document.getElementById('stat-rules-triggered');
  
  // Findings Elements
  const findingsSectionEl = document.getElementById('findings-section');
  const findingsBadgeEl = document.getElementById('findings-badge');
  const findingsListEl = document.getElementById('findings-list');
  
  // Narrative Elements
  const narrativeContentEl = document.getElementById('narrative-content');
  const narrativeModelBadgeEl = document.getElementById('narrative-model-badge');
  
  // Table Elements
  const txTableBodyEl = document.getElementById('tx-table-body');
  const totalTxCountEl = document.getElementById('total-tx-count');
  const flaggedTxCountEl = document.getElementById('flagged-tx-count');
  const filterAllBtnEl = document.getElementById('filter-all-btn');
  const filterFlaggedBtnEl = document.getElementById('filter-flagged-btn');

  // Application State
  let currentTransactions = [];
  let currentFlaggedIds = new Set();
  let currentFlaggedRuleMap = new Map();
  let currentFilter = 'ALL'; // 'ALL' or 'FLAGGED'

  // =========================================================================
  // 1. System Health & Connectivity Check
  // =========================================================================
  async function initSystem() {
    try {
      const resp = await fetch('/api/health');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      backendStatusEl.className = 'status-chip online';
      backendStatusEl.innerHTML = `
        <span class="pulse-dot"></span>
        <span class="chip-text">Backend Connected (${data.mode || 'Active'})</span>
      `;

      if (data.gemini_model) {
        modelDisplayEl.textContent = data.gemini_model;
      }

      await loadCustomers();
    } catch (err) {
      console.error('Backend connection error:', err);
      backendStatusEl.className = 'status-chip offline';
      backendStatusEl.innerHTML = `
        <span class="pulse-dot"></span>
        <span class="chip-text">Backend Offline</span>
      `;
    }
  }

  // =========================================================================
  // 2. Load Customers Dropdown
  // =========================================================================
  async function loadCustomers() {
    try {
      const resp = await fetch('/api/customers');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      customerSelectEl.innerHTML = '<option value="">-- Select Customer Account to Review --</option>';
      (data.customers || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.customer_id;
        opt.textContent = `${c.name} (${c.customer_id}) — ${c.transaction_count} txs [${c.notes.slice(0, 48)}...]`;
        customerSelectEl.appendChild(opt);
      });
      customerSelectEl.disabled = false;
    } catch (err) {
      console.error('Failed to load customers:', err);
      customerSelectEl.innerHTML = '<option value="">Error loading customers</option>';
    }
  }

  // =========================================================================
  // 3. Customer Selection Changed
  // =========================================================================
  customerSelectEl.addEventListener('change', async (e) => {
    const custId = e.target.value;
    if (!custId) {
      runBtnEl.disabled = true;
      profileBannerEl.classList.add('hidden');
      resultsAreaEl.classList.add('hidden');
      welcomeCardEl.classList.remove('hidden');
      return;
    }

    try {
      const resp = await fetch(`/api/customers/${custId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const cust = await resp.json();

      // Render profile banner
      const initials = cust.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      avatarInitialsEl.textContent = initials;
      custNameEl.textContent = cust.name;
      custIdEl.textContent = cust.customer_id;
      custAccEl.textContent = cust.account_number;
      custTxCountEl.textContent = `${cust.transaction_count} Transactions`;
      custRiskTagEl.textContent = `${cust.risk_profile} Risk Profile`;
      custNotesEl.textContent = cust.notes;

      profileBannerEl.classList.remove('hidden');
      runBtnEl.disabled = false;

      // Reset state and show preview transactions
      currentTransactions = cust.transactions || [];
      currentFlaggedIds = new Set();
      currentFlaggedRuleMap = new Map();
      currentFilter = 'ALL';
      filterAllBtnEl.classList.add('active');
      filterFlaggedBtnEl.classList.remove('active');

      resultsAreaEl.classList.add('hidden');
      welcomeCardEl.classList.remove('hidden');
    } catch (err) {
      console.error('Error fetching customer details:', err);
    }
  });

  // =========================================================================
  // 4. Run Investigation
  // =========================================================================
  runBtnEl.addEventListener('click', async () => {
    const custId = customerSelectEl.value;
    if (!custId) return;

    // UI Loading state
    runBtnEl.disabled = true;
    runBtnTextEl.textContent = 'Analyzing...';
    welcomeCardEl.classList.add('hidden');
    resultsAreaEl.classList.add('hidden');
    loadingSpinnerEl.classList.remove('hidden');

    try {
      const resp = await fetch(`/api/investigate/${custId}`, { method: 'POST' });
      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();

      renderInvestigationResults(data);
    } catch (err) {
      console.error('Investigation failed:', err);
      alert(`Investigation failed: ${err.message}`);
    } finally {
      loadingSpinnerEl.classList.add('hidden');
      runBtnEl.disabled = false;
      runBtnTextEl.textContent = 'Run Investigation';
    }
  });

  // =========================================================================
  // 5. Render Investigation Results
  // =========================================================================
  function renderInvestigationResults(data) {
    const isAttention = data.overall_status === 'ATTENTION_REQUIRED';
    const findings = data.findings || [];
    const flaggedTxs = data.flagged_transactions || [];
    const baseline = data.baseline_profile || {};
    const aiNarrative = data.ai_narrative || {};

    // 1. Update Hero Status
    statusCardEl.className = `status-hero ${isAttention ? 'attention' : 'clean'}`;
    if (isAttention) {
      statusHeadlineEl.textContent = 'STATUS: ATTENTION REQUIRED';
      statusSubtextEl.textContent = `${findings.length} risk signal(s) detected across ${flaggedTxs.length} transaction(s). Activity exhibits unusual characteristics relative to customer's baseline.`;
      statusIconEl.innerHTML = `
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
      `;
    } else {
      statusHeadlineEl.textContent = 'STATUS: NO IMMEDIATE ATTENTION REQUIRED';
      statusSubtextEl.textContent = 'No configured risk rules were triggered. All reviewed transaction activity is broadly consistent with the customer’s established pattern.';
      statusIconEl.innerHTML = `
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
      `;
    }

    // 2. Update Baseline Metrics
    statMedianEl.textContent = `INR ${(baseline.median_debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    statChannelEl.textContent = baseline.dominant_channel || 'NONE';
    statChannelPctEl.textContent = `${baseline.dominant_channel_pct || 0}% of historical debits`;
    statHoursEl.textContent = '07:00–22:00';
    statHoursDescEl.textContent = baseline.active_hours_summary || 'Standard daytime';
    statFlaggedCountEl.textContent = `${flaggedTxs.length} / ${baseline.total_transactions || 0}`;
    statRulesTriggeredEl.textContent = `${findings.length} Rule(s) Triggered`;

    // 3. Render Structured Findings
    if (findings.length > 0) {
      findingsSectionEl.classList.remove('hidden');
      findingsBadgeEl.textContent = `${findings.length} Finding(s)`;
      findingsBadgeEl.className = 'badge badge-subtle';
      findingsListEl.innerHTML = '';

      findings.forEach(f => {
        const card = document.createElement('div');
        card.className = `finding-card severity-${f.severity.toLowerCase()}`;
        
        const txChips = f.transaction_ids.map(id => `<span class="tx-chip">${id}</span>`).join('');
        
        card.innerHTML = `
          <div class="finding-header">
            <div class="rule-name-badge">
              <span>&bull;</span> ${f.rule}
            </div>
            <div class="severity-pill ${f.severity.toLowerCase()}">${f.severity} SEVERITY</div>
          </div>
          <div class="finding-tx-tags">
            <span style="color: var(--text-muted); font-size: 0.78rem;">FLAGGED TRANSACTION(S):</span>
            ${txChips}
          </div>
          <div class="finding-detail-grid">
            <div class="detail-row">
              <span class="detail-lbl">Why Flagged:</span>
              <span class="detail-txt">${f.reason}</span>
            </div>
            <div class="detail-row">
              <span class="detail-lbl">Baseline:</span>
              <span class="detail-txt">${f.baseline}</span>
            </div>
            <div class="detail-row">
              <span class="detail-lbl">Deviation:</span>
              <span class="detail-txt">${f.deviation}</span>
            </div>
          </div>
          <div class="investigator-action-box">
            <span class="action-icon">&#9998;</span>
            <div class="action-text">
              <strong>Investigator Action:</strong> ${f.investigator_action}
            </div>
          </div>
        `;
        findingsListEl.appendChild(card);
      });
    } else {
      findingsSectionEl.classList.add('hidden');
    }

    // 4. Render Narrative AI Report
    narrativeModelBadgeEl.textContent = aiNarrative.model || 'gemini-3.5-flash-lite';
    if (aiNarrative.is_fallback) {
      narrativeModelBadgeEl.textContent = 'Deterministic Fallback';
      narrativeModelBadgeEl.title = aiNarrative.fallback_reason || 'Offline Fallback';
    }
    narrativeContentEl.innerHTML = formatMarkdownToHTML(aiNarrative.content || 'No narrative report generated.');

    // 5. Setup Flagged Transaction Tracking for Table
    currentTransactions = data.all_transactions || [];
    currentFlaggedIds = new Set(flaggedTxs.map(t => t.transaction_id));
    currentFlaggedRuleMap = new Map();
    flaggedTxs.forEach(t => {
      currentFlaggedRuleMap.set(t.transaction_id, (t.triggered_rules || []).join(', '));
    });

    totalTxCountEl.textContent = currentTransactions.length;
    flaggedTxCountEl.textContent = currentFlaggedIds.size;

    renderTransactionsTable();
    resultsAreaEl.classList.remove('hidden');
    resultsAreaEl.scrollIntoView({ behavior: 'smooth' });
  }

  // =========================================================================
  // 6. Transactions Table Rendering & Filtering
  // =========================================================================
  function renderTransactionsTable() {
    txTableBodyEl.innerHTML = '';

    const filtered = currentTransactions.filter(tx => {
      if (currentFilter === 'FLAGGED') {
        return currentFlaggedIds.has(tx.transaction_id);
      }
      return true;
    });

    if (filtered.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No transactions match the selected filter.</td>`;
      txTableBodyEl.appendChild(tr);
      return;
    }

    filtered.forEach(tx => {
      const isFlagged = currentFlaggedIds.has(tx.transaction_id);
      const ruleName = currentFlaggedRuleMap.get(tx.transaction_id) || '';

      const tr = document.createElement('tr');
      if (isFlagged) tr.className = 'row-flagged';

      const amountFormatted = `INR ${Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      const amountClass = tx.type === 'DEBIT' ? 'tx-debit' : 'tx-credit';
      const typePrefix = tx.type === 'DEBIT' ? '-' : '+';

      tr.innerHTML = `
        <td class="code-font" style="font-weight: 600; font-size: 0.8rem;">${tx.transaction_id}</td>
        <td class="code-font" style="font-size: 0.8rem; color: var(--text-secondary);">${tx.date}</td>
        <td>${escapeHTML(tx.description)}</td>
        <td style="font-weight: 500;">${escapeHTML(tx.payee)}</td>
        <td><span class="channel-pill">${tx.channel}</span></td>
        <td class="tx-amount ${amountClass}">${typePrefix} ${amountFormatted}</td>
        <td>
          ${isFlagged
            ? `<span class="risk-pill flagged" title="${ruleName}">&#9888; ${ruleName || 'FLAGGED'}</span>`
            : `<span class="risk-pill clean">&check; Clean</span>`
          }
        </td>
      `;
      txTableBodyEl.appendChild(tr);
    });
  }

  // Filter Toggles
  filterAllBtnEl.addEventListener('click', () => {
    currentFilter = 'ALL';
    filterAllBtnEl.classList.add('active');
    filterFlaggedBtnEl.classList.remove('active');
    renderTransactionsTable();
  });

  filterFlaggedBtnEl.addEventListener('click', () => {
    currentFilter = 'FLAGGED';
    filterFlaggedBtnEl.classList.add('active');
    filterAllBtnEl.classList.remove('active');
    renderTransactionsTable();
  });

  // =========================================================================
  // 7. Utility: Lightweight Safe Markdown to HTML Formatter
  // =========================================================================
  function formatMarkdownToHTML(md) {
    if (!md) return '';
    let html = escapeHTML(md);

    // Format section headers (### 1. Title)
    html = html.replace(/^###\s+(.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.*$)/gim, '<h3>$1</h3>');

    // Bold text (**bold**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Bullet points (* or -)
    html = html.replace(/^\s*[\-\*]\s+(.*$)/gim, '<li>$1</li>');

    // Wrap consecutive list items in <ul>
    html = html.replace(/(<li>.*<\/li>(\s*<li>.*<\/li>)*)/gim, '<ul>$1</ul>');

    // Linebreaks into paragraphs
    html = html.replace(/\n\n+/g, '</p><p>');
    html = `<p>${html}</p>`;
    html = html.replace(/<p>\s*<\/p>/g, '');

    return html;
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize
  initSystem();
});
