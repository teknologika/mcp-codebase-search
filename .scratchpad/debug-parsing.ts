/**
 * Debug script to test tree-sitter parsing of builtinCatalog.ts
 * 
 * This script will:
 * 1. Parse the file using tree-sitter
 * 2. Show the AST structure
 * 3. Demonstrate why it produces zero chunks
 * 4. Propose solutions
 */

import Parser from 'tree-sitter';
import TreeSitterTypeScript from 'tree-sitter-typescript';
import { readFile } from 'node:fs/promises';

async function debugParsing() {
  const filePath = '/Users/bruce/GitHub/chisel/src/tools/builtinCatalog.ts';
  
  // Initialize parser
  const parser = new Parser();
  parser.setLanguage(TreeSitterTypeScript.typescript);
  
  // Read and parse file
  const content = await readFile(filePath, 'utf-8');
  const tree = parser.parse(content);
  
  console.log('=== FILE CONTENT ===');
  console.log(content);
  console.log('\n=== AST ROOT NODE ===');
  console.log('Type:', tree.rootNode.type);
  console.log('Child count:', tree.rootNode.childCount);
  
  console.log('\n=== TOP-LEVEL NODES ===');
  for (let i = 0; i < tree.rootNode.childCount; i++) {
    const child = tree.rootNode.child(i);
    if (child) {
      console.log(`Child ${i}:`, {
        type: child.type,
        startLine: child.startPosition.row + 1,
        endLine: child.endPosition.row + 1,
        text: content.substring(child.startIndex, Math.min(child.endIndex, child.startIndex + 50))
      });
    }
  }
  
  console.log('\n=== ANALYSIS ===');
  console.log('Expected node types for TypeScript chunks:');
  console.log('  - function_declaration');
  console.log('  - arrow_function');
  console.log('  - class_declaration');
  console.log('  - method_definition');
  console.log('  - interface_declaration');
  
  console.log('\nActual node types found:');
  const nodeTypes = new Set<string>();
  function collectNodeTypes(node: Parser.SyntaxNode) {
    nodeTypes.add(node.type);
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) collectNodeTypes(child);
    }
  }
  collectNodeTypes(tree.rootNode);
  console.log(Array.from(nodeTypes).sort().join(', '));
  
  console.log('\n=== CONCLUSION ===');
  console.log('The file contains only:');
  console.log('  1. import_statement');
  console.log('  2. export_statement with lexical_declaration (const)');
  console.log('');
  console.log('None of these match the expected chunk types, so zero chunks are extracted.');
  console.log('This is why the file is not indexed in the database.');
}

debugParsing().catch(console.error);
