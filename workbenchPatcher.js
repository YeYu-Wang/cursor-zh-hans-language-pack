const fs = require('fs');
const os = require('os');
const path = require('path');

const WORKBENCH_BACKUP_SUFFIX = '.cursor-zh-hans-workbench.bak';
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
      continue;
    }

    const backupPath = `${targetPath}${WORKBENCH_BACKUP_SUFFIX}`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(targetPath, backupPath);
      result.createdBackups += 1;
    }

    fs.writeFileSync(targetPath, next, 'utf8');
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
    missingBackups: []
  };

  for (const patchSet of patchSets) {
    const targetPath = resolvePatchTarget(appRoot, patchSet.file);
    const backupPath = `${targetPath}${WORKBENCH_BACKUP_SUFFIX}`;
    if (!fs.existsSync(backupPath)) {
      result.missingBackups.push(patchSet.file);
      continue;
    }

    fs.copyFileSync(backupPath, targetPath);
    fs.rmSync(backupPath, { force: true });
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
    return expandHome(configured);
  }

  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'app'));
  }

  if (process.execPath) {
    candidates.push(path.join(path.dirname(process.execPath), 'resources', 'app'));
  }

  if (process.platform === 'win32') {
    candidates.push(path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'cursor', 'resources', 'app'));
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Cursor.app/Contents/Resources/app');
  } else {
    candidates.push('/usr/share/cursor/resources/app');
    candidates.push('/opt/Cursor/resources/app');
    candidates.push('/opt/cursor/resources/app');
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
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