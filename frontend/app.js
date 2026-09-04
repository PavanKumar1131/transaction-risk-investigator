/**
 * Transaction Risk Investigation Assistant (PS06)
 * Enterprise AI Frontend Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation & Telemetry
  const connectionStatusEl = document.getElementById('connection-status');
  const backendStatusTextEl = document.getElementById('backend-status-text');
  const modelDisplayEl = document.getElementById('model-display');

  // Command Center
  const customerSelectEl = document.getElementById('customer-select');
  const runBtnEl = document.getElementById('run-btn');
  const runBtnTextEl = document.getElementById('run-btn-text');
  const quickJumpContainerEl = document.getElementById('quick-jump-container');

  // Dossier Card
  const customerDossierEl = document.getElementById('customer-dossier');
  const dossierAvatarEl = document.getElementById('dossier-avatar');
  const dossierNameEl = document.getElementById('dossier-name');
  const dossierIdEl = document.getElementById('dossier-id');
  const dossierAccEl = document.getElementById('dossier-acc');
  const dossierCountEl = document.getElementById('dossier-count');
  const dossierRiskEl = document.getElementById('dossier-risk');
  const dossierNotesEl = document.getElementById('dossier-notes');

  // Loaders & Sections
  const engineLoaderEl = document.getElementById('engine-loader');
  const welcomeOverviewEl = document.getElementById('welcome-overview');
  const investigationWorkspaceEl = document.getElementById('investigation-workspace');

  // Status Hero
  const statusHeroEl = document.getElementById('status-hero');
  const statusIconBoxEl = document.getElementById('status-icon-box');
  const statusHeadingEl = document.getElementById('status-heading');
  const statusSummaryTextEl = document.getElementById('status-summary-text');

  // Baseline Metrics
  const metricMedianEl = document.getElementById('metric-median');
  const metricMedianSubEl = document.getElementById('metric-median-sub');
  const metricChannelEl = document.getElementById('metric-channel');
  const metricChannelPctEl = document.getElementById('metric-channel-pct');
  const metricChannelBarEl = document.getElementById('metric-channel-bar');
  const metricHoursEl = document.getElementById('metric-hours');
  const metricHoursSubEl = document.getElementById('metric-hours-sub');
  const metricFlaggedCountEl = document.getElementById('metric-flagged-count');
  const metricRulesSubEl = document.getElementById('metric-rules-sub');

  // Findings Deck
  const findingsWrapperEl = document.getElementById('findings-wrapper');
  const findingsCounterEl = document.getElementById('findings-counter');
  const findingsDeckEl = document.getElementById('findings-deck');

  // AI Narrative Report
  const aiModelBadgeEl = document.getElementById('ai-model-badge');
  const aiModelNameEl = document.getElementById('ai-model-name');
  const aiReportContentEl = document.getElementById('ai-report-content');

  // Ledger Table & Filters
  const txSearchInputEl = document.getElementById('tx-search-input');
  const tabAllBtn = document.getElementById('tab-all');
  const tabFlaggedBtn = document.getElementById('tab-flagged');
  const countAllEl = document.getElementById('count-all');
  const countFlaggedEl = document.getElementById('count-flagged');
  const ledgerTableBodyEl = document.getElementById('ledger-table-body');

  // State
  let availableCustomers = [];
  let currentTransactions = [];
  let currentFlaggedIds = new Set();
  let currentFlaggedRuleMap = new Map();
  let currentFilter = 'ALL'; // 'ALL' or 'FLAGGED'
  let searchQuery = '';

  // Quick Demo Jump Scenarios metadata
  const DEMO_TARGETS = [
    { id: 'CUST_101', label: 'CUST_101 (Clean Salaried)', type: 'clean' },
    { id: 'CUST_102', label: 'CUST_102 (Rule 1: Outlier Wire)', type: 'flagged' },
    { id: 'CUST_103', label: 'CUST_103 (Rule 2: Rapid Burst)', type: 'flagged' },
    { id: 'CUST_104', label: 'CUST_104 (Rule 3: 02:42 AM Odd Hours)', type: 'flagged' },
    { id: 'CUST_105', label: 'CUST_105 (Rule 4: Pattern Break)', type: 'flagged' },
    { id: 'CUST_106', label: 'CUST_106 (Clean Freelancer)', type: 'clean' },
  ];

  // =========================================================================
  // 1. Initial System Boot & Health Check
  // =========================================================================
  async function bootSystem() {
    try {
      const resp = await fetch('/api/health');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      connectionStatusEl.className = 'telemetry-item online';
      backendStatusTextEl.textContent = `Online (${data.mode || 'Connected'})`;

      if (data.gemini_model) {
        modelDisplayEl.textContent = data.gemini_model;
      }

      await fetchCustomers();
      renderQuickJumpChips();
    } catch (err) {
      console.error('Boot health check failed:', err);
      connectionStatusEl.className = 'telemetry-item offline';
      backendStatusTextEl.textContent = 'Service Disconnected';
    }
  }

  // =========================================================================
  // 2. Fetch Customer Directory
  // =========================================================================
  async function fetchCustomers() {
    try {
      const resp = await fetch('/api/customers');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      availableCustomers = data.customers || [];

      customerSelectEl.innerHTML = '<option value="">-- Choose Customer Account to Investigate --</option>';
      availableCustomers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.customer_id;
        opt.textContent = `${c.name} (${c.customer_id}) — ${c.transaction_count} txs [${c.risk_profile} Risk]`;
        customerSelectEl.appendChild(opt);
      });
      customerSelectEl.disabled = false;
    } catch (err) {
      console.error('Error fetching customers:', err);
      customerSelectEl.innerHTML = '<option value="">Error loading customers</option>';
    }
  }

  // =========================================================================
  // 3. Quick Demo Shortcuts for Hackathon Evaluators
  // =========================================================================
  function renderQuickJumpChips() {
    quickJumpContainerEl.innerHTML = '';
    DEMO_TARGETS.forEach(target => {
      const chip = document.createElement('button');
      chip.className = `jump-chip chip-${target.type}`;
      chip.textContent = target.label;
      chip.onclick = () => selectAndFocusCustomer(target.id);
      quickJumpContainerEl.appendChild(chip);
    });
  }

  function selectAndFocusCustomer(custId) {
    customerSelectEl.value = custId;
    customerSelectEl.dispatchEvent(new Event('change'));
    
    // Update active state in chips
    document.querySelectorAll('.jump-chip').forEach(c => {
      if (c.textContent.includes(custId)) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
  }

  // =========================================================================
  // 4. Customer Selection Event
  // =========================================================================
  customerSelectEl.addEventListener('change', async (e) => {
    const custId = e.target.value;
    if (!custId) {
      runBtnEl.disabled = true;
      customerDossierEl.classList.add('hidden');
      investigationWorkspaceEl.classList.add('hidden');
      welcomeOverviewEl.classList.remove('hidden');
      return;
    }

    try {
      const resp = await fetch(`/api/customers/${custId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const cust = await resp.json();

      // Render spotlight dossier card
      const initials = cust.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
      dossierAvatarEl.textContent = initials;
      dossierNameEl.textContent = cust.name;
      dossierIdEl.textContent = cust.customer_id;
      dossierAccEl.textContent = cust.account_number;
      dossierCountEl.textContent = `${cust.transaction_count} Transactions`;
      dossierRiskEl.textContent = `${cust.risk_profile} Risk Profile`;
      dossierNotesEl.textContent = cust.notes;

      customerDossierEl.classList.remove('hidden');
      runBtnEl.disabled = false;

      // Reset ledger preview state
      currentTransactions = cust.transactions || [];
      currentFlaggedIds = new Set();
      currentFlaggedRuleMap = new Map();
      currentFilter = 'ALL';
      searchQuery = '';
      if (txSearchInputEl) txSearchInputEl.value = '';
      tabAllBtn.classList.add('active');
      tabFlaggedBtn.classList.remove('active');

      investigationWorkspaceEl.classList.add('hidden');
      welcomeOverviewEl.classList.remove('hidden');
    } catch (err) {
      console.error('Error reading customer dossier:', err);
    }
  });

  // =========================================================================
  // 5. Execute Investigation Engine
  // =========================================================================
  runBtnEl.addEventListener('click', async () => {
    const custId = customerSelectEl.value;
    if (!custId) return;

    // Trigger radar loader and transition
    runBtnEl.disabled = true;
    runBtnTextEl.textContent = 'Auditing Account...';
    welcomeOverviewEl.classList.add('hidden');
    investigationWorkspaceEl.classList.add('hidden');
    engineLoaderEl.classList.remove('hidden');

    try {
      const resp = await fetch(`/api/investigate/${custId}`, { method: 'POST' });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();

      // Small deliberate delay so the user witnesses the deterministic scanner steps
      setTimeout(() => {
        engineLoaderEl.classList.add('hidden');
        renderFullInvestigation(data);
        runBtnEl.disabled = false;
        runBtnTextEl.textContent = 'Run Risk Investigation';
      }, 450);

    } catch (err) {
      console.error('Investigation execution error:', err);
      engineLoaderEl.classList.add('hidden');
      runBtnEl.disabled = false;
      runBtnTextEl.textContent = 'Run Risk Investigation';
      alert(`Investigation Engine Alert: ${err.message}`);
    }
  });

  // =========================================================================
  // 6. Render Full Investigation Results
  // =========================================================================
  function renderFullInvestigation(data) {
    const isAttention = data.overall_status === 'ATTENTION_REQUIRED';
    const findings = data.findings || [];
    const flaggedTxs = data.flagged_transactions || [];
    const baseline = data.baseline_profile || {};
    const ai = data.ai_narrative || {};

    // 1. Executive Status Hero Card
    statusHeroEl.className = `status-hero-card ${isAttention ? 'attention' : 'clean'}`;
    if (isAttention) {
      statusHeadingEl.textContent = 'STATUS: ATTENTION REQUIRED';
      statusSummaryTextEl.textContent = `Identified ${findings.length} risk signal(s) across ${flaggedTxs.length} transaction(s). Activity exhibits unusual characteristics relative to customer's baseline.`;
      statusIconBoxEl.innerHTML = `
        <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>
        </svg>
      `;
    } else {
      statusHeadingEl.textContent = 'STATUS: NO IMMEDIATE ATTENTION REQUIRED';
      statusSummaryTextEl.textContent = 'No configured risk rules were triggered. All reviewed transactions align with the customer’s established baseline and regular spending pattern.';
      statusIconBoxEl.innerHTML = `
        <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      `;
    }

    // 2. Baseline Metrics
    metricMedianEl.textContent = `INR ${(baseline.median_debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    metricMedianSubEl.textContent = `Calculated across ${baseline.total_debits || 0} historical debits`;
    metricChannelEl.textContent = baseline.dominant_channel || 'NONE';
    metricChannelPctEl.textContent = `${baseline.dominant_channel_pct || 0}% of historical volume`;
    metricChannelBarEl.style.width = `${Math.min(baseline.dominant_channel_pct || 10, 100)}%`;
    metricHoursEl.textContent = '07:00–22:00';
    metricHoursSubEl.textContent = baseline.active_hours_summary || 'Standard daytime activity';
    metricFlaggedCountEl.textContent = `${flaggedTxs.length} / ${baseline.total_transactions || 0}`;
    metricRulesSubEl.textContent = `${findings.length} rule trigger(s) detected`;

    // 3. Structured Risk Findings Deck
    if (findings.length > 0) {
      findingsWrapperEl.classList.remove('hidden');
      findingsCounterEl.textContent = `${findings.length} Active Finding(s)`;
      findingsDeckEl.innerHTML = '';

      findings.forEach(f => {
        const card = document.createElement('div');
        card.className = `finding-card severity-${f.severity.toLowerCase()}`;

        const chipsHtml = f.transaction_ids.map(id => `<span class="evidence-tx-chip code-font">${id}</span>`).join(' ');

        card.innerHTML = `
          <div class="finding-card-top">
            <div class="rule-indicator">
              <span class="rule-beacon"></span>
              <span>${f.rule}</span>
            </div>
            <span class="severity-pill-modern ${f.severity.toLowerCase()}">${f.severity} SEVERITY</span>
          </div>

          <div class="finding-cited-txs">
            <span class="cited-label">Cited Evidence Record(s):</span>
            ${chipsHtml}
          </div>

          <div class="finding-columns-grid">
            <div class="finding-col-item">
              <span class="col-header">Why Flagged</span>
              <span class="col-text">${f.reason}</span>
            </div>
            <div class="finding-col-item">
              <span class="col-header">Customer Baseline</span>
              <span class="col-text">${f.baseline}</span>
            </div>
            <div class="finding-col-item">
              <span class="col-header">Magnitude &amp; Deviation</span>
              <span class="col-text" style="color: var(--cyan-bright); font-weight: 600;">${f.deviation}</span>
            </div>
          </div>

          <div class="investigator-directive-box">
            <svg class="directive-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/>
              <line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            <div class="directive-text">
              <strong>Investigator Action:</strong> ${f.investigator_action}
            </div>
          </div>
        `;
        findingsDeckEl.appendChild(card);
      });
    } else {
      findingsWrapperEl.classList.add('hidden');
    }

    // 4. Grounded AI Narrative Report
    aiModelNameEl.textContent = ai.model || 'gemini-3.5-flash-lite';
    if (ai.is_fallback) {
      aiModelBadgeEl.classList.add('fallback');
      aiModelNameEl.textContent = 'Deterministic Fallback Engine';
    } else {
      aiModelBadgeEl.classList.remove('fallback');
    }
    aiReportContentEl.innerHTML = parseMarkdownToHTML(ai.content || 'Report generation unavailable.');

    // 5. Store Flagged IDs & Rule Map for Ledger Highlighting
    currentTransactions = data.all_transactions || [];
    currentFlaggedIds = new Set(flaggedTxs.map(t => t.transaction_id));
    currentFlaggedRuleMap = new Map();
    flaggedTxs.forEach(t => {
      currentFlaggedRuleMap.set(t.transaction_id, (t.triggered_rules || []).join(', '));
    });

    countAllEl.textContent = currentTransactions.length;
    countFlaggedEl.textContent = currentFlaggedIds.size;

    renderLedger();
    investigationWorkspaceEl.classList.remove('hidden');
    investigationWorkspaceEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // =========================================================================
  // 7. Render Ledger Table (Search & Filter)
  // =========================================================================
  function renderLedger() {
    ledgerTableBodyEl.innerHTML = '';

    const filtered = currentTransactions.filter(tx => {
      // Filter tab check
      if (currentFilter === 'FLAGGED' && !currentFlaggedIds.has(tx.transaction_id)) {
        return false;
      }
      // Search query check
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches = (
          tx.transaction_id.toLowerCase().includes(q) ||
          tx.description.toLowerCase().includes(q) ||
          tx.payee.toLowerCase().includes(q) ||
          tx.channel.toLowerCase().includes(q)
        );
        if (!matches) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">No transaction records match the active filter or search criteria.</td>`;
      ledgerTableBodyEl.appendChild(tr);
      return;
    }

    filtered.forEach(tx => {
      const isFlagged = currentFlaggedIds.has(tx.transaction_id);
      const ruleLabel = currentFlaggedRuleMap.get(tx.transaction_id) || '';

      const tr = document.createElement('tr');
      if (isFlagged) tr.className = 'flagged-row';

      const isDebit = tx.type === 'DEBIT';
      const formattedAmount = `INR ${Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      const typeSign = isDebit ? '-' : '+';
      const amountClass = isDebit ? 'debit' : 'credit';

      tr.innerHTML = `
        <td class="code-font" style="font-weight: 700; color: ${isFlagged ? 'var(--rose-text)' : 'var(--cyan-bright)'}">${tx.transaction_id}</td>
        <td class="code-font" style="font-size: 0.78rem; color: var(--text-secondary);">${tx.date}</td>
        <td>${escapeHTML(tx.description)}</td>
        <td style="font-weight: 600;">${escapeHTML(tx.payee)}</td>
        <td><span class="channel-tag">${tx.channel}</span></td>
        <td class="tx-amount-col ${amountClass}" style="text-align: right;">${typeSign} ${formattedAmount}</td>
        <td style="text-align: center;">
          ${isFlagged
            ? `<span class="flag-status-pill alert">&#9888; ${ruleLabel || 'FLAGGED'}</span>`
            : `<span class="flag-status-pill clean">&check; Clean Routine</span>`
          }
        </td>
      `;
      ledgerTableBodyEl.appendChild(tr);
    });
  }

  // Filter Buttons
  tabAllBtn.addEventListener('click', () => {
    currentFilter = 'ALL';
    tabAllBtn.classList.add('active');
    tabFlaggedBtn.classList.remove('active');
    renderLedger();
  });

  tabFlaggedBtn.addEventListener('click', () => {
    currentFilter = 'FLAGGED';
    tabFlaggedBtn.classList.add('active');
    tabAllBtn.classList.remove('active');
    renderLedger();
  });

  // Search Input
  txSearchInputEl.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderLedger();
  });

  // =========================================================================
  // 8. Markdown to Clean HTML Formatter
  // =========================================================================
  function parseMarkdownToHTML(md) {
    if (!md) return '';
    let html = escapeHTML(md);

    // Section Titles (### 1. ...)
    html = html.replace(/^###\s+(.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.*$)/gim, '<h3>$1</h3>');

    // Bold text (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Bullet points (- or *)
    html = html.replace(/^\s*[\-\*]\s+(.*$)/gim, '<li>$1</li>');

    // Numbered lists (1. ...)
    html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li>$2</li>');

    // Group list items into <ul> or <ol>
    html = html.replace(/(<li>.*<\/li>(\s*<li>.*<\/li>)*)/gim, '<ul>$1</ul>');

    // Paragraph separation
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

  // Boot Application
  bootSystem();
});
