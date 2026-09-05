/**
 * Transaction Risk Investigation Assistant (PS06)
 * Enterprise One-Page Persistent Investigation Workspace
 */

document.addEventListener('DOMContentLoaded', () => {
  // System Status & Health
  const statusMsgEl = document.getElementById('status-msg');
  const activeModelNameEl = document.getElementById('active-model-name');
  const systemPillEl = document.getElementById('system-pill');

  // Customer Selection & Dossier
  const customerSelectEl = document.getElementById('customer-select');
  const targetStatsCardEl = document.getElementById('target-stats-card');
  const targetAvatarEl = document.getElementById('target-avatar');
  const targetNameEl = document.getElementById('target-name');
  const targetAccEl = document.getElementById('target-acc');
  const targetRiskPillEl = document.getElementById('target-risk-pill');
  const statTargetMedianEl = document.getElementById('stat-target-median');
  const statTargetCountEl = document.getElementById('stat-target-count');
  const statTargetHoursEl = document.getElementById('stat-target-hours');
  const statTargetChannelEl = document.getElementById('stat-target-channel');

  // Trigger Buttons & Actions
  const runAuditBtn = document.getElementById('run-audit-btn');
  const runBtnLabel = document.getElementById('run-btn-label');
  const btnToggleFlaggedFilter = document.getElementById('btn-toggle-flagged-filter');
  const flaggedFilterLabel = document.getElementById('flagged-filter-label');
  const btnJumpFindings = document.getElementById('btn-jump-findings');
  const exportDossierBtn = document.getElementById('export-dossier-btn');

  // Workspace Header
  const headerCustId = document.getElementById('header-cust-id');
  const headerTxCount = document.getElementById('header-tx-count');

  // Persistent Report Canvas States
  const reportEmptyState = document.getElementById('report-empty-state');
  const reportLoadingState = document.getElementById('report-loading-state');
  const loadingStepText = document.getElementById('loading-step-text');
  const reportContent = document.getElementById('report-content');

  // Rules Modal
  const openRulesModalBtn = document.getElementById('open-rules-modal-btn');
  const closeRulesModalBtn = document.getElementById('close-modal-btn');
  const modalCloseAction = document.getElementById('modal-close-action');
  const rulesModal = document.getElementById('rules-modal');

  // Internal Application State
  let availableCustomers = [];
  let activeCustomerData = null;
  let activeInvestigationReport = null;
  let isFlaggedOnlyFilterActive = false;

  // =========================================================================
  // 1. Initialize System & Health Verification
  // =========================================================================
  async function initStudio() {
    try {
      const resp = await fetch('/api/health');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const health = await resp.json();

      statusMsgEl.textContent = health.has_gemini_key ? 'Engine Ready' : 'Fallback Ready';
      if (health.gemini_model) {
        activeModelNameEl.textContent = health.gemini_model;
      }

      await loadCustomerList();
    } catch (err) {
      console.error('System health check error:', err);
      statusMsgEl.textContent = 'Service Offline';
      systemPillEl.style.borderColor = 'var(--rose-border)';
    }
  }

  // =========================================================================
  // 2. Load Customer Directory
  // =========================================================================
  async function loadCustomerList() {
    try {
      const resp = await fetch('/api/customers');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      availableCustomers = data.customers || [];

      customerSelectEl.innerHTML = '<option value="">-- Choose Account Dossier --</option>';
      availableCustomers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.customer_id;
        opt.textContent = `${c.name} (${c.customer_id}) — ${c.transaction_count} txs`;
        customerSelectEl.appendChild(opt);
      });
      customerSelectEl.disabled = false;
    } catch (err) {
      console.error('Failed to load customer catalog:', err);
    }
  }

  // =========================================================================
  // 3. Customer Selection & Spotlight Stat Grid (Requirement 4)
  // =========================================================================
  async function selectCustomer(custId, autoRun = false) {
    if (!custId) {
      targetStatsCardEl.classList.add('hidden');
      runAuditBtn.disabled = true;
      headerCustId.textContent = 'None Selected';
      headerTxCount.textContent = '(0 Transactions)';
      activeCustomerData = null;
      activeInvestigationReport = null;
      exportDossierBtn.disabled = true;
      btnToggleFlaggedFilter.disabled = true;
      btnJumpFindings.disabled = true;
      updateBenchmarkButtonStates('');
      showEmptyState();
      return;
    }

    try {
      customerSelectEl.value = custId;
      updateBenchmarkButtonStates(custId);

      const resp = await fetch(`/api/customers/${custId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      activeCustomerData = await resp.json();

      // Update Dossier Header
      const initials = activeCustomerData.name
        .split(' ')
        .map(p => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      targetAvatarEl.textContent = initials;
      targetNameEl.textContent = activeCustomerData.name;
      targetAccEl.textContent = activeCustomerData.account_number;
      
      const riskLevel = activeCustomerData.risk_profile || 'LOW';
      targetRiskPillEl.textContent = `${riskLevel} RISK`;
      targetRiskPillEl.className = `dossier-risk-pill ${riskLevel.toLowerCase() === 'high' ? 'high' : ''}`;

      // Calculate 2x2 Stat Grid Values
      statTargetCountEl.textContent = `${activeCustomerData.transaction_count} txs`;

      const debits = (activeCustomerData.transactions || []).filter(t => t.type === 'DEBIT');
      if (debits.length > 0) {
        const sortedAmts = debits.map(t => t.amount).sort((a, b) => a - b);
        const mid = Math.floor(sortedAmts.length / 2);
        const med = sortedAmts.length % 2 !== 0 ? sortedAmts[mid] : (sortedAmts[mid - 1] + sortedAmts[mid]) / 2;
        statTargetMedianEl.textContent = `INR ${med.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

        const channelMap = {};
        debits.forEach(t => channelMap[t.channel] = (channelMap[t.channel] || 0) + 1);
        const dominant = Object.keys(channelMap).reduce((a, b) => channelMap[a] > channelMap[b] ? a : b, 'UPI');
        statTargetChannelEl.textContent = dominant;
      } else {
        statTargetMedianEl.textContent = 'INR 0.00';
        statTargetChannelEl.textContent = 'NONE';
      }

      statTargetHoursEl.textContent = '07:00–22:00';
      targetStatsCardEl.classList.remove('hidden');

      // Update Header Bar
      headerCustId.textContent = `${activeCustomerData.name} (${activeCustomerData.customer_id})`;
      headerTxCount.textContent = `(${activeCustomerData.transaction_count} Transactions)`;

      runAuditBtn.disabled = false;

      if (autoRun) {
        executeInvestigation(custId);
      }
    } catch (err) {
      console.error('Failed to load customer details:', err);
    }
  }

  customerSelectEl.addEventListener('change', (e) => {
    selectCustomer(e.target.value);
  });

  function updateBenchmarkButtonStates(activeCustId) {
    document.querySelectorAll('.scenario-select-btn').forEach(btn => {
      if (btn.getAttribute('data-cust') === activeCustId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Handle Quick Benchmark clicks in Sidebar and Empty State
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.scenario-select-btn, .benchmark-card');
    if (btn) {
      const custId = btn.getAttribute('data-cust');
      selectCustomer(custId, true);
    }
  });

  // =========================================================================
  // 4. Run Automated Risk Audit
  // =========================================================================
  runAuditBtn.addEventListener('click', () => {
    if (!activeCustomerData) return;
    executeInvestigation(activeCustomerData.customer_id);
  });

  async function executeInvestigation(custId) {
    if (!custId) return;

    showLoadingState('Executing deterministic rules 1–4 against transaction history...');
    runAuditBtn.disabled = true;
    runBtnLabel.textContent = 'Auditing Account...';

    // Step progression animation
    const stepTimer = setTimeout(() => {
      if (loadingStepText) {
        loadingStepText.textContent = 'Synthesizing grounded investigation narrative via Gemini AI...';
      }
    }, 900);

    try {
      const resp = await fetch(`/api/investigate/${custId}`, { method: 'POST' });
      clearTimeout(stepTimer);

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      activeInvestigationReport = await resp.json();

      // Render Persistent One-Page Report (Replaces view)
      renderInvestigationReport(activeInvestigationReport);

      exportDossierBtn.disabled = false;
      const hasFindings = (activeInvestigationReport.findings || []).length > 0;
      btnToggleFlaggedFilter.disabled = !hasFindings;
      btnJumpFindings.disabled = !hasFindings;

    } catch (err) {
      clearTimeout(stepTimer);
      showErrorState(err.message);
    } finally {
      runAuditBtn.disabled = false;
      runBtnLabel.textContent = 'Run Automated Risk Audit';
    }
  }

  // =========================================================================
  // 5. Render Persistent Investigation Report (Requirements 1, 2, 3)
  // =========================================================================
  function renderInvestigationReport(report) {
    const isAttention = report.overall_status === 'ATTENTION_REQUIRED';
    const findings = report.findings || [];
    const flaggedTxs = report.flagged_transactions || [];
    const allTxs = report.all_transactions || [];
    const baseline = report.baseline_profile || {};
    const aiNarrative = report.ai_narrative || {};

    // 1. Overall Status Banner (Requirement 2)
    let statusBannerHtml = '';
    if (isAttention) {
      statusBannerHtml = `
        <div class="report-status-banner attention">
          <div class="banner-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>
            </svg>
          </div>
          <div class="banner-content">
            <div class="banner-headline">STATUS: ATTENTION REQUIRED &mdash; Deterministic rule violations detected</div>
            <div class="banner-sub">
              Deterministic evaluation flagged <strong>${findings.length} risk heuristic(s)</strong> across <strong>${flaggedTxs.length} cited transaction(s)</strong>. Immediate investigator adjudication is recommended.
            </div>
            <div class="banner-chips-row">
              <span class="banner-chip alert">${findings.length} Rule Signal(s)</span>
              <span class="banner-chip alert">${flaggedTxs.length} Cited Transaction(s)</span>
              <span class="banner-chip neutral">Model: ${escapeHTML(aiNarrative.model_used || 'gemini-3.5-flash-lite')}</span>
              <span class="banner-chip neutral">Traceability: 100% Grounded</span>
            </div>
          </div>
        </div>
      `;
    } else {
      statusBannerHtml = `
        <div class="report-status-banner clean">
          <div class="banner-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div class="banner-content">
            <div class="banner-headline">STATUS: NO IMMEDIATE ATTENTION REQUIRED &mdash; Account conforms to baseline</div>
            <div class="banner-sub">
              No configured risk rules were triggered across ${baseline.total_transactions || allTxs.length} evaluated transactions. All customer debits strictly adhere to historical spending norms.
            </div>
            <div class="banner-chips-row">
              <span class="banner-chip clean">Zero Rule Violations</span>
              <span class="banner-chip clean">Baseline Adherent</span>
              <span class="banner-chip neutral">Model: ${escapeHTML(aiNarrative.model_used || 'gemini-3.5-flash-lite')}</span>
              <span class="banner-chip neutral">Traceability: Verified</span>
            </div>
          </div>
        </div>
      `;
    }

    // 2. Metadata Profile Strip
    const profileStripHtml = `
      <div class="report-profile-strip">
        <div class="profile-stat-item">
          <span class="profile-stat-label">Customer Account</span>
          <span class="profile-stat-value">${escapeHTML(report.customer_name)}</span>
          <span class="code-font" style="font-size: 0.72rem; color: var(--text-muted);">${escapeHTML(report.account_number || report.customer_id)}</span>
        </div>
        <div class="profile-stat-item">
          <span class="profile-stat-label">Review Period</span>
          <span class="profile-stat-value code-font" style="font-size: 0.78rem;">${baseline.date_range_start || '2024-01-01'} &rarr; ${baseline.date_range_end || '2024-03-31'}</span>
        </div>
        <div class="profile-stat-item">
          <span class="profile-stat-label">Audited Volume</span>
          <span class="profile-stat-value code-font" style="font-size: 0.8rem;">${baseline.total_debits || 0} Debits &bull; ${baseline.total_credits || 0} Credits</span>
          <span style="font-size: 0.7rem; color: var(--text-muted);">Total: INR ${Number(baseline.total_debit_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
        </div>
        <div class="profile-stat-item">
          <span class="profile-stat-label">AI Investigation Mode</span>
          <span class="profile-stat-value" style="font-size: 0.78rem; color: ${aiNarrative.is_fallback ? 'var(--amber-text)' : 'var(--cyan)'};">
            ${aiNarrative.is_fallback ? 'Deterministic Fallback' : 'Live Gemini Synthesis'}
          </span>
          <span class="code-font" style="font-size: 0.7rem; color: var(--text-muted);">${escapeHTML(aiNarrative.model_used || 'gemini-3.5-flash-lite')}</span>
        </div>
      </div>
    `;

    // 3. Distinct Risk Finding Cards (Requirement 2)
    let findingsSectionHtml = '';
    if (findings.length > 0) {
      const cardsHtml = findings.map(f => {
        const severityClass = (f.severity || 'HIGH').toLowerCase();
        const citedChips = (f.transaction_ids || []).map(id => 
          `<button class="cited-chip-clickable code-font" onclick="jumpToLedgerRow('${id}')" title="Click to view and highlight transaction row in ledger">${id} &rarr; View Row</button>`
        ).join(' ');

        return `
          <div class="finding-card severity-${severityClass}">
            <div class="finding-top-bar">
              <span class="finding-rule-title">&bull; ${escapeHTML(f.rule)}</span>
              <span class="severity-pill ${severityClass}">${escapeHTML(f.severity)} SEVERITY</span>
            </div>
            
            <div class="finding-cited-wrap">
              <span class="cited-label">Cited Transaction(s):</span>
              ${citedChips}
            </div>

            <div class="finding-detail-grid">
              <div class="finding-detail-row">
                <span class="detail-row-label">Why Flagged</span>
                <span class="detail-row-text">${escapeHTML(f.reason)}</span>
              </div>
              <div class="finding-detail-row">
                <span class="detail-row-label">Customer Baseline Comparison</span>
                <span class="detail-row-text">${escapeHTML(f.baseline)}</span>
              </div>
              <div class="finding-detail-row">
                <span class="detail-row-label">Deviation Magnitude</span>
                <span class="detail-row-text"><span class="magnitude-badge">${escapeHTML(f.deviation)}</span></span>
              </div>
            </div>

            <div class="finding-action-box">
              <strong>Recommended Investigator Action:</strong> ${escapeHTML(f.investigator_action)}
            </div>
          </div>
        `;
      }).join('');

      findingsSectionHtml = `
        <div class="findings-section-wrap" id="findings-deck">
          <div class="section-title-lockup">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; color: var(--rose-text);">
                <polygon points="12 2 2 22 22 22 12 2"/>
              </svg>
              Identified Risk Findings
            </h3>
            <span class="section-badge-count">${findings.length} Flagged</span>
          </div>
          <div class="findings-cards-deck">
            ${cardsHtml}
          </div>
        </div>
      `;
    }

    // 4. Grounded AI Narrative Prose
    const narrativeHtml = `
      <div class="narrative-section-wrap">
        <div class="narrative-header">
          <div class="narrative-title-lockup">
            <svg class="narrative-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/>
            </svg>
            <h3>AI Investigation Synthesis</h3>
          </div>
          <span class="ai-engine-badge code-font">${escapeHTML(aiNarrative.model_used || 'gemini-3.5-flash-lite')}</span>
        </div>
        <div class="narrative-prose">
          ${parseMarkdown(aiNarrative.content || 'Report generation unavailable.')}
        </div>
      </div>
    `;

    // 5. Scannable Transaction Ledger Table (Requirement 3)
    const flaggedIdSet = new Set(flaggedTxs.map(t => t.transaction_id));
    const ruleMap = new Map();
    flaggedTxs.forEach(t => ruleMap.set(t.transaction_id, (t.triggered_rules || []).join(', ')));

    const rowsHtml = allTxs.map(tx => {
      const isFlagged = flaggedIdSet.has(tx.transaction_id);
      const isDebit = tx.type === 'DEBIT';
      const formattedAmt = `INR ${Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      const ruleText = ruleMap.get(tx.transaction_id) || '';

      return `
        <tr id="ledger-row-${tx.transaction_id}" class="${isFlagged ? 'row-flagged' : 'row-clean'}">
          <td class="tx-id-cell code-font">${escapeHTML(tx.transaction_id)}</td>
          <td class="code-font" style="font-size: 0.75rem; color: var(--text-secondary);">${escapeHTML(tx.date)}</td>
          <td>${escapeHTML(tx.description)}</td>
          <td style="font-weight: 600; color: #fff;">${escapeHTML(tx.payee)}</td>
          <td><span class="channel-badge code-font">${escapeHTML(tx.channel)}</span></td>
          <td class="${isDebit ? 'amount-debit code-font' : 'amount-credit code-font'}" style="text-align: right;">
            ${isDebit ? '-' : '+'} ${formattedAmt}
          </td>
          <td style="text-align: center;">
            ${isFlagged
              ? `<span class="status-badge alert">&#9888; ${escapeHTML(ruleText || 'FLAGGED')}</span>`
              : `<span class="status-badge clean">&check; Clean</span>`
            }
          </td>
        </tr>
      `;
    }).join('');

    const ledgerSectionHtml = `
      <div class="ledger-section-wrap" id="ledger-section">
        <div class="ledger-header">
          <div class="ledger-title-lockup">
            <h3>Customer Transaction Audit Ledger</h3>
          </div>
          <div class="ledger-counts">
            <span style="color: var(--text-muted);">Total: <strong style="color: #fff;">${allTxs.length}</strong></span>
            <span style="color: var(--text-muted);">Flagged: <strong style="color: ${flaggedTxs.length ? 'var(--rose-text)' : 'var(--emerald-text)'};">${flaggedTxs.length}</strong></span>
            ${flaggedTxs.length > 0 ? `
              <button class="ledger-filter-pill-btn" id="table-filter-btn" onclick="toggleFlaggedFilter()">
                ${isFlaggedOnlyFilterActive ? 'Show All Rows' : 'Show Flagged Only'}
              </button>
            ` : ''}
          </div>
        </div>
        <div class="table-scroll-container">
          <table class="evidence-table" id="evidence-ledger-table">
            <thead>
              <tr>
                <th>Txn ID</th>
                <th>Date &amp; Time</th>
                <th>Description</th>
                <th>Payee</th>
                <th>Channel</th>
                <th style="text-align: right;">Amount</th>
                <th style="text-align: center;">Risk Adjudication</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Replace the entire report content canvas with the new single report
    reportContent.innerHTML = `
      ${statusBannerHtml}
      ${profileStripHtml}
      ${findingsSectionHtml}
      ${narrativeHtml}
      ${ledgerSectionHtml}
    `;

    showReportContent();

    // Scroll to top of report view
    const container = document.getElementById('report-view-container');
    if (container) container.scrollTop = 0;
  }

  // =========================================================================
  // 6. Traceability Jump to Ledger Row (Requirement 3)
  // =========================================================================
  window.jumpToLedgerRow = function(txId) {
    const row = document.getElementById(`ledger-row-${txId}`);
    if (row) {
      // If table filter is currently hiding clean rows, reset filter so row is visible
      if (isFlaggedOnlyFilterActive) {
        window.toggleFlaggedFilter(false);
      }
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.remove('row-pulse');
      void row.offsetWidth; // trigger reflow
      row.classList.add('row-pulse');
    }
  };

  // Toggle Flagged Only Filter in Table
  window.toggleFlaggedFilter = function(explicitState) {
    if (explicitState !== undefined) {
      isFlaggedOnlyFilterActive = explicitState;
    } else {
      isFlaggedOnlyFilterActive = !isFlaggedOnlyFilterActive;
    }

    const cleanRows = document.querySelectorAll('#evidence-ledger-table tbody tr.row-clean');
    cleanRows.forEach(r => {
      r.style.display = isFlaggedOnlyFilterActive ? 'none' : '';
    });

    const tableFilterBtn = document.getElementById('table-filter-btn');
    if (tableFilterBtn) {
      tableFilterBtn.textContent = isFlaggedOnlyFilterActive ? 'Show All Rows' : 'Show Flagged Only';
      tableFilterBtn.classList.toggle('active', isFlaggedOnlyFilterActive);
    }

    if (flaggedFilterLabel) {
      flaggedFilterLabel.textContent = isFlaggedOnlyFilterActive ? 'Show All Rows' : 'Filter Flagged Rows';
    }
  };

  btnToggleFlaggedFilter.addEventListener('click', () => {
    window.toggleFlaggedFilter();
  });

  btnJumpFindings.addEventListener('click', () => {
    const deck = document.getElementById('findings-deck');
    if (deck) {
      deck.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // =========================================================================
  // 7. View State Toggles
  // =========================================================================
  function showEmptyState() {
    reportEmptyState.classList.remove('hidden');
    reportLoadingState.classList.add('hidden');
    reportContent.classList.add('hidden');
  }

  function showLoadingState(message) {
    reportEmptyState.classList.add('hidden');
    reportLoadingState.classList.remove('hidden');
    reportContent.classList.add('hidden');
    if (loadingStepText && message) loadingStepText.textContent = message;
  }

  function showReportContent() {
    reportEmptyState.classList.add('hidden');
    reportLoadingState.classList.add('hidden');
    reportContent.classList.remove('hidden');
  }

  function showErrorState(errorMsg) {
    reportEmptyState.classList.add('hidden');
    reportLoadingState.classList.add('hidden');
    reportContent.classList.remove('hidden');
    reportContent.innerHTML = `
      <div class="report-status-banner attention">
        <div class="banner-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <div class="banner-content">
          <div class="banner-headline">Investigation Execution Failed</div>
          <div class="banner-sub">An error occurred while generating the risk report: <strong>${escapeHTML(errorMsg)}</strong></div>
          <div style="margin-top: 0.75rem;">
            <button class="btn btn-primary-gradient" onclick="document.getElementById('run-audit-btn').click()">
              Retry Investigation
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 8. Export Dossier JSON
  // =========================================================================
  exportDossierBtn.addEventListener('click', () => {
    if (!activeInvestigationReport) return;
    const jsonStr = JSON.stringify(activeInvestigationReport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dossier_${activeInvestigationReport.customer_id}_investigation.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // =========================================================================
  // 9. Heuristics Reference Modal
  // =========================================================================
  openRulesModalBtn.addEventListener('click', () => rulesModal.classList.remove('hidden'));
  closeRulesModalBtn.addEventListener('click', () => rulesModal.classList.add('hidden'));
  modalCloseAction.addEventListener('click', () => rulesModal.classList.add('hidden'));
  rulesModal.addEventListener('click', (e) => {
    if (e.target === rulesModal) rulesModal.classList.add('hidden');
  });

  // =========================================================================
  // 10. Safe Markdown Parser for Narrative Prose
  // =========================================================================
  function parseMarkdown(md) {
    if (!md) return '';
    let html = escapeHTML(md);

    // Headings
    html = html.replace(/^###\s+(.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.*$)/gim, '<h3>$1</h3>');

    // Bold text
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Inline code
    html = html.replace(/\`(.*?)\`/g, '<code class="code-font">$1</code>');

    // Bullet points
    html = html.replace(/^\s*[\-\*]\s+(.*$)/gim, '<li>$1</li>');

    // Numbered lists
    html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li>$2</li>');

    // Wrap list items in <ul>
    html = html.replace(/(<li>.*<\/li>(\s*<li>.*<\/li>)*)/gim, '<ul>$1</ul>');

    // Paragraph breaks
    html = html.replace(/\n\n+/g, '</p><p>');
    html = `<p>${html}</p>`;
    html = html.replace(/<p>\s*<\/p>/g, '');

    return html;
  }

  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Launch Studio
  initStudio();
});
