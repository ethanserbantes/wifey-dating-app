#!/usr/bin/env node

import('./build/server/index.js').then(module => {
  console.log('✅ Wifey backend started successfully');
}).catch(error => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
