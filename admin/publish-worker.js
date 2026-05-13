/**
 * Cloudflare Worker publish endpoint for Parkway Admin.
 *
 * Required Worker secrets:
 * - GH_TOKEN: GitHub token with repo contents write access
 * - ADMIN_USERNAME: admin username (same as admin/auth-config.js username)
 * - ADMIN_PASSWORD: admin password (plaintext, matched server-side)
 *
 * Optional env vars:
 * - ALLOW_ORIGIN: e.g. https://parkwaygrille.com (or * for testing)
 */

function json(data, status, corsOrigin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

async function ghFetch(url, token, options) {
  const res = await fetch(url, {
    method: (options && options.method) || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: options && options.body ? JSON.stringify(options.body) : undefined
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub API ${res.status}: ${txt.slice(0, 220)}`);
  }

  return res.json();
}

function normalizePath(p) {
  return String(p || '').replace(/^\/+/, '');
}

export default {
  async fetch(request, env) {
    const allowOrigin = env.ALLOW_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response('', {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowOrigin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, allowOrigin);
    }

    try {
      const body = await request.json();
      const user = body.user || '';
      const pass = body.pass || '';

      if (user !== env.ADMIN_USERNAME || pass !== env.ADMIN_PASSWORD) {
        return json({ ok: false, error: 'Unauthorized' }, 401, allowOrigin);
      }

      const owner = body.owner;
      const repo = body.repo;
      const branch = body.branch || 'master';
      const payload = body.payload || {};

      if (!owner || !repo || !payload.action) {
        return json({ ok: false, error: 'Missing owner/repo/action' }, 400, allowOrigin);
      }

      if (payload.action === 'ping') {
        return json({ ok: true, message: 'connected' }, 200, allowOrigin);
      }

      if (payload.action !== 'put_file') {
        return json({ ok: false, error: 'Unsupported action' }, 400, allowOrigin);
      }

      const path = normalizePath(payload.path);
      const content_b64 = payload.content_b64 || '';
      const message = payload.message || `Update ${path}`;

      if (!path || !content_b64) {
        return json({ ok: false, error: 'Missing path/content_b64' }, 400, allowOrigin);
      }

      const base = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
      const refUrl = `${base}?ref=${encodeURIComponent(branch)}`;

      let current = null;
      try {
        current = await ghFetch(refUrl, env.GH_TOKEN);
      } catch (err) {
        current = null;
      }

      const putBody = {
        message,
        content: content_b64,
        branch
      };

      if (current && current.sha) {
        putBody.sha = current.sha;
      }

      const result = await ghFetch(base, env.GH_TOKEN, {
        method: 'PUT',
        body: putBody
      });

      return json({ ok: true, commit: result.commit ? result.commit.sha : null }, 200, allowOrigin);
    } catch (err) {
      return json({ ok: false, error: err.message || 'Server error' }, 500, allowOrigin);
    }
  }
};