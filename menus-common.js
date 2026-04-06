(function () {
  function normalizePath(path) {
    if (!path) return '';
    return path.startsWith('/') ? path : '/' + path;
  }

  async function loadMenuItems() {
    var candidates = ['/admin/menu-items.json', 'admin/menu-items.json'];
    for (var i = 0; i < candidates.length; i += 1) {
      try {
        var res = await fetch(candidates[i], { cache: 'no-store' });
        if (!res.ok) continue;
        var data = await res.json();
        if (Array.isArray(data)) return data;
      } catch (err) {
        // continue fallback chain
      }
    }
    return [];
  }

  function buildLink(item) {
    if (item.page) return normalizePath(item.page);
    if (item.pdf) return normalizePath(item.pdf);
    return '#';
  }

  function isMobileMode() {
    return window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
  }

  function buildMobileAwareLink(item) {
    if (isMobileMode() && item.pdf) return normalizePath(item.pdf);
    return buildLink(item);
  }

  function isPdfOnly(item) {
    return !item.page && !!item.pdf;
  }

  function renderSidebar(items, currentKey) {
    var container = document.querySelector('.menu-links-vertical');
    if (!container) return;
    container.innerHTML = '';

    items.forEach(function (item) {
      var a = document.createElement('a');
      var href = buildMobileAwareLink(item);
      a.href = href;
      a.textContent = item.label || 'Menu';
      if (item.key === currentKey) a.classList.add('current');
      if (isPdfOnly(item) || (isMobileMode() && item.pdf)) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      container.appendChild(a);
    });
  }

  function renderDropdown(items) {
    var dropdown = document.querySelector('.menu-dropdown-list');
    if (!dropdown) return;
    dropdown.innerHTML = '';

    items.forEach(function (item) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = buildLink(item);
      a.textContent = item.label || 'Menu';
      if (isPdfOnly(item)) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      li.appendChild(a);
      dropdown.appendChild(li);
    });
  }

  function renderViewer(currentItem) {
    var frame = document.querySelector('.menu-viewer iframe');
    var mobileLink = document.querySelector('.menu-mobile-open a');
    if (!currentItem || !currentItem.pdf) return;

    var pdf = normalizePath(currentItem.pdf);
    if (frame) {
      frame.src = pdf;
      frame.title = (currentItem.label || 'Menu') + ' PDF';
    }
    if (mobileLink) {
      mobileLink.href = pdf;
      mobileLink.textContent = 'Open ' + (currentItem.label || 'Menu') + ' PDF';
    }
  }

  function pickCurrentItem(items, key) {
    var byKey = items.find(function (item) { return item.key === key; });
    if (byKey) return byKey;

    var path = window.location.pathname.toLowerCase();
    var byPath = items.find(function (item) {
      return item.page && normalizePath(item.page).toLowerCase() === path;
    });
    if (byPath) return byPath;

    return items[0] || null;
  }

  async function initMenus() {
    var hasMenuLayout = document.querySelector('.menu-main-section');
    if (!hasMenuLayout) return;

    var items = await loadMenuItems();
    items = items.filter(function (item) { return item && item.enabled !== false; });
    if (!items.length) return;

    var currentKey = (document.body && document.body.dataset.menuKey) || '';
    var currentItem = pickCurrentItem(items, currentKey);

    renderSidebar(items, currentItem ? currentItem.key : '');
    renderDropdown(items);
    renderViewer(currentItem);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenus);
  } else {
    initMenus();
  }
})();
