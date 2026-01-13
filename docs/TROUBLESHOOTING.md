# Troubleshooting Guide

Solutions for common issues with the Tri-State Data Dashboard.

## Quick Diagnostics

Run the built-in test suite:
```javascript
// In Apps Script Editor
testDeployment()
```

Check execution logs:
```bash
clasp logs
```

## Common Issues

### 1. "Authorization required" Error

**Symptoms:**
- Function fails on first run
- "Authorization required" popup

**Solution:**
1. Open Apps Script Editor: `clasp open`
2. Select any function in the dropdown
3. Click **Run**
4. Click **Review permissions**
5. Select your Google account
6. Click **Allow**

---

### 2. Dashboard Shows "Error Loading Data"

**Symptoms:**
- Red error card in dashboard
- Console shows error

**Diagnosis:**
```javascript
// Run in Apps Script Editor
Logger.log(getDataForFrontend());
```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Sheet doesn't exist | Data will auto-create on first POST |
| Script not authorized | Run any function manually to authorize |
| Wrong spreadsheet | Verify script is bound to correct spreadsheet |

---

### 3. Python POST Returns 302 Redirect Loop

**Symptoms:**
- Infinite redirects
- "Max retries exceeded" error

**Cause:** Using `/dev` URL instead of `/exec`

**Solution:** Use the deployment URL:
```python
# Wrong
url = "https://script.google.com/macros/s/.../dev"

# Correct
url = "https://script.google.com/macros/s/.../exec"
```

---

### 4. 401 Unauthorized / Redirect to Login

**Symptoms:**
- Request redirects to `accounts.google.com`
- "Access denied" errors

**Cause:** Organization policy blocking anonymous access

**Solution:** Use authenticated mode:
```python
client = GASClient(url, use_auth=True)
```

This uses Colab's OAuth to authenticate as your user.

---

### 5. "Refused to display in frame"

**Symptoms:**
- Dashboard blank in Google Sites
- Console shows frame error

**Solution:** Verify in `Code.gs`:
```javascript
.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
```

Then redeploy:
```bash
clasp push
clasp deploy --description "Fix frame options"
```

---

### 6. Concurrent Writes Corrupting Data

**Symptoms:**
- Missing rows
- Duplicate entries
- Lock timeout errors

**Solution:** Increase lock timeout in `Code.gs`:
```javascript
var CONFIG = {
  LOCK_TIMEOUT_MS: 60000  // Increase to 60 seconds
};
```

---

### 7. Quota Exceeded Errors

**Symptoms:**
- "Service invoked too many times" error
- Script stops working during peak usage

**Causes:**
- Too many requests
- Long-running operations

**Solutions:**

1. **Reduce polling frequency:**
   ```javascript
   // In Index.html
   const POLLING_INTERVAL = 60000; // 60 seconds instead of 30
   ```

2. **Monitor quota usage:**
   ```javascript
   // Run in Apps Script Editor
   checkQuotaUsage()
   ```

3. **Consider caching:**
   ```javascript
   var cache = CacheService.getScriptCache();
   cache.put('data', JSON.stringify(data), 60);
   ```

---

### 8. Python Connection Test Fails

**Complete Checklist:**

- [ ] Web App URL ends with `/exec` (not `/dev`)
- [ ] Web App access set to "Anyone"
- [ ] Apps Script deployment is active
- [ ] Spreadsheet exists and is accessible
- [ ] No corporate firewall blocking requests
- [ ] URL is correct and complete

**Diagnostic command:**
```python
import requests
response = requests.get(WEBAPP_URL)
print(f"Status: {response.status_code}")
print(f"Headers: {dict(response.headers)}")
print(f"Body: {response.text[:500]}")
```

---

### 9. CLASP Push Fails

**Symptoms:**
- "Could not push" error
- Authentication errors

**Solutions:**

1. **Re-authenticate:**
   ```bash
   clasp logout
   clasp login
   ```

2. **Check `.clasp.json`:**
   ```json
   {
     "scriptId": "YOUR_SCRIPT_ID",
     "rootDir": "."
   }
   ```

3. **Verify script access:**
   - Open script in browser
   - Ensure you have Editor access

---

### 10. Data Not Appearing in Dashboard

**Symptoms:**
- POST succeeds but dashboard empty
- Data visible in sheet but not in UI

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Wrong sheet name | Verify `CONFIG.SHEET_NAME` matches |
| Caching | Wait 30s for auto-refresh or reload |
| JavaScript error | Check browser console (F12) |
| Data format | Ensure all 4 columns present |

## Getting Help

1. **Check execution logs:**
   - Apps Script Editor > Executions
   - `clasp logs` in terminal

2. **Browser console:**
   - F12 > Console tab
   - Look for red errors

3. **Test individual functions:**
   - Run functions directly in Apps Script Editor
   - Check Logger output

4. **Create GitHub issue with:**
   - Error message
   - Steps to reproduce
   - Apps Script execution ID
   - Browser/environment details
