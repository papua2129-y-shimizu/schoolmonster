function dataBook() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートが未設定です。先に setupApp を実行してください。');
  return SpreadsheetApp.openById(id);
}

function table(name) {
  const sheet = dataBook().getSheetByName(name);
  if (!sheet) throw new Error('スプレッドシートの ' + name + ' シートがありません。');
  return sheet;
}

function ensureSchema() {
  const book = dataBook();
  Object.keys(TABLES).forEach(name => {
    let sheet = book.getSheetByName(name);
    if (!sheet) sheet = book.insertSheet(name);
    sheet.getRange(1, 1, 1, TABLES[name].length).setValues([TABLES[name]]);
    sheet.setFrozenRows(1);
  });
}

function rows(name) {
  const sheet = table(name);
  if (sheet.getLastRow() < 2) return [];
  const headers = TABLES[name];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map((values, index) => {
    const row = { _row: index + 2 };
    headers.forEach((header, i) => { row[header] = values[i]; });
    return row;
  });
}

function appendRow(name, value) {
  table(name).appendRow(TABLES[name].map(key => value[key] === undefined ? '' : value[key]));
}

function writeRow(name, rowNumber, value) {
  table(name).getRange(rowNumber, 1, 1, TABLES[name].length)
    .setValues([TABLES[name].map(key => value[key] === undefined ? '' : value[key])]);
}

function settings() {
  const result = Object.assign({}, DEFAULTS);
  rows('Settings').forEach(row => {
    if (Object.prototype.hasOwnProperty.call(result, row.key)) {
      result[row.key] = row.value === '' ? DEFAULTS[row.key] : row.value;
    }
  });
  return result;
}

function saveSettings(input) {
  try {
    const sheet = table('Settings');
    const current = settings();
    const next = Object.assign({}, current);
    Object.keys(DEFAULTS).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(input, key)) return;
      const value = input[key];
      if (typeof DEFAULTS[key] === 'number') {
        if (value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('設定値が正しくありません: ' + key);
        if ((/^(HP_|BONUS_)/.test(key) || key === 'CLASS_SIZE') && !Number.isInteger(Number(value))) {
          throw new Error('設定値が正しくありません: ' + key);
        }
        if (key === 'CLASS_SIZE' && Number(value) < 1) throw new Error('設定値が正しくありません: ' + key);
        next[key] = Number(value);
      } else if (typeof DEFAULTS[key] === 'boolean') {
        next[key] = value === true || value === 'true';
      } else {
        next[key] = String(value || '').trim();
        if (key === 'HOLIDAYS') {
          const dates = next[key].split(',').map(item => item.trim()).filter(Boolean);
          if (dates.some(item => !/^\d{4}-\d{2}-\d{2}$/.test(item))) throw new Error('設定値が正しくありません: HOLIDAYS');
          next[key] = [...new Set(dates)].sort().join(',');
        }
      }
    });
    if (next.DRIVE_FOLDER_ID) {
      try { DriveApp.getFolderById(next.DRIVE_FOLDER_ID).getName(); }
      catch (error) { throw new Error('DriveフォルダIDを確認してください。'); }
    }
    const existing = rows('Settings');
    Object.keys(DEFAULTS).forEach(key => {
      const value = { key, value: next[key] };
      const found = existing.find(row => row.key === key);
      if (found) writeRow('Settings', found._row, value);
      else appendRow('Settings', value);
    });
    return next;
  } catch (error) { publicError(error); }
}

function setupApp(folderId) {
  try {
    const props = PropertiesService.getScriptProperties();
    let id = props.getProperty(SPREADSHEET_PROPERTY);
    let book;
    if (id) book = SpreadsheetApp.openById(id);
    else {
      book = SpreadsheetApp.create('スクモン討伐アプリ データ');
      props.setProperty(SPREADSHEET_PROPERTY, book.getId());
    }
    Object.keys(TABLES).forEach(name => {
      let sheet = book.getSheetByName(name);
      if (!sheet) sheet = book.insertSheet(name);
      sheet.getRange(1, 1, 1, TABLES[name].length).setValues([TABLES[name]]);
      sheet.setFrozenRows(1);
    });
    const blank = book.getSheetByName('Sheet1') || book.getSheetByName('シート1');
    if (blank && book.getSheets().length > 1 && blank.getLastRow() === 0) book.deleteSheet(blank);
    if (rows('Settings').length === 0) saveSettings(DEFAULTS);
    if (folderId) saveSettings({ DRIVE_FOLDER_ID: folderId });
    let formUrl = props.getProperty('SUKUMON_FORM_URL');
    if (!formUrl) {
      const form = FormApp.create('スクモン 今日のふり返り');
      const choices = Array.from({ length: 21 }, (_, i) => String(i * 5));
      form.addMultipleChoiceItem().setTitle(SCORE_QUESTION).setChoiceValues(choices).setRequired(true);
      form.setCollectEmail(true);
      form.setDestination(FormApp.DestinationType.SPREADSHEET, book.getId());
      formUrl = form.getPublishedUrl();
      props.setProperty('SUKUMON_FORM_URL', formUrl);
      props.setProperty('SUKUMON_FORM_ID', form.getId());
    } else {
      enableEmailCollection();
    }
    if (settings().DRIVE_FOLDER_ID) syncMonsters();
    return { spreadsheetUrl: book.getUrl(), formUrl, monsterCount: rows('Monsters').length };
  } catch (error) { publicError(error); }
}

