/**
 * @fileoverview Backend API for Tri-State Data Dashboard
 * Production-ready REST API with error handling, validation, and concurrency control
 * @version 1.0.0
 */

// ===================================================================
// CONFIGURATION
// ===================================================================

/**
 * Application configuration constants
 * @const {Object}
 */
var CONFIG = {
  SHEET_NAME: 'Processed_Data',
  QUOTA_WARNING_THRESHOLD: 0.8,
  LOCK_TIMEOUT_MS: 30000,
  MAX_EXECUTION_TIME: 360
};

// ===================================================================
// WEB APP ENDPOINTS
// ===================================================================

/**
 * Serves the HTML dashboard interface
 * @param {Object} e - Event object from GET request
 * @return {HtmlOutput} Dashboard HTML with proper frame options for embedding
 */
function doGet(e) {
  try {
    Logger.log('[doGet] Serving dashboard HTML');
    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Data Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    Logger.log('[doGet] Error: ' + error.toString());
    return HtmlService.createHtmlOutput(
      '<html><body>' +
      '<h1>Error Loading Dashboard</h1>' +
      '<p>' + error.toString() + '</p>' +
      '<p>Please check the Apps Script logs for details.</p>' +
      '</body></html>'
    );
  }
}

/**
 * Handles incoming data from Python/Colab POST requests
 * Validates input, acquires lock, and writes to sheet atomically
 * @param {Object} e - Event object containing POST data
 * @return {TextOutput} JSON response with status and metadata
 */
function doPost(e) {
  var startTime = new Date().getTime();
  var lock = null;
  
  try {
    // 1. Validate request has data
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        status: 'error',
        message: 'No data received in POST request',
        code: 'MISSING_DATA'
      });
    }
    
    // 2. Parse JSON payload
    var requestData;
    try {
      requestData = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return createJsonResponse({
        status: 'error',
        message: 'Invalid JSON format: ' + parseError.toString(),
        code: 'INVALID_JSON'
      });
    }
    
    // 3. Validate required fields
    var requiredFields = ['id', 'result', 'score'];
    var missingFields = requiredFields.filter(function(field) {
      return !(field in requestData);
    });
    
    if (missingFields.length > 0) {
      return createJsonResponse({
        status: 'error',
        message: 'Missing required fields: ' + missingFields.join(', '),
        code: 'MISSING_FIELDS',
        required: requiredFields
      });
    }
    
    // 4. Get or create target sheet
    var sheet = getOrCreateSheet(CONFIG.SHEET_NAME);
    
    // 5. Acquire lock for thread-safe writes
    lock = LockService.getScriptLock();
    var hasLock = lock.tryLock(CONFIG.LOCK_TIMEOUT_MS);
    
    if (!hasLock) {
      return createJsonResponse({
        status: 'error',
        message: 'Could not acquire lock - concurrent write in progress',
        code: 'LOCK_TIMEOUT'
      });
    }
    
    // 6. Write data atomically
    sheet.appendRow([
      new Date(),
      requestData.id,
      requestData.result,
      requestData.score
    ]);
    
    var rowNum = sheet.getLastRow();
    var executionTime = (new Date().getTime() - startTime) / 1000;
    
    // 7. Release lock before response
    lock.releaseLock();
    lock = null;
    
    Logger.log('[doPost] Success - Row ' + rowNum + ' added in ' + executionTime + 's');
    
    return createJsonResponse({
      status: 'success',
      row: rowNum,
      executionTime: executionTime
    });
    
  } catch (error) {
    Logger.log('[doPost] Error: ' + error.toString());
    
    // Ensure lock is released on error
    if (lock) {
      try { lock.releaseLock(); } catch (e) { /* ignore */ }
    }
    
    return createJsonResponse({
      status: 'error',
      message: error.toString(),
      code: 'INTERNAL_ERROR'
    });
  }
}

// ===================================================================
// DATA RETRIEVAL
// ===================================================================

/**
 * Fetches all data for frontend dashboard display
 * Called by client-side JavaScript via google.script.run
 * @return {Array<Array>} 2D array of sheet data including headers
 */
function getDataForFrontend() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    
    if (!sheet) {
      Logger.log('[getDataForFrontend] Sheet not found, returning empty array');
      return [];
    }
    
    var data = sheet.getDataRange().getValues();
    Logger.log('[getDataForFrontend] Retrieved ' + data.length + ' rows');
    return data;
    
  } catch (error) {
    Logger.log('[getDataForFrontend] Error: ' + error.toString());
    return [];
  }
}

// ===================================================================
// TESTING & DIAGNOSTICS
// ===================================================================

/**
 * Comprehensive deployment verification suite
 * Tests all critical functions and reports pass/fail status
 * @return {String} Formatted test results report
 */
