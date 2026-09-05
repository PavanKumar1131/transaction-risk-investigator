/**
 * Transaction Risk Investigation Assistant (PS06)
 * Interactive Banking Fraud Copilot & Dossier Workspace
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation & System Status
  const statusMsgEl = document.getElementById('status-msg');
  const activeModelNameEl = document.getElementById('active-model-name');
  const systemPillEl = document.getElementById('system-pill');

  // Sidebar Elements
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

  // Trigger Buttons
  const runAuditBtn = document.getElementById('run-audit-btn');
  const runBtnLabel = document.getElementById('run-btn-label');
  const chipFlaggedOnly = document.getElementById('chip-flagged-only');
  const chipCleanTest = document.getElementById('chip-clean-test');
  const chipExplainDeviations = document.getElementById('chip-explain-deviations');

  // Rules Modal
  const openRulesModalBtn = document.getElementById('open-rules-modal-btn');
  const closeRulesModalBtn = document.getElementById('close-modal-btn');
  const modalCloseAction = document.getElementById('modal-close-action');
  const rulesModal = document.getElementById('rules-modal');

  // Workspace Header
  const headerCustId = document.getElementById('header-cust-id');
  const headerTxCount = document.getElementById('header-tx-count');
  const exportDossierBtn = document.getElementById('export-dossier-btn');
  const clearStreamBtn = document.getElementById('clear-stream-btn');

  // Stream & Chat
  const streamContainer = document.getElementById('stream-container');
  const dynamicThread = document.getElementById('dynamic-thread');
  const typingIndicator = document.getElementById('typing-indicator');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const quickPromptsContainer = document.getElementById('quick-prompts');
  const welcomeTimeEl = document.getElementById('welcome-time');

  // Internal State
  let availableCustomers = [];
  let activeCustomerData = null;
  let activeInvestigationReport = null;

  if (welcomeTimeEl) {
    welcomeTimeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // =========================================================================
  // 1. Initialize System & Check Health
  // =========================================================================
  async function initCopilot() {
    try {
      const resp = await fetch('/api/health');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const health = await resp.json();

      statusMsgEl.textContent = 'Engine Ready';
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
  // 3. Customer Selection & Spotlight Stats
  // =========================================================================
  customerSelectEl.addEventListener('change', async (e) => {
    const custId = e.target.value;
    if (!custId) {
      targetStatsCardEl.classList.add('hidden');
      runAuditBtn.disabled = true;
      headerCustId.textContent = 'None Selected';
      headerTxCount.textContent = '(0 Transactions)';
      activeCustomerData = null;
      activeInvestigationReport = null;
      exportDossierBtn.disabled = true;
      chipFlaggedOnly.disabled = true;
      chipExplainDeviations.disabled = true;
      return;
    }

    try {
      const resp = await fetch(`/api/customers/${custId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      activeCustomerData = await resp.json();

      // Render Spotlight Dossier
      const initials = activeCustomerData.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
      targetAvatarEl.textContent = initials;
      targetNameEl.textContent = activeCustomerData.name;
      targetAccEl.textContent = activeCustomerData.account_number;
      targetRiskPillEl.textContent = `${activeCustomerData.risk_profile} RISK`;
      statTargetCountEl.textContent = `${activeCustomerData.transaction_count} txs`;

      // Quick approximate median / channel from loaded transactions
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
      exportDossierBtn.disabled = false;

    } catch (err) {
      console.error('Failed to load customer details:', err);
    }
  });

  // =========================================================================
  // 4. Run Automated Risk Audit
  // =========================================================================
  runAuditBtn.addEventListener('click', () => {
    if (!activeCustomerData) return;
    executeAudit(activeCustomerData.customer_id);
  });

  async function executeAudit(custId) {
    if (!custId) return;

    // 1. Post User prompt in conversation stream
    appendUserBubble(`Analyze recent transaction history for ${headerCustId.textContent} against risk rules.`);

    // 2. Show Typing / Evaluator indicator
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
    runAuditBtn.disabled = true;
    runBtnLabel.textContent = 'Running Audit...';

    try {
      const resp = await fetch(`/api/investigate/${custId}`, { method: 'POST' });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      activeInvestigationReport = await resp.json();

      // 3. Render AI Response Bubble with Verdict Banner, Findings, and Evidence Ledger
      typingIndicator.classList.add('hidden');
      renderInvestigationBubble(activeInvestigationReport);

      chipFlaggedOnly.disabled = activeInvestigationReport.findings_count === 0;
      chipExplainDeviations.disabled = activeInvestigationReport.findings_count === 0;

    } catch (err) {
      typingIndicator.classList.add('hidden');
      appendCopilotTextBubble(`⚠️ **Investigation Engine Alert:** Failed to complete audit. Error: ${err.message}`);
    } finally {
      runAuditBtn.disabled = false;
      runBtnLabel.textContent = 'Run Automated Risk Audit';
      scrollToBottom();
    }
  }

  // =========================================================================
  // 5. Render Stream Investigation Bubble
  // =========================================================================
  function renderInvestigationBubble(report) {
    const isAttention = report.overall_status === 'ATTENTION_REQUIRED';
    const findings = report.findings || [];
    const flaggedTxs = report.flagged_transactions || [];
    const allTxs = report.all_transactions || [];
    const baseline = report.baseline_profile || {};
    const aiNarrative = report.ai_narrative || {};

    const bubble = document.createElement('div');
    bubble.className = 'stream-bubble copilot-response';

    // Unique table ID for traceability jump links
    const tableId = `evidence-table-${Date.now()}`;

    // 1. Top Verdict Banner
    let verdictBannerHtml = '';
    if (isAttention) {
      verdictBannerHtml = `
        <div class="verdict-banner attention">
          <svg class="verdict-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>
          </svg>
          <div>
            <div class="verdict-title">STATUS: ATTENTION REQUIRED &mdash; Deterministic rule violations detected</div>
            <div class="verdict-sub">${findings.length} risk signal(s) flagged across ${flaggedTxs.length} transaction(s). Activity requires investigator adjudication.</div>
          </div>
        </div>
      `;
    } else {
      verdictBannerHtml = `
        <div class="verdict-banner clean">
          <svg class="verdict-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <div>
            <div class="verdict-title">STATUS: NO IMMEDIATE ATTENTION REQUIRED &mdash; Account conforms to baseline</div>
            <div class="verdict-sub">No configured risk rules were triggered across ${baseline.total_transactions || allTxs.length} transactions. Behavior is consistent with established pattern.</div>
          </div>
        </div>
      `;
    }

    // 2. Structured Findings Cards (if attention required)
    let findingsHtml = '';
    if (findings.length > 0) {
      const cardsHtml = findings.map(f => {
        const chipButtons = f.transaction_ids.map(id => 
          `<button class="cited-chip-clickable code-font" onclick="jumpToEvidenceRow('${tableId}', '${id}')" title="Click to inspect row in evidence table">${id} &rarr;</button>`
        ).join(' ');

        return `
          <div class="stream-finding-card severity-${f.severity.toLowerCase()}">
            <div class="finding-top-row">
              <span class="finding-rule-name">&bull; ${f.rule}</span>
              <span class="severity-pill-sm ${f.severity.toLowerCase()}">${f.severity} SEVERITY</span>
            </div>
            <div class="finding-cited-chips">
              <span style="color: var(--text-muted);">Cited Transaction(s):</span>
              ${chipButtons}
            </div>
            <div class="finding-breakdown-text">
              <p><strong>Why Flagged:</strong> ${f.reason}</p>
              <p><strong>Customer Baseline:</strong> ${f.baseline}</p>
              <p><strong>Deviation Magnitude:</strong> <span style="color: var(--cyan); font-weight: 700;">${f.deviation}</span></p>
            </div>
            <div class="finding-action-callout">
              <strong>Recommended Investigator Action:</strong> ${f.investigator_action}
            </div>
          </div>
        `;
      }).join('');

      findingsHtml = `
        <div class="stream-findings-deck">
          <h4 style="font-size: 0.85rem; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.05em;">Identified Risk Findings (${findings.length})</h4>
          ${cardsHtml}
        </div>
      `;
    }

    // 3. Grounded Gemini Narrative Report
    const formattedNarrative = parseMarkdown(aiNarrative.content || 'Report generation unavailable.');
    const narrativeHtml = `
      <div class="stream-narrative-prose">
        ${formattedNarrative}
      </div>
    `;

    // 4. Interactive Evidence Ledger Table
    const flaggedIdSet = new Set(flaggedTxs.map(t => t.transaction_id));
    const ruleMap = new Map();
    flaggedTxs.forEach(t => ruleMap.set(t.transaction_id, (t.triggered_rules || []).join(', ')));

    const rowsHtml = allTxs.map(tx => {
      const isFlagged = flaggedIdSet.has(tx.transaction_id);
      const isDebit = tx.type === 'DEBIT';
      const formattedAmt = `INR ${Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      const ruleText = ruleMap.get(tx.transaction_id) || '';

      return `
        <tr id="${tableId}-row-${tx.transaction_id}" class="${isFlagged ? 'row-flagged' : ''}">
          <td class="code-font" style="font-weight: 700; color: ${isFlagged ? 'var(--rose-text)' : 'var(--cyan)'};">${tx.transaction_id}</td>
          <td class="code-font" style="font-size: 0.75rem; color: var(--text-secondary);">${tx.date}</td>
          <td>${escapeHTML(tx.description)}</td>
          <td style="font-weight: 600;">${escapeHTML(tx.payee)}</td>
          <td><span class="channel-tag code-font" style="font-size: 0.7rem;">${tx.channel}</span></td>
          <td class="${isDebit ? 'amount-debit' : 'amount-credit'}" style="text-align: right;">${isDebit ? '-' : '+'} ${formattedAmt}</td>
          <td style="text-align: center;">
            ${isFlagged
              ? `<span class="badge-risk alert">&#9888; ${ruleText || 'FLAGGED'}</span>`
              : `<span class="badge-risk clean">&check; Clean Routine</span>`
            }
          </td>
        </tr>
      `;
    }).join('');

    const ledgerHtml = `
      <div class="stream-ledger-wrapper">
        <div class="stream-ledger-header">
          <h4>Customer Transaction Audit Ledger (${allTxs.length} records)</h4>
          <span style="font-size: 0.72rem; color: var(--text-muted);">Flagged: <strong style="color: ${flaggedTxs.length ? 'var(--rose-text)' : 'var(--emerald-text)'};">${flaggedTxs.length}</strong></span>
        </div>
        <div class="evidence-table-scroll">
          <table class="evidence-table" id="${tableId}">
            <thead>
              <tr>
                <th>Txn ID</th>
                <th>Date &amp; Time</th>
                <th>Description</th>
                <th>Payee</th>
                <th>Channel</th>
                <th style="text-align: right;">Amount</th>
                <th style="text-align: center;">Risk Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;

    bubble.innerHTML = `
      <div class="avatar-copilot">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/>
        </svg>
      </div>
      <div class="bubble-body">
        <div class="bubble-header">
          <span class="sender-name">Risk Investigation Copilot &bull; Report</span>
          <span class="timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        ${verdictBannerHtml}
        ${findingsHtml}
        ${narrativeHtml}
        ${ledgerHtml}
      </div>
    `;

    dynamicThread.appendChild(bubble);
  }

  // =========================================================================
  // 6. Traceability Jump-to-Row Function
  // =========================================================================
  window.jumpToEvidenceRow = function(tableId, txId) {
    const row = document.getElementById(`${tableId}-row-${txId}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.remove('row-pulse');
      void row.offsetWidth; // trigger reflow
      row.classList.add('row-pulse');
    }
  };

  // =========================================================================
  // 7. Interactive Conversation Follow-Ups
  // =========================================================================
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = chatInput.value.trim();
    if (!query) return;

    chatInput.value = '';
    handleFollowUpQuery(query);
  });

  // Quick Prompt Pills
  if (quickPromptsContainer) {
    quickPromptsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.prompt-pill');
      if (!btn) return;
      const prompt = btn.getAttribute('data-prompt');
      handleFollowUpQuery(prompt);
    });
  }

  function handleFollowUpQuery(query) {
    appendUserBubble(query);

    typingIndicator.classList.remove('hidden');
    scrollToBottom();

    setTimeout(() => {
      typingIndicator.classList.add('hidden');
      const reply = generateFollowUpResponse(query);
      appendCopilotTextBubble(reply);
      scrollToBottom();
    }, 400);
  }

  function generateFollowUpResponse(query) {
    if (!activeInvestigationReport) {
      return "Please select a customer and click **Run Automated Risk Audit** first so I have their audited records in memory.";
    }

    const q = query.toLowerCase();
    const r = activeInvestigationReport;
    const findings = r.findings || [];
    const baseline = r.baseline_profile || {};

    // 1. Check for specific transaction query
    const txMatch = query.match(/TX\d+_\d+/i);
    if (txMatch) {
      const targetId = txMatch[0].toUpperCase();
      const finding = findings.find(f => f.transaction_ids.includes(targetId));
      const tx = (r.all_transactions || []).find(t => t.transaction_id === targetId);

      if (finding && tx) {
        return `**Transaction ${targetId} Analysis:**\n- **Date/Time:** ${tx.date}\n- **Payee:** ${tx.payee} (${tx.channel})\n- **Amount:** INR ${Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n- **Triggered Rule:** \`${finding.rule}\` (${finding.severity} Severity)\n- **Reason:** ${finding.reason}\n- **Baseline Comparison:** ${finding.baseline}\n- **Action:** ${finding.investigator_action}`;
      } else if (tx) {
        return `**Transaction ${targetId} Details:**\n- **Date/Time:** ${tx.date}\n- **Payee:** ${tx.payee} (${tx.channel})\n- **Amount:** INR ${Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n- **Status:** **Clean Routine** (No risk heuristics triggered for this transaction).`;
      } else {
        return `Transaction ID \`${targetId}\` was not found in customer ${r.customer_name}'s loaded dataset.`;
      }
    }

    // 2. Baseline inquiries
    if (q.includes('baseline') || q.includes('channel') || q.includes('median')) {
      return `**Customer Baseline Profile for ${r.customer_name} (${r.customer_id}):**\n- **Historical Median Debit:** INR ${Number(baseline.median_debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n- **Dominant Channel:** \`${baseline.dominant_channel || 'NONE'}\` (${baseline.dominant_channel_pct || 0}% of debits)\n- **Typical Active Hours:** ${baseline.active_hours_summary || '07:00–22:00'}\n- **Total Transactions Audited:** ${baseline.total_transactions || 0} (${baseline.total_debits || 0} debits, ${baseline.total_credits || 0} credits)\n- **Date Range:** ${baseline.date_range_start} to ${baseline.date_range_end}`;
    }

    // 3. Next steps / Investigator actions
    if (q.includes('next') || q.includes('check first') || q.includes('action') || q.includes('step')) {
      if (findings.length === 0) {
        return `**No Actions Required:** Account ${r.customer_name} exhibits routine living spending consistent with established baseline. No further escalation needed.`;
      }
      const actions = findings.map((f, i) => `${i + 1}. **[${f.rule}]**: ${f.investigator_action}`).join('\n');
      return `**Recommended Next Steps for Investigator:**\n${actions}`;
    }

    // 4. Odd-hours inquiries
    if (q.includes('odd') || q.includes('hour') || q.includes('night')) {
      const oddRule = findings.find(f => f.rule === 'ODD_HOURS_ACTIVITY');
      if (oddRule) {
        return `⚠️ **Odd-Hours Activity Identified:**\n- ${oddRule.reason}\n- **Baseline:** ${oddRule.baseline}\n- **Action:** ${oddRule.investigator_action}`;
      } else {
        return `✅ **No Odd-Hours Anomalies:** Customer activity aligns with normal daylight/evening operating hours (${baseline.active_hours_summary || '07:00–22:00'}).`;
      }
    }

    // 5. Deviations summary
    if (q.includes('deviation') || q.includes('why') || q.includes('flag')) {
      if (findings.length === 0) {
        return `This account has **0 deviations**. All transactions fall within the customer's historical parameters.`;
      }
      const devList = findings.map(f => `- **${f.rule}**: ${f.deviation}`).join('\n');
      return `**Summary of Statistical Deviations:**\n${devList}`;
    }

    // Default grounded fallback
    return `Based on customer ${r.customer_name}'s history (${r.customer_id}): Overall determination is **${r.overall_status}** with ${findings.length} rule trigger(s). Feel free to ask about a specific transaction ID (e.g. \`TX102_28\`), baseline metrics, or recommended next steps.`;
  }

  // =========================================================================
  // 8. Stream Helpers (User & Copilot Bubbles)
  // =========================================================================
  function appendUserBubble(text) {
    const bubble = document.createElement('div');
    bubble.className = 'stream-bubble user-message';
    bubble.innerHTML = `
      <div class="bubble-body">
        <div class="bubble-text">${escapeHTML(text)}</div>
      </div>
    `;
    dynamicThread.appendChild(bubble);
  }

  function appendCopilotTextBubble(markdownText) {
    const bubble = document.createElement('div');
    bubble.className = 'stream-bubble copilot-response';
    bubble.innerHTML = `
      <div class="avatar-copilot">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/>
        </svg>
      </div>
      <div class="bubble-body">
        <div class="bubble-header">
          <span class="sender-name">Risk Investigation Copilot</span>
          <span class="timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="bubble-text">${parseMarkdown(markdownText)}</div>
      </div>
    `;
    dynamicThread.appendChild(bubble);
  }

  function scrollToBottom() {
    streamContainer.scrollTop = streamContainer.scrollHeight;
  }

  // =========================================================================
  // 9. Quick Scenario Buttons (Welcome Bubble)
  // =========================================================================
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.scenario-chip');
    if (chip) {
      const custId = chip.getAttribute('data-id');
      customerSelectEl.value = custId;
      customerSelectEl.dispatchEvent(new Event('change'));
      // Auto run audit for quick demo
      setTimeout(() => executeAudit(custId), 200);
    }
  });

  // Secondary Quick Chips in Sidebar
  chipCleanTest.addEventListener('click', () => {
    customerSelectEl.value = 'CUST_101';
    customerSelectEl.dispatchEvent(new Event('change'));
    setTimeout(() => executeAudit('CUST_101'), 200);
  });

  chipFlaggedOnly.addEventListener('click', () => {
    if (!activeInvestigationReport) return;
    const flaggedIds = activeInvestigationReport.findings.flatMap(f => f.transaction_ids);
    appendUserBubble('Show only flagged rows in ledger');
    appendCopilotTextBubble(`Filtering evidence: ${flaggedIds.length} transaction(s) flagged under rule heuristics: ${flaggedIds.map(id => `\`${id}\``).join(', ')}.`);
  });

  chipExplainDeviations.addEventListener('click', () => {
    handleFollowUpQuery('Explain why the flagged transaction deviates from baseline');
  });

  // =========================================================================
  // 10. Export Dossier JSON
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

  // Clear Stream
  clearStreamBtn.addEventListener('click', () => {
    dynamicThread.innerHTML = '';
  });

  // =========================================================================
  // 11. Modal Reference Controls
  // =========================================================================
  openRulesModalBtn.addEventListener('click', () => rulesModal.classList.remove('hidden'));
  closeRulesModalBtn.addEventListener('click', () => rulesModal.classList.add('hidden'));
  modalCloseAction.addEventListener('click', () => rulesModal.classList.add('hidden'));
  rulesModal.addEventListener('click', (e) => {
    if (e.target === rulesModal) rulesModal.classList.add('hidden');
  });

  // =========================================================================
  // 12. Safe Markdown Parser
  // =========================================================================
  function parseMarkdown(md) {
    if (!md) return '';
    let html = escapeHTML(md);

    // Section Titles
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
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Boot Copilot
  initCopilot();
});
