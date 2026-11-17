/**
 * ศูนย์รวมระบบสารสนเทศ (Web Portal) - Google Apps Script Backend
 * Database: Google Sheets (Portal_Database)
 * Image Storage: Google Drive (Portal_Images)
 */

const SPREADSHEET_ID = '1LlcDf7I3LllBzob4vSG5AEC3kVDcUJDedt4HsiKcF8Y';
const IMAGE_FOLDER_ID = '1iyw_3BpZAiGd1foKfBpB8B1YjaZhVWZA';

const SHEET_NAMES = {
  SETTINGS: 'Settings',
  CATEGORIES: 'Categories',
  SYSTEMS: 'Systems'
};

const DEFAULT_SETTINGS = {
  siteName: 'ชื่อหน่วยงาน / โรงเรียนของคุณ',
  siteSubtitle: 'ศูนย์รวมระบบสารสนเทศ',
  heroBadge: 'พอร์ทัลรวมระบบสารสนเทศ',
  heroTitle: 'ระบบทั้งหมด',
  heroDesc: 'รวมลิงก์ระบบงานและบริการออนไลน์ไว้ในที่เดียว',
  footerText: 'ศูนย์รวมระบบสารสนเทศภายในองค์กร',
  logoUrl: '',
  heroImageUrl: '',
  adminPin: '1234',
  updatedAt: ''
};

function doGet() {
  const settings = getSettingsMap_();
  const title = settings.siteName
    ? `${settings.siteSubtitle || 'ศูนย์รวมระบบสารสนเทศ'} | ${settings.siteName}`
    : 'ศูนย์รวมระบบสารสนเทศ';

  const output = HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  if (settings.logoUrl && /^https?:\/\//i.test(settings.logoUrl.trim())) {
    try {
      output.setFaviconUrl(settings.logoUrl.trim());
    } catch (e) {
      Logger.log('Cannot set favicon URL: ' + e);
    }
  }

  return output;
}

// ==================== Public Read API ====================

function getPortalData() {
  const ss = getSpreadsheet_();
  const settings = getSettingsMap_(ss);

  // Never expose adminPin to client
  const publicSettings = {
    siteName: settings.siteName || DEFAULT_SETTINGS.siteName,
    siteSubtitle: settings.siteSubtitle || DEFAULT_SETTINGS.siteSubtitle,
    heroBadge: settings.heroBadge || DEFAULT_SETTINGS.heroBadge,
    heroTitle: settings.heroTitle || DEFAULT_SETTINGS.heroTitle,
    heroDesc: settings.heroDesc || DEFAULT_SETTINGS.heroDesc,
    footerText: settings.footerText || DEFAULT_SETTINGS.footerText,
    logoUrl: settings.logoUrl || '',
    heroImageUrl: settings.heroImageUrl || ''
  };

  const categories = readSheetObjects_(ss.getSheetByName(SHEET_NAMES.CATEGORIES))
    .map((row) => ({
      id: String(row.id || ''),
      name: String(row.name || ''),
      desc: String(row.desc || ''),
      icon: String(row.icon || 'folder'),
      color: String(row.color || 'blue'),
      sortOrder: Number(row.sortOrder) || 0
    }))
    .filter((c) => c.id && c.name)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const systems = readSheetObjects_(ss.getSheetByName(SHEET_NAMES.SYSTEMS))
    .map((row) => ({
      id: String(row.id || ''),
      categoryId: String(row.categoryId || ''),
      title: String(row.title || ''),
      desc: String(row.desc || ''),
      url: String(row.url || ''),
      image: String(row.imageUrl || ''),
      imageFileId: String(row.imageFileId || ''),
      icon: String(row.icon || 'app-window'),
      color: String(row.color || 'blue'),
      sortOrder: Number(row.sortOrder) || 0
    }))
    .filter((s) => s.id && s.title)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    settings: publicSettings,
    categories,
    systems
  };
}

// ==================== Admin Auth & Mutations ====================

function verifyAdminPin(pin) {
  const settings = getSettingsMap_();
  requireAdminPin_(pin, settings);
  return { ok: true };
}