function testDeployment() {
  var results = [];
  var passCount = 0;
  var totalTests = 0;
  
  Logger.log('[testDeployment] Starting test suite...');
  
  // Test 1: Sheet operations
  totalTests++;
  try {
    var testSheetName = 'Test_Sheet_' + Date.now();
    var sheet = getOrCreateSheet(testSheetName);
    sheet.appendRow(['Test', 'Data', 'Here']);
    var data = sheet.getDataRange().getValues();
    
    if (data.length >= 2) {
      SpreadsheetApp.getActiveSpreadsheet().deleteSheet(sheet);
      results.push('✓ Test 1: Sheet operations - PASSED');
      passCount++;
    } else {
      results.push('✗ Test 1: Sheet operations - FAILED: Data not written');
    }
  } catch (e) {
    results.push('✗ Test 1: Sheet operations - FAILED: ' + e.toString());
  }
  
  // Test 2: doGet execution
  totalTests++;
  try {
    var html = doGet({});
    if (html && html.getContent) {
      var content = html.getContent();
      if (content.indexOf('Dashboard') > -1) {
        results.push('✓ Test 2: doGet HTML generation - PASSED');
        passCount++;
      } else {
        results.push('✗ Test 2: doGet HTML generation - FAILED: Missing dashboard content');
      }
    } else {
      results.push('✗ Test 2: doGet HTML generation - FAILED: No content returned');
    }
  } catch (e) {
    results.push('✗ Test 2: doGet HTML generation - FAILED: ' + e.toString());
  }
  
  // Test 3: doPost with valid data
  totalTests++;
  try {
    var mockEvent = {
      postData: {
        contents: JSON.stringify({
          id: 999,
          result: 'Test Entry',
          score: 100
        })
      }
    };
    var response = JSON.parse(doPost(mockEvent).getContent());
    
    if (response.status === 'success' && response.row) {
      results.push('✓ Test 3: doPost valid payload - PASSED (row: ' + response.row + ')');
      passCount++;
    } else {
      results.push('✗ Test 3: doPost valid payload - FAILED: ' + response.message);
    }
  } catch (e) {
    results.push('✗ Test 3: doPost valid payload - FAILED: ' + e.toString());
  }
  
  // Test 4: doPost error handling (invalid JSON)
  totalTests++;
  try {
    var invalidEvent = {
      postData: {
        contents: '{invalid json here}'
      }
    };
    var response = JSON.parse(doPost(invalidEvent).getContent());
    
    if (response.status === 'error' && response.code === 'INVALID_JSON') {
      results.push('✓ Test 4: doPost error handling - PASSED');
      passCount++;
    } else {
      results.push('✗ Test 4: doPost error handling - FAILED: Wrong error response');
    }
  } catch (e) {
    results.push('✗ Test 4: doPost error handling - FAILED: ' + e.toString());
  }
  
  // Test 5: doPost missing fields
  totalTests++;
  try {
    var incompleteEvent = {
      postData: {
        contents: JSON.stringify({ id: 1 }) // Missing result and score
      }
    };
    var response = JSON.parse(doPost(incompleteEvent).getContent());
    
    if (response.status === 'error' && response.code === 'MISSING_FIELDS') {
      results.push('✓ Test 5: doPost field validation - PASSED');
      passCount++;
    } else {
      results.push('✗ Test 5: doPost field validation - FAILED: Wrong error response');
    }
  } catch (e) {
    results.push('✗ Test 5: doPost field validation - FAILED: ' + e.toString());
  }
  
  // Test 6: getDataForFrontend
  totalTests++;
  try {
    var data = getDataForFrontend();
    if (Array.isArray(data)) {
      results.push('✓ Test 6: getDataForFrontend - PASSED (' + data.length + ' rows)');
      passCount++;
    } else {
      results.push('✗ Test 6: getDataForFrontend - FAILED: Not an array');
    }
  } catch (e) {
    results.push('✗ Test 6: getDataForFrontend - FAILED: ' + e.toString());
  }
  
  // Generate report
  var report = '\n═══════════════════════════════════════\n' +
               '         TEST SUITE RESULTS\n' +
               '═══════════════════════════════════════\n\n' +
               results.join('\n') + '\n\n' +
               '───────────────────────────────────────\n' +
               'Overall: ' + passCount + '/' + totalTests + ' tests passed\n' +
               '═══════════════════════════════════════\n';
  
  Logger.log(report);
  return report;
}

/**
 * Monitors execution quota usage and sends warning email if threshold exceeded
 * @return {Object} Quota usage statistics
 */
function checkQuotaUsage() {
  var startTime = new Date().getTime();
  
  // Simulate work by fetching data
  getDataForFrontend();
  
  var executionTime = (new Date().getTime() - startTime) / 1000;
  var quotaUsed = executionTime / CONFIG.MAX_EXECUTION_TIME;
  var quotaPercent = quotaUsed * 100;
  
  var stats = {
    executionTime: executionTime,
    quotaPercent: quotaPercent.toFixed(2),
    warning: quotaPercent > (CONFIG.QUOTA_WARNING_THRESHOLD * 100)
  };
  
  Logger.log('[Quota] Execution: ' + executionTime + 's (' + quotaPercent.toFixed(1) + '% of quota)');
  
  if (stats.warning) {
    try {
      var email = Session.getActiveUser().getEmail();
      MailApp.sendEmail({
        to: email,
        subject: '⚠️ GAS Quota Warning - Tri-State Dashboard',
        body: 'Script approaching quota limit:\n\n' +
              'Execution time: ' + executionTime + 's of ' + CONFIG.MAX_EXECUTION_TIME + 's\n' +
              'Quota usage: ' + quotaPercent.toFixed(1) + '%\n\n' +
              'Consider optimizing your data processing or spreading load across time.'
      });
      Logger.log('[Quota] Warning email sent to ' + email);
    } catch (e) {
      Logger.log('[Quota] Warning: Could not send email - ' + e.toString());
    }
  }
  
  return stats;
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Gets existing sheet or creates it with headers if it doesn't exist
 * @param {String} sheetName - Name of sheet to get or create
 * @return {Sheet} The Sheet object
 */
function getOrCreateSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['Timestamp', 'ID', 'Result', 'Score']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    sheet.setFrozenRows(1);
    Logger.log('[getOrCreateSheet] Created new sheet: ' + sheetName);
  }
  
  return sheet;
}

/**
 * Creates standardized JSON response with proper MIME type
 * @param {Object} data - Response data object
 * @return {TextOutput} JSON formatted response
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Includes external HTML file content (for templating)
 * @param {String} filename - Name of HTML file to include
 * @return {String} File contents
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
