/**
 * Country code to country name mapping (ISO 3166-1 alpha-2)
 * Handles common country codes found in Spotify streaming history
 */
export const countryCodeToName: Record<string, string> = {
  'NO': 'Norway',
  'NL': 'Netherlands',
  'GB': 'United Kingdom',
  'US': 'United States',
  'SE': 'Sweden',
  'DK': 'Denmark',
  'FI': 'Finland',
  'DE': 'Germany',
  'FR': 'France',
  'ES': 'Spain',
  'IT': 'Italy',
  'PT': 'Portugal',
  'GR': 'Greece',
  'IE': 'Ireland',
  'BE': 'Belgium',
  'CH': 'Switzerland',
  'AT': 'Austria',
  'PL': 'Poland',
  'CZ': 'Czech Republic',
  'HU': 'Hungary',
  'RO': 'Romania',
  'BG': 'Bulgaria',
  'HR': 'Croatia',
  'SI': 'Slovenia',
  'SK': 'Slovakia',
  'LT': 'Lithuania',
  'LV': 'Latvia',
  'EE': 'Estonia',
  'IS': 'Iceland',
  'LU': 'Luxembourg',
  'MT': 'Malta',
  'CY': 'Cyprus',
  'MG': 'Madagascar',
  'CA': 'Canada',
  'MX': 'Mexico',
  'BR': 'Brazil',
  'AR': 'Argentina',
  'CL': 'Chile',
  'CO': 'Colombia',
  'PE': 'Peru',
  'VE': 'Venezuela',
  'AU': 'Australia',
  'NZ': 'New Zealand',
  'JP': 'Japan',
  'KR': 'South Korea',
  'CN': 'China',
  'IN': 'India',
  'SG': 'Singapore',
  'MY': 'Malaysia',
  'TH': 'Thailand',
  'PH': 'Philippines',
  'ID': 'Indonesia',
  'VN': 'Vietnam',
  'TW': 'Taiwan',
  'HK': 'Hong Kong',
  'ZA': 'South Africa',
  'EG': 'Egypt',
  'MA': 'Morocco',
  'AE': 'United Arab Emirates',
  'SA': 'Saudi Arabia',
  'LB': 'Lebanon',
  'MU': 'Mauritius',
  'TJ': 'Tajikistan',
  'IL': 'Israel',
  'TR': 'Turkey',
  'RU': 'Russia',
  'UA': 'Ukraine',
  'BY': 'Belarus',
  'KZ': 'Kazakhstan',
  'RS': 'Serbia',
  'KG': 'Kyrgyzstan',
  'ET': 'Ethiopia',
  'SS': 'South Sudan',
  'ZZ': 'Unknown' // Invalid/unknown country code
}

/**
 * Get country name from country code
 * @param code - ISO 3166-1 alpha-2 country code
 * @returns Country name or the code itself if not found
 */
export function getCountryName(code: string): string {
  return countryCodeToName[code] || code
}

/**
 * Check if a country code is valid
 * @param code - ISO 3166-1 alpha-2 country code
 * @returns true if the code is valid (not ZZ or unknown)
 */
export function isValidCountryCode(code: string): boolean {
  return code !== 'ZZ' && countryCodeToName[code] !== undefined
}

