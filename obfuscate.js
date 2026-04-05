const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const STANDALONE_DIR = path.join(__dirname, '.next', 'standalone');

const OBF_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 5,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
};

function obfuscateFile(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    if (code.length < 50) return; // skip tiny files
    const result = JavaScriptObfuscator.obfuscate(code, OBF_OPTIONS);
    fs.writeFileSync(filePath, result.getObfuscatedCode());
    console.log(`  ✓ ${path.relative(STANDALONE_DIR, filePath)}`);
  } catch (e) {
    console.log(`  ✗ ${path.relative(STANDALONE_DIR, filePath)}: ${e.message}`);
  }
}

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      // Skip node_modules and .next/static (client JS already minified)
      if (f === 'node_modules' || f === 'static') return;
      walkDir(full, callback);
    } else if (f.endsWith('.js') && !f.endsWith('.min.js')) {
      callback(full);
    }
  });
}

console.log('Obfuscating server-side JS...');

// Obfuscate app route handlers
const appDir = path.join(STANDALONE_DIR, '.next', 'server', 'app');
if (fs.existsSync(appDir)) {
  walkDir(appDir, obfuscateFile);
}

// Obfuscate chunks
const chunksDir = path.join(STANDALONE_DIR, '.next', 'server', 'chunks');
if (fs.existsSync(chunksDir)) {
  walkDir(chunksDir, obfuscateFile);
}

// Obfuscate server.js itself
const serverJs = path.join(STANDALONE_DIR, 'server.js');
if (fs.existsSync(serverJs)) {
  obfuscateFile(serverJs);
}

console.log('Done!');
