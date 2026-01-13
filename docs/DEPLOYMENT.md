# Deployment Guide

Workflows for deploying updates to the Tri-State Dashboard.

## Apps Script Deployment

### Initial Deployment

```bash
cd apps-script

# Push code to Apps Script
clasp push

# Create first deployment
clasp deploy --description "Production v1.0"
```

### Update Existing Deployment

```bash
# Make code changes locally
# ...

# Push changes
clasp push

# Option 1: Create new version (keeps old version accessible)
clasp deploy --description "Production v1.1 - Bug fixes"

# Option 2: Update existing deployment (replaces in-place)
clasp deploy --deploymentId YOUR_DEPLOYMENT_ID --description "Production v1.1"
```

### View Deployments

```bash
clasp deployments
```

Example output:
```
2 Deployments.
- AKfycbx... @1 - Production v1.0
- AKfycby... @2 - Production v1.1
```

### Rollback

```bash
# Find previous deployment ID
clasp deployments

# Undeploy problematic version
clasp undeploy AKfycby...

# Redeploy previous version as current
clasp deploy --deploymentId AKfycbx... --description "Rollback to v1.0"
```

## Python Deployment Options

### Google Colab (Manual)

1. Upload `python/colab_integration.py` to Colab
2. Configure secrets (see [SETUP.md](SETUP.md))
3. Run cells manually

### Google Colab (Scheduled)

Use Colab Pro's scheduled execution:
1. Open notebook
2. Click **Connect** dropdown
3. Select **Schedule**
4. Configure timing

### Google Cloud Functions

```bash
# Create function
gcloud functions deploy tristate-processor \
  --runtime python39 \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point main \
  --source python/ \
  --set-env-vars GAS_WEBAPP_URL=your_url

# Update function
gcloud functions deploy tristate-processor \
  --source python/
```

### Local Cron Job

```bash
# Add to crontab (runs every 6 hours)
0 */6 * * * cd /path/to/tri-state-data-dashboard && python3 python/colab_integration.py
```

## CI/CD with GitHub Actions

The included workflow (`.github/workflows/deploy.yml`) provides:

- **On Pull Request**: Syntax validation
- **On Push to Main**: Full validation suite

### Enabling Automated Deployment

1. Create CLASP credentials:
   ```bash
   cat ~/.clasprc.json
   ```

2. Add to GitHub Secrets:
   - `CLASP_CREDENTIALS`: Contents of `.clasprc.json`

3. Update workflow to deploy:
   ```yaml
   - name: Deploy
     run: |
       echo '${{ secrets.CLASP_CREDENTIALS }}' > ~/.clasprc.json
       cd apps-script
       clasp push
       clasp deploy --description "Automated deploy"
   ```

## Environment Management

### Development

```bash
# Use /dev URL for testing
clasp open --webapp
# Click "Test web app" > Get /dev URL
```

The `/dev` URL always runs the latest saved code (not deployed).

### Staging

Create a separate Apps Script project:
```bash
clasp create --title "Tri-State Dashboard - Staging"
```

### Production

Use versioned deployments with the `/exec` URL.

## Deployment Checklist

Before deploying:

- [ ] All tests pass (`clasp run testDeployment`)
- [ ] Code reviewed and approved
- [ ] No debug logging left enabled
- [ ] Error handling in place
- [ ] Documentation updated

After deploying:

- [ ] Verify web app loads
- [ ] Test Python connection
- [ ] Check dashboard displays data
- [ ] Monitor execution logs for errors
