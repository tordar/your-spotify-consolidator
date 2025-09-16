# Your Spotify Consolidator

A TypeScript tool to fetch and consolidate Spotify top albums data from an external API. This tool helps you collect your listening data and clean up duplicates to get a consolidated view of your most played albums.

## Features

- 🔄 **Data Fetching**: Fetches top albums data from Spotify API with configurable batch sizes
- 🧹 **Data Cleaning**: Consolidates duplicate albums and removes redundant entries
- 📊 **Analytics**: Provides detailed statistics about your listening habits
- ⚙️ **Configurable**: Environment-based configuration for API settings
- 🚀 **Easy to Use**: Simple npm scripts for execution

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Valid Spotify API token

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd your-spotify-consolidator
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Edit the `.env` file with your configuration:
```env
SPOTIFY_API_URL=https://spotify-api.tordar.no/spotify/top/albums
SPOTIFY_COOKIE_TOKEN=your_jwt_token_here
START_DATE=2010-05-02T05:22:01.000Z
END_DATE=2025-09-16T12:33:53.259Z
BATCH_SIZE=20
TOTAL_CALLS=50
```

## Usage

### Fetch Data
To fetch your top albums data from the API:
```bash
npm run fetch
```

This will:
- Make multiple API calls with increasing offsets
- Save the raw data to a timestamped JSON file
- Display progress and summary statistics

### Clean and Consolidate Data
To clean and consolidate the fetched data:
```bash
npm run clean
```

This will:
- Find the latest JSON file in the directory
- Consolidate duplicate albums (same artist + album name)
- Remove redundant entries
- Save cleaned data to a new timestamped file
- Display consolidation statistics

### Development
For development with auto-reload:
```bash
npm run dev
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SPOTIFY_API_URL` | Base URL for the Spotify API | `https://spotify-api.tordar.no/spotify/top/albums` |
| `SPOTIFY_COOKIE_TOKEN` | JWT token for API authentication | Required |
| `START_DATE` | Start date for data collection | `2010-05-02T05:22:01.000Z` |
| `END_DATE` | End date for data collection | `2025-09-16T12:33:53.259Z` |
| `BATCH_SIZE` | Number of albums per API call | `20` |
| `TOTAL_CALLS` | Total number of API calls to make | `50` |

### Data Structure

The tool works with the following data structure:

```typescript
interface Album {
  duration_ms: number;
  count: number;
  albumId: string;
  album: {
    name: string;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
  };
  artist: {
    name: string;
    genres: string[];
  };
}
```

## Output Files

- `top-albums-{timestamp}.json`: Raw data from API calls
- `cleaned-top-albums-{timestamp}.json`: Consolidated and cleaned data

## Scripts

- `npm run fetch`: Fetch data from Spotify API
- `npm run clean`: Clean and consolidate existing data
- `npm run build`: Compile TypeScript to JavaScript
- `npm run dev`: Run in development mode with auto-reload
- `npm start`: Run compiled JavaScript

## Error Handling

The tool includes comprehensive error handling:
- API request failures are logged and tracked
- Invalid JSON responses are caught and reported
- Missing environment variables are validated
- File system errors are handled gracefully

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Security Note

⚠️ **Important**: Never commit your `.env` file or API tokens to version control. The `.env` file is already included in `.gitignore` for your protection.

## Troubleshooting

### Common Issues

1. **"SPOTIFY_COOKIE_TOKEN environment variable is required"**
   - Make sure you've created a `.env` file with your token
   - Verify the token is valid and not expired

2. **"No top-albums JSON files found"**
   - Run `npm run fetch` first to generate data files
   - Check that the fetch process completed successfully

3. **API rate limiting**
   - The tool includes a 1-second delay between requests
   - Adjust `TOTAL_CALLS` or `BATCH_SIZE` if needed

4. **TypeScript compilation errors**
   - Run `npm install` to ensure all dependencies are installed
   - Check that your Node.js version is 18.0.0 or higher
