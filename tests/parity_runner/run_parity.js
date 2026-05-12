import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const jsRoot = path.join(repoRoot, 'sdk', 'js');
const pyRoot = path.join(repoRoot, 'sdk', 'python');

const scenarios = [
  'normal_chat',
  'streaming_chat',
  'reconnect_resync',
  'auth_refresh',
  'file_upload',
  'liveness',
];

function runCommand(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
  });
  return result;
}

function runJsScenario(scenario, resultPath) {
  return runCommand(
    process.execPath,
    [
      '--experimental-vm-modules',
      path.join(jsRoot, 'node_modules', 'jest', 'bin', 'jest.js'),
      'tests/parity_adapter.test.ts',
      '--runInBand',
      '--silent',
    ],
    jsRoot,
    {
      PARITY_SCENARIO: scenario,
      PARITY_RESULT_PATH: resultPath,
    },
  );
}

function runPyScenario(scenario, resultPath) {
  return runCommand(
    'python',
    ['-m', 'pytest', 'tests/test_parity_adapter.py', '-q'],
    pyRoot,
    {
      PARITY_SCENARIO: scenario,
      PARITY_RESULT_PATH: resultPath,
    },
  );
}

function loadResult(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function compareResults(jsResult, pyResult) {
  const diffs = [];
  const jsTypes = jsResult.messages_received.map((message) => message.type);
  const pyTypes = pyResult.messages_received.map((message) => message.type);

  if (JSON.stringify(jsTypes) !== JSON.stringify(pyTypes)) {
    diffs.push(`messages_received mismatch: js=${JSON.stringify(jsTypes)} py=${JSON.stringify(pyTypes)}`);
  }

  if (jsResult.session_state_final !== pyResult.session_state_final) {
    diffs.push(`session_state_final mismatch: js=${jsResult.session_state_final} py=${pyResult.session_state_final}`);
  }

  if (JSON.stringify(jsResult.errors_received) !== JSON.stringify(pyResult.errors_received)) {
    diffs.push(`errors_received mismatch: js=${JSON.stringify(jsResult.errors_received)} py=${JSON.stringify(pyResult.errors_received)}`);
  }

  return {
    pass: diffs.length === 0,
    diffs,
  };
}

mkdirSync(path.join(repoRoot, 'sdk', 'tests', 'parity_runner'), { recursive: true });
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'cortex-parity-'));
const rows = [];
let hasFailure = false;

try {
  for (const scenario of scenarios) {
    const jsResultPath = path.join(tempDir, `${scenario}.js.json`);
    const pyResultPath = path.join(tempDir, `${scenario}.py.json`);

    const jsRun = runJsScenario(scenario, jsResultPath);
    const pyRun = runPyScenario(scenario, pyResultPath);

    const jsStatus = jsRun.status === 0 ? 'PASS' : 'FAIL';
    const pyStatus = pyRun.status === 0 ? 'PASS' : 'FAIL';

    let parityStatus = 'FAIL';
    let detail = '';

    if (jsRun.status === 0 && pyRun.status === 0) {
      const jsResult = loadResult(jsResultPath);
      const pyResult = loadResult(pyResultPath);
      const comparison = compareResults(jsResult, pyResult);
      parityStatus = comparison.pass ? 'PASS' : 'FAIL';
      detail = comparison.pass
        ? `channel js=${jsResult.channel_state_final} py=${pyResult.channel_state_final}; callbacks js=${jsResult.callback_call_count} py=${pyResult.callback_call_count}`
        : comparison.diffs.join(' | ');
    } else {
      const jsError = jsRun.status === 0 ? '' : (jsRun.stderr || jsRun.stdout).trim();
      const pyError = pyRun.status === 0 ? '' : (pyRun.stderr || pyRun.stdout).trim();
      detail = [jsError && `js: ${jsError}`, pyError && `py: ${pyError}`].filter(Boolean).join(' | ');
    }

    if (jsStatus !== 'PASS' || pyStatus !== 'PASS' || parityStatus !== 'PASS') {
      hasFailure = true;
    }

    rows.push({
      scenario,
      js: jsStatus,
      python: pyStatus,
      parity: parityStatus,
      detail,
    });
  }

  console.table(rows);

  if (hasFailure) {
    process.exitCode = 1;
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
