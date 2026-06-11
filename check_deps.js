const fs = require('fs');
const path = require('path');

const DEPS = ['authenticateToken', 'hasBookAccess', 'checkPermission', 'hasAdminOrEditorAccess', 'checkApprovalBypass', 'createNotification', 'getOrgAdminUserIds', 'maybeMirrorOrgTxnToCreatorPersonal', 'getChainRemainingBalance', 'mustUseChangeDeleteApprovalFlow', 'getRequiredApproversForChangeDelete', 'buildChangeDeletePendingData', 'syncCounterpartLegsForChangeDelete', 'notifyChangeDeleteApprovers', 'buildChangeDeleteNotification', 'deleteCounterpartLegsForChangeDelete', 'reverseTxnBalanceForRemoval', 'generateChainId', 'fundSendRetryStatuses', 'resolveApprovalOrgId', 'resolveFundSendChainParts', 'parsePendingData', 'parseClientDateTime', 'enrichTxn', 'DEFAULT_CATEGORIES'];

function walk(dir, files = []) {
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      walk(full, files);
    } else if (full.endsWith('.js')) {
      files.push(full);
    }
  });
  return files;
}

const routesDir = path.join(__dirname, 'src', 'routes');
const files = walk(routesDir);

function checkFile(file) {
  const content = fs.readFileSync(file, 'utf-8');
  // Simple check: if a DEP is used in the file, but not destructured, it's a bug.
  // We'll just do a simple string match for the dependency word.
  // Then we check if it is destructured via `const { ... } = deps;` or imported.
  DEPS.forEach(dep => {
    // If the file mentions the dep
    if (content.match(new RegExp(`\\b${dep}\\b`))) {
      // Is it imported or destructured?
      const isRequired = content.match(new RegExp(`const\\s+\\{.*${dep}.*\\}\\s*=\\s*require`));
      const isDestructured = content.match(new RegExp(`const\\s+\\{.*${dep}.*\\}\\s*=\\s*deps`));
      const isPassedInDeps = content.match(new RegExp(`deps\\.${dep}`));
      const isFunctionArg = content.match(new RegExp(`function\\s*\\(.*${dep}.*\\)`));

      if (!isRequired && !isDestructured && !isPassedInDeps && !isFunctionArg) {
         console.log(`POTENTIAL BUG in ${file}: used ${dep} but not imported/destructured!`);
      }
    }
  });
}

files.forEach(checkFile);
console.log('Check complete.');
