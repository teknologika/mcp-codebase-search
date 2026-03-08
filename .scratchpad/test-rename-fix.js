#!/usr/bin/env node

/**
 * Test script to verify the vector validation fix in renameCodebase
 */

import { CodebaseService } from '../dist/domains/codebase/codebase.service.js';
import { LanceDBClientWrapper } from '../dist/infrastructure/lancedb/lancedb.client.js';
import { createLogger } from '../dist/shared/logging/logger.js';
import { loadConfig } from '../dist/shared/config/config.js';

async function testRenameFix() {
  try {
    console.log('Testing rename fix with vector validation...');
    
    // Load config
    const config = await loadConfig();
    
    // Create logger
    const logger = createLogger('test-rename');
    
    // Create LanceDB client
    const lanceClient = new LanceDBClientWrapper(config, logger);
    await lanceClient.initialize();
    
    // Create codebase service
    const codebaseService = new CodebaseService(lanceClient);
    
    // Test the rename operation
    console.log('Attempting to rename codebase from "moraya" to "chisel-desktop"...');
    
    await codebaseService.renameCodebase('moraya', 'chisel-desktop');
    
    console.log('✅ Rename completed successfully!');
    
    // Verify the new codebase exists
    const codebases = await codebaseService.listCodebases();
    const renamedCodebase = codebases.find(cb => cb.name === 'chisel-desktop');
    
    if (renamedCodebase) {
      console.log('✅ New codebase found:', {
        name: renamedCodebase.name,
        chunkCount: renamedCodebase.chunkCount,
        path: renamedCodebase.path
      });
    } else {
      console.log('❌ New codebase not found in list');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testRenameFix().catch(console.error);