function saveSettings(pin, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = getSpreadsheet_();
    const current = getSettingsMap_(ss);
    requireAdminPin_(pin, current);

    const next = Object.assign({}, current);
    const fields = ['siteName', 'siteSubtitle', 'heroBadge', 'heroTitle', 'heroDesc', 'footerText'];
    fields.forEach((f) => {
      if (payload && typeof payload[f] === 'string') {
        next[f] = payload[f].trim();
      }
    });

    if (payload && payload.logoBase64) {
      const uploaded = uploadBase64ImageToDrive_(payload.logoBase64, 'portal-logo');
      next.logoUrl = uploaded.imageUrl;
    } else if (payload && typeof payload.logoUrl === 'string') {
      next.logoUrl = payload.logoUrl.trim();
    }

    if (payload && payload.heroImageBase64) {
      const uploaded = uploadBase64ImageToDrive_(payload.heroImageBase64, 'portal-hero');
      next.heroImageUrl = uploaded.imageUrl;
    } else if (payload && typeof payload.heroImageUrl === 'string') {
      next.heroImageUrl = payload.heroImageUrl.trim();
    }

    if (payload && payload.newAdminPin && String(payload.newAdminPin).trim().length >= 4) {
      next.adminPin = String(payload.newAdminPin).trim();
    }

    next.updatedAt = new Date().toISOString();

    const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
    const data = sheet.getDataRange().getValues();
    const keyRowMap = {};
    for (let i = 1; i < data.length; i++) {
      const k = String(data[i][0] || '').trim();
      if (k) keyRowMap[k] = i + 1;
    }

    Object.keys(DEFAULT_SETTINGS).forEach((k) => {
      const val = next[k] !== undefined ? next[k] : DEFAULT_SETTINGS[k];
      if (keyRowMap[k]) {
        sheet.getRange(keyRowMap[k], 2).setValue(val);
      } else {
        sheet.appendRow([k, val, '']);
      }
    });

    return getPortalData();
  } finally {
    lock.releaseLock();
  }
}

function saveCategory(pin, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = getSpreadsheet_();
    requireAdminPin_(pin, getSettingsMap_(ss));

    if (!payload || !String(payload.name || '').trim()) {
      throw new Error('กรุณาระบุชื่อหมวดหมู่');
    }

    const sheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES);
    const rows = readSheetObjects_(sheet);
    const id = String(payload.id || '').trim() || 'cat-' + Date.now();
    const existing = rows.find((r) => String(r.id) === id);
    const now = new Date().toISOString();

    const record = [
      id,
      String(payload.name || '').trim(),
      String(payload.desc || '').trim(),
      String(payload.icon || 'folder').trim(),
      String(payload.color || 'blue').trim(),
      existing ? Number(existing.sortOrder) || 0 : rows.length + 1,
      now
    ];

    if (existing) {
      sheet.getRange(existing._rowNumber, 1, 1, record.length).setValues([record]);
    } else {
      sheet.appendRow(record);
    }

    return getPortalData();
  } finally {
    lock.releaseLock();
  }
}

function deleteCategory(pin, categoryId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = getSpreadsheet_();
    requireAdminPin_(pin, getSettingsMap_(ss));

    const catSheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES);
    const cats = readSheetObjects_(catSheet);
    const target = cats.find((c) => String(c.id) === String(categoryId));
    if (target) {
      catSheet.deleteRow(target._rowNumber);
    }

    // Delete all systems in this category (bottom-up so row numbers stay valid)
    const sysSheet = ss.getSheetByName(SHEET_NAMES.SYSTEMS);
    const systems = readSheetObjects_(sysSheet)
      .filter((s) => String(s.categoryId) === String(categoryId))
      .sort((a, b) => b._rowNumber - a._rowNumber);

    systems.forEach((s) => {
      if (s.imageFileId) trashDriveFileSafe_(s.imageFileId);
      sysSheet.deleteRow(s._rowNumber);
    });

    return getPortalData();
  } finally {
    lock.releaseLock();
  }
}

