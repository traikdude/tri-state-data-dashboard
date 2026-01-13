/**
 * @fileoverview Test Suite for Tri-State Dashboard
 * Extended testing functionality beyond testDeployment()
 * @version 1.0.0
 */

/**
 * Runs all available tests and generates a comprehensive report
 * @return {String} Full test report
 */
function runAllTests() {
  var allResults = [];
  
  allResults.push('╔══════════════════════════════════════════════╗');
  allResults.push('║     TRI-STATE DASHBOARD - FULL TEST SUITE    ║');
  allResults.push('╚══════════════════════════════════════════════╝\n');
  
  // Run deployment tests
  allResults.push('▶ DEPLOYMENT TESTS');
  allResults.push('─'.repeat(40));
  allResults.push(testDeployment());
  
  // Run performance tests
  allResults.push('\n▶ PERFORMANCE TESTS');
  allResults.push('─'.repeat(40));
  allResults.push(testPerformance());
  
  // Run stress tests
  allResults.push('\n▶ STRESS TESTS');
  allResults.push('─'.repeat(40));
  allResults.push(testConcurrency());
  
  var report = allResults.join('\n');
  Logger.log(report);
  return report;
}

/**
 * Tests performance characteristics
 * @return {String} Performance test results
 */
function testPerformance() {
  var results = [];
  
  // Test 1: Sheet read performance
  var startTime = new Date().getTime();
  for (var i = 0; i < 10; i++) {
    getDataForFrontend();
  }
  var readTime = (new Date().getTime() - startTime) / 10;
  results.push('📊 Average sheet read time: ' + readTime.toFixed(2) + 'ms');
  
  // Test 2: JSON response creation
  startTime = new Date().getTime();
  for (var i = 0; i < 100; i++) {
    createJsonResponse({status: 'test', data: 'sample'});
  }
  var jsonTime = (new Date().getTime() - startTime) / 100;
  results.push('📦 Average JSON response time: ' + jsonTime.toFixed(2) + 'ms');
  
  // Test 3: HTML generation
  startTime = new Date().getTime();
  doGet({});
  var htmlTime = new Date().getTime() - startTime;
  results.push('🖥️  HTML generation time: ' + htmlTime + 'ms');
  
  return results.join('\n');
}

/**
 * Tests concurrent write handling
 * @return {String} Concurrency test results
 */
function testConcurrency() {
  var results = [];
  
  // Get initial row count
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  var initialRows = sheet ? sheet.getLastRow() : 0;
  
  // Simulate multiple rapid writes
  var writeCount = 5;
  var successCount = 0;
  
  for (var i = 0; i < writeCount; i++) {
    var mockEvent = {
      postData: {
        contents: JSON.stringify({
          id: 'STRESS_' + i,
          result: 'Concurrent write test',
          score: i * 10
        })
      }
    };
    
    var response = JSON.parse(doPost(mockEvent).getContent());
    if (response.status === 'success') {
      successCount++;
    }
  }
  
  results.push('🔄 Concurrent writes attempted: ' + writeCount);
  results.push('✅ Successful writes: ' + successCount);
  results.push('📈 Success rate: ' + ((successCount / writeCount) * 100).toFixed(1) + '%');
  
  // Verify row count increased
  sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  var finalRows = sheet ? sheet.getLastRow() : 0;
  var rowsAdded = finalRows - initialRows;
  
  results.push('📝 Rows added: ' + rowsAdded + ' (expected: ' + successCount + ')');
  
  if (rowsAdded === successCount) {
    results.push('✓ Data integrity: PASSED');
  } else {
    results.push('✗ Data integrity: FAILED');
  }
  
  return results.join('\n');
}

/**
 * Validates configuration constants
 * @return {String} Configuration validation results
 */
function validateConfig() {
  var results = [];
  results.push('⚙️  Configuration Validation\n');
  
  // Check CONFIG object exists
  if (typeof CONFIG === 'undefined') {
    results.push('✗ CONFIG object is undefined!');
    return results.join('\n');
  }
  
  results.push('✓ SHEET_NAME: ' + CONFIG.SHEET_NAME);
  results.push('✓ LOCK_TIMEOUT_MS: ' + CONFIG.LOCK_TIMEOUT_MS + 'ms');
  results.push('✓ QUOTA_WARNING_THRESHOLD: ' + (CONFIG.QUOTA_WARNING_THRESHOLD * 100) + '%');
  results.push('✓ MAX_EXECUTION_TIME: ' + CONFIG.MAX_EXECUTION_TIME + 's');
  
  // Validate values
  if (CONFIG.LOCK_TIMEOUT_MS < 5000) {
    results.push('⚠️  Warning: Lock timeout may be too short');
  }
  
  if (CONFIG.QUOTA_WARNING_THRESHOLD < 0.5 || CONFIG.QUOTA_WARNING_THRESHOLD > 0.95) {
    results.push('⚠️  Warning: Quota threshold may be misconfigured');
  }
  
  return results.join('\n');
}

/**
 * Cleans up test data from the sheet
 * @param {String} prefix - Prefix to match for deletion (e.g., 'STRESS_', 'TEST_')
 * @return {Number} Number of rows deleted
 */
function cleanupTestData(prefix) {
  prefix = prefix || 'TEST';
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return 0;
  
  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];
  
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]).indexOf(prefix) === 0) {
      rowsToDelete.push(i + 1); // Convert to 1-indexed
    }
  }
  
  // Delete rows from bottom to top to preserve indices
  for (var i = 0; i < rowsToDelete.length; i++) {
    sheet.deleteRow(rowsToDelete[i]);
  }
  
  Logger.log('[cleanupTestData] Deleted ' + rowsToDelete.length + ' rows with prefix: ' + prefix);
  return rowsToDelete.length;
}
