#!/usr/bin/env tsx

/**
 * Setup script for AI consolidation agent
 * Helps install Ollama and download the required model
 */

import { execSync } from 'child_process';
import fs from 'fs';

async function checkOllamaInstalled(): Promise<boolean> {
  try {
    execSync('ollama --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

async function checkModelAvailable(model: string): Promise<boolean> {
  try {
    const output = execSync('ollama list', { encoding: 'utf8' });
    return output.includes(model);
  } catch (error) {
    return false;
  }
}

async function installOllama(): Promise<void> {
  console.log('📦 Installing Ollama...');
  
  try {
    // Detect OS and install Ollama
    const platform = process.platform;
    
    if (platform === 'darwin') {
      console.log('🍎 Detected macOS - installing Ollama via Homebrew...');
      execSync('brew install ollama', { stdio: 'inherit' });
    } else if (platform === 'linux') {
      console.log('🐧 Detected Linux - installing Ollama via curl...');
      execSync('curl -fsSL https://ollama.ai/install.sh | sh', { stdio: 'inherit' });
    } else {
      throw new Error(`Unsupported platform: ${platform}. Please install Ollama manually from https://ollama.ai`);
    }
    
    console.log('✅ Ollama installed successfully!');
  } catch (error) {
    console.error('❌ Failed to install Ollama:', error instanceof Error ? error.message : 'Unknown error');
    console.log('Please install Ollama manually from https://ollama.ai');
    process.exit(1);
  }
}

async function downloadModel(model: string): Promise<void> {
  console.log(`📥 Downloading model: ${model}`);
  
  try {
    execSync(`ollama pull ${model}`, { stdio: 'inherit' });
    console.log(`✅ Model ${model} downloaded successfully!`);
  } catch (error) {
    console.error(`❌ Failed to download model ${model}:`, error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

async function startOllamaService(): Promise<void> {
  console.log('🚀 Starting Ollama service...');
  
  try {
    // Start Ollama in the background
    execSync('ollama serve &', { stdio: 'ignore' });
    
    // Wait a moment for the service to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('✅ Ollama service started!');
  } catch (error) {
    console.error('❌ Failed to start Ollama service:', error instanceof Error ? error.message : 'Unknown error');
    console.log('Please start Ollama manually: ollama serve');
  }
}

async function createExampleScript(): Promise<void> {
  const exampleScript = `#!/bin/bash

# Example usage of the AI consolidation agent

echo "🤖 AI Album Consolidation Agent"
echo "================================"

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null; then
    echo "❌ Ollama is not running. Starting it now..."
    ollama serve &
    sleep 3
fi

# Run the AI consolidation
echo "🎵 Running AI consolidation analysis..."
npm run ai-consolidate -- --confidence 0.7

echo "✅ Analysis complete!"
`;

  fs.writeFileSync('run-ai-consolidation.sh', exampleScript);
  fs.chmodSync('run-ai-consolidation.sh', '755');
  
  console.log('📝 Created example script: run-ai-consolidation.sh');
}

async function main() {
  console.log('🤖 AI Album Consolidation Agent Setup');
  console.log('=====================================\n');

  // Check if Ollama is installed
  const ollamaInstalled = await checkOllamaInstalled();
  if (!ollamaInstalled) {
    console.log('❌ Ollama is not installed');
    await installOllama();
  } else {
    console.log('✅ Ollama is already installed');
  }

  // Check if the model is available
  const model = 'llama3.1';
  const modelAvailable = await checkModelAvailable(model);
  if (!modelAvailable) {
    console.log(`❌ Model ${model} is not available`);
    await downloadModel(model);
  } else {
    console.log(`✅ Model ${model} is already available`);
  }

  // Start Ollama service
  await startOllamaService();

  // Create example script
  await createExampleScript();

  console.log('\n🎉 Setup complete!');
  console.log('\nNext steps:');
  console.log('1. Run: npm run ai-consolidate');
  console.log('2. Or use the example script: ./run-ai-consolidation.sh');
  console.log('\nThe AI agent will:');
  console.log('- Analyze your existing consolidation rules');
  console.log('- Process albums in batches');
  console.log('- Make intelligent consolidation decisions');
  console.log('- Generate new rules automatically');
  console.log('- Show confidence levels for each decision');
}

if (require.main === module) {
  main().catch(error => {
    console.error('💥 Setup failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  });
}
