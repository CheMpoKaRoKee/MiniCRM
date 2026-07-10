const SPREADSHEET_ID = '169tUJfh8pSz6nzTpUgRl44ghFfYY-J19TAcML7pt2JA';
const TZ = 'Europe/Moscow';

const SHEET_CLIENTS = 'Clients';
const SHEET_SETTINGS = 'Settings';
const SHEET_LOGS = 'Logs';

const CLIENT_HEADERS = [
  'client_id',
  'name',
  'primary_phone',
  'alt_phone',
  'telegram',
  'email',
  'preferred_contact',
  'legal_status',
  'created_at',
  'updated_at',
  'comment',
  'notification_sent_at',
  'notification_status'
];

const LEGAL_STATUSES = [
  'Новая заявка',
  'Первичный контакт',
  'Консультация назначена',
  'Документы запрошены',
  'Документы получены',
  'Правовой анализ',
  'Документ в подготовке',
  'В работе',
  'Ожидаем клиента',
  'Ожидаем третью сторону/суд',
  'Закрыт успешно',
  'Закрыт без сделки',
  'Отложен'
];

const CONTACT_METHODS = [
  'Телефон',
  'Второй телефон',
  'Telegram',
  'Email'
];

function doGet() {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Юридическая CRM — клиенты')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getBootstrapData() {
  try {
    ensureBaseStructure_();
    const clients = getClients_();

    return {
      ok: true,
      error: '',
      clients: clients,
      counts: countStatuses_(clients),
      statuses: LEGAL_STATUSES,
      contactMethods: CONTACT_METHODS,
      settings: getPublicSettings_(),
      updatedAt: now_(),
      debug: {
        spreadsheetId: SPREADSHEET_ID,
        clientsCount: clients.length,
        statusesCount: LEGAL_STATUSES.length,
        contactMethodsCount: CONTACT_METHODS.length
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error && error.message ? error.message : error),
      clients: [],
      counts: {},
      statuses: LEGAL_STATUSES,
      contactMethods: CONTACT_METHODS,
      settings: {
        notify_on_new_client: 'TRUE',
        notification_channel: 'Email',
        lawyer_email_is_set: false
      },
      updatedAt: now_(),
      debug: {
        spreadsheetId: SPREADSHEET_ID,
        clientsCount: 0,
        statusesCount: LEGAL_STATUSES.length,
        contactMethodsCount: CONTACT_METHODS.length
      }
    };
  }
}

function addClient(payload) {
  ensureBaseStructure_();

  const client = normalizeClientPayload_(payload);
  validateClient_(client);

  const sheet = getSheet_(SHEET_CLIENTS);
  const headers = getHeaders_(sheet);
  const rowNumber = sheet.getLastRow() + 1;
  const currentTime = now_();

  const rowObject = {
    client_id: getNextClientId_(),
    name: client.name,
    primary_phone: client.primary_phone,
    alt_phone: client.alt_phone,
    telegram: client.telegram,
    email: client.email,
    preferred_contact: client.preferred_contact,
    legal_status: client.legal_status,
    created_at: currentTime,
    updated_at: currentTime,
    comment: client.comment,
    notification_sent_at: '',
    notification_status: ''
  };

  sheet.appendRow(headers.map(function(header) {
    return rowObject[header] || '';
  }));

  const notificationResult = sendClientNotification_(rowObject);
  setClientNotificationResult_(sheet, headers, rowNumber, notificationResult);

  log_('add_client', rowObject.client_id, 'success', {
    name: rowObject.name,
    legal_status: rowObject.legal_status,
    notification_status: notificationResult.status
  });

  return getBootstrapData();
}

function updateClient(clientId, patch) {
  ensureBaseStructure_();

  if (!clientId) throw new Error('Не указан client_id.');

  const found = findClientRow_(clientId);
  if (!found) throw new Error('Клиент не найден: ' + clientId);

  const headers = found.headers;
  const row = found.rowValues.slice();
  const editableFields = [
    'name',
    'primary_phone',
    'alt_phone',
    'telegram',
    'email',
    'preferred_contact',
    'legal_status',
    'comment'
  ];

  editableFields.forEach(function(field) {
    if (Object.prototype.hasOwnProperty.call(patch || {}, field)) {
      const index = headers.indexOf(field);
      if (index !== -1) row[index] = clean_(patch[field]);
    }
  });

  const name = row[headers.indexOf('name')];
  const primaryPhone = row[headers.indexOf('primary_phone')];
  const legalStatus = row[headers.indexOf('legal_status')];
  const preferredContact = row[headers.indexOf('preferred_contact')];

  if (!name) throw new Error('Имя клиента обязательно.');
  if (!primaryPhone) throw new Error('Основной телефон обязателен.');
  if (LEGAL_STATUSES.indexOf(legalStatus) === -1) throw new Error('Недопустимый юридический статус: ' + legalStatus);
  if (CONTACT_METHODS.indexOf(preferredContact) === -1) throw new Error('Недопустимый способ связи: ' + preferredContact);

  const updatedAtIndex = headers.indexOf('updated_at');
  if (updatedAtIndex !== -1) row[updatedAtIndex] = now_();

  found.sheet.getRange(found.rowIndex, 1, 1, headers.length).setValues([row]);

  log_('update_client', clientId, 'success', {
    legal_status: legalStatus,
    preferred_contact: preferredContact
  });

  return getBootstrapData();
}

