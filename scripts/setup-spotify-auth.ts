import * as readline from 'readline';
import * as fs from 'fs';

interface SpotifyTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

class SpotifyAuthSetup {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  private async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
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
      console.log('This will help you get a refresh token for automated Spotify data sync.');
      console.log('');

      // Get Spotify app credentials
      const clientId = await this.prompt('Enter your Spotify Client ID: ');
      const clientSecret = await this.prompt('Enter your Spotify Client Secret: ');
      const redirectUri = await this.prompt('Enter your Redirect URI (default: https://example.com/callback): ') || 'https://example.com/callback';

      console.log('');
      console.log('🔗 Generating authorization URL...');

      // Generate authorization URL
      const authUrl = this.generateAuthUrl(clientId, redirectUri);
      
      console.log('');
      console.log('Please visit this URL to authorize the app:');
      console.log('');
      console.log(authUrl);
      console.log('');
      console.log('After authorizing, you will be redirected to a URL that looks like:');
      console.log(`${redirectUri}?code=AQB...`);
      console.log('');
      console.log('Copy the "code" parameter from the URL and paste it below.');

      // Get authorization code
      const authCode = await this.prompt('Enter the authorization code: ');

      console.log('');
      console.log('🔄 Exchanging code for tokens...');

      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(authCode, clientId, clientSecret, redirectUri);

      console.log('');
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

      // Save to .env.local for testing
      const envContent = `SPOTIFY_CLIENT_ID=${clientId}
SPOTIFY_CLIENT_SECRET=${clientSecret}
SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}
SPOTIFY_REDIRECT_URI=${redirectUri}
`;

      fs.writeFileSync('.env.local', envContent);
      console.log('💾 Tokens saved to .env.local (project root)');
      console.log('');
      console.log('If you use the web app: copy SPOTIFY_REFRESH_TOKEN into web-app/.env or web-app/.env.local');

    } catch (error) {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }
}

// Run the setup if called directly
if (require.main === module) {
  const setup = new SpotifyAuthSetup();
  setup.setup();
}

export { SpotifyAuthSetup };
