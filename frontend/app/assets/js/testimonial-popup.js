/* Site-wide testimonial pop-up. Each testimonial shows for 3 seconds, then
   the next one appears after a short gap. Runs on every page. */

const SHOW_MS = 3000;
const GAP_MS = 12000;

function stars(n) {
  return '★★★★★☆☆☆☆☆'.slice(5 - Math.min(5, n), 10 - Math.min(5, n));
}

const API_BASE = (typeof window !== 'undefined' && window.MT5 && window.MT5.apiBase) || '/api';

async function start() {
  let items = [];
  try {
    const res = await fetch(`${API_BASE}/testimonials`);
    const json = await res.json();
    items = (json.data || []).filter((t) => t && t.text);
  } catch { return; }
  if (!items.length) return;

  const host = document.createElement('div');
  host.className = 'tst-pop';
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);

  let i = Math.floor(Math.random() * items.length);
  const cycle = () => {
    const t = items[i % items.length];
    i += 1;
    host.innerHTML = `
      <button class="tst-x" aria-label="Dismiss">&times;</button>
      <div class="tst-stars">${stars(t.rating || 5)}</div>
      <p class="tst-text">"${t.text}"</p>
      <div class="tst-who"><span class="tst-avatar">${(t.name || '?').charAt(0)}</span>
        <span><b>${t.name || 'Verified investor'}</b>${t.location ? ` · <span class="tst-loc">${t.location}</span>` : ''}${t.plan ? ` · <span class="tst-plan">${t.plan} plan</span>` : ''}</span>
      </div>`;
    host.querySelector('.tst-x').addEventListener('click', () => { host.classList.remove('show'); stop = true; });
    requestAnimationFrame(() => host.classList.add('show'));
    setTimeout(() => host.classList.remove('show'), SHOW_MS);
  };

  let stop = false;
  cycle();
  const timer = setInterval(() => { if (stop) return clearInterval(timer); cycle(); }, SHOW_MS + GAP_MS);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
