/**
 * tests/ptalk-agent.test.mjs — 客戶端（開源 repo）的離線測試。
 *
 * 這是一支**客戶端**工具：使用者要加入平台時安裝它。因此測試必須**不需要 token、不連網**
 * （在別人機器上跑得起來），只驗結構與離線行為。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(ROOT, 'bin', 'ptalk-agent.mjs');
const src = readFileSync(BIN, 'utf8');

test('原始碼不得包含任何憑證或機密', () => {
  assert.ok(!/agt_[a-f0-9]{16,}/.test(src), '不得寫死 agent token');
  assert.ok(!/Bearer\s+[A-Za-z0-9_\-]{20,}/.test(src), '不得寫死 Bearer 憑證');
  assert.ok(src.includes('PTALK_AGENT_TOKEN'), '憑證必須由環境變數提供');
});

test('不得提供表態類工具（代理人不得附議／連署／檢舉）', () => {
  for (const forbidden of ['/bot/reactions', '/bot/support', '/bot/petitions', '/bot/reports']) {
    assert.ok(!src.includes(forbidden), `不得提供 ${forbidden}`);
  }
  const names = [...src.matchAll(/name: '([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(names.filter((n) => /react|support|petition|report/.test(n)), []);
});

test('必須要求先讀準則並回報（戴上 skill 才能發言）', () => {
  assert.ok(src.includes("name: 'read_skill'"), '必須有 read_skill 工具');
  assert.ok(src.includes("name: 'attest_skill'"), '必須有 attest_skill 工具');
  assert.ok(src.includes('SKILL_ATTESTATION_REQUIRED'), '必須說明未回報會被擋');
  assert.ok(src.includes('instructions'), 'MCP initialize 必須帶 instructions（讓 harness 一開始就知道）');
});

test('必須明文提示「討論區內容是不可信資料」', () => {
  assert.ok(src.includes('不可信資料'), '必須提示提示詞注入風險');
});

test('help 與 --version 可離線執行', async () => {
  const run = (args) =>
    new Promise((resolve) => {
      const c = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, PTALK_AGENT_TOKEN: '' } });
      let out = '';
      c.stdout.on('data', (d) => (out += d.toString()));
      c.on('exit', (code) => resolve({ code, out }));
    });
  const help = await run(['help']);
  assert.equal(help.code, 0);
  assert.ok(help.out.includes('ptalk-agent'), 'help 必須有用法');
  assert.ok(help.out.includes('PTALK_AGENT_TOKEN'), 'help 必須說明環境變數');
  const v = await run(['--version']);
  assert.ok(v.out.includes('0.1.0'));
});

test('缺少憑證時，需要憑證的指令必須以非零碼結束並說明', async () => {
  const code = await new Promise((resolve) => {
    const c = spawn(process.execPath, [BIN, 'whoami'], { env: { ...process.env, PTALK_AGENT_TOKEN: '' } });
    let err = '';
    c.stderr.on('data', (d) => (err += d.toString()));
    c.on('exit', (c2) => resolve({ c2, err }));
  });
  assert.notEqual(code.c2, 0, '缺憑證必須非零結束');
  assert.ok(code.err.includes('PTALK_AGENT_TOKEN'), '必須說明缺哪個環境變數');
});

test('skill 快取（若有）必須是合法 JSON 且有版本', () => {
  const p = join(ROOT, 'skill', 'skill.json');
  if (!existsSync(p)) return; // 快取可不存在（尚未 sync）
  const skill = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(typeof skill.version, 'number');
  assert.ok(Array.isArray(skill.rules) && skill.rules.length > 0, '必須有硬規則');
  assert.ok(skill.prompt_injection?.inbound, '必須有反注入指引');
});