function resendClientNotification(clientId) {
  ensureBaseStructure_();

  if (!clientId) throw new Error('Не указан client_id.');

  const found = findClientRow_(clientId);
  if (!found) throw new Error('Клиент не найден: ' + clientId);

  const client = rowToObject_(found.headers, found.rowValues);
  const result = sendClientNotification_(client);

  setClientNotificationResult_(found.sheet, found.headers, found.rowIndex, result);

  log_('resend_notification', clientId, result.status, {
    sentAt: result.sentAt || ''
  });

  return getBootstrapData();
}

function setupPrototypeSheets() {
  ensureBaseStructure_();

  return {
    ok: true,
    message: 'Готово: структура таблицы проверена и подготовлена.',
    spreadsheetId: SPREADSHEET_ID,
    updatedAt: now_()
  };
}

function debugBootstrapData() {
  ensureBaseStructure_();

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const clientsSheet = ss.getSheetByName(SHEET_CLIENTS);
  const settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  const logsSheet = ss.getSheetByName(SHEET_LOGS);
  const clients = getClients_();

  const clientsValues = clientsSheet
    ? clientsSheet.getDataRange().getValues().map(function(row) {
        return row.map(normalizeSheetValue_);
      })
    : [];

  const settingsValues = settingsSheet
    ? settingsSheet.getDataRange().getValues().map(function(row) {
        return row.map(normalizeSheetValue_);
      })
    : [];

  return {
    ok: true,
    spreadsheetId: SPREADSHEET_ID,
    spreadsheetUrl: ss.getUrl(),
    sheets: ss.getSheets().map(function(sheet) {
      return sheet.getName();
    }),
    clientsSheetExists: Boolean(clientsSheet),
    settingsSheetExists: Boolean(settingsSheet),
    logsSheetExists: Boolean(logsSheet),
    clientsRowsRaw: clientsValues.length,
    clientsHeaders: clientsValues[0] || [],
    firstClientRows: clientsValues.slice(1, 5),
    parsedClientsCount: clients.length,
    parsedClients: clients.slice(0, 5),
    settingsRows: settingsValues,
    statusesCount: LEGAL_STATUSES.length,
    contactMethodsCount: CONTACT_METHODS.length,
    statuses: LEGAL_STATUSES,
    contactMethods: CONTACT_METHODS
  };
}

function ensureBaseStructure_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let clients = ss.getSheetByName(SHEET_CLIENTS);
  if (!clients) clients = ss.insertSheet(SHEET_CLIENTS);

  let settings = ss.getSheetByName(SHEET_SETTINGS);
  if (!settings) settings = ss.insertSheet(SHEET_SETTINGS);

  let logs = ss.getSheetByName(SHEET_LOGS);
  if (!logs) logs = ss.insertSheet(SHEET_LOGS);

  ensureHeaders_(clients, CLIENT_HEADERS);
  ensureSettings_(settings);
  ensureLogs_(logs);
  applyValidation_(clients);
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const currentHeaders = headerRange.getValues()[0];
  let changed = false;

  headers.forEach(function(header, index) {
    if (currentHeaders[index] !== header) {
      currentHeaders[index] = header;
      changed = true;
    }
  });

  if (changed) headerRange.setValues([headers]);

  sheet.setFrozenRows(1);

  headerRange
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#111827')
    .setWrap(true);

  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), headers.length).setWrap(true);

  [95, 190, 160, 160, 150, 200, 160, 240, 160, 160, 320, 180, 230].forEach(function(width, index) {
    sheet.setColumnWidth(index + 1, width);
  });
}

