const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

const WORKBENCH_BACKUP_SUFFIX = '.cursor-zh-hans-workbench.bak';
const WORKBENCH_METADATA_SUFFIX = '.cursor-zh-hans-workbench.json';
const PRODUCT_BACKUP_SUFFIX = '.cursor-zh-hans-product.bak';
const PRODUCT_FILE = 'product.json';
const WORKBENCH_ENTRY_FILE = 'out/vs/workbench/workbench.desktop.main.js';
const PATCHES_PATH = path.join(__dirname, 'cursor-hardcoded-patches.json');

function applyWorkbenchPatch(options = {}) {
  const appRoot = resolveCursorAppRoot(options.cursorAppRoot);
  const patchSets = loadPatchSets(options.patchesPath);
  const result = createResult(appRoot);

  for (const patchSet of patchSets) {
    const targetPath = resolvePatchTarget(appRoot, patchSet.file);
    if (!fs.existsSync(targetPath)) {
      result.missingFiles.push(patchSet.file);
      continue;
    }

    const original = fs.readFileSync(targetPath, 'utf8');
    let next = original;
    let fileReplacements = 0;
    let fileAlreadyPatched = 0;

    for (const replacement of patchSet.replacements) {
      const sourceCount = countOccurrences(next, replacement.source);
      if (sourceCount > 0) {
        next = replaceAll(next, replacement.source, replacement.target);
        fileReplacements += sourceCount;
        continue;
      }

      const targetCount = countOccurrences(next, replacement.target);
      if (targetCount > 0) {
        fileAlreadyPatched += targetCount;
      } else if (!replacement.optional) {
        result.missingReplacements.push({
          file: patchSet.file,
          source: replacement.source
        });
      }
    }

    result.alreadyPatched += fileAlreadyPatched;

    if (next === original) {
      result.updatedProductChecksums += syncProductChecksum(appRoot, patchSet.file, original);
      continue;
    }

    const backup = ensureWorkbenchBackup(targetPath, original, next, patchSet.file, {
      alreadyPatched: fileAlreadyPatched > 0
    });
    if (backup.created) {
      result.createdBackups += 1;
    }
    if (backup.refreshed) {
      result.refreshedBackups += 1;
    }

    fs.writeFileSync(targetPath, next, 'utf8');
    result.updatedProductChecksums += syncProductChecksum(appRoot, patchSet.file, next);
    result.changedFiles += 1;
    result.replacements += fileReplacements;
  }

  return result;
}

function revertWorkbenchPatch(options = {}) {
  const appRoot = resolveCursorAppRoot(options.cursorAppRoot);
  const patchSets = loadPatchSets(options.patchesPath);
  const result = {
    appRoot,
    restoredFiles: 0,
    updatedProductChecksums: 0,
    missingBackups: [],
    staleBackups: []
  };

  for (const patchSet of patchSets) {
    const targetPath = resolvePatchTarget(appRoot, patchSet.file);
    const backupPath = `${targetPath}${WORKBENCH_BACKUP_SUFFIX}`;
    if (!fs.existsSync(backupPath)) {
      result.missingBackups.push(patchSet.file);
      continue;
    }

    const current = fs.readFileSync(targetPath, 'utf8');
    const backup = fs.readFileSync(backupPath, 'utf8');
    const metadata = readJsonIfExists(`${targetPath}${WORKBENCH_METADATA_SUFFIX}`);
    if (metadata && (metadata.originalSha256 !== sha256(backup) || metadata.patchedSha256 !== sha256(current))) {
      result.staleBackups.push(patchSet.file);
      continue;
    }

    fs.copyFileSync(backupPath, targetPath);
    result.updatedProductChecksums += syncProductChecksum(appRoot, patchSet.file, backup);
    fs.rmSync(backupPath, { force: true });
    fs.rmSync(`${targetPath}${WORKBENCH_METADATA_SUFFIX}`, { force: true });
    result.restoredFiles += 1;
  }

  return result;
}

