import { useState } from 'react';
import Icon from '../icons/icon';
import FloatingInput from './FloatingInput';
import PasswordStrengthMeter from './PasswordStrengthMeter';

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  valid,
  required,
  autoComplete = 'current-password',
  minLength,
  showStrength = false,
  placeholder,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <FloatingInput
        id={id}
        label={label}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        icon="lock"
        error={error}
        valid={valid}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        placeholder={placeholder}
        rightSlot={
          <button
            type="button"
            className="jd-field-toggle"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            tabIndex={0}
          >
            <Icon name={visible ? 'eyeOff' : 'eye'} size={17} />
          </button>
        }
      />
      {showStrength && value && <PasswordStrengthMeter password={value} />}
    </div>
  );
}
