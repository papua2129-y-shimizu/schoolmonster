const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
let day = '2026-09-18';
let scores = [];
let data;
let sequence = 0;
const config = {
  HP_1: 7000, HP_2: 8500, HP_3: 10000, DAMAGE_MULTIPLIER: 20,
  BONUS_LEARNING: 100, BONUS_LIFE: 50, BONUS_COOPERATION: 100,
  DRIVE_FOLDER_ID: 'folder', HOLIDAYS: ''
};
const context = vm.createContext({
  console: { error() {} }, Date, Math, Number, String, Array, Object,
  Utilities: { getUuid: () => `uuid-${++sequence}` },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  DriveApp: { getFileById() { throw new Error('no access'); }, getFolderById() { throw new Error('bad ID'); } },
  MimeType: { PNG: 'image/png' }
});
for (const name of ['Config.gs', 'Logic.gs', 'MonsterService.gs', 'BattleService.gs']) {
  vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
}
context.todayKey = () => day;
context.settings = () => config;
context.scoresForDate = () => scores;
context.dashboard = () => ({ ok: true });
context.rows = name => data[name].map((row, index) => ({ ...row, _row: index + 2 }));
context.appendRow = (name, row) => { data[name].push({ ...row }); };
context.writeRow = (name, rowNumber, row) => { data[name][rowNumber - 2] = { ...row }; };
context.table = name => ({ deleteRow(rowNumber) { data[name].splice(rowNumber - 2, 1); } });

function reset(options = {}) {
  day = options.day || '2026-09-18';
  scores = options.scores || [];
  data = {
    Monsters: [{ monsterId: 'm1', name: 'スクモン', driveFileId: 'f1' }],
    Challenges: [{ challengeId: 'c1', monsterId: 'm1', difficulty: 1, maxHp: options.hp || 7000,
      currentHp: options.hp || 7000, startDate: '2026-09-14', endDate: '', status: 'active',
      totalDamage: 0, maxCombo: 0, firstAverage: '', lastAverage: '', highestAverage: '', comboCount: 0 }],
    DailyStats: options.history || [], BattleHistory: []
  };
}
function attack(bonuses = []) { return context.attackToday(bonuses); }
function history(date, average, bonuses = {}) {
  return { date, monsterId: 'm1', challengeId: 'c1', responseCount: 24, averageScore: average,
    baseDamage: average * 20, comboCount: 0, comboBonus: 0,
    bonusLearning: bonuses.learning || 0, bonusLife: bonuses.life || 0,
    bonusCooperation: bonuses.cooperation || 0, bonusTotal: bonuses.total || 0,
    totalDamage: average * 20 + (bonuses.total || 0),
    hpBefore: 7000, hpAfter: 7000 - average * 20, attacked: true, createdAt: new Date() };
}
function check(name, task) { task(); process.stdout.write(`PASS ${name}\n`); }

check('0件の日は攻撃できない', () => { reset(); assert.throws(attack, /今日の回答/); });
check('1件の日はその回答を平均にする', () => { reset({ scores: [80] }); assert.equal(attack().damage.total, 1600); });
check('24人全員の平均', () => { reset({ scores: Array(24).fill(75) }); assert.equal(attack().average, 75); });
check('欠席者がいても回答者だけで平均', () => { reset({ scores: Array(23).fill(70) }); assert.equal(attack().responseCount, 23); });
check('小数の平均から整数ダメージ', () => { reset({ scores: [80, 85] }); assert.equal(attack().damage.total, 1650); });
check('学習面と協力面のボーナスを加算', () => {
  reset({ scores: [65] });
  const result = attack(['learning', 'cooperation']);
  assert.equal(result.damage.base, 1300);
  assert.equal(result.damage.bonus, 200);
  assert.equal(result.damage.total, 1500);
  assert.equal(data.DailyStats[0].bonusLearning, 100);
  assert.equal(data.DailyStats[0].bonusCooperation, 100);
});
check('同じボーナスは重複加算しない', () => {
  reset({ scores: [60] }); assert.equal(attack(['life', 'life']).damage.bonus, 50);
});
check('3つのボーナスを同時に選べる', () => {
  reset({ scores: [60] }); assert.equal(attack(['learning', 'life', 'cooperation']).damage.bonus, 250);
});
check('不明なボーナスは拒否する', () => {
  reset({ scores: [60] }); assert.throws(() => attack(['unknown']), /選択/);
});
check('月曜が休日なら火曜は前週金曜を直前の登校日とする', () => {
  config.HOLIDAYS = '2026-09-21';
  assert.equal(context.previousSchoolDate('2026-09-22', config), '2026-09-18');
  config.HOLIDAYS = '';
});
check('休日は攻撃できない', () => {
  config.HOLIDAYS = '2026-09-18'; reset({ scores: [80] });
  assert.throws(attack, /休日/); config.HOLIDAYS = '';
});
check('HPちょうど0で討伐', () => {
  reset({ scores: [80], hp: 1600 }); assert.equal(attack().defeated, true); assert.equal(data.Challenges[0].currentHp, 0);
});
check('HP超過ダメージでも負数にしない', () => {
  reset({ scores: [100], hp: 1000 }); attack(); assert.equal(data.Challenges[0].currentHp, 0);
});
check('週末をまたいでも平均点だけで基本ダメージを計算', () => {
  reset({ day: '2026-09-18', scores: [50] }); attack();
  day = '2026-09-21'; scores = [60]; attack();
  assert.equal(data.Challenges[0].currentHp, 7000 - 1000 - 1200);
});
check('同じ日の二重攻撃を防ぐ', () => { reset({ scores: [80] }); attack(); assert.throws(attack, /すでに今日/); });
check('討伐済モンスターに再挑戦', () => {
  reset(); data.Challenges[0].status = 'defeated';
  context.startChallenge('m1', 3);
  assert.equal(data.Challenges[1].maxHp, 10000);
});
check('画像取得失敗は日本語メッセージ', () => { reset(); assert.throws(() => context.monsterImage('m1'), /画像を読み込めません/); });
check('不正なDriveフォルダIDは案内を出す', () => { reset(); assert.throws(() => context.syncMonsters(), /DriveフォルダID/); });
check('攻撃取消でHPと状態を復元', () => {
  reset({ scores: [100], hp: 1000 }); attack(); context.undoToday();
  assert.equal(data.Challenges[0].currentHp, 1000);
  assert.equal(data.Challenges[0].status, 'active');
  assert.equal(data.DailyStats.length, 0);
});

for (const name of ['DataService.gs', 'WebApp.gs']) {
  new vm.Script(fs.readFileSync(path.join(root, name), 'utf8'), { filename: name });
  process.stdout.write(`PASS ${name} 構文\n`);
}
const client = fs.readFileSync(path.join(root, 'Client.html'), 'utf8');
new vm.Script(client.replace(/^<script>\s*|\s*<\/script>\s*$/g, ''), { filename: 'Client.html' });
process.stdout.write('PASS Client.html 構文\n');