function inspectWorkbenchPatch(options = {}) {
  const appRoot = resolveCursorAppRoot(options.cursorAppRoot);
  const patchSets = loadPatchSets(options.patchesPath);
  const result = createResult(appRoot);

  for (const patchSet of patchSets) {
    const targetPath = resolvePatchTarget(appRoot, patchSet.file);
    if (!fs.existsSync(targetPath)) {
      result.missingFiles.push(patchSet.file);
      continue;
    }

    const content = fs.readFileSync(targetPath, 'utf8');
    for (const replacement of patchSet.replacements) {
      const sourceCount = countOccurrences(content, replacement.source);
      const targetCount = countOccurrences(content, replacement.target);
      result.replacements += sourceCount;
      result.alreadyPatched += targetCount;
      if (sourceCount === 0 && targetCount === 0 && !replacement.optional) {
        result.missingReplacements.push({
          file: patchSet.file,
          source: replacement.source
        });
      }
    }
  }

  return result;
}

function resolveCursorAppRoot(configuredRoot) {
  const configured = typeof configuredRoot === 'string' ? configuredRoot.trim() : '';
  if (configured) {
    return normalizeCursorAppRoot(expandHome(configured));
  }

  const candidates = getCursorAppRootCandidates();
  return candidates.find(isCursorAppRoot) || candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function getCursorAppRootCandidates() {
  const candidates = [];
  const push = (candidate) => {
    if (typeof candidate === 'string' && candidate.trim()) {
      candidates.push(path.normalize(candidate));
    }
  };

  if (process.resourcesPath) {
    push(path.join(process.resourcesPath, 'app'));
    push(process.resourcesPath);
  }

  if (process.execPath) {
    const executableDir = path.dirname(process.execPath);
    push(path.join(executableDir, 'resources', 'app'));
    push(path.resolve(executableDir, '..', 'Resources', 'app'));
    push(path.resolve(executableDir, '..', 'resources', 'app'));
    push(path.resolve(executableDir, '..', 'share', 'cursor', 'resources', 'app'));
  }

  if (process.env.APPDIR) {
    push(path.join(process.env.APPDIR, 'resources', 'app'));
    push(path.join(process.env.APPDIR, 'usr', 'share', 'cursor', 'resources', 'app'));
  }

  if (process.platform === 'win32') {
    push(path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'cursor', 'resources', 'app'));
    push(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cursor', 'resources', 'app'));
  } else if (process.platform === 'darwin') {
    push('/Applications/Cursor.app/Contents/Resources/app');
    push(path.join(os.homedir(), 'Applications', 'Cursor.app', 'Contents', 'Resources', 'app'));
  } else {
    push('/usr/share/cursor/resources/app');
    push('/usr/lib/cursor/resources/app');
    push('/opt/Cursor/resources/app');
    push('/opt/cursor/resources/app');
    push('/app/share/cursor/resources/app');
    push('/snap/cursor/current/usr/share/cursor/resources/app');
  }

  return [...new Set(candidates)];
}

function normalizeCursorAppRoot(value) {
  const candidates = [
    value,
    path.join(value, 'resources', 'app'),
    path.join(value, 'Contents', 'Resources', 'app'),
    path.join(value, 'Resources', 'app')
  ];
  return candidates.find(isCursorAppRoot) || value;
}

function isCursorAppRoot(candidate) {
  return Boolean(candidate) && fs.existsSync(resolvePatchTarget(candidate, WORKBENCH_ENTRY_FILE));
}

function loadPatchSets(patchesPath = PATCHES_PATH) {
  const patchSets = JSON.parse(fs.readFileSync(patchesPath, 'utf8'));
  validatePatchSets(patchSets);
  return patchSets;
}

function validatePatchSets(patchSets) {
  if (!Array.isArray(patchSets) || patchSets.length === 0) {
    throw new Error('cursor-hardcoded-patches.json 必须是非空数组');
  }

  for (const patchSet of patchSets) {
    if (!patchSet || typeof patchSet !== 'object') {
      throw new Error('补丁项必须是对象');
    }
    if (typeof patchSet.file !== 'string' || !patchSet.file) {
      throw new Error('补丁项缺少 file');
    }
    if (!Array.isArray(patchSet.replacements) || patchSet.replacements.length === 0) {
      throw new Error(`补丁项缺少 replacements：${patchSet.file}`);
    }

    for (const replacement of patchSet.replacements) {
      if (typeof replacement.source !== 'string' || !replacement.source) {
        throw new Error(`补丁 source 必须是非空字符串：${patchSet.file}`);
      }
      if (typeof replacement.target !== 'string' || !replacement.target) {
        throw new Error(`补丁 target 必须是非空字符串：${patchSet.file}`);
      }
      if (replacement.source === replacement.target) {
        throw new Error(`补丁 source 和 target 不能相同：${patchSet.file}`);
      }
    }
  }
}

function resolvePatchTarget(appRoot, relativeFile) {
  return path.join(appRoot, ...relativeFile.split('/'));
}

function createResult(appRoot) {
  return {
    appRoot,
    changedFiles: 0,
    replacements: 0,
    alreadyPatched: 0,
    createdBackups: 0,
    refreshedBackups: 0,
    updatedProductChecksums: 0,
    missingFiles: [],
    missingReplacements: []
  };
}

function replaceAll(value, source, target) {
  return value.split(source).join(target);
}

function countOccurrences(value, needle) {
  let count = 0;
  let index = 0;

  while ((index = value.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }

  return count;
}

function ensureWorkbenchBackup(targetPath, original, patched, patchSetFile, options = {}) {
  const backupPath = `${targetPath}${WORKBENCH_BACKUP_SUFFIX}`;
  const metadataPath = `${targetPath}${WORKBENCH_METADATA_SUFFIX}`;
  const originalSha256 = sha256(original);
  const patchedSha256 = sha256(patched);
  const backupExists = fs.existsSync(backupPath);
  const backupMatchesOriginal = backupExists && sha256(fs.readFileSync(backupPath, 'utf8')) === originalSha256;
  const metadata = readJsonIfExists(metadataPath);
  const metadataMatches = metadata
    && metadata.originalSha256 === originalSha256
    && metadata.patchedSha256 === patchedSha256;

  if (backupMatchesOriginal && metadataMatches) {
    return { created: false, refreshed: false };
  }

  if (backupExists && options.alreadyPatched) {
    if (backupMatchesOriginal && !metadataMatches) {
      writeWorkbenchMetadata(metadataPath, targetPath, patchSetFile, originalSha256, patchedSha256);
    }
    return { created: false, refreshed: false };
  }

  fs.writeFileSync(backupPath, original, 'utf8');
  writeWorkbenchMetadata(metadataPath, targetPath, patchSetFile, originalSha256, patchedSha256);

  return {
    created: !backupExists,
    refreshed: backupExists
  };
}

function writeWorkbenchMetadata(metadataPath, targetPath, patchSetFile, originalSha256, patchedSha256) {
  const metadata = {
    targetPath,
    patchSetFile,
    originalSha256,
    patchedSha256,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function syncProductChecksum(appRoot, patchSetFile, content) {
  const checksumKey = patchSetFile.startsWith('out/') ? patchSetFile.slice(4) : patchSetFile;
  const productPath = resolvePatchTarget(appRoot, PRODUCT_FILE);
  if (!fs.existsSync(productPath)) {
    return 0;
  }

  const product = readJsonIfExists(productPath);
  if (!product?.checksums || typeof product.checksums[checksumKey] !== 'string') {
    return 0;
  }

  const nextChecksum = sha256Base64NoPadding(content);
  if (product.checksums[checksumKey] === nextChecksum) {
    return 0;
  }

  const backupPath = `${productPath}${PRODUCT_BACKUP_SUFFIX}`;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(productPath, backupPath);
  }

  product.checksums[checksumKey] = nextChecksum;
  fs.writeFileSync(productPath, `${JSON.stringify(product, null, '\t')}\n`, 'utf8');
  return 1;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256Base64NoPadding(value) {
  return crypto.createHash('sha256').update(value).digest('base64').replace(/=+$/, '');
}

function expandHome(value) {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

module.exports = {
  WORKBENCH_BACKUP_SUFFIX,
  applyWorkbenchPatch,
  inspectWorkbenchPatch,
  loadPatchSets,
  resolveCursorAppRoot,
  revertWorkbenchPatch,
  validatePatchSets
};