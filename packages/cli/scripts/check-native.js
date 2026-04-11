#!/usr/bin/env node

/**
 * Check for better-sqlite3 native build issues
 * This script detects when better-sqlite3 fails to load due to missing native bindings,
 * which commonly occurs on Node 23/24/25.
 */

import { platform } from 'os';

function checkBetterSqlite3() {
  return import('better-sqlite3')
    .then(() => {
      console.log('✅ better-sqlite3 loaded successfully');
      return true;
    })
    .catch((error) => {
      // Check if this is the specific bindings file error
      if (error.message && error.message.includes('Could not locate the bindings file')) {
        console.error('❌ better-sqlite3 native bindings missing');
        console.error('');
        console.error('This is a known issue with Node.js 23/24/25 and better-sqlite3.');
        console.error('');
        console.error('🔧 To fix this issue, try one of these solutions:');
        console.error('');
        console.error('1. Rebuild better-sqlite3 for your Node.js version:');
        console.error('   npm rebuild better-sqlite3');
        console.error('   # or');
        console.error('   pnpm rebuild better-sqlite3');
        console.error('   # or');
        console.error('   yarn install --force');
        console.error('');
        console.error('2. If rebuild doesn\'t work, reinstall the package:');
        console.error('   npm uninstall better-sqlite3 && npm install better-sqlite3');
        console.error('');
        console.error('3. If you\'re using Node.js 24+, consider using Node.js 20 or 22 LTS:');
        console.error('   nvm use 20  # or nvm use 22');
        console.error('');
        console.error(`Current Node.js version: ${process.version}`);
        console.error(`Platform: ${platform()}`);
        return false;
      } else {
        // Different error, re-throw
        console.error('❌ better-sqlite3 failed to load with unexpected error:');
        console.error(error.message);
        return false;
      }
    });
}

async function main() {
  console.log('Checking better-sqlite3 native bindings...');

  const success = await checkBetterSqlite3();

  if (!success) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Unexpected error during native bindings check:', error);
  process.exit(1);
});