function saveSystem(pin, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = getSpreadsheet_();
    requireAdminPin_(pin, getSettingsMap_(ss));

    if (!payload || !String(payload.title || '').trim()) {
      throw new Error('กรุณาระบุชื่อระบบ');
    }

    const sheet = ss.getSheetByName(SHEET_NAMES.SYSTEMS);
    const rows = readSheetObjects_(sheet);
    const id = String(payload.id || '').trim() || 'sys-' + Date.now();
    const existing = rows.find((r) => String(r.id) === id);
    const now = new Date().toISOString();

    let imageUrl = existing ? String(existing.imageUrl || '') : '';
    let imageFileId = existing ? String(existing.imageFileId || '') : '';

    if (payload.clearImage) {
      if (imageFileId) trashDriveFileSafe_(imageFileId);
      imageUrl = '';
      imageFileId = '';
    } else if (payload.imageBase64) {
      if (imageFileId) trashDriveFileSafe_(imageFileId);
      const uploaded = uploadBase64ImageToDrive_(payload.imageBase64, 'sys-' + id);
      imageUrl = uploaded.imageUrl;
      imageFileId = uploaded.fileId;
    } else if (typeof payload.imageUrl === 'string' && payload.imageUrl.trim() !== imageUrl) {
      if (imageFileId && !payload.imageUrl.includes(imageFileId)) {
        trashDriveFileSafe_(imageFileId);
        imageFileId = '';
      }
      imageUrl = payload.imageUrl.trim();
    }

    const record = [
      id,
      String(payload.categoryId || '').trim(),
      String(payload.title || '').trim(),
      String(payload.desc || '').trim(),
      String(payload.url || '').trim(),
      imageUrl,
      imageFileId,
      String(payload.icon || 'app-window').trim(),
      String(payload.color || 'blue').trim(),
      existing ? Number(existing.sortOrder) || 0 : rows.length + 1,
      now
    ];

    if (existing) {
      sheet.getRange(existing._rowNumber, 1, 1, record.length).setValues([record]);
    } else {
      sheet.appendRow(record);
    }

    return getPortalData();
  } finally {
    lock.releaseLock();
  }
}

function deleteSystem(pin, systemId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = getSpreadsheet_();
    requireAdminPin_(pin, getSettingsMap_(ss));

    const sheet = ss.getSheetByName(SHEET_NAMES.SYSTEMS);
    const rows = readSheetObjects_(sheet);
    const target = rows.find((r) => String(r.id) === String(systemId));
    if (target) {
      if (target.imageFileId) trashDriveFileSafe_(target.imageFileId);
      sheet.deleteRow(target._rowNumber);
    }

    return getPortalData();
  } finally {
    lock.releaseLock();
  }
}

function saveOrder(pin, orderedCategoryIds, orderedSystemIds) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = getSpreadsheet_();
    requireAdminPin_(pin, getSettingsMap_(ss));
    const now = new Date().toISOString();

    if (Array.isArray(orderedCategoryIds) && orderedCategoryIds.length > 0) {
      const catSheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES);
      const catRows = readSheetObjects_(catSheet);
      const orderMap = {};
      orderedCategoryIds.forEach((id, idx) => {
        orderMap[String(id)] = idx + 1;
      });
      catRows.forEach((r) => {
        const nextOrder = orderMap[String(r.id)];
        if (nextOrder !== undefined) {
          catSheet.getRange(r._rowNumber, 6, 1, 2).setValues([[nextOrder, now]]);
        }
      });
    }

    if (Array.isArray(orderedSystemIds) && orderedSystemIds.length > 0) {
      const sysSheet = ss.getSheetByName(SHEET_NAMES.SYSTEMS);
      const sysRows = readSheetObjects_(sysSheet);
      const orderMap = {};
      orderedSystemIds.forEach((id, idx) => {
        orderMap[String(id)] = idx + 1;
      });
      sysRows.forEach((r) => {
        const nextOrder = orderMap[String(r.id)];
        if (nextOrder !== undefined) {
          sysSheet.getRange(r._rowNumber, 10, 1, 2).setValues([[nextOrder, now]]);
        }
      });
    }

    return getPortalData();
  } finally {
    lock.releaseLock();
  }
}