function enableEmailCollection() {
  try {
    const formId = PropertiesService.getScriptProperties().getProperty('SUKUMON_FORM_ID');
    if (!formId) throw new Error('フォームが未設定です。先に setupApp を実行してください。');
    const form = FormApp.openById(formId);
    form.setCollectEmail(true);
    return { enabled: form.collectsEmail(), formUrl: form.getPublishedUrl() };
  } catch (error) { publicError(error); }
}

function responseSheet(config) {
  const book = dataBook();
  if (config.RESPONSE_SHEET_NAME) {
    const selected = book.getSheetByName(config.RESPONSE_SHEET_NAME);
    if (!selected) throw new Error('回答シート名を確認してください。');
    return selected;
  }
  const matches = book.getSheets().filter(sheet => {
    if (Object.prototype.hasOwnProperty.call(TABLES, sheet.getName()) || sheet.getLastColumn() < 2) return false;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    return headers.some(header => header === SCORE_QUESTION);
  });
  if (matches.length !== 1) throw new Error('回答シートを確認してください。設定画面でシート名を指定できます。');
  return matches[0];
}

function columnIndex(spec, headers, candidates) {
  if (spec) {
    if (/^[A-Za-z]+$/.test(String(spec))) {
      return String(spec).toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    }
    return headers.indexOf(String(spec));
  }
  return headers.findIndex(header => candidates.some(candidate => candidate === header));
}

function responsesForDate(day, config) {
  const sheet = responseSheet(config);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(String);
  const scoreCol = columnIndex(config.SCORE_COLUMN, headers, [SCORE_QUESTION]);
  const timeCol = columnIndex(config.TIMESTAMP_COLUMN, headers, ['タイムスタンプ', 'Timestamp']);
  const emailCol = columnIndex('', headers, ['メールアドレス', 'Email Address']);
  if (scoreCol < 0 || timeCol < 0 || emailCol < 0 || scoreCol >= headers.length ||
      timeCol >= headers.length || emailCol >= headers.length) {
    throw new Error('回答のメールアドレス列・日時列・点数列を確認してください。');
  }
  const latest = new Map();
  data.slice(1).forEach((row, index) => {
    if (dateKey(row[timeCol]) !== day) return;
    const email = String(row[emailCol] || '').trim().toLowerCase();
    const score = Number(row[scoreCol]);
    if (!email || !Number.isFinite(score) || score < 0 || score > 100 || score % 5 !== 0) return;
    const timestamp = row[timeCol] instanceof Date ? row[timeCol].getTime() : new Date(row[timeCol]).getTime();
    const previous = latest.get(email);
    if (!previous || !Number.isFinite(timestamp) || timestamp >= previous.timestamp) {
      latest.set(email, { score, timestamp: Number.isFinite(timestamp) ? timestamp : index });
    }
  });
  return [...latest].map(([email, item]) => ({ email, score: item.score }));
}

function scoresForDate(day, config) {
  return responsesForDate(day, config).map(item => item.score);
}

function missingNumbersForDate(responses) {
  const sheet = dataBook().getSheetByName('児童名簿番号だけ');
  if (!sheet || sheet.getLastRow() === 0) throw new Error('児童名簿番号だけ シートがありません。');
  const values = sheet.getRange(1, 1, sheet.getLastRow(), 3).getValues();
  if (values.length < 2 || values[0][0] !== '出席番号' || values[0][1] !== 'メールアドレス' || values[0][2] !== '在籍') {
    throw new Error('児童名簿番号だけ のA～C列の見出しを確認してください。');
  }
  const roster = values.slice(1).filter(row => row.some(value => value !== ''));
  const active = roster.filter(row => row[2] === true || String(row[2]).trim().toUpperCase() === 'TRUE');
  const numbers = active.map(row => String(row[0]).trim());
  const emails = active.map(row => String(row[1]).trim().toLowerCase());
  if (!active.length || numbers.some(number => !/^\d+$/.test(number)) || emails.some(email => !email.includes('@')) ||
      new Set(numbers).size !== numbers.length || new Set(emails).size !== emails.length) {
    throw new Error('児童名簿番号だけ の在籍児童の番号・メールアドレスを確認してください。');
  }
  const answered = new Set(responses.map(item => item.email));
  return {
    numbers: active.filter((row, index) => !answered.has(emails[index]))
      .map(row => Number(row[0])).sort((a, b) => a - b),
    rosterCount: active.length,
    unmatchedCount: responses.filter(item => !emails.includes(item.email)).length
  };
}
