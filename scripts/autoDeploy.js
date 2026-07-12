import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const debounceMs = 2500;
const packageManager = process.env.npm_execpath || 'pnpm';
const safeAddPaths = [
  'src',
  'server',
  'scripts',
  'index.html',
  'vite.config.js',
  'package.json',
  'pnpm-lock.yaml',
  'render.yaml',
  '.env.example',
  'README.md'
];
const ignoredPathParts = new Set([
  '.git',
  'node_modules',
  '.pnpm-store',
  'dist',
  'server/data'
]);
const forbiddenFileNames = new Set(['.env']);
const forbiddenExtensions = new Set(['.pem', '.key', '.p12']);

let deployTimer;
let isDeploying = false;
let pendingDeploy = false;

function log(message) {
  console.log(`[auto-deploy] ${message}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: false
    });

    let stdout = '';
    let stderr = '';

    if (options.capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(`${command} ${args.join(' ')} failed with code ${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

function isIgnoredPath(filePath) {
  const normalized = filePath.split(path.sep).join('/');
  return [...ignoredPathParts].some((part) => normalized === part || normalized.startsWith(`${part}/`));
}

function isForbiddenFile(filePath) {
  const fileName = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();
  return forbiddenFileNames.has(fileName) || forbiddenExtensions.has(extension);
}

function isSuspiciousStagedFile(filePath) {
  const normalized = filePath.split(path.sep).join('/');

  if (isForbiddenFile(normalized)) return true;
  if (normalized.endsWith('.json') && normalized !== 'package.json' && normalized !== 'package-lock.json') {
    return true;
  }

  return false;
}

function scheduleDeploy(reason) {
  if (isIgnoredPath(reason) || isForbiddenFile(reason)) return;

  clearTimeout(deployTimer);
  deployTimer = setTimeout(() => {
    deploy(reason).catch((error) => {
      log(`Ошибка публикации: ${error.message}`);
    });
  }, debounceMs);
}

async function deploy(reason) {
  if (isDeploying) {
    pendingDeploy = true;
    log('Изменения сохранены во время публикации. Повторю после завершения текущей.');
    return;
  }

  isDeploying = true;
  pendingDeploy = false;

  try {
    log(`Обнаружено сохранение: ${reason}`);
    log('Проверяю сборку...');
    await run(packageManager, ['run', 'build']);

    log('Готовлю безопасные файлы для Git...');
    await run('git', ['add', ...safeAddPaths]);

    const staged = await run('git', ['diff', '--cached', '--name-only'], { capture: true });
    const stagedFiles = staged.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (stagedFiles.length === 0) {
      log('Нет новых изменений для публикации.');
      return;
    }

    const suspiciousFiles = stagedFiles.filter(isSuspiciousStagedFile);
    if (suspiciousFiles.length > 0) {
      await run('git', ['restore', '--staged', ...suspiciousFiles]);
      throw new Error(`Остановлено: похожие на секреты файлы не будут отправлены (${suspiciousFiles.join(', ')})`);
    }

    const date = new Date();
    const stamp = date.toLocaleString('ru-RU', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      year: 'numeric'
    });

    log('Создаю коммит...');
    await run('git', ['commit', '-m', `Auto deploy ${stamp}`]);

    log('Отправляю в GitHub...');
    await run('git', ['push', 'origin', 'main']);

    log('Готово. Render начнет обновлять сайт автоматически.');
  } finally {
    isDeploying = false;

    if (pendingDeploy) {
      scheduleDeploy('повторная публикация после новых изменений');
    }
  }
}

function startWatching() {
  log('Режим автопубликации включен.');
  log('Сохраняйте файлы в VS Code. После сохранения будет build, commit и push.');
  log('Не закрывайте это окно терминала, пока нужен автодеплой.');

  const watcher = fs.watch(rootDir, { recursive: true }, (_eventType, fileName) => {
    if (!fileName) return;
    scheduleDeploy(String(fileName));
  });

  process.on('SIGINT', () => {
    watcher.close();
    log('Режим автопубликации выключен.');
    process.exit(0);
  });
}

startWatching();
