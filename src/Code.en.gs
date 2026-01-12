// ==========================================
// CONFIGURATION VIA SCRIPT PROPERTIES OR SHEET
// ==========================================
// We will use Sheet for easier user editing
const SHEET_CONFIG = "Config";
const SHEET_BENEFICIARIES = "Beneficiaries";

function getSheet() {
  const props = PropertiesService.getScriptProperties();
  let sheetId = props.getProperty("SHEET_ID");
  
  // 1. Try to open by ID if existing
  if (sheetId) {
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch (e) {
      Logger.log("Invalid SHEET_ID in properties, trying active sheet...");
    }
  }

  // 2. Fallback: Try Active Spreadsheet (Bound Script)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      // Save for future use (e.g. WebHook)
      props.setProperty("SHEET_ID", ss.getId());
      return ss;
    }
  } catch (e) {
    // Ignore
  }

  throw new Error("Could not find Spreadsheet. Please run 'Setup Sheet' from the menu first, or set SHEET_ID in Script Properties.");
}

function getConfig() {
  const ss = getSheet();
  const sh = ss.getSheetByName(SHEET_CONFIG);
  if (!sh) throw new Error(`Sheet '${SHEET_CONFIG}' not found.`);
  
  const data = sh.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) {
    config[data[i][0]] = data[i][1];
  }
  return config;
}

function setConfig(key, value) {
  const ss = getSheet();
  const sh = ss.getSheetByName(SHEET_CONFIG);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
}

// ==========================================
// CORE LOGIC
// ==========================================

// ==========================================
// CORE LOGIC & HELPERS
// ==========================================

function mainJob() {
  const config = getConfig();
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDate();
  
  // Parse CHECK_TIME_HOUR (supports '9', '9h')
  const checkHourStr = String(config['CHECK_TIME_HOUR']).toLowerCase().replace('h', '').trim();
  const checkHour = Number(checkHourStr); // e.g., 9
  const checkDayStr = String(config['CHECK_DAY'] || "").trim();
  const checkDay = checkDayStr ? Number(checkDayStr) : null; // If empty, run daily
  const status = config['STATUS'];
  const telegramId = config['USER_CHAT_ID'];
  const botToken = config['TELEGRAM_BOT_TOKEN'];
  
  // TEST MODE LOGIC (Only affects start time check)
  const testMode = String(config['TEST_MODE']).toUpperCase() === 'TRUE';

  Logger.log(`Running mainJob. Status: ${status}, Day: ${currentDay}, Hour: ${currentHour}, TestMode: ${testMode}`);

  // 1. CHECK ALIVE TIME
  // Normal mode: Check hour AND (check day match OR no check day configured). Test mode: Always run if ALIVE.
  const isDayMatch = (checkDay === null) || (currentDay === checkDay);
  const isTimeToCheck = (isDayMatch && (currentHour === checkHour)) || testMode;
  
  if (isTimeToCheck && status === 'ALIVE') {
    // It's time to check!
    sendTelegram(botToken, telegramId, "🧟 Are you still there? Reply 'Alive' or click the button below.", {
      inline_keyboard: [[{ text: "💪 I'm Alive", callback_data: "alive" }]]
    });
    setConfig('STATUS', 'PENDING');
    setConfig('LAST_PING', now);
    setConfig('RETRIES', 0); // Reset retries
    return;
  }

  // 2. CHECK TIMEOUT IF PENDING
  if (status === 'PENDING') {
    const lastPing = new Date(config['LAST_PING']);
    
    // Parse timeout to milliseconds
    const timeoutInput = config['TIMEOUT_HOURS']; // Can be '24', '9h', '30m'
    const timeoutMs = parseDurationToMs(timeoutInput);
    
    const maxRetries = Number(config['MAX_RETRIES']);
    const currentRetries = Number(config['RETRIES'] || 0);

    const diffMs = now - lastPing;
    
    Logger.log(`Checking timeout. Diff: ${(diffMs/60000).toFixed(1)}m. Timeout: ${(timeoutMs/60000).toFixed(1)}m`);

    if (diffMs >= timeoutMs) {
       // Timeout reached!
       if (currentRetries < maxRetries) {
         // Retry
         sendTelegram(botToken, telegramId, `⚠️ WARNING: No response from you! This is reminder ${currentRetries + 1}/${maxRetries}. Are you still there?`);
         setConfig('RETRIES', currentRetries + 1);
         setConfig('LAST_PING', now); // Reset timer for next retry
       } else {
         // DEAD
         setConfig('STATUS', 'DEAD');
         sendTelegram(botToken, telegramId, "💀 Response timed out. Legacy protocol initiated.");
         triggerLegacyProtocol();
       }
    }
  }
}

