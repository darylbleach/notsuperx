const ids = ['server', 'key', 'account'];
chrome.storage.sync.get(ids, (v) => ids.forEach((i) => { if (v[i]) document.getElementById(i).value = v[i]; }));
document.getElementById('save').onclick = () => {
  const v = Object.fromEntries(ids.map((i) => [i, document.getElementById(i).value.trim()]));
  chrome.storage.sync.set(v, () => (document.getElementById('ok').textContent = 'Saved ✓'));
};
