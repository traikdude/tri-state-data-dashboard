# Setup Guide

Complete installation and configuration instructions for the Tri-State Data Dashboard.

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Google Account | - | Google Drive, Sheets, Apps Script access |
| Node.js | 14+ | CLASP CLI tool |
| npm | 6+ | Package management |
| Git | 2.x | Version control |
| Python | 3.7+ | Colab integration (optional) |

## Step 1: Clone Repository

```bash
git clone https://github.com/your-username/tri-state-data-dashboard.git
cd tri-state-data-dashboard
```

## Step 2: Install CLASP

CLASP (Command Line Apps Script Projects) is Google's official CLI for Apps Script.

```bash
# Install globally
npm install -g @google/clasp

# Verify installation
clasp --version
```

## Step 3: Authenticate with Google

```bash
clasp login
```

This opens a browser window. Sign in with the Google account you want to deploy from.

## Step 4: Create Google Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it "Tri-State Dashboard Data"
4. Note the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```

## Step 5: Create Apps Script Project

```bash
cd apps-script

# Create standalone Apps Script project
clasp create --title "Tri-State Dashboard" --type standalone
```

This generates `.clasp.json` with your Script ID.

## Step 6: Link to Spreadsheet

Open the Apps Script project in the browser:

```bash
clasp open
```

Then:
1. Click ⚙️ **Project Settings**
2. Under "Google Cloud Platform (GCP) Project", click **Change project**
3. Under "Script Properties", add:
   - Property: `SPREADSHEET_ID`
   - Value: Your Spreadsheet ID from Step 4

Alternatively, update `Code.gs` to use a bound spreadsheet.

## Step 7: Push Code

```bash
clasp push
```

When prompted about overwriting `appsscript.json`, type `y`.

## Step 8: Deploy as Web App

```bash
clasp deploy --description "Production v1.0"
```

Output will include the **Web App URL**:
```
Created version 1.
- AKfycb... @1.
```

To get the full URL:
```bash
clasp deployments
```

Copy the URL ending in `/exec`.

## Step 9: Configure Python (Colab)

### Option A: Colab Secrets (Recommended)

1. Open your Colab notebook
2. Click 🔑 **Secrets** in the left sidebar
3. Add new secret:
   - Name: `GAS_WEBAPP_URL`
   - Value: Your Web App URL
4. Toggle "Notebook access" ON

### Option B: Environment Variable

```python
import os
os.environ['GAS_WEBAPP_URL'] = 'https://script.google.com/macros/s/YOUR_ID/exec'
```

## Step 10: Verify Deployment

### Test Apps Script

In the Apps Script editor, run:
```javascript
testDeployment()
```

Check **Executions** log for results.

### Test Python Integration

```python
from python.colab_integration import GASClient, Config

client = GASClient(Config.get_webapp_url())
client.test_connection()
```

Expected output:
```
🔍 Testing connection to GAS Web App...
📡 Status Code: 200
🎉 Connection test PASSED!
```

## Next Steps

- [DEPLOYMENT.md](DEPLOYMENT.md) - Detailed deployment workflows
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design documentation

## Quick Reference

| Command | Purpose |
|---------|---------|
| `clasp login` | Authenticate with Google |
| `clasp push` | Push local code to Apps Script |
| `clasp pull` | Pull remote code to local |
| `clasp deploy` | Create new deployment |
| `clasp deployments` | List all deployments |
| `clasp open` | Open project in browser |
| `clasp logs` | View execution logs |
