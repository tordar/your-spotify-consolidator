# GitHub Actions Spotify Sync Setup Guide

This guide will help you set up automated daily Spotify data syncing using GitHub Actions.

## 🎯 **What This Does**

- **Daily sync**: Automatically fetches your recent Spotify plays every day at 2 AM UTC
- **Data merging**: Combines recent plays with your existing consolidated data
- **Auto-deployment**: Updates your Vercel deployment with fresh data
- **Zero maintenance**: Set it up once, then it runs automatically

## 📋 **Prerequisites**

- GitHub account
- Spotify account
- Existing consolidated data (run `npm run consolidate-all` first)

## 🚀 **Setup Steps**

### **Step 1: Create Spotify App**

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **"Create App"**
3. Fill in the details:
   - **App name**: `My Spotify Data Sync`
   - **App description**: `Personal Spotify data sync`
   - **Redirect URI**: `http://localhost:3000/callback`
4. Click **"Save"**
5. Copy your **Client ID** and **Client Secret**

### **Step 2: Get Refresh Token**

1. Run the setup script:
   ```bash
   npm run setup-spotify-auth
   ```
2. Follow the prompts to enter your Client ID and Client Secret
3. Authorize the app in your browser
4. Copy the **Refresh Token** from the output

### **Step 3: Add GitHub Secrets**

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"** and add these secrets:

   | Secret Name | Value | Description |
   |-------------|-------|-------------|
   | `SPOTIFY_CLIENT_ID` | Your Client ID | From Spotify app |
   | `SPOTIFY_CLIENT_SECRET` | Your Client Secret | From Spotify app |
   | `SPOTIFY_REFRESH_TOKEN` | Your Refresh Token | From setup script |
   | `VERCEL_DEPLOY_HOOK` | (Optional) | Vercel deploy hook URL |

### **Step 4: Enable GitHub Actions**

1. Go to the **Actions** tab in your repository
2. Click **"Enable Actions"** if prompted
3. The workflow will start running automatically

## 🔄 **How It Works**

### **Daily Schedule**:
```
2:00 AM UTC → GitHub Actions triggers
2:01 AM → Fetch recent Spotify plays (last 50)
2:02 AM → Merge with existing consolidated data
2:03 AM → Run consolidation scripts
2:04 AM → Commit changes to Git
2:05 AM → Trigger Vercel deployment
2:06 AM → You wake up to fresh data! 🎉
```

### **Data Flow**:
```
Recent Plays (API) → Merge → Consolidated Data → Deploy
```

## 📊 **Monitoring**

### **Check Status**:
- **Actions tab**: See sync history and logs
- **Email notifications**: Get notified of success/failure
- **Manual trigger**: Click "Run workflow" anytime

### **Troubleshooting**:
- **Token expired**: Re-run setup script, update refresh token
- **API errors**: Check Spotify app settings
- **Sync failed**: Check Actions logs for details

## 🛠 **Manual Commands**

### **Test the setup**:
```bash
# Test token refresh
npm run fetch-recent-plays

# Test data merging
npm run merge-recent-data

# Test full consolidation
npm run consolidate-all
```

### **Manual sync**:
```bash
# Run all steps manually
npm run fetch-recent-plays
npm run merge-recent-data
npm run consolidate-all
```

## 🔒 **Security Notes**

- **Tokens are encrypted** in GitHub Secrets
- **No data leaves your control** - everything runs in your repo
- **Revocable access** - you can revoke Spotify app access anytime
- **Private repos** - your data stays private

## ❓ **FAQ**

### **Q: How often does it sync?**
A: Daily at 2 AM UTC. You can change this in `.github/workflows/sync-spotify.yml`

### **Q: What if I miss a day?**
A: No problem! The next sync will catch up with all recent plays.

### **Q: Can I sync more than 50 plays?**
A: Spotify API only provides the last 50 plays. For more historical data, use the full export.

### **Q: What if my refresh token expires?**
A: You'll get an email notification. Just re-run the setup script and update the secret.

### **Q: Can I disable the sync?**
A: Yes! Go to Actions tab → Workflows → Disable workflow.

## 🎉 **Success!**

Once set up, you'll have:
- ✅ **Daily automatic updates** of your Spotify data
- ✅ **Always fresh visualizations** on your Vercel site
- ✅ **Zero maintenance** required
- ✅ **Complete privacy** - your data stays yours

Your Spotify data will now stay current automatically! 🎵
