#!/usr/bin/env node

import Parser from 'tree-sitter';
import TreeSitterCSharp from 'tree-sitter-c-sharp';
import { readFile } from 'fs/promises';

const filePath = '/Users/bruce/GitHub/APR-Fuel-Calculator/APR.LapTelemetry.SimhubPlugin/LapCollector.cs';

console.log('Testing C# parsing for LapCollector.cs\n');

try {
  // Initialize parser
  const parser = new Parser();
  parser.setLanguage(TreeSitterCSharp);
  
  // Read file
  const content = await readFile(filePath, 'utf-8');
  console.log(`File size: ${content.length} bytes`);
  console.log(`Lines: ${content.split('\n').length}\n`);
  
  // Parse
  console.log('Parsing...');
  const tree = parser.parse(content);
  
  console.log(`Root node type: ${tree.rootNode.type}`);
  console.log(`Root node has error: ${tree.rootNode.hasError()}`);
  console.log(`Child count: ${tree.rootNode.childCount}\n`);
  
  // Walk tree and collect node types
  const nodeTypes = new Map();
  
  function walk(node, depth = 0) {
    const count = nodeTypes.get(node.type) || 0;
    nodeTypes.set(node.type, count + 1);
    
    // Print first few levels
    if (depth < 3) {
      console.log(`${'  '.repeat(depth)}${node.type} (${node.startPosition.row + 1}:${node.startPosition.column})`);
    }
    
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, depth + 1);
    }
  }
  
  console.log('Tree structure (first 3 levels):');
  walk(tree.rootNode);
  
  console.log('\n\nNode type counts:');
  const sorted = Array.from(nodeTypes.entries()).sort((a, b) => b[1] - a[1]);
  sorted.slice(0, 20).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  // Check for expected types
  console.log('\n\nLooking for expected C# node types:');
  const expected = ['class_declaration', 'method_declaration', 'property_declaration', 'interface_declaration'];
  expected.forEach(type => {
    const count = nodeTypes.get(type) || 0;
    console.log(`  ${type}: ${count} ${count === 0 ? '❌ MISSING' : '✓'}`);
  });
  
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
}
