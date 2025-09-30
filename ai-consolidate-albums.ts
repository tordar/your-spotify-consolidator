#!/usr/bin/env tsx

/**
 * AI-powered album consolidation agent
 * Uses local LLM (Ollama) to intelligently consolidate duplicate albums
 */

import fs from 'fs';
import axios from 'axios';
import { Command } from 'commander';
import * as cliProgress from 'cli-progress';

interface CleanedAlbum {
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

interface ConsolidationRule {
  artistName: string;
  baseAlbumName: string;
  variations: string[];
}

interface ConsolidationRules {
  rules: ConsolidationRule[];
  timestamp: string;
}

interface ConsolidationDecision {
  shouldConsolidate: boolean;
  confidence: number; // 0-1 scale
  canonicalName: string;
  reasoning: string;
}

interface AIConsolidationResult {
  decisions: Array<{
    albums: CleanedAlbum[];
    decision: ConsolidationDecision;
  }>;
  newRules: ConsolidationRule[];
}

class AlbumConsolidationAgent {
  private ollamaUrl: string;
  private model: string;
  private existingRules: ConsolidationRules;

  constructor(ollamaUrl: string = 'http://localhost:11434', model: string = 'llama3.1') {
    this.ollamaUrl = ollamaUrl;
    this.model = model;
    this.existingRules = this.loadExistingRules();
  }

  private loadExistingRules(): ConsolidationRules {
    const rulesFile = 'album-consolidation-rules.json';
    
    if (fs.existsSync(rulesFile)) {
      try {
        const data = fs.readFileSync(rulesFile, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        console.log('⚠️  Could not load existing consolidation rules, starting fresh');
      }
    }
    
    return {
      rules: [],
      timestamp: new Date().toISOString()
    };
  }

  private async checkOllamaConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  private async queryLLM(prompt: string): Promise<string> {
    try {
      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for consistent results
          top_p: 0.9
        }
      });

