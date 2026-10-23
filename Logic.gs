// 純粋な計算をここにまとめ、フォームやシートに依存せず検証できるようにする。
function averageScore(scores) {
  if (!scores.length) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function responseReadiness(responseCount, expectedCount) {
  const count = Math.max(0, Math.floor(Number(responseCount) || 0));
  const target = Math.max(1, Math.floor(Number(expectedCount) || 0));
  return { count, target, remaining: Math.max(0, target - count), complete: count >= target };
}

function classBonusForDay(selected, settings) {
  const allowed = {
    learning: 'BONUS_LEARNING', life: 'BONUS_LIFE', cooperation: 'BONUS_COOPERATION'
  };
  const keys = Array.isArray(selected) ? [...new Set(selected.map(String))] : [];
  if (keys.some(key => !allowed[key])) {
    throw new Error('ボーナスの選択を確認してください。');
  }
  const values = { learning: 0, life: 0, cooperation: 0 };
  keys.forEach(key => { values[key] = numberSetting(settings, allowed[key]); });
  return { selected: keys, values, total: Object.values(values).reduce((sum, value) => sum + value, 0) };
}

function damageForDay(average, selected, settings) {
  const base = Math.round(average * numberSetting(settings, 'DAMAGE_MULTIPLIER'));
  const classBonus = classBonusForDay(selected, settings);
  return { base, bonus: classBonus.total, total: base + classBonus.total, classBonus };
}

function previousDate(day) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function holidayDates(settings) {
  return String(settings.HOLIDAYS || '').split(',').map(value => value.trim())
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isSchoolDay(day, settings) {
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
  return weekday >= 1 && weekday <= 5 && !holidayDates(settings).includes(day);
}

function previousSchoolDate(day, settings) {
  let candidate = previousDate(day);
  while (!isSchoolDay(candidate, settings)) candidate = previousDate(candidate);
  return candidate;
}

function weekDates(day) {
  const date = new Date(day + 'T12:00:00Z');
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));
  return Array.from({ length: 5 }, (_, index) => {
    const current = new Date(date);
    current.setUTCDate(current.getUTCDate() + index);
    return current.toISOString().slice(0, 10);
  });
}

function inclusiveDays(start, end) {
  return Math.floor((new Date(end + 'T12:00:00Z') - new Date(start + 'T12:00:00Z')) / 86400000) + 1;
}
