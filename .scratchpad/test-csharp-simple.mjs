#!/usr/bin/env node

import Parser from 'tree-sitter';
import TreeSitterCSharp from 'tree-sitter-c-sharp';

console.log('Testing C# parser initialization\n');
console.log('TreeSitterCSharp type:', typeof TreeSitterCSharp);
console.log('TreeSitterCSharp:', TreeSitterCSharp);

try {
  const parser = new Parser();
  console.log('\nParser created');
  
  console.log('\nAttempting to set language...');
  parser.setLanguage(TreeSitterCSharp);
  console.log('Language set successfully');
  
  const simpleCode = `
namespace Test {
    public class MyClass {
        public void MyMethod() {
        }
    }
}
`;
  
  console.log('\nParsing simple C# code...');
  const tree = parser.parse(simpleCode);
  console.log('Parse successful!');
  console.log('Root node type:', tree.rootNode.type);
  console.log('Child count:', tree.rootNode.childCount);
  
} catch (error) {
  console.error('\nError:', error.message);
  console.error(error.stack);
}