      return response.data.response;
    } catch (error) {
      throw new Error(`Failed to query LLM: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createSystemPrompt(): string {
    // Use only 3 examples to reduce prompt size
    const examples = this.existingRules.rules.slice(0, 3).map(rule => 
      `"${rule.artistName}" - "${rule.baseAlbumName}" (${rule.variations.length} variations)`
    ).join(', ');

    return `You are a music data analyst. Determine if album entries should be consolidated.

RULES:
- Identical names (case-insensitive) = ALWAYS consolidate (confidence: 0.95+)
- Minor variations (remastered, deluxe, explicit, anniversary) = consolidate (confidence: 0.8+)
- Different languages/artists = NEVER consolidate (confidence: 0.1-)
- Significantly different names = keep separate (confidence: 0.2-)

EXAMPLES: ${examples}

RESPONSE FORMAT (JSON only):
{
  "shouldConsolidate": boolean,
  "confidence": number (0-1),
  "canonicalName": "string",
  "reasoning": "string"
}

Be conservative. When uncertain, set low confidence.`;
  }

  private async analyzeAlbumGroup(albums: CleanedAlbum[]): Promise<ConsolidationDecision> {
    const albumInfo = albums.map(album => 
      `"${album.album.name}" (${album.count} plays)`
    ).join(', ');

    const prompt = `${this.createSystemPrompt()}

ANALYZE THESE ALBUMS:
Artist: "${albums[0].artist.name}"
Albums: ${albumInfo}

Should these albums be consolidated? Provide your analysis in the required JSON format.`;

    try {
      const response = await this.queryLLM(prompt);
      
      // Extract JSON from response (handle cases where LLM adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const decision = JSON.parse(jsonMatch[0]);
      
      // Validate response format
      if (typeof decision.shouldConsolidate !== 'boolean' ||
          typeof decision.confidence !== 'number' ||
          typeof decision.canonicalName !== 'string' ||
          typeof decision.reasoning !== 'string') {
        throw new Error('Invalid response format from LLM');
      }

      return decision;
    } catch (error) {
      console.error(`Error analyzing album group: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Fallback decision
      return {
        shouldConsolidate: false,
        confidence: 0.0,
        canonicalName: albums[0].album.name,
        reasoning: `Error in AI analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private groupAlbumsByArtist(albums: CleanedAlbum[]): Map<string, CleanedAlbum[]> {
    const artistMap = new Map<string, CleanedAlbum[]>();
    
    albums.forEach(album => {
      const artistName = album.artist.name.toLowerCase();
      if (!artistMap.has(artistName)) {
        artistMap.set(artistName, []);
      }
      artistMap.get(artistName)!.push(album);
    });
    
    return artistMap;
  }

  private findPotentialConsolidations(albums: CleanedAlbum[]): Array<CleanedAlbum[]> {
    const artistMap = this.groupAlbumsByArtist(albums);
    const potentialGroups: Array<CleanedAlbum[]> = [];
    
    artistMap.forEach((artistAlbums, artistName) => {
      if (artistAlbums.length > 1) {
        // Group by normalized album names
        const albumGroups = new Map<string, CleanedAlbum[]>();
        
        artistAlbums.forEach(album => {
          const normalizedName = album.album.name.toLowerCase()
            .replace(/\s*\([^)]*\)/g, '') // Remove parentheses
            .replace(/\s*\[[^\]]*\]/g, '') // Remove brackets
            .replace(/\s*(remastered|deluxe|explicit|super deluxe|anniversary|edition|version|re-mastered|re-mastret).*$/i, '')
            .trim();
          
          if (!albumGroups.has(normalizedName)) {
            albumGroups.set(normalizedName, []);
          }
          albumGroups.get(normalizedName)!.push(album);
        });
        
        // Add groups with multiple albums, but skip obvious cases
        albumGroups.forEach((groupAlbums, baseName) => {
          if (groupAlbums.length > 1) {
            // Skip if all album names are identical (case-insensitive) - auto-consolidate
            const albumNames = groupAlbums.map(album => album.album.name.toLowerCase());
            const allIdentical = albumNames.every(name => name === albumNames[0]);
            
            if (!allIdentical) {
              // Only send non-obvious cases to AI
              potentialGroups.push(groupAlbums);
            }
          }
        });
      }
    });
    
    return potentialGroups;
  }

  private findAutoConsolidations(albums: CleanedAlbum[]): ConsolidationRule[] {
    const artistMap = this.groupAlbumsByArtist(albums);
    const autoRules: ConsolidationRule[] = [];
    
    artistMap.forEach((artistAlbums, artistName) => {
      if (artistAlbums.length > 1) {
        const albumGroups = new Map<string, CleanedAlbum[]>();
        
        artistAlbums.forEach(album => {
          const normalizedName = album.album.name.toLowerCase();
          if (!albumGroups.has(normalizedName)) {
            albumGroups.set(normalizedName, []);
          }
          albumGroups.get(normalizedName)!.push(album);
        });
        
        // Auto-consolidate identical album names
        albumGroups.forEach((groupAlbums, normalizedName) => {
          if (groupAlbums.length > 1) {
            const sortedAlbums = groupAlbums.sort((a, b) => b.count - a.count);
            const baseName = sortedAlbums[0].album.name; // Use most played version
            
            const autoRule: ConsolidationRule = {
              artistName: artistAlbums[0].artist.name,
              baseAlbumName: baseName,
              variations: groupAlbums.map(album => album.album.name.toLowerCase())
            };
            autoRules.push(autoRule);
          }
        });
      }
    });
    
    return autoRules;
  }

  async consolidateAlbums(albums: CleanedAlbum[], confidenceThreshold: number = 0.7): Promise<AIConsolidationResult> {
    console.log(`🤖 AI Agent analyzing ${albums.length} albums...`);
    
    // Check Ollama connection
    const isConnected = await this.checkOllamaConnection();
    if (!isConnected) {
      throw new Error(`Cannot connect to Ollama at ${this.ollamaUrl}. Please ensure Ollama is running and the model "${this.model}" is available.`);
    }

    // First, handle auto-consolidations (identical names)
    const autoRules = this.findAutoConsolidations(albums);
    console.log(`🔄 Auto-consolidated ${autoRules.length} groups with identical names`);

    const potentialGroups = this.findPotentialConsolidations(albums);
    console.log(`🔍 Found ${potentialGroups.length} potential consolidation groups (after pre-filtering)`);

    const decisions: Array<{albums: CleanedAlbum[], decision: ConsolidationDecision}> = [];
    const newRules: ConsolidationRule[] = [...autoRules]; // Start with auto-rules

    // Create progress bar
    const progressBar = new cliProgress.SingleBar({
      format: '🤖 AI Analysis |{bar}| {percentage}% | {value}/{total} groups | ETA: {eta}s',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      stopOnComplete: true
    });

    progressBar.start(potentialGroups.length, 0);

    // Process groups in parallel batches of 5
    const batchSize = 5;
    for (let i = 0; i < potentialGroups.length; i += batchSize) {
      const batch = potentialGroups.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (group, batchIndex) => {
        try {
          const decision = await this.analyzeAlbumGroup(group);
          
          // If confidence is high enough, create a rule
          if (decision.shouldConsolidate && decision.confidence >= confidenceThreshold) {
            const variations = group.map(album => album.album.name.toLowerCase());
            const newRule: ConsolidationRule = {
              artistName: group[0].artist.name,
              baseAlbumName: decision.canonicalName,
              variations: variations
            };
            return { albums: group, decision, newRule };
          }
          
          return { albums: group, decision, newRule: null };
        } catch (error) {
          console.error(`Error processing group ${i + batchIndex + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Process results
      batchResults.forEach(result => {
        if (result) {
          decisions.push({ albums: result.albums, decision: result.decision });
          if (result.newRule) {
            newRules.push(result.newRule);
          }
        }
      });

      // Update progress
      progressBar.update(Math.min(i + batchSize, potentialGroups.length));
      
      // Small delay between batches to be respectful to the LLM
      if (i + batchSize < potentialGroups.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    progressBar.stop();

    return { decisions, newRules };
  }

  async saveNewRules(newRules: ConsolidationRule[]): Promise<void> {
    if (newRules.length === 0) {
      console.log('📝 No new consolidation rules generated');
      return;
    }

    // Add new rules to existing ones
    this.existingRules.rules.push(...newRules);
    this.existingRules.timestamp = new Date().toISOString();

    const rulesFile = 'album-consolidation-rules.json';
    fs.writeFileSync(rulesFile, JSON.stringify(this.existingRules, null, 2));
    
    console.log(`💾 Added ${newRules.length} new consolidation rules to ${rulesFile}`);
  }

  printAnalysisSummary(results: AIConsolidationResult): void {
    const highConfidence = results.decisions.filter(d => d.decision.confidence >= 0.8).length;
    const mediumConfidence = results.decisions.filter(d => d.decision.confidence >= 0.5 && d.decision.confidence < 0.8).length;
    const lowConfidence = results.decisions.filter(d => d.decision.confidence < 0.5).length;
    const shouldConsolidate = results.decisions.filter(d => d.decision.shouldConsolidate).length;

    console.log('\n📊 --- AI ANALYSIS SUMMARY ---');
    console.log('┌─────────────────────┬─────────────┐');
    console.log('│ Metric              │ Value       │');
    console.log('├─────────────────────┼─────────────┤');
    console.log(`│ Total groups        │ ${results.decisions.length.toString().padStart(11)} │`);
    console.log(`│ Should consolidate  │ ${shouldConsolidate.toString().padStart(11)} │`);
    console.log(`│ High confidence     │ ${highConfidence.toString().padStart(11)} │`);
    console.log(`│ Medium confidence   │ ${mediumConfidence.toString().padStart(11)} │`);
    console.log(`│ Low confidence      │ ${lowConfidence.toString().padStart(11)} │`);
    console.log(`│ New rules created   │ ${results.newRules.length.toString().padStart(11)} │`);
    console.log('└─────────────────────┴─────────────┘');

    // Show decisions that need human review
    const needsReview = results.decisions.filter(d => d.decision.confidence < 0.7);
    if (needsReview.length > 0) {
      console.log('\n🤔 DECISIONS NEEDING HUMAN REVIEW:');
      needsReview.forEach(({ albums, decision }, index) => {
        console.log(`\n${index + 1}. ${albums[0].artist.name}:`);
        albums.forEach(album => {
          console.log(`   - "${album.album.name}" (${album.count} plays)`);
        });
        console.log(`   Decision: ${decision.shouldConsolidate ? 'CONSOLIDATE' : 'KEEP SEPARATE'}`);
        console.log(`   Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
        console.log(`   Reasoning: ${decision.reasoning}`);
      });
    }
  }
}

async function main() {
  const program = new Command();

  program
    .name('ai-consolidate-albums')
    .description('AI-powered album consolidation using local LLM')
    .version('1.0.0');

  program
    .option('-i, --input <file>', 'Input JSON file (default: latest top-albums file)')
    .option('-o, --output <file>', 'Output JSON file')
    .option('-c, --confidence <number>', 'Confidence threshold (0-1)', '0.7')
    .option('--ollama-url <url>', 'Ollama server URL', 'http://localhost:11434')
    .option('--model <name>', 'Ollama model name', 'llama3.1')
    .option('--fast', 'Use faster model (llama3 instead of llama3.1)')
    .option('--interactive', 'Interactive mode for low-confidence decisions')
    .action(async (options: any) => {
      try {
        // Find input file
        let inputFile = options.input;
        if (!inputFile) {
          const files = fs.readdirSync('.')
            .filter(file => file.startsWith('top-albums-') && file.endsWith('.json'))
            .sort()
            .reverse();
          
          if (files.length === 0) {
            throw new Error('No top-albums JSON files found in current directory');
          }
          inputFile = files[0];
        }

        console.log(`📁 Reading data from: ${inputFile}`);
        
        // Read and parse the JSON file
        const rawData = fs.readFileSync(inputFile, 'utf8');
        const data = JSON.parse(rawData);
        
        if (!data.albums || !Array.isArray(data.albums)) {
          throw new Error('Invalid JSON structure: albums array not found');
        }
        
        console.log(`📊 Found ${data.albums.length} albums in the file`);

        // Initialize AI agent
        const model = options.fast ? 'llama3' : options.model;
        const agent = new AlbumConsolidationAgent(options.ollamaUrl, model);
        
        // Run consolidation analysis
        const results = await agent.consolidateAlbums(data.albums, parseFloat(options.confidence));
        
        // Print summary
        agent.printAnalysisSummary(results);
        
        // Save new rules
        await agent.saveNewRules(results.newRules);
        
        // Save results if output file specified
        if (options.output) {
          fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
          console.log(`\n💾 Analysis results saved to: ${options.output}`);
        }
        
        console.log('\n🎉 AI consolidation analysis completed!');
        
      } catch (error) {
        console.error('\n💥 Script failed:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  program.parse();
}

// Run the script
if (require.main === module) {
  main();
}

export { AlbumConsolidationAgent };
