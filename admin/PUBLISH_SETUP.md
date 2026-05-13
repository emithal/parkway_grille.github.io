# Tokenless Admin Publish Setup

This admin is now configured so the client does **not** enter a GitHub token.

## 1. Deploy publish endpoint (Cloudflare Worker)

Use `admin/publish-worker.js` as the worker source.

Set worker secrets:
- `GH_TOKEN` = GitHub token with access to `emithal/parkway_grille.github.io`
- `ADMIN_USERNAME` = same username as `admin/auth-config.js`
- `ADMIN_PASSWORD` = plaintext password for admin login
- `ALLOW_ORIGIN` = `https://parkwaygrille.com` (or your domain)

## 2. Point admin to your worker URL

Edit `admin/publish-config.js`:
- Set `endpoint` to your deployed worker URL
- Keep `owner`, `repo`, `branch` values correct

## 3. Deploy site

Push this repo to GitHub Pages branch (`master` in your case).

## 4. Client workflow

Client does:
1. Open `/admin/`
2. Login with username/password
3. Swap files or edit menu rows
4. Click `Save Menu List`

No GitHub token required on their end.

## Notes

- This is secure only when worker endpoint is HTTPS and CORS is restricted with `ALLOW_ORIGIN`.
- Do not store GitHub tokens in frontend files.