// Helper to parse duration strings like "9h", "30m", "1w", "2d" or "24" (default hours)
function parseDurationToMs(input) {
  if (!input) return 24 * 60 * 60 * 1000; // Default 24h
  
  const str = String(input).trim().toLowerCase();
  
  // Regex to match "9.5", "30", "30m", "5h", "1d", "2w"
  const match = str.match(/^([\d\.]+)\s*([wdmh]?)$/);
  
  if (!match) {
    Logger.log(`Warning: Invalid duration format '${input}'. Defaulting to 24h.`);
    return 24 * 60 * 60 * 1000;
  }
  
  const val = Number(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 'w': return val * 7 * 24 * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': 
    default:  return val * 60 * 60 * 1000;
  }
}

function triggerLegacyProtocol() {
  const ss = getSheet();
  const sh = ss.getSheetByName(SHEET_BENEFICIARIES);
  const data = sh.getDataRange().getValues();
  
  // Row 1 is header
  for (let i = 1; i < data.length; i++) {
    const email = data[i][0];
    const subject = data[i][1];
    const body = data[i][2];
    
    if (email && body) {
      try {
        MailApp.sendEmail({
          to: email,
          subject: subject,
          htmlBody: body.replace(/\n/g, '<br>')
        });
        Logger.log(`Sent email to ${email}`);
      } catch (e) {
        Logger.log(`Failed to send to ${email}: ${e}`);
      }
    }
  }
}

// ==========================================
// STATE MANAGEMENT & HELPERS
// ==========================================

function setUserState(chatId, state, data = {}) {
  const cache = CacheService.getScriptCache();
  const value = JSON.stringify({ state: state, data: data });
  cache.put(chatId, value, 600); // 10 minutes expiry
}

function getUserState(chatId) {
  const cache = CacheService.getScriptCache();
  const value = cache.get(chatId);
  return value ? JSON.parse(value) : null;
}

function clearUserState(chatId) {
  CacheService.getScriptCache().remove(chatId);
}

function getBeneficiaries() {
  const ss = getSheet();
  const sh = ss.getSheetByName(SHEET_BENEFICIARIES);
  if (sh.getLastRow() <= 1) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  return data.map((row, index) => ({
    id: index + 1,
    row: index + 2, // Sheet row (1-based)
    email: row[0],
    subject: row[1],
    body: row[2]
  }));
}

function addBeneficiary(email, subject, body) {
  const ss = getSheet();
  const sh = ss.getSheetByName(SHEET_BENEFICIARIES);
  sh.appendRow([email, subject, body]);
}

function deleteBeneficiary(row) {
  const ss = getSheet();
  const sh = ss.getSheetByName(SHEET_BENEFICIARIES);
  sh.deleteRow(row);
}

