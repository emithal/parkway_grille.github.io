(function () {
  var state = {
    images: [],
    menus: []
  };

  var session = {
    authed: false,
    username: '',
    password: ''
  };

  function $(id) { return document.getElementById(id); }

  function publishCfg() {
    return window.ADMIN_PUBLISH || {};
  }

  function setStatus(id, msg, isError) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? '#ff8f8f' : '#aeb6cb';
  }

  async function sha256Hex(text) {
    var bytes = new TextEncoder().encode(text);
    var digest = await crypto.subtle.digest('SHA-256', bytes);
    var arr = Array.from(new Uint8Array(digest));
    return arr.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function showApp() {
    $('login-wrap').style.display = 'none';
    $('app-wrap').style.display = '';

    var cfg = publishCfg();
    var target = $('conn-target');
    if (target) {
      var owner = cfg.owner || 'owner';
      var repo = cfg.repo || 'repo';
      var branch = cfg.branch || 'master';
      target.textContent = owner + '/' + repo + ' (' + branch + ')';
    }
  }

  async function publishRequest(payload) {
    var cfg = publishCfg();
    if (!cfg.endpoint) {
      throw new Error('Missing publish endpoint in /admin/publish-config.js');
    }
    if (!session.authed) {
      throw new Error('Please login first.');
    }

    var body = {
      user: session.username,
      pass: session.password,
      owner: cfg.owner,
      repo: cfg.repo,
      branch: cfg.branch,
      payload: payload
    };

    var res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    var text = await res.text();
    var data = {};
    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || ('Publish error ' + res.status));
    }

    return data;
  }

  function toBase64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  async function putRepoFile(path, bytes, message) {
    return publishRequest({
      action: 'put_file',
      path: path,
      content_b64: toBase64(bytes),
      message: message
    });
  }

  async function testConnection() {
    setStatus('status-conn', 'Checking connection...');
    try {
      await publishRequest({ action: 'ping' });
      var cfg = publishCfg();
      setStatus('status-conn', 'Connected. Publishing to ' + cfg.owner + '/' + cfg.repo + ' on ' + cfg.branch + '.');
    } catch (err) {
      setStatus('status-conn', err.message, true);
    }
  }

  async function loadJson(path) {
    var res = await fetch(path + '?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load ' + path);
    return res.json();
  }

  async function urlReachable(path) {
    if (!path) return false;
    var url = path + (path.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now();
    try {
      var res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) return true;
    } catch (err) {
      // fallback below
    }
    try {
      var res2 = await fetch(url, { method: 'GET', cache: 'no-store' });
      return !!res2.ok;
    } catch (err2) {
      return false;
    }
  }

  function renderImages() {
    var host = $('images');
    host.innerHTML = '';

    state.images.forEach(function (img) {
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        '<img src="' + img.path + '?v=' + Date.now() + '" alt="' + (img.label || '') + '">' +
        '<div class="meta"><strong>' + img.label + '</strong><br>' +
        'Page: ' + img.page + '<br>Path: ' + img.path + '<br>' +
        'Size: ' + img.width + 'x' + img.height + '</div>';

      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';

      var btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Swap Image';
      btn.addEventListener('click', function () { fileInput.click(); });

      fileInput.addEventListener('change', async function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        setStatus('status-images', 'Uploading ' + img.path + ' ...');
        try {
          var bytes = new Uint8Array(await f.arrayBuffer());
          var repoPath = img.path.replace(/^\//, '');
          await putRepoFile(repoPath, bytes, 'Swap image: ' + repoPath);
          setStatus('status-images', 'Updated ' + img.path + ' successfully.');
          renderImages();
        } catch (err) {
          setStatus('status-images', err.message, true);
        }
      });

      card.appendChild(btn);
      card.appendChild(fileInput);
      host.appendChild(card);
    });
  }

  function menuRow(item, idx) {
    var tr = document.createElement('tr');
    var liveBadge = item.isLive ? '<span style="color:#6ed28f;">Live</span>' : '<span style="color:#ff8f8f;">Not Live</span>';
    tr.innerHTML =
      '<td><input type="text" data-k="label" value="' + (item.label || '') + '"></td>' +
      '<td><input type="text" data-k="page" value="' + (item.page || '') + '" placeholder="/dinner/"></td>' +
      '<td><input type="text" data-k="pdf" value="' + (item.pdf || '') + '" placeholder="/files/Dinner Menu.pdf"></td>' +
      '<td>' + liveBadge + '</td>' +
      '<td><input type="checkbox" data-k="enabled" ' + (item.enabled !== false ? 'checked' : '') + '></td>' +
      '<td class="row"></td>';

    var actions = tr.querySelector('td:last-child');

    var swapBtn = document.createElement('button');
    swapBtn.className = 'btn';
    swapBtn.textContent = 'Swap PDF';
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,application/pdf';
    fileInput.style.display = 'none';

    swapBtn.onclick = function () { fileInput.click(); };
    fileInput.onchange = async function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      try {
        var pdfPath = (tr.querySelector('input[data-k="pdf"]').value || '').trim();
        if (!pdfPath) {
          var slug = (tr.querySelector('input[data-k="label"]').value || 'menu').toLowerCase().replace(/[^a-z0-9]+/g, '-');
          pdfPath = '/files/' + slug + '.pdf';
          tr.querySelector('input[data-k="pdf"]').value = pdfPath;
        }
        setStatus('status-menus', 'Uploading ' + pdfPath + ' ...');
        var bytes = new Uint8Array(await f.arrayBuffer());
        await putRepoFile(pdfPath.replace(/^\//, ''), bytes, 'Swap menu PDF: ' + pdfPath);
        setStatus('status-menus', 'Updated ' + pdfPath + ' successfully. Save menu list to finalize labels/order.');
      } catch (err) {
        setStatus('status-menus', err.message, true);
      }
    };

    var removeBtn = document.createElement('button');
    removeBtn.className = 'btn danger';
    removeBtn.textContent = 'X';
    removeBtn.onclick = function () {
      state.menus.splice(idx, 1);
      renderMenus();
    };

    actions.appendChild(swapBtn);
    actions.appendChild(removeBtn);
    actions.appendChild(fileInput);
    return tr;
  }

  function renderMenus() {
    var tbody = $('menus-table').querySelector('tbody');
    tbody.innerHTML = '';
    state.menus.forEach(function (item, idx) {
      tbody.appendChild(menuRow(item, idx));
    });
  }

  function collectMenusFromTable() {
    var rows = Array.prototype.slice.call($('menus-table').querySelectorAll('tbody tr'));
    return rows.map(function (tr, i) {
      var old = state.menus[i] || {};
      var label = tr.querySelector('input[data-k="label"]').value.trim();
      var page = tr.querySelector('input[data-k="page"]').value.trim();
      var pdf = tr.querySelector('input[data-k="pdf"]').value.trim();
      var enabled = tr.querySelector('input[data-k="enabled"]').checked;
      var key = old.key || label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return { key: key, label: label, page: page, pdf: pdf, enabled: enabled };
    });
  }

  async function syncMenuLiveState() {
    var checks = state.menus.map(async function (item) {
      var pageLive = await urlReachable(item.page || '');
      var pdfLive = await urlReachable(item.pdf || '');
      var isLive = pageLive || pdfLive;
      item.isLive = isLive;
      if (!isLive) item.enabled = false;
      return item;
    });
    await Promise.all(checks);

    var hiddenCount = state.menus.filter(function (m) { return !m.isLive; }).length;
    if (hiddenCount > 0) {
      setStatus('status-menus', hiddenCount + ' menu item(s) are not live and were auto-unchecked. Click "Save Menu List" to persist.');
    }
  }

  async function saveMenus() {
    try {
      state.menus = collectMenusFromTable();
      var text = JSON.stringify(state.menus, null, 2) + '\n';
      var bytes = new TextEncoder().encode(text);
      await putRepoFile('admin/menu-items.json', bytes, 'Update menu items via admin panel');
      setStatus('status-menus', 'Menu list saved. Site menu links and dropdown will update automatically.');
    } catch (err) {
      setStatus('status-menus', err.message, true);
    }
  }

  async function loadPanelData() {
    try {
      state.images = await loadJson('/admin/image-items.json');
      state.menus = await loadJson('/admin/menu-items.json');
      await syncMenuLiveState();
      renderImages();
      renderMenus();
    } catch (err) {
      setStatus('status-conn', err.message, true);
    }

    $('btn-connect').addEventListener('click', testConnection);
    $('btn-add-menu').addEventListener('click', function () {
      state.menus.push({ key: '', label: 'New Menu', page: '', pdf: '', enabled: true, isLive: false });
      renderMenus();
    });
    $('btn-save-menus').addEventListener('click', saveMenus);
  }

  async function init() {
    var btnLogin = $('btn-login');
    if (!btnLogin) {
      await loadPanelData();
      return;
    }

    btnLogin.addEventListener('click', async function () {
      try {
        var cfg = window.ADMIN_AUTH || {};
        var u = ($('login-user').value || '').trim();
        var p = $('login-pass').value || '';

        if (!cfg.username || !cfg.password_sha256) {
          throw new Error('Missing admin auth config.');
        }

        var hash = await sha256Hex(p);
        if (u !== cfg.username || hash !== cfg.password_sha256) {
          setStatus('status-login', 'Invalid username or password.', true);
          return;
        }

        session.authed = true;
        session.username = u;
        session.password = p;

        showApp();
        setStatus('status-login', '');
        await loadPanelData();
      } catch (err) {
        setStatus('status-login', err.message, true);
      }
    });
  }

  init();
})();