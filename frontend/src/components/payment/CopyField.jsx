import { useState } from "react";
import Icon from "../icons/icon";

export default function CopyField({ label, value, amount = false }) {
  const [copied, setCopied] = useState(false);

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
    } catch {
      // clipboard API unavailable — fall back silently, the value is still visible
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="jp-detail-row">
      <div className="jp-detail-label">{label}</div>
      <div className="jp-detail-value-row">
        <span className={`jp-detail-value${amount ? " jp-amount" : ""}`}>{value}</span>
        <button type="button" className={`jp-copy-btn${copied ? " is-copied" : ""}`} onClick={doCopy}>
          <Icon name={copied ? "check" : "copy"} size={13} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