// ==========================================
// TELEGRAM HANDLERS (UPDATED)
// ==========================================

  /* 
  // CONFLICT: doGet is already defined in Code.vi.gs
  function doGet(e) {
    return serveWebApp(e);
  }
  */
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    const config = getConfig();
    const botToken = config['TELEGRAM_BOT_TOKEN'];
    const botToken = config['TELEGRAM_BOT_TOKEN'];
    const authorizedChatId = String(config['USER_CHAT_ID']).trim();
    // Use DEBUG_MODE to toggle logging (conceptually, though Logger always runs, we can use this for specific verbose logs)
    const debugMode = (config['DEBUG_MODE'] === 'TRUE');
    
    // Save DEBUG_MODE if passed in payload (from Web App)
    if (update.action === 'saveConfig') {
       if (update.DEBUG_MODE) setConfig('DEBUG_MODE', update.DEBUG_MODE);
    }

    // 1. Handle Callback Query (Buttons)
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = String(cb.message.chat.id);
      
      if (chatId !== authorizedChatId) return HtmlService.createHtmlOutput("OK");

      handleCallback(botToken, chatId, cb);
      return HtmlService.createHtmlOutput("OK");
    }
    
    // 2. Handle Message (Text)
    if (update.message) {
      const msg = update.message;
      const text = msg.text;
      const chatId = String(msg.chat.id);
      
      if (chatId !== authorizedChatId) return HtmlService.createHtmlOutput("OK");

      // Check state first
      const userState = getUserState(chatId);
      if (userState && text && !text.startsWith('/')) {
        handleInput(botToken, chatId, text, userState);
        return HtmlService.createHtmlOutput("OK");
      }

      // Handle Commands
      if (text) {
        handleCommand(botToken, chatId, text);
      }
    }
    return HtmlService.createHtmlOutput("OK");
  } catch(err) {
    Logger.log(err);
    return HtmlService.createHtmlOutput("Error");
  }
}

function handleCommand(token, chatId, text) {
  // Always confirm alive on interaction
  confirmAlive(chatId, token);
  clearUserState(chatId);

  if (text === '/start' || text === '/menu') {
    showMainMenu(token, chatId);
  } else {
    showMainMenu(token, chatId);
  }
}

function showMainMenu(token, chatId) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: "⚙️ Bot Config", callback_data: "menu_config" },
        { text: "👥 Beneficiaries", callback_data: "menu_ben" }
      ],
      [{ text: "❌ Exit", callback_data: "close" }]
    ]
  };
  sendTelegram(token, chatId, "👋 Hello Master! What would you like to do today?", keyboard);
}