function importPortalJson(pin, jsonData) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = getSpreadsheet_();
    requireAdminPin_(pin, getSettingsMap_(ss));

    if (!jsonData || !Array.isArray(jsonData.categories) || !Array.isArray(jsonData.systems)) {
      throw new Error('รูปแบบไฟล์ JSON ไม่ถูกต้อง');
    }

    const now = new Date().toISOString();
    const catSheet = ss.getSheetByName(SHEET_NAMES.CATEGORIES);
    clearDataRows_(catSheet);
    if (jsonData.categories.length > 0) {
      const catRows = jsonData.categories.map((c, idx) => [
        String(c.id || 'cat-' + (idx + 1)),
        String(c.name || ''),
        String(c.desc || ''),
        String(c.icon || 'folder'),
        String(c.color || 'blue'),
        Number(c.sortOrder) || idx + 1,
        now
      ]);
      catSheet.getRange(2, 1, catRows.length, 7).setValues(catRows);
    }

    const sysSheet = ss.getSheetByName(SHEET_NAMES.SYSTEMS);
    clearDataRows_(sysSheet);
    if (jsonData.systems.length > 0) {
      const sysRows = jsonData.systems.map((s, idx) => [
        String(s.id || 'sys-' + (idx + 1)),
        String(s.categoryId || ''),
        String(s.title || ''),
        String(s.desc || ''),
        String(s.url || ''),
        String(s.image || s.imageUrl || ''),
        String(s.imageFileId || ''),
        String(s.icon || 'app-window'),
        String(s.color || 'blue'),
        Number(s.sortOrder) || idx + 1,
        now
      ]);
      sysSheet.getRange(2, 1, sysRows.length, 11).setValues(sysRows);
    }

    return getPortalData();
  } finally {
    lock.releaseLock();
  }
}

// ==================== Internal Helpers ====================

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSettingsMap_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.SETTINGS);
  const map = Object.assign({}, DEFAULT_SETTINGS);
  if (!sheet) return map;

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][0] || '').trim();
    if (key) {
      map[key] = values[i][1] !== undefined && values[i][1] !== null ? String(values[i][1]) : '';
    }
  }
  return map;
}

function requireAdminPin_(pin, settings) {
  const expected = String((settings && settings.adminPin) || DEFAULT_SETTINGS.adminPin).trim();
  const actual = String(pin || '').trim();
  if (!actual || actual !== expected) {
    throw new Error('รหัสผ่านแอดมินไม่ถูกต้อง');
  }
}

function readSheetObjects_(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map((h) => String(h || '').trim());
  const result = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const hasAnyValue = row.some((cell) => cell !== '' && cell !== null && cell !== undefined);
    if (!hasAnyValue) continue;

    const obj = { _rowNumber: i + 1 };
    headers.forEach((h, colIdx) => {
      if (h) obj[h] = row[colIdx];
    });
    result.push(obj);
  }
  return result;
}

function clearDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
}

function uploadBase64ImageToDrive_(base64DataUrl, fileNamePrefix) {
  const match = String(base64DataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('รูปแบบไฟล์รูปภาพไม่ถูกต้อง');
  }
  const mimeType = match[1];
  const base64Body = match[2];
  const ext = mimeType.split('/')[1].replace('jpeg', 'jpg');
  const fileName = `${fileNamePrefix}-${Date.now()}.${ext}`;

  const bytes = Utilities.base64Decode(base64Body);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    fileId: file.getId(),
    imageUrl: `https://lh3.googleusercontent.com/d/${file.getId()}`
  };
}

function trashDriveFileSafe_(fileId) {
  try {
    if (fileId) {
      DriveApp.getFileById(String(fileId)).setTrashed(true);
    }
  } catch (err) {
    Logger.log('Cannot trash file ' + fileId + ': ' + err);
  }
}
