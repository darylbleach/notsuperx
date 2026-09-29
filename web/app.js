import { $, h, api, toast, state } from './lib.js';
import { pages, nav } from './pages.js';

const app = $('#app');

async function boot() {
  state.status = await api('/status').catch(() => ({}));
  try { state.accounts = await api('/accounts'); } catch { return login(); }
  if (!state.accounts.find((a) => a.id === state.account)) state.account = state.accounts[0]?.id ?? null;
  render();
}

function login() {
  app.replaceChildren(h('div', { class: 'login card' },
    h('h2', {}, 'NotSuperX'),
    h('label', {}, 'Password'), h('input', { type: 'password', id: 'pw', onkeydown: (e) => e.key === 'Enter' && go() }),
    h('div', { style: 'height:12px' }), h('button', { onclick: go }, 'Sign in')));
  async function go() {
    try { await api('/login', { body: { password: $('#pw').value } }); location.hash = '#/'; boot(); }
    catch (e) { toast(e.message, true); }
  }
}

async function render() {
  const route = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  if (route === 'login') return login();
  const page = pages[route] || pages.dashboard;
  const sel = h('select', { onchange: (e) => { state.account = +e.target.value; localStorage.setItem('acct', state.account); render(); } },
    state.accounts.map((a) => h('option', { value: a.id, selected: a.id === state.account }, '@' + a.username)),
    !state.accounts.length && h('option', {}, 'No account — connect in Settings'));
  const main = h('main', {}, h('div', { class: 'mute' }, 'Loading…'));
  app.replaceChildren(h('div', { class: 'shell' },
    h('nav', {}, h('h1', {}, h('b', {}, 'NotSuperX')), sel,
      nav.map(([k, label]) => h('a', { href: '#/' + k, class: k === route ? 'on' : '' }, label))), main));
  try { main.replaceChildren(await page()); } catch (e) { main.replaceChildren(h('div', { class: 'card' }, h('h3', {}, 'Error'), e.message)); }
}

addEventListener('hashchange', render);
boot();
