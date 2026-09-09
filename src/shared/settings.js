const toggle = document.getElementById('lockAllToggle');
const section = document.getElementById('passwordSection');
const input = document.getElementById('passwordInput');
const status = document.getElementById('passwordStatus');
const lockStatus = document.getElementById('lockStatus');

// Load settings
chrome.storage?.local.get(['lockAllSites', 'siteLockPassword'], (data) => {
  toggle.checked = data.lockAllSites || false;
  updateLockStatus(toggle.checked);
});

toggle.addEventListener('change', () => {
  const isLocked = toggle.checked;
  chrome.storage?.local.get(['pin'], (data) => {
    if (isLocked && !data.pin) {
      alert('⚠️ Pehle Master PIN set karein (Popup Settings mein)!');
      toggle.checked = false;
      return;
    }
    chrome.storage?.local.set({ lockAllSites: isLocked });
    updateLockStatus(isLocked);
  });
});

function updateLockStatus(locked) {
  if (locked) {
    lockStatus.textContent = '🔒 All Sites Locked';
    lockStatus.className = 'status active';
  } else {
    lockStatus.textContent = '🔓 Sites Unlocked';
    lockStatus.className = 'status inactive';
  }
}
