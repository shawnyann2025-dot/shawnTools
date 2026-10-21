(() => {
  const $ = (sel) => document.querySelector(sel);
  const grid = $('#grid');
  const filters = $('#filters');
  const search = $('#search');
  const empty = $('#empty');

  const state = { tools: [], category: '全部', query: '' };

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'style') for (const [p, val] of Object.entries(v)) node.style.setProperty(p, val);
      else node.setAttribute(k, v);
    }
    node.append(...children);
    return node;
  };

  const isImagePath = (s) => /^(https?:|data:|\/|\.{0,2}\/?[\w\-./]+\.(svg|png|jpe?g|webp|gif|ico|avif)(\?.*)?$)/i.test(s);

  // icon 字段支持：图片路径/URL（svg 默认按主题色着色）、emoji/文字；留空则取名称首字
  function renderIcon(tool) {
    const box = el('div', { class: 'icon', 'aria-hidden': 'true' });
    const icon = (tool.icon || '').trim();

    if (icon && isImagePath(icon)) {
      const isSvg = /\.svg(\?.*)?$/i.test(icon) || icon.startsWith('data:image/svg');
      if (isSvg && tool.iconTint !== false) {
        box.append(el('span', { class: 'mask', style: { '--src': `url("${new URL(icon, location.href).href}")` } }));
      } else {
        const img = el('img', { src: icon, alt: '', loading: 'lazy', class: tool.iconFit === 'cover' ? 'full' : null });
        img.onerror = () => img.replaceWith(glyph(tool.name));
        box.append(img);
      }
    } else {
      box.append(glyph(icon || tool.name));
    }
    return box;
  }

  const glyph = (text) => el('span', { class: 'glyph', text: Array.from(text || '?')[0] });

  function renderCard(tool) {
    const external = /^https?:/i.test(tool.url) && !tool.url.startsWith(location.origin);
    const card = el('a', {
      class: 'card',
      href: tool.url,
      target: external || tool.newTab ? '_blank' : null,
      rel: external ? 'noopener' : null,
      style: tool.color ? { '--c': tool.color } : null,
    }, [
      renderIcon(tool),
      el('div', {}, [
        el('h2', { text: tool.name }),
        tool.description ? el('p', { text: tool.description, title: tool.description }) : '',
      ]),
    ]);
    if (tool.category) card.append(el('span', { class: 'badge', text: tool.category }));
    return card;
  }

  function matches(tool) {
    if (state.category !== '全部' && tool.category !== state.category) return false;
    if (!state.query) return true;
    const hay = [tool.name, tool.description, tool.category, ...(tool.tags || [])].join(' ').toLowerCase();
    return state.query.split(/\s+/).every((q) => hay.includes(q));
  }

  function render() {
    const list = state.tools.filter(matches);
    grid.replaceChildren(...list.map(renderCard));
    empty.hidden = list.length > 0;
  }

  function renderFilters() {
    const cats = [...new Set(state.tools.map((t) => t.category).filter(Boolean))];
    if (cats.length < 2) return filters.replaceChildren();
    filters.replaceChildren(...['全部', ...cats].map((c) => {
      const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(c === state.category), text: c });
      b.onclick = () => {
        state.category = c;
        filters.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        render();
      };
      return b;
    }));
  }

  function applySite(site = {}) {
    if (site.title) {
      document.title = site.title;
      $('#site-title').textContent = site.title;
    }
    $('#site-subtitle').textContent = site.subtitle || '';
    $('#site-footer').textContent = site.footer || '';
  }

  search.addEventListener('input', () => {
    state.query = search.value.trim().toLowerCase();
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== search) {
      e.preventDefault();
      search.focus();
    } else if (e.key === 'Escape' && document.activeElement === search) {
      search.value = '';
      search.dispatchEvent(new Event('input'));
      search.blur();
    }
  });

  fetch('tools.json', { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      applySite(data.site);
      state.tools = (data.tools || []).filter((t) => t && t.name && t.url && !t.hidden);
      renderFilters();
      render();
    })
    .catch((err) => {
      grid.replaceChildren(el('p', {
        class: 'error',
        text: `无法加载 tools.json（${err.message}）。请通过 HTTP 服务器访问，例如在项目目录运行：python3 -m http.server`,
      }));
      grid.style.display = 'block';
    });
})();
