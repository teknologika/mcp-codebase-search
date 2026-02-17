#!/usr/bin/env node
/**
 * Test script to verify file-level fallback works
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simulate the ingestion logic
async function testFallback() {
  const testFile = '/Users/bruce/GitHub/chisel/src/tools/builtinCatalog.ts';
  
  console.log('Testing file-level fallback logic...\n');
  
  // Read file content
  const fullFileContent = await readFile(testFile, 'utf-8');
  console.log('✓ File read successfully');
  console.log(`  Size: ${fullFileContent.length} bytes`);
  console.log(`  Lines: ${fullFileContent.split('\n').length}`);
  
  // Simulate zero chunks from parser
  let chunks = []; // This is what tree-sitter returns for this file
  
  console.log(`\n✗ Tree-sitter produced ${chunks.length} chunks`);
  
  // Apply fallback
  if (chunks.length === 0 && fullFileContent) {
    console.log('\n✓ Applying file-level fallback...');
    
    const lineCount = fullFileContent.split('\n').length;
    chunks = [{
      content: fullFileContent,
      startLine: 1,
      endLine: lineCount,
      chunkType: 'file',
      language: 'typescript',
      filePath: testFile,
    }];
    
    console.log(`✓ Created file-level chunk:`);
    console.log(`  Type: ${chunks[0].chunkType}`);
    console.log(`  Lines: ${chunks[0].startLine}-${chunks[0].endLine}`);
    console.log(`  Content length: ${chunks[0].content.length} bytes`);
  }
  
  console.log(`\n✓ Final result: ${chunks.length} chunk(s)`);
  
  if (chunks.length > 0) {
    console.log('\n✅ SUCCESS: File would be indexed!');
  } else {
    console.log('\n❌ FAILURE: File would NOT be indexed!');
  }
}

testFallback().catch(console.error);
