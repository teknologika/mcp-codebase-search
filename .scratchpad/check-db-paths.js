// Quick script to check what paths are actually stored in the database
import { connect } from '@lancedb/lancedb';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(process.env.HOME || process.env.USERPROFILE, '.codebase-memory', 'lancedb');

async function checkPaths() {
  const db = await connect(dbPath);
  
  // List all tables
  const tables = await db.tableNames();
  console.log('Available tables:', tables);
  
  if (tables.length === 0) {
    console.log('No tables found!');
    return;
  }
  
  // Check the mcp-codebase-search table
  const tableName = tables.find(t => t.includes('mcp-codebase-search')) || tables[0];
  console.log(`\nChecking table: ${tableName}`);
  
  const table = await db.openTable(tableName);
  
  // Get rows ordered by ingestion timestamp
  const rows = await table.query().limit(10).toArray();
  
  // Sort by ingestion timestamp to see newest first
  rows.sort((a, b) => (b.ingestionTimestamp || '').localeCompare(a.ingestionTimestamp || ''));
  
  console.log('\nSample file paths from database (newest first):');
  rows.forEach((row, i) => {
    console.log(`${i + 1}. [${row.ingestionTimestamp}] ${row.filePath}`);
  });
  
  // Check if any are relative
  const hasRelative = rows.some(row => !row.filePath.startsWith('/'));
  const hasAbsolute = rows.some(row => row.filePath.startsWith('/'));
  console.log(`\nPath types: ${hasRelative ? 'Has relative' : 'No relative'}, ${hasAbsolute ? 'Has absolute' : 'No absolute'}`);
}

checkPaths().catch(console.error);
