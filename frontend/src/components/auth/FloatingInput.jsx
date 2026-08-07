import Icon from '../icons/icon';

export default function FloatingInput({
  id,
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  icon,
  error,
  valid,
  required,
  autoComplete,
  inputMode,
  pattern,
  minLength,
  placeholder,
  rightSlot,
}) {
  const filled = value !== undefined && value !== null && String(value).length > 0;

  return (
    <div className={`jd-field ${icon ? 'jd-has-icon-left' : ''} ${error ? 'jd-error' : ''}`}>
      <div className="jd-field-input-wrap">
        {icon && (
          <span className="jd-field-icon-left">
            <Icon name={icon} size={17} />
          </span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          required={required}
          autoComplete={autoComplete}
          inputMode={inputMode}
          pattern={pattern}
          minLength={minLength}
          placeholder={placeholder || label}
          className={filled ? 'jd-filled' : ''}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <label htmlFor={id} className={`jd-field-label ${filled ? 'jd-float' : ''}`}>
          {label}
        </label>
        <span className="jd-field-icon-right">
          {rightSlot}
          {!rightSlot && valid === true && (
            <span className="jd-field-status jd-valid"><Icon name="check" size={16} /></span>
          )}
          {!rightSlot && valid === false && error && (
            <span className="jd-field-status jd-invalid"><Icon name="x" size={16} /></span>
          )}
        </span>
      </div>
      {error && (
        <div className="jd-field-error" id={`${id}-error`}>
          <Icon name="x" size={13} /> {error}
        </div>
      )}
    </div>
  );
}
