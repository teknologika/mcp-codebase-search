#!/usr/bin/env node

// Quick test to see if LapCollector.cs can be parsed
const fs = require('fs');
const path = require('path');

const filePath = '/Users/bruce/GitHub/APR-Fuel-Calculator/APR.LapTelemetry.SimhubPlugin/LapCollector.cs';

console.log('Testing LapCollector.cs parsing...\n');

// Check file exists and size
try {
  const stats = fs.statSync(filePath);
  console.log(`File exists: ${stats.size} bytes (${stats.size / 1024} KB)`);
  console.log(`Modified: ${stats.mtime}\n`);
  
  // Read first 500 chars to see structure
  const content = fs.readFileSync(filePath, 'utf-8');
  console.log(`Total lines: ${content.split('\n').length}`);
  console.log(`Total chars: ${content.length}\n`);
  console.log('First 500 characters:');
  console.log(content.substring(0, 500));
  console.log('\n...\n');
  
  // Check for any unusual characters
  const hasNullBytes = content.includes('\0');
  console.log(`Contains null bytes: ${hasNullBytes}`);
  
} catch (error) {
  console.error('Error:', error.message);
}
