# Media Uploader Fix: Deployment Guide

## Overview
This fix addresses critical issues in the media upload system:
- Missing database schema for `media_uploads` table
- Incomplete Cloudinary integration error handling
- Missing security event logging
- Poor error messages and authorization checks

## What Changed

### 1. Database Schema (New)
**File:** `backend/src/migrations/schema_media_uploads.sql`

Creates two new tables:
- `media_uploads` — stores metadata for all uploaded files
- `media_upload_audit` — tracks all upload attempts (success/rejection/malware)

### 2. Upload Controller (Enhanced)
**File:** `backend/src/controllers/uploadsController.js`

**Changes:**
- Added security context logging (userId, ipAddress)
- Improved error handling with specific status codes (409 for duplicates, 401 for auth failures)
- Distinguished Cloudinary errors from database errors
- Added detailed audit logging for all upload attempts
- Better error messages for users

### 3. Upload Routes (Improved)
**File:** `backend/src/routes/uploads.js`

**Changes:**
- Added Multer fileFilter to catch missing files early
- Better documentation
- Consistent field name validation

### 4. Cloudinary Client (Enhanced)
**File:** `backend/src/services/cloudinaryClient.js`

**Changes:**
- Better JSDoc documentation
- Explicit error messages
- Clarified signed URL generation for private assets

### 5. Security Service (New)
**File:** `backend/src/services/securityEventService.js`

**Changes:**
- Added `recordSecurityEvent()` for upload security events
- Added `recordUploadAudit()` for upload attempt tracking
- Graceful failure (won't crash if audit table doesn't exist)

## Deployment Steps

### Step 1: Set Environment Variables
```bash
# Copy .env.example to .env and fill in your Cloudinary credentials
cp .env.example .env

# Required vars:
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### Step 2: Run Database Migrations
```bash
# This creates the media_uploads and media_upload_audit tables
node backend/src/config/migrate.js

# Or manually:
psql $DATABASE_URL < backend/src/migrations/schema_media_uploads.sql
```

### Step 3: Restart Backend
```bash
# Development
npm run dev

# Production
npm start
```

### Step 4: Test Upload Flow
```bash
# 1. Sign in to get an access token
curl -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com", "password":"test123"}'

# 2. Upload a file
curl -X POST http://localhost:5000/api/uploads \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -F 'file=@/path/to/image.jpg'

# Expected response (201):
# {"message": "Upload successful.", "media": {"id": 1, "url": "...", ...}}

# 3. Retrieve your uploads
curl http://localhost:5000/api/uploads/mine \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

## Troubleshooting

### "Media upload is not configured"
**Cause:** Cloudinary env vars are missing or empty
**Fix:** 
```bash
# Verify all three are set:
echo $CLOUDINARY_CLOUD_NAME
echo $CLOUDINARY_API_KEY
echo $CLOUDINARY_API_SECRET

# If using Railway/Render, add to project settings or redeploy with updated .env
```

### "File too large" errors
**Cause:** File exceeds 50MB Multer limit or category limit
**Fix:** Check file size limits in `uploadSecurity.js`:
- Image: 8MB
- Video: 50MB
- Audio: 15MB
- Document: 20MB

### "This file does not appear to be a valid..."
**Cause:** Magic byte check failed (spoofed file type)
**Fix:** Ensure file extension matches actual content (e.g., don't rename .exe to .jpg)

### Database errors (FK constraint, duplicate key)
**Cause:** `media_uploads` table doesn't exist or is malformed
**Fix:** 
```bash
# Check table exists:
psql $DATABASE_URL -c "\dt media_uploads"

# Recreate if missing:
node backend/src/config/migrate.js
```

## Configuration Reference

### Environment Variables
| Variable | Required | Default | Purpose |
|----------|----------|---------|----------|
| `CLOUDINARY_CLOUD_NAME` | ✓ | — | Cloudinary account ID |
| `CLOUDINARY_API_KEY` | ✓ | — | Cloudinary API key (public) |
| `CLOUDINARY_API_SECRET` | ✓ | — | Cloudinary API secret (private, never expose) |
| `CLAMSCAN_BIN` | | `/usr/bin/clamscan` | Path to clamscan binary (for malware scanning) |
| `CLAMAV_ENABLED` | | `false` | Enable ClamAV scanning |

### File Size Limits (backend/src/services/uploadSecurity.js)
- Image: 8 MB (includes JPEG, PNG, WebP, GIF)
- Video: 50 MB (MP4, WebM, MOV)
- Audio: 15 MB (MP3, WAV, OGG, M4A)
- Document: 20 MB (PDF, DOC/DOCX, XLS/XLSX)

To change: edit `FILE_CATEGORIES` in `uploadSecurity.js`

## Security Notes

1. **Never commit `.env` files** — they contain secrets
2. **Cloudinary API Secret** — keep this private, never expose in frontend
3. **File validation** — uses MIME allowlist + magic byte verification + threat scan
4. **Audit logging** — all upload attempts logged to `media_upload_audit` table
5. **User isolation** — uploads tagged with authenticated user's ID, cannot be attributed to another user

## Rollback (if needed)

If issues arise, the old upload code is still in the repository history.

```bash
# Revert to previous commit
git revert HEAD~1

# Or switch to main branch
git checkout main
```

## Support

For issues:
1. Check server logs: `docker logs backend` or `npm run dev`
2. Check Security Operations Dashboard (if admin): `/admin/security-ops`
3. Check database audit table: `SELECT * FROM media_upload_audit ORDER BY created_at DESC LIMIT 20;`