function handleCallback(token, chatId, cb) {
  const data = cb.data;
  
  // Confirm alive on click
  confirmAlive(chatId, token);
  
  // Answer callback immediately to stop loading animation
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery?callback_query_id=${cb.id}`);

  if (data === "alive") {
     sendTelegram(token, chatId, "✅ Confirmed you are alive!");
     return;
  }
  
  if (data === "close") {
    // Delete the menu message (optional, or just ignore)
    return; 
  }

  // --- MAIN MENU (Back button) ---
  if (data === "menu") {
    showMainMenu(token, chatId);
    return;
  }

  // --- CONFIG MENU ---
  if (data === "menu_config") {
    showConfigMenu(token, chatId);
    return;
  }
  if (data.startsWith("cfg_edit_")) {
    const field = data.replace("cfg_edit_", "");
    
    // Toggle Test Mode immediately
    if (field === "TEST_MODE") {
      const current = getConfig()['TEST_MODE'];
      const newVal = (String(current).toUpperCase() === 'TRUE') ? 'FALSE' : 'TRUE';
      setConfig('TEST_MODE', newVal);
      sendTelegram(token, chatId, `Test Mode toggled to: ${newVal}`);
      showConfigMenu(token, chatId);
      return;
    }

    // For others, ask input
    setUserState(chatId, "WAITING_CONFIG_VALUE", { field: field });
    let prompt = `Enter new value for ${field}:`;
    if (field === "CHECK_DAY") prompt += "\n(1-31, or send '0' to clear)";
    if (field === "TIMEOUT_HOURS") prompt += "\n(Fixed: 24h, 30m, 1w)";
    sendTelegram(token, chatId, prompt);
    return;
  }

  // --- BENEFICIARY MENU ---
  if (data === "menu_ben") {
    showBeneficiaryMenu(token, chatId);
    return;
  }
  if (data === "ben_add") {
    setUserState(chatId, "WAITING_BEN_EMAIL");
    sendTelegram(token, chatId, "📧 Enter Beneficiary EMAIL:");
    return;
  }
  if (data.startsWith("ben_del_")) {
    const row = Number(data.replace("ben_del_", ""));
    deleteBeneficiary(row);
    sendTelegram(token, chatId, "🗑️ Beneficiary deleted.");
    showBeneficiaryMenu(token, chatId);
    return;
  }
}

function handleInput(token, chatId, text, userState) {
  const state = userState.state;
  const data = userState.data;

  // --- CONFIG INPUT ---
  if (state === "WAITING_CONFIG_VALUE") {
    const field = data.field;
    let val = text.trim();
    if (field === "CHECK_DAY" && val === '0') val = "";
    
    setConfig(field, val);
    sendTelegram(token, chatId, `✅ Updated ${field} = ${val}`);
    clearUserState(chatId);
    showConfigMenu(token, chatId);
    return;
  }

  // --- ADD BEN FLOW ---
  if (state === "WAITING_BEN_EMAIL") {
    // Save email, move to next
    setUserState(chatId, "WAITING_BEN_SUBJECT", { email: text });
    sendTelegram(token, chatId, "📝 Enter Subject:");
    return;
  }
  if (state === "WAITING_BEN_SUBJECT") {
    // Save subject, move to next
    const context = data;
    context.subject = text;
    setUserState(chatId, "WAITING_BEN_BODY", context);
    sendTelegram(token, chatId, "💬 Enter Message Body:");
    return;
  }
  if (state === "WAITING_BEN_BODY") {
    const context = data;
    const body = text;
    addBeneficiary(context.email, context.subject, body);
    sendTelegram(token, chatId, `✅ Added Beneficiary:\n${context.email}`);
    clearUserState(chatId);
    showBeneficiaryMenu(token, chatId);
    return;
  }
}

function showConfigMenu(token, chatId) {
  const config = getConfig();
  const msg = [
    "<b>⚙️ CURRENT CONFIG:</b>",
    `1. Timeout: ${config['TIMEOUT_HOURS']}`,
    `2. Check Hour: ${config['CHECK_TIME_HOUR']}`,
    `3. Check Day: ${config['CHECK_DAY'] || 'Daily'}`,
    `4. Max Retries: ${config['MAX_RETRIES']}`,
    `5. Test Mode: ${config['TEST_MODE']}`
  ].join("\n");

  const keyboard = {
    inline_keyboard: [
      [
        { text: "⏳ Edit Timeout", callback_data: "cfg_edit_TIMEOUT_HOURS" },
        { text: "🕒 Edit Check Hour", callback_data: "cfg_edit_CHECK_TIME_HOUR" }
      ],
      [
        { text: "📅 Edit Check Day", callback_data: "cfg_edit_CHECK_DAY" },
        { text: "🔄 Edit Max Retries", callback_data: "cfg_edit_MAX_RETRIES" }
      ],
      [
        { text: "🧪 Toggle Test Mode", callback_data: "cfg_edit_TEST_MODE" }
      ],
      [{ text: "🔙 Back", callback_data: "menu" }]
    ]
  };
  sendTelegram(token, chatId, msg, keyboard);
}

function showBeneficiaryMenu(token, chatId) {
  const list = getBeneficiaries();
  let msg = "<b>👥 BENEFICIARY LIST:</b>\n\n";
  
  if (list.length === 0) {
    msg += "(Empty)";
  } else {
    list.forEach(b => {
      msg += `#${b.id}: <b>${b.email}</b>\nSubject: ${b.subject}\n------------------\n`;
    });
  }

  // Create delete buttons for each item
  const deleteButtons = list.map(b => {
    return { text: `🗑️ Del #${b.id}`, callback_data: `ben_del_${b.row}` };
  });
  
  // Chunk buttons (2 per row)
  const keyboardRows = [];
  keyboardRows.push([{ text: "➕ Add New", callback_data: "ben_add" }]);
  
  for (let i = 0; i < deleteButtons.length; i += 2) {
    keyboardRows.push(deleteButtons.slice(i, i + 2));
  }
  
  keyboardRows.push([{ text: "🔙 Back", callback_data: "menu" }]);

  sendTelegram(token, chatId, msg, { inline_keyboard: keyboardRows });
}

