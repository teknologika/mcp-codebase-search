#!/usr/bin/env node

// Test script to verify the rescan lastIngestion timestamp fix
import { IngestionService } from '../dist/domains/ingestion/ingestion.service.js';
import { LanceDBClientWrapper } from '../dist/infrastructure/lancedb/lancedb.client.js';
import { Config } from '../dist/shared/config/config.js';

async function testRescanFix() {
  try {
    console.log('Testing rescan lastIngestion timestamp fix...');
    
    // Initialize services
    const config = new Config();
    const lanceClient = new LanceDBClientWrapper(config);
    const ingestionService = new IngestionService(lanceClient, config);
    
    // Test with a small codebase
    const testCodebaseName = 'chisel';
    const testCodebasePath = '/Users/bruce/GitHub/chisel';
    
    console.log(`Before rescan - checking current timestamp...`);
    
    // Get current timestamp from database
    const table = await lanceClient.getOrCreateTable(testCodebaseName);
    if (table) {
      const sample = await table.query().limit(1).toArray();
      if (sample.length > 0) {
        console.log('Current _lastIngestion:', sample[0]._lastIngestion);
      }
    }
    
    console.log('Performing rescan...');
    const result = await ingestionService.rescanCodebase(testCodebaseName, testCodebasePath);
    console.log('Rescan result:', result);
    
    // Check timestamp after rescan
    console.log('After rescan - checking new timestamp...');
    const updatedSample = await table.query().limit(1).toArray();
    if (updatedSample.length > 0) {
      console.log('New _lastIngestion:', updatedSample[0]._lastIngestion);
    }
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRescanFix();