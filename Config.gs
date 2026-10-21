const TABLES = Object.freeze({
  Monsters: ['monsterId', 'name', 'description', 'driveFileId', 'fileName', 'createdAt', 'updatedAt'],
  Challenges: ['challengeId', 'monsterId', 'difficulty', 'maxHp', 'currentHp', 'startDate', 'endDate', 'status', 'totalDamage', 'maxCombo', 'firstAverage', 'lastAverage', 'highestAverage', 'comboCount'],
  DailyStats: ['date', 'monsterId', 'challengeId', 'responseCount', 'averageScore', 'baseDamage', 'comboCount', 'comboBonus', 'totalDamage', 'hpBefore', 'hpAfter', 'attacked', 'createdAt', 'bonusLearning', 'bonusLife', 'bonusCooperation', 'bonusTotal'],
  BattleHistory: ['eventId', 'challengeId', 'date', 'action', 'damage', 'createdAt'],
  Settings: ['key', 'value']
});

const DEFAULTS = Object.freeze({
  DRIVE_FOLDER_ID: '',
  RESPONSE_SHEET_NAME: '',
  SCORE_COLUMN: '',
  TIMESTAMP_COLUMN: '',
  HP_1: 7000,
  HP_2: 8500,
  HP_3: 10000,
  DAMAGE_MULTIPLIER: 20,
  BONUS_LEARNING: 100,
  BONUS_LEARNING_LABEL: '学習面',
  BONUS_LEARNING_DETAIL: '宿題・授業準備',
  BONUS_LIFE: 50,
  BONUS_LIFE_LABEL: '生活面',
  BONUS_LIFE_DETAIL: '整理整頓・切り替え',
  BONUS_COOPERATION: 100,
  BONUS_COOPERATION_LABEL: '協力面',
  BONUS_COOPERATION_DETAIL: '助け合い・めあて達成',
  HOLIDAYS: '',
  SOUND_ON: true
});

const SCORE_QUESTION = '今日、自分はこのスクモンにどのくらい勝てましたか？';
const SPREADSHEET_PROPERTY = 'SUKUMON_SPREADSHEET_ID';

function todayKey() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function dateKey(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(value || '').slice(0, 10);
}

function numberSetting(settings, key) {
  const value = Number(settings[key]);
  if (!Number.isFinite(value) || value < 0) throw new Error('設定値が正しくありません: ' + key);
  return value;
}

function publicError(error) {
  console.error(error && error.stack ? error.stack : error);
  const message = error && error.message ? error.message : '';
  if (/^設定値|^回答|^今日|^すでに|^現在|^画像|^挑戦|^モンスター|^保存|^操作|^スプレッドシート|^Drive|^ボーナス/.test(message)) throw new Error(message);
  throw new Error('処理を完了できませんでした。設定とフォームの回答を確認してください。');
}
