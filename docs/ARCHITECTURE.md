# Architecture Documentation

Technical design and system architecture for the Tri-State Data Dashboard.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     TRI-STATE ARCHITECTURE                       │
│                                                                  │
│  "Tri-State" refers to the three distinct layers of state:      │
│  1. Processing State (Python)                                   │
│  2. Storage State (Google Sheets)                               │
│  3. Presentation State (Dashboard)                              │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐
    │   Python/Colab   │
    │   (Processing)   │
    └────────┬─────────┘
             │ POST JSON
             │ {id, result, score}
             ▼
    ┌──────────────────┐      ┌──────────────────┐
    │ Apps Script API  │◄────▶│   Lock Service   │
    │    (Backend)     │      │  (Concurrency)   │
    └────────┬─────────┘      └──────────────────┘
             │ appendRow()
             ▼
    ┌──────────────────┐
    │  Google Sheets   │
    │   (Database)     │
    └────────┬─────────┘
             │ getValues()
             ▼
    ┌──────────────────┐      ┌──────────────────┐
    │  HTML Dashboard  │─────▶│  Google Sites    │
    │   (Frontend)     │      │   (Hosting)      │
    └──────────────────┘      └──────────────────┘
```

## Component Details

### 1. Python/Colab Layer

**Role:** Data processing and submission

**Responsibilities:**
- Transform raw data into structured format
- Validate data before submission
- Handle network errors with retry logic
- Batch processing for efficiency

**Key Classes:**
```python
class GASClient:
    """HTTP client with retry logic and redirect handling"""
    
class Config:
    """Environment configuration management"""
```

**Data Flow:**
```
Raw Data → Validation → JSON Serialization → HTTP POST → Response Handling
```

---

### 2. Apps Script API Layer

**Role:** REST API backend and business logic

**Endpoints:**

| Method | Function | Purpose |
|--------|----------|---------|
| GET | `doGet(e)` | Serve HTML dashboard |
| POST | `doPost(e)` | Receive and store data |

**Key Functions:**

```javascript
doGet(e)           // Serves HTML UI
doPost(e)          // Handles data ingestion
getDataForFrontend() // Provides data to dashboard
getOrCreateSheet() // Sheet management
createJsonResponse() // Standardized responses
```

**Error Handling:**
- Input validation with specific error codes
- LockService for concurrency
- Graceful degradation on failures

---

### 3. Google Sheets Layer

**Role:** Persistent data storage

**Schema:**

| Column | Type | Description |
|--------|------|-------------|
| Timestamp | DateTime | When data was received |
| ID | Number/String | Unique identifier |
| Result | String | Processing result description |
| Score | Number | Performance metric |

**Operations:**
- `appendRow()` - Add new data
- `getDataRange().getValues()` - Read all data
- Automatic sheet creation if missing

---

### 4. HTML Dashboard Layer

**Role:** Data visualization

**Features:**
- Auto-refresh every 30 seconds
- Real-time statistics (count, average, high score)
- Responsive design for mobile
- XSS protection via HTML escaping

**Technology:**
- Vanilla JavaScript (no frameworks)
- CSS with gradients and animations
- `google.script.run` for backend communication

---

## Data Flow Diagrams

### Write Path (Python → Sheet)

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  DATA   │──▶│VALIDATE │──▶│  POST   │──▶│  LOCK   │──▶│  SHEET  │
│ (JSON)  │   │ Fields  │   │ Request │   │ Acquire │   │ Append  │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
                                               │
                                               ▼
                                         ┌─────────┐
                                         │ Release │
                                         │  Lock   │
                                         └─────────┘
```

### Read Path (Dashboard → Sheet)

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Dashboard│──▶│ google.  │──▶│ getValues│──▶│ Render   │
│  Load    │   │script.run│   │ (Sheet)  │   │ Cards    │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
      │                                             │
      │◀────────────────────────────────────────────│
      │           Every 30 seconds