function confirmAlive(chatId, botToken) {
  // Only update status if it was pending or we want to be sure
  // But strictly, we update status to ALIVE
  const config = getConfig();
  if (config['STATUS'] !== 'ALIVE') {
     setConfig('STATUS', 'ALIVE');
     setConfig('LAST_PING', ""); 
     setConfig('RETRIES', 0);
  }
}

function sendTelegram(token, chatId, text, markup = null) {
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if (markup) payload.reply_markup = markup;
  
  try {
     UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
       method: "post",
       contentType: "application/json",
       payload: JSON.stringify(payload)
     });
  } catch (e) {
     Logger.log("Telegram Error: " + e);
  }
}

// ==========================================
// MENU & SETUP
// ==========================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Dead Man Bot')
      .addItem('Setup Sheet', 'setupSheet')
      .addToUi();
}

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log("Please run this bound to a spreadsheet.");
    return;
  }
  
  // Set ID for script to use later if needed, though active sheet is enough for bound scripts
  PropertiesService.getScriptProperties().setProperty("SHEET_ID", ss.getId());
  
  // 1. CONFIG SHEET
  let shConfig = ss.getSheetByName(SHEET_CONFIG);
  if (!shConfig) {
    shConfig = ss.insertSheet(SHEET_CONFIG);
    // Header
    const headerRange = shConfig.getRange(1, 1, 1, 2);
    headerRange.setValues([["Key", "Value"]]);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#efefef");
    shConfig.setFrozenRows(1);
    
    // Default Values
    // Default Values
    const defaults = [
      ["TELEGRAM_BOT_TOKEN", ""],
      ["USER_CHAT_ID", ""],
      ["CHECK_DAY", "1"],
      ["CHECK_TIME_HOUR", "9"],
      ["TIMEOUT_HOURS", "24"],
      ["MAX_RETRIES", "3"],
      ["STATUS", "ALIVE"],
      ["TEST_MODE", "FALSE"],
      ["DEBUG_MODE", "FALSE"],
      ["LAST_PING", ""],
      ["RETRIES", "0"]
    ];
    shConfig.getRange(2, 1, defaults.length, 2).setValues(defaults);
    
    // Auto-resize
    shConfig.autoResizeColumns(1, 2);
    ss.toast("Created Config sheet", "Setup");
  } else {
    // Sheet exists, check if empty or needs repair
    if (shConfig.getLastRow() <= 1) {
       // Repair: File Default Values
       const defaults = [
         ["TELEGRAM_BOT_TOKEN", ""],
         ["USER_CHAT_ID", ""],
         ["CHECK_DAY", "1"],
         ["CHECK_TIME_HOUR", "9"],
         ["TIMEOUT_HOURS", "24"],
         ["MAX_RETRIES", "3"],
         ["STATUS", "ALIVE"],
         ["TEST_MODE", "FALSE"],
         ["LAST_PING", ""],
         ["RETRIES", "0"]
       ];
       shConfig.getRange(2, 1, defaults.length, 2).setValues(defaults);
       ss.toast("Repaired empty Config sheet", "Setup");
    } else {
       ss.toast("Config sheet already exists.", "Setup");
    }
  }
  
  // 2. BENEFICIARIES SHEET
  let shBen = ss.getSheetByName(SHEET_BENEFICIARIES);
  if (!shBen) {
    shBen = ss.insertSheet(SHEET_BENEFICIARIES);
    // Header
    const headerRange = shBen.getRange(1, 1, 1, 3);
    headerRange.setValues([["Email", "Subject", "Content"]]);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#efefef");
    shBen.setFrozenRows(1);
    
    // Example Row
    shBen.appendRow(["example@email.com", "Important Info", "Here is my secret..."]);
    
    // Auto-resize
    shBen.autoResizeColumns(1, 3);
  }
  
  // 3. CLEANUP
  // Remove default "Sheet1" if it exists and is empty/default
  const sheet1 = ss.getSheetByName("Sheet1");
  if (sheet1 && ss.getSheets().length > 1) {
    try {
      ss.deleteSheet(sheet1);
    } catch(e) {
      // Ignore if can't delete
    }
  }

  ss.toast("Setup complete! Please fill in your Config sheet.", "Dead Man Bot");
}

