const enabledToggle = document.getElementById('enabled');
const modeButtons = document.querySelectorAll('.mode-btn');

chrome.storage.local.get({ enabled: true, mode: 'wide' }, ({ enabled, mode }) => {
  enabledToggle.checked = enabled;
  applyActiveMode(mode);
});

enabledToggle.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabledToggle.checked });
});

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const { mode } = btn.dataset;
    chrome.storage.local.set({ mode });
    applyActiveMode(mode);
  });
});

function applyActiveMode(mode) {
  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}
