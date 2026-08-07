import Icon from '../icons/icon';

export default function Checkbox({ checked, onChange, children, id }) {
  return (
    <div
      className={`jd-checkbox-row ${checked ? 'checked' : ''}`}
      onClick={() => onChange(!checked)}
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      id={id}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
    >
      <span className="jd-checkbox-box">
        {checked && <Icon name="check" size={13} strokeWidth={3} />}
      </span>
      <span className="jd-checkbox-text">{children}</span>
    </div>
  );
}