function setWebhook() {
  // Run this function manually after deployment
  const config = getConfig();
  const token = config['TELEGRAM_BOT_TOKEN'];
  // replace with your web app url
  const url = "YOUR_WEB_APP_URL_HERE"; 
  
  const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${url}`);
  Logger.log("Webhook: " + response.getContentText());
  
  setBotCommands(token);
}

function setBotCommands(token) {
  const commands = [
    { command: "menu", description: "Main Dashboard" },
    { command: "help", description: "Usage Guide" },
    { command: "start", description: "Start Bot" }
  ];
  
  const payload = {
    commands: commands
  };
  
  try {
    const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload)
    });
    Logger.log("Commands: " + response.getContentText());
  } catch (e) {
    Logger.log("Error setting commands: " + e);
  }
}
// Helper to generate human-readable config explanation
function getConfigExplanation(config) {
  const timeout = config.TIMEOUT_HOURS;
  const hour = config.CHECK_TIME_HOUR;
  const day = config.CHECK_DAY;
  const retries = config.MAX_RETRIES;
  const testMode = config.TEST_MODE;
  
  const isMinutes = String(timeout).toLowerCase().endsWith('m');
  const isTest = (testMode === 'TRUE');

  if (isTest) {
      let msg = `⚠️ TEST MODE IS ON\n`;
      msg += `Bot will check continuously (Requires Trigger 'Every Minute').\n`;
      
      if (!isMinutes) {
          msg += `⚠️ Note: You are using Timeout ${timeout} (Hours). In Test Mode, use minutes (e.g., 5m) for faster checks.\n`;
      } else {
          msg += `Timeout: ${timeout} (Minutes) - OK.\n`;
      }
      
      msg += `-> If you don't reply after ${retries} retries (interval ${timeout}), bot will alert beneficiaries.\n`;
      msg += `Critical Requirements:\n`;
      msg += `1. Set Apps Script Trigger to: Every Minute.\n`;
      msg += `2. Clear real beneficiary data to avoid accidents.`;
      return msg;
  }
  
  // Normal Mode
  let msg = "";
  if (day && String(day).trim() !== "") {
      msg += `📅 Schedule: Checks on day ${day} of every month, at ${hour}h.\n`;
  } else {
      msg += `📅 Schedule: Checks daily, at ${hour}h.\n`;
  }
  
  if (isMinutes) {
      msg += `⚠️ Warning: You are using Timeout ${timeout} (Minutes). In Normal Mode (Hourly Trigger), minutes might be inaccurate. Use hours (e.g., 24, 48).\n`;
  }
  
  msg += `🔔 Process: If you are offline, bot will retry ${retries} times (interval ${timeout}).\n`;
  msg += `✅ Requirement: Set Apps Script Trigger to: Every Hour.\n`;
  msg += `Please double-check beneficiary info.`;
  
  return msg;
}
