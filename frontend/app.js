// Frontend client script for Transaction Risk Investigation Assistant (PS06)

document.addEventListener('DOMContentLoaded', () => {
  const backendStatusEl = document.getElementById('backend-status');
  const apiStatusEl = document.getElementById('api-status');
  const geminiModelEl = document.getElementById('gemini-model');
  const trackIdEl = document.getElementById('track-id');
  const srvHostEl = document.getElementById('srv-host');

  async function checkBackendHealth() {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const data = await response.json();

      // Update Header Status
      backendStatusEl.className = 'status-indicator online';
      backendStatusEl.innerHTML = `
        <span class="dot"></span>
        <span class="label">Backend Connected (Port 8000)</span>
      `;

      // Update Metric Values
      apiStatusEl.textContent = '200 OK (Active)';
      apiStatusEl.className = 'metric-value status-pill success';

      if (data.track_id) {
        trackIdEl.textContent = data.track_id;
      }
      if (data.gemini_model) {
        geminiModelEl.textContent = data.gemini_model;
      }
      if (data.host) {
        srvHostEl.textContent = data.host;
      }

      console.log('Backend health check passed:', data);
    } catch (error) {
      console.error('Backend health check failed:', error);
      backendStatusEl.className = 'status-indicator offline';
      backendStatusEl.innerHTML = `
        <span class="dot"></span>
        <span class="label">Backend Disconnected</span>
      `;
      apiStatusEl.textContent = 'Connection Failed';
      apiStatusEl.className = 'metric-value status-pill danger';
    }
  }

  // Initial check
  checkBackendHealth();
});