function ensureSettings_(sheet) {
  if (sheet.getMaxColumns() < 3) sheet.insertColumnsAfter(sheet.getMaxColumns(), 3 - sheet.getMaxColumns());

  const values = sheet.getDataRange().getValues();
  const hasData = values.length > 1 || Boolean(values[0] && values[0][0]);
  const requiredSettings = [
    ['lawyer_email', 'lawyer@example.com', 'Email юриста для уведомлений'],
    ['notify_on_new_client', 'TRUE', 'Отправлять email при добавлении клиента через Web App'],
    ['notification_channel', 'Email', 'Безопасный канал уведомления для MVP'],
    ['duplicate_protection', 'notification_status', 'Не отправлять повторно без ручной команды'],
    ['timezone', TZ, 'Часовой пояс']
  ];

  if (!hasData) {
    sheet.getRange(1, 1, 1, 3).setValues([['key', 'value', 'description']]);
    sheet.getRange(2, 1, requiredSettings.length, 3).setValues(requiredSettings);
  } else {
    const existing = getSettingsFromSheet_(sheet);

    if (sheet.getRange(1, 1).getValue() !== 'key') {
      sheet.getRange(1, 1, 1, 3).setValues([['key', 'value', 'description']]);
    }

    requiredSettings.forEach(function(setting) {
      if (!Object.prototype.hasOwnProperty.call(existing, setting[0])) sheet.appendRow(setting);
    });
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e5e7eb');
  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 280);
  sheet.setColumnWidth(3, 480);
}

function ensureLogs_(sheet) {
  const headers = ['log_id', 'timestamp', 'action', 'client_id', 'result', 'details_json'];

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  let changed = false;

  headers.forEach(function(header, index) {
    if (current[index] !== header) {
      current[index] = header;
      changed = true;
    }
  });

  if (changed) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e5e7eb');
  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(2, 170);
  sheet.setColumnWidth(3, 180);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 220);
  sheet.setColumnWidth(6, 500);
}

function applyValidation_(sheet) {
  const contactRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONTACT_METHODS, true)
    .setAllowInvalid(false)
    .build();

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(LEGAL_STATUSES, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange('G2:G500').setDataValidation(contactRule);
  sheet.getRange('H2:H500').setDataValidation(statusRule);
}

function getClients_() {
  const sheet = getSheet_(SHEET_CLIENTS);
  const values = sheet.getDataRange().getValues();

  if (!values || values.length <= 1) return [];

  const headers = values[0].map(function(value) {
    return String(value || '').trim();
  });

  return values
    .slice(1)
    .filter(function(row) {
      return row[0] || row[1] || row[2];
    })
    .map(function(row) {
      return rowToObject_(headers, row);
    })
    .sort(function(a, b) {
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
}

function countStatuses_(clients) {
  const counts = {};
  LEGAL_STATUSES.forEach(function(status) { counts[status] = 0; });

  clients.forEach(function(client) {
    const status = client.legal_status || 'Новая заявка';
    if (!Object.prototype.hasOwnProperty.call(counts, status)) counts[status] = 0;
    counts[status] += 1;
  });

  return counts;
}

function findClientRow_(clientId) {
  const sheet = getSheet_(SHEET_CLIENTS);
  const values = sheet.getDataRange().getValues();

  if (!values || values.length <= 1) return null;

  const headers = values[0].map(function(value) {
    return String(value || '').trim();
  });

  const idIndex = headers.indexOf('client_id');
  if (idIndex === -1) throw new Error('В таблице Clients нет колонки client_id.');

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idIndex]) === String(clientId)) {
      return {
        sheet: sheet,
        headers: headers,
        rowValues: values[i],
        rowIndex: i + 1
      };
    }
  }

  return null;
}

function rowToObject_(headers, row) {
  const obj = {};

  headers.forEach(function(header, index) {
    obj[header] = normalizeSheetValue_(row[index]);
  });

  return obj;
}

function normalizeSheetValue_(value) {
  if (value === null || value === undefined) return '';

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, TZ, 'yyyy-MM-dd HH:mm:ss');
  }

  return String(value).trim();
}

function normalizeClientPayload_(payload) {
  payload = payload || {};

  return {
    name: clean_(payload.name),
    primary_phone: clean_(payload.primary_phone),
    alt_phone: clean_(payload.alt_phone),
    telegram: clean_(payload.telegram),
    email: clean_(payload.email),
    preferred_contact: clean_(payload.preferred_contact) || 'Телефон',
    legal_status: clean_(payload.legal_status) || 'Новая заявка',
    comment: clean_(payload.comment)
  };
}

