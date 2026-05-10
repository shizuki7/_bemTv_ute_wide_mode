const enabledToggle = document.getElementById('enabled');
const modeButtons = document.querySelectorAll('.mode-btn');
const pseudoFullscreenToggle = document.getElementById('pseudo-fullscreen-enabled');

chrome.storage.local.get(
  { enabled: true, mode: 'wide', pseudoFullscreenEnabled: false },
  ({ enabled, mode, pseudoFullscreenEnabled }) => {
    enabledToggle.checked = enabled;
    pseudoFullscreenToggle.checked = pseudoFullscreenEnabled;
    applyActiveMode(mode);
  },
);

enabledToggle.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabledToggle.checked });
});

pseudoFullscreenToggle.addEventListener('change', () => {
  chrome.storage.local.set({
    pseudoFullscreenEnabled: pseudoFullscreenToggle.checked,
  });
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
