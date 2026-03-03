#!/usr/bin/env node

import Parser from 'tree-sitter';
import TreeSitterCSharp from 'tree-sitter-c-sharp';
import { readFile } from 'fs/promises';

const filePath = '/Users/bruce/GitHub/APR-Fuel-Calculator/APR.LapTelemetry.SimhubPlugin/LapCollector.cs';

console.log('Testing correct C# parser usage\n');

try {
  const parser = new Parser();
  
  // WRONG WAY (what we're currently doing):
  console.log('Attempting WRONG way (passing module directly)...');
  try {
    parser.setLanguage(TreeSitterCSharp);
    console.log('✗ This should have failed but didn\'t');
  } catch (e) {
    console.log('✓ Failed as expected:', e.message);
  }
  
  // RIGHT WAY:
  console.log('\nAttempting RIGHT way (using .language property)...');
  const parser2 = new Parser();
  parser2.setLanguage(TreeSitterCSharp.language);
  console.log('✓ Language set successfully');
  
  // Now try parsing LapCollector.cs
  console.log('\nParsing LapCollector.cs...');
  const content = await readFile(filePath, 'utf-8');
  const tree = parser2.parse(content);
  
  console.log('✓ Parse successful!');
  console.log(`Root node: ${tree.rootNode.type}`);
  console.log(`Children: ${tree.rootNode.childCount}`);
  console.log(`Has errors: ${tree.rootNode.hasError()}`);
  
  // Count some node types
  let classCount = 0;
  let methodCount = 0;
  
  function walk(node) {
    if (node.type === 'class_declaration') classCount++;
    if (node.type === 'method_declaration') methodCount++;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }
  
  walk(tree.rootNode);
  console.log(`\nFound ${classCount} classes, ${methodCount} methods`);
  
} catch (error) {
  console.error('\n✗ Error:', error.message);
  console.error(error.stack);
}