function validateClient_(client) {
  if (!client.name) throw new Error('Укажите имя клиента.');
  if (!client.primary_phone) throw new Error('Укажите основной телефон клиента.');
  if (CONTACT_METHODS.indexOf(client.preferred_contact) === -1) throw new Error('Недопустимый способ связи: ' + client.preferred_contact);
  if (LEGAL_STATUSES.indexOf(client.legal_status) === -1) throw new Error('Недопустимый юридический статус: ' + client.legal_status);
}

function getNextClientId_() {
  const clients = getClients_();
  let maxNumber = 0;

  clients.forEach(function(client) {
    const match = String(client.client_id || '').match(/^C(\d+)$/);
    if (match) maxNumber = Math.max(maxNumber, Number(match[1]));
  });

  return 'C' + String(maxNumber + 1).padStart(3, '0');
}

function sendClientNotification_(client) {
  const settings = getSettings_();
  const enabled = String(settings.notify_on_new_client || '').toUpperCase() === 'TRUE';
  const lawyerEmail = clean_(settings.lawyer_email);

  if (!enabled) return { sentAt: '', status: 'skipped: notifications_disabled' };
  if (!lawyerEmail || lawyerEmail === 'lawyer@example.com') return { sentAt: '', status: 'skipped: lawyer_email_not_set' };

  const subject = 'Новый клиент в CRM: ' + client.name;
  const htmlBody =
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' +
      '<h2 style="margin:0 0 12px">Новый клиент</h2>' +
      '<p><b>Имя:</b> ' + escapeHtml_(client.name) + '</p>' +
      '<p><b>Основной телефон:</b> ' + escapeHtml_(client.primary_phone) + '</p>' +
      '<p><b>Второй телефон:</b> ' + escapeHtml_(client.alt_phone || '—') + '</p>' +
      '<p><b>Telegram:</b> ' + escapeHtml_(client.telegram || '—') + '</p>' +
      '<p><b>Email:</b> ' + escapeHtml_(client.email || '—') + '</p>' +
      '<p><b>Удобный способ связи:</b> ' + escapeHtml_(client.preferred_contact) + '</p>' +
      '<p><b>Юридический статус:</b> ' + escapeHtml_(client.legal_status) + '</p>' +
      '<p><b>Комментарий:</b><br>' + escapeHtml_(client.comment || '—') + '</p>' +
      '<hr>' +
      '<p style="color:#666">Уведомление отправлено автоматически из прототипа юридической CRM.</p>' +
    '</div>';

  try {
    MailApp.sendEmail({ to: lawyerEmail, subject: subject, htmlBody: htmlBody });
    return { sentAt: now_(), status: 'sent' };
  } catch (error) {
    return { sentAt: '', status: 'error: ' + String(error.message || error).slice(0, 120) };
  }
}

function setClientNotificationResult_(sheet, headers, rowNumber, result) {
  const sentAtColumn = headers.indexOf('notification_sent_at') + 1;
  const statusColumn = headers.indexOf('notification_status') + 1;

  if (sentAtColumn > 0) sheet.getRange(rowNumber, sentAtColumn).setValue(result.sentAt || '');
  if (statusColumn > 0) sheet.getRange(rowNumber, statusColumn).setValue(result.status || '');
}

function getSettings_() {
  return getSettingsFromSheet_(getSheet_(SHEET_SETTINGS));
}

function getSettingsFromSheet_(sheet) {
  const values = sheet.getDataRange().getValues();
  const settings = {};

  values.slice(1).forEach(function(row) {
    const key = clean_(row[0]);
    const value = clean_(row[1]);
    if (key) settings[key] = value;
  });

  return settings;
}

function getPublicSettings_() {
  const settings = getSettings_();

  return {
    notify_on_new_client: settings.notify_on_new_client || 'TRUE',
    notification_channel: settings.notification_channel || 'Email',
    lawyer_email_is_set: Boolean(settings.lawyer_email && settings.lawyer_email !== 'lawyer@example.com')
  };
}

function getSheet_(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(name);

  if (!sheet) throw new Error('Лист не найден: ' + name);

  return sheet;
}

function getHeaders_(sheet) {
  return sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function(value) {
      return String(value || '').trim();
    });
}

function log_(action, clientId, result, details) {
  try {
    getSheet_(SHEET_LOGS).appendRow([
      Utilities.getUuid(),
      now_(),
      action,
      clientId || '',
      result || '',
      JSON.stringify(details || {})
    ]);
  } catch (error) {
    // Логи не должны ломать пользовательский сценарий.
  }
}

function clean_(value) {
  return String(value || '').trim();
}

function now_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
