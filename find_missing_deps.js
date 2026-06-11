const fs = require('fs');
const path = require('path');

const DEPS = [
  'authenticateToken',
  'hasAdminOrEditorAccess',
  'checkPermission',
  'createNotification',
  'getOrgAdminUserIds',
  'resolveApprovalOrgId',
  'parsePendingData',
  'buildChangeDeleteNotification',
  'parseClientDateTime'
];

function walk(dir, filelist = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      filelist = walk(filepath, filelist);
    } else if (file.endsWith('.js')) {
      filelist.push(filepath);
    }
  }
  return filelist;
}

const routesDir = path.join(__dirname, 'src/routes');
const files = walk(routesDir);

let totalIssues = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  
  // Find module.exports = function(app, { ... })
  const match = content.match(/module\.exports\s*=\s*function\s*\(\s*app\s*,\s*\{\s*([^}]*)\s*\}\s*\)/);
  if (!match) continue; // Not a standard injected route

  const destructuredRaw = match[1];
  const destructured = destructuredRaw.split(',').map(s => s.trim()).filter(Boolean);

  // Check which deps are used in the file
  for (const dep of DEPS) {
    // Basic string search for the dependency name (could be a false positive if used in a comment, but good for detection)
    // To be more precise, we check if it is called or referenced as a whole word.
    const regex = new RegExp(`\\b${dep}\\b`, 'g');
    const matches = content.match(regex);
    
    // If there's more than 1 match (1 would be the destructuring itself if it was there), or if it's not destructured but has > 0 matches
    if (matches && !destructured.includes(dep)) {
      console.log(`[MISSING DEP] ${file.replace(routesDir, '')} uses '${dep}' but does not destructure it!`);
      totalIssues++;
    }
  }
}

console.log(`\nScan complete. Found ${totalIssues} issues.`);
