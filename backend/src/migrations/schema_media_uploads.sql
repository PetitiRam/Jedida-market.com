-- Media Uploads Table
-- Stores metadata for all user-uploaded media (images, videos, audio, documents)
-- via the /api/uploads endpoint (Cloudinary backend) and partner/KYC document uploads.
-- Files are stored in Cloudinary; this table holds the URLs and metadata only.

CREATE TABLE IF NOT EXISTS media_uploads (
  id BIGSERIAL PRIMARY KEY,
  uploaded_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image', 'video', 'audio', 'document')),
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  provider VARCHAR(50) NOT NULL DEFAULT 'cloudinary',
  original_name VARCHAR(255),
  bytes BIGINT,
  width INT,
  height INT,
  duration_seconds INT,
  cloudinary_public_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_media_uploads_uploaded_by ON media_uploads(uploaded_by);
CREATE INDEX idx_media_uploads_created_at ON media_uploads(created_at);
CREATE INDEX idx_media_uploads_cloudinary_public_id ON media_uploads(cloudinary_public_id);

-- Audit: track upload attempts (success and rejection)
CREATE TABLE IF NOT EXISTS media_upload_audit (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET,
  file_name VARCHAR(255),
  file_size BIGINT,
  mime_type VARCHAR(100),
  status VARCHAR(20) CHECK (status IN ('success', 'rejected', 'malware', 'failed')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_media_upload_audit_user_id ON media_upload_audit(user_id);
CREATE INDEX idx_media_upload_audit_created_at ON media_upload_audit(created_at);
CREATE INDEX idx_media_upload_audit_status ON media_upload_audit(status);