```

---

## Security Model

### Access Control

| Component | Access Level | Notes |
|-----------|--------------|-------|
| Web App | Anyone | Required for embedding |
| Script | USER_DEPLOYING | Runs as deployer |
| Sheet | Deployer only | Protected by script |

### Data Validation

All inputs validated server-side:
```javascript
var requiredFields = ['id', 'result', 'score'];
var missingFields = requiredFields.filter(function(field) {
  return !(field in requestData);
});
```

### XSS Prevention

HTML escaping in frontend:
```javascript
function escapeHtml(text) {
  var map = {'&': '&amp;', '<': '&lt;', '>': '&gt;'};
  return String(text).replace(/[&<>]/g, function(m) { return map[m]; });
}
```

---

## Concurrency Handling

### LockService Usage

```javascript
var lock = LockService.getScriptLock();
var hasLock = lock.tryLock(30000); // 30 second timeout

if (!hasLock) {
  // Return error - concurrent write in progress
}

try {
  // Critical section - write to sheet
  sheet.appendRow([...]);
} finally {
  lock.releaseLock();
}
```

### Why LockService?

- Google Sheets is not ACID-compliant
- Concurrent writes can corrupt data
- Lock ensures atomic operations

---

## Scaling Considerations

### Current Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| Execution time | 6 minutes | Per invocation |
| Daily quota | 90 minutes | Trigger time total |
| URL Fetch | 20,000/day | External requests |
| Sheet cells | 10 million | Per spreadsheet |

### Scaling Strategies

1. **Horizontal Scaling:**
   - Multiple Web Apps for load distribution
   - Separate scripts per data category

2. **Caching:**
   ```javascript
   var cache = CacheService.getScriptCache();
   var cached = cache.get('dashboard_data');
   if (cached) return JSON.parse(cached);
   ```

3. **Batching:**
   ```javascript
   sheet.getRange(row, 1, data.length, 4).setValues(data);
   ```

4. **Migration Path:**
   - Move to Cloud Functions for unlimited scale
   - Use Cloud SQL for larger datasets

---

## Error Handling Strategy

### Three-Layer Defense

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: INPUT VALIDATION                          │
│  - Check required fields                            │
│  - Validate data types                              │
│  - Return early with specific error codes           │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  Layer 2: GRACEFUL DEGRADATION                      │
│  - Try-catch around all operations                  │
│  - Lock release in finally block                    │
│  - Return error response, don't crash               │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  Layer 3: USER COMMUNICATION                        │
│  - Clear error messages                             │
│  - Specific error codes for debugging               │
│  - Guidance on how to fix                           │
└─────────────────────────────────────────────────────┘
```

### Error Codes

| Code | Meaning | Resolution |
|------|---------|------------|
| `MISSING_DATA` | No POST body | Include JSON payload |
| `INVALID_JSON` | Malformed JSON | Check JSON syntax |
| `MISSING_FIELDS` | Required fields absent | Include id, result, score |
| `LOCK_TIMEOUT` | Concurrent write | Retry request |
| `INTERNAL_ERROR` | Unexpected error | Check logs |

---

## Monitoring & Observability

### Logging

All operations logged:
```javascript
Logger.log('[doPost] Success - Row ' + rowNum + ' added in ' + executionTime + 's');
```

### Quota Monitoring

```javascript
function checkQuotaUsage() {
  // Measures execution time
  // Sends email alert if threshold exceeded
}
```

### Execution History

Access via:
- Apps Script Editor > Executions
- `clasp logs` command

---

## Future Enhancements

1. **Real-time Updates:** Replace polling with Apps Script triggers
2. **User Authentication:** Add OAuth for multi-user support
3. **Data Export:** Add CSV/JSON export endpoints
4. **Charting:** Integrate Google Charts for visualization
5. **Notifications:** Slack/Email alerts on data events
