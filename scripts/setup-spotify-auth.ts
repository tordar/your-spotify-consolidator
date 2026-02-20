import * as fs from 'fs';
import * as http from 'http';
import { execSync } from 'child_process';

const CALLBACK_PORT = 3847;
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const BASE_URL = `http://127.0.0.1:${CALLBACK_PORT}`;

interface SpotifyTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface PendingCredentials {
  clientId: string;
  clientSecret: string;
}

function parseFormBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split('&')) {
    const [k, v] = part.split('=').map((s) => decodeURIComponent(s.replace(/\+/g, ' ')));
    if (k && v !== undefined) out[k] = v;
  }
  return out;
}

class SpotifyAuthSetup {
  constructor() {}

  private getFormPage(): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Spotify auth setup</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 420px; margin: 2rem auto; padding: 1.5rem;">
  <h1 style="color: #1DB954;">Spotify auth setup</h1>
  <p style="color: #666;">Enter your app credentials from the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">Spotify Dashboard</a>. Add redirect URI: <code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:0.85em;">${REDIRECT_URI}</code></p>
  <form method="post" action="/" style="display:flex;flex-direction:column;gap:1rem;">
    <label style="display:flex;flex-direction:column;gap:0.25rem;">
      <span style="font-weight:500;">Client ID</span>
      <input type="text" name="clientId" required placeholder="Your Client ID" style="padding:0.5rem;border:1px solid #ccc;border-radius:6px;font-size:1rem;" />
    </label>
    <label style="display:flex;flex-direction:column;gap:0.25rem;">
      <span style="font-weight:500;">Client Secret</span>
      <input type="password" name="clientSecret" required placeholder="Your Client Secret" style="padding:0.5rem;border:1px solid #ccc;border-radius:6px;font-size:1rem;" />
    </label>
    <button type="submit" style="padding:0.6rem 1rem;background:#1DB954;color:#fff;border:none;border-radius:6px;font-size:1rem;cursor:pointer;font-weight:500;">Authorize with Spotify</button>
  </form>
</body>
</html>`;
  }

  private getSuccessPage(clientId: string, refreshToken: string): string {
    const safeToken = this.escapeHtml(refreshToken);
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Spotify auth – done</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 2rem auto; padding: 1rem;">
  <h1 style="color: #1DB954;">✓ Setup complete</h1>
  <p>Tokens saved to <code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;">.env.local</code> in the project root.</p>
  <p><strong>Add these to GitHub Secrets</strong> (Settings → Secrets and variables → Actions):</p>
  <ul style="line-height:1.8;">
    <li><code>SPOTIFY_CLIENT_ID</code> – your Client ID</li>
    <li><code>SPOTIFY_CLIENT_SECRET</code> – your Client Secret</li>
    <li><code>SPOTIFY_REFRESH_TOKEN</code> – see below</li>
  </ul>
  <p style="margin-bottom:0.25rem;">Refresh token (copy if needed):</p>
  <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
    <pre id="token" style="flex: 1; background: #f0f0f0; padding: 1rem; border-radius: 6px; overflow-x: auto; word-break: break-all; margin: 0; font-size: 0.8rem;">${safeToken}</pre>
    <button type="button" onclick="var btn=this,el=document.getElementById('token'); navigator.clipboard.writeText(el.textContent).then(function(){ btn.textContent='Copied!'; setTimeout(function(){ btn.textContent='Copy'; }, 1500); });" style="flex-shrink: 0; padding: 0.5rem 0.75rem; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer; font-size: 0.875rem;">Copy</button>
  </div>
  <p style="color: #666; margin-top: 1.5rem;">You can close this tab. Return to the terminal for next steps.</p>
</body>
</html>`;
  }

  private generateAuthUrl(clientId: string, redirectUri: string): string {
    const scopes = [
      'user-read-recently-played',
      'user-read-playback-state',
      'user-read-private',
      'user-read-email'
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      show_dialog: 'true'
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private getCallbackPageError(error: string): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Spotify auth</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 2rem auto; padding: 1rem;">
  <h1 style="color: #c00;">Authorization failed</h1>
  <p>Error: ${error}</p>
  <p>Close this tab and run <code>npm run setup-spotify-auth</code> again to retry.</p>
</body>
</html>`;
  }

  private startWebServer(): Promise<{ clientId: string; clientSecret: string; tokens: SpotifyTokens }> {
    return new Promise((resolve, reject) => {
      let pending: PendingCredentials | null = null;

      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', BASE_URL);

        if (req.method === 'GET' && url.pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.getFormPage());
          return;
        }

        if (req.method === 'POST' && url.pathname === '/') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const form = parseFormBody(body);
            const clientId = (form.clientId ?? '').trim();
            const clientSecret = (form.clientSecret ?? '').trim();
            if (!clientId || !clientSecret) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(this.getCallbackPageError('Missing Client ID or Client Secret'));
              return;
            }
            pending = { clientId, clientSecret };
            const authUrl = this.generateAuthUrl(clientId, REDIRECT_URI);
            res.writeHead(302, { Location: authUrl });
            res.end();
          });
          return;
        }

        if (req.method === 'GET' && url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(this.getCallbackPageError(error));
            reject(new Error(`Spotify authorization failed: ${error}`));
            setTimeout(() => server.close(), 500);
            return;
          }
          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing code');
            reject(new Error('Redirect missing code parameter'));
            setTimeout(() => server.close(), 500);
            return;
          }
          if (!pending) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(this.getCallbackPageError('Session expired. Please start from the beginning.'));
            reject(new Error('No pending credentials'));
            setTimeout(() => server.close(), 500);
            return;
          }
          this.exchangeCodeForTokens(code, pending.clientId, pending.clientSecret, REDIRECT_URI)
            .then((tokens) => {
              const envContent = `SPOTIFY_CLIENT_ID=${pending!.clientId}
SPOTIFY_CLIENT_SECRET=${pending!.clientSecret}
SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}
SPOTIFY_REDIRECT_URI=${REDIRECT_URI}
`;
              fs.writeFileSync('.env.local', envContent);
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(this.getSuccessPage(pending!.clientId, tokens.refresh_token));
              resolve({ clientId: pending!.clientId, clientSecret: pending!.clientSecret, tokens });
              setTimeout(() => server.close(), 500);
            })
            .catch((err) => {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(this.getCallbackPageError(err.message || 'Token exchange failed'));
              reject(err);
              setTimeout(() => server.close(), 500);
            });
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        }
      });
      server.listen(CALLBACK_PORT, '127.0.0.1', () => {});
      server.on('error', (err) => reject(err));
    });
  }

  private openBrowser(url: string): void {
    try {
      const command =
        process.platform === 'win32'
          ? `start "" "${url}"`
          : process.platform === 'darwin'
            ? `open "${url}"`
            : `xdg-open "${url}"`;
      execSync(command);
    } catch {
      console.log('Please open this URL in your browser:\n');
      console.log(url);
    }
  }

  private async exchangeCodeForTokens(
    code: string, 
    clientId: string, 
    clientSecret: string, 
    redirectUri: string
  ): Promise<SpotifyTokens> {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<SpotifyTokens>;
  }

  async setup(): Promise<void> {
    try {
      console.log('🎵 Spotify Authentication Setup');
      console.log('================================');
      console.log('');
      console.log('Opening the setup page in your browser...');
      console.log('Enter your Client ID and Client Secret there, then authorize with Spotify.');
      console.log('');

      const donePromise = this.startWebServer();
      this.openBrowser(BASE_URL);

      const { clientId, clientSecret, tokens } = await donePromise;

      console.log('✅ Success! Here are your tokens:');
      console.log('');
      console.log('📋 Add these to your GitHub Secrets:');
      console.log('');
      console.log(`SPOTIFY_CLIENT_ID: ${clientId}`);
      console.log(`SPOTIFY_CLIENT_SECRET: ${clientSecret}`);
      console.log(`SPOTIFY_REFRESH_TOKEN: ${tokens.refresh_token}`);
      console.log('');
      console.log('🔒 Keep these tokens secure!');
      console.log('');
      console.log('Next steps:');
      console.log('1. Go to your GitHub repository');
      console.log('2. Settings → Secrets and variables → Actions');
      console.log('3. Add the three secrets above');
      console.log('4. Enable GitHub Actions');
      console.log('5. Your daily sync will start automatically!');
      console.log('');
      console.log('💾 Tokens saved to .env.local (project root)');
      console.log('');
      console.log('If you use the web app: copy SPOTIFY_* into web-app/.env or web-app/.env.local');
    } catch (error) {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    }
  }
}

// Run the setup if called directly
if (require.main === module) {
  const setup = new SpotifyAuthSetup();
  setup.setup();
}

export { SpotifyAuthSetup };
