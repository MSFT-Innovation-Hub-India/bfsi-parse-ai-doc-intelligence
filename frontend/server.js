const { execSync } = require('child_process');
const path = require('path');

// Get port from environment or default to 8080
const port = process.env.PORT || 8080;

// Path to next binary
const nextBin = path.join(__dirname, 'node_modules', '.bin', 'next');

console.log(`Starting Next.js on port ${port}...`);

// Execute next start
try {
  execSync(`"${nextBin}" start -p ${port}`, { 
    stdio: 'inherit',
    cwd: __dirname 
  });
} catch (error) {
  console.error('Failed to start Next.js:', error.message);
  process.exit(1);
}
