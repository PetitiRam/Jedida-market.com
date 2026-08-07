import { useRef, useState } from "react";
import Icon from "../icons/icon";

const MAX_SIZE_MB = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];

/**
 * Local, presentational upload zone. Calls onFileSelected(file) once a valid
 * file is chosen — the parent owns the actual upload/submit call, so this
 * component never talks to the API itself.
 */
export default function ReceiptUploadZone({ file, previewUrl, uploading = false, progress = 0, error = "", onFileSelected, onRemove, onRetry }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const validate = (f) => {
    if (!f) return "No file selected.";
    const isAccepted = ACCEPTED_TYPES.includes(f.type) || /\.(jpe?g|png|pdf)$/i.test(f.name);
    if (!isAccepted) return "Only JPG, PNG or PDF files are supported.";
    if (f.size > MAX_SIZE_MB * 1024 * 1024) return `File is too large — max ${MAX_SIZE_MB}MB.`;
    return "";
  };

  const handleFiles = (files) => {
    const f = files?.[0];
    if (!f) return;
    const validationError = validate(f);
    onFileSelected(f, validationError);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  if (file || previewUrl) {
    return (
      <div>
        <div className="jp-upload-preview">
          {previewUrl ? (
            <img src={previewUrl} alt="Receipt preview" className="jp-upload-thumb" />
          ) : (
            <div className="jp-upload-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="fileImage" size={26} />
            </div>
          )}

          <div className="jp-upload-info">
            <div className="jp-upload-filename">{file?.name || "Receipt uploaded"}</div>
            <div className="jp-upload-meta">
              {file?.size ? `${(file.size / 1024).toFixed(0)} KB` : ""}
              {uploading ? " · Uploading…" : error ? " · Failed" : " · Ready"}
            </div>
            {uploading && (
              <div className="jp-progress-track">
                <div className="jp-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>

          <div className="jp-upload-actions">
            {error && (
              <button type="button" className="jp-icon-btn" onClick={onRetry} aria-label="Retry upload">
                <Icon name="refresh" size={16} />
              </button>
            )}
            <button type="button" className="jp-icon-btn is-danger" onClick={onRemove} aria-label="Remove file">
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
        {error && (
          <p style={{ color: "#C0392B", fontSize: "0.8rem", marginTop: 8 }}>{error}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        className={`jp-upload-zone${dragging ? " is-dragging" : ""}${error ? " has-error" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="jp-upload-icon">
          <Icon name="upload" size={24} />
        </div>
        <div className="jp-upload-title">Drag &amp; drop your receipt here</div>
        <div className="jp-upload-sub">or click to browse from your device</div>
        <div className="jp-upload-formats">JPG, PNG or PDF · Max {MAX_SIZE_MB}MB</div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && (
        <p style={{ color: "#C0392B", fontSize: "0.8rem", marginTop: 8 }}>{error}</p>
      )}
    </div>
  );
}
