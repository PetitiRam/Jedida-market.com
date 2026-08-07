import { useTheme } from '../contexts/ThemeContext';
import Icon from './icons/icon';

const OPTIONS = [
  { key: 'light', icon: 'sun', label: 'Light theme' },
  { key: 'dark', icon: 'moon', label: 'Dark theme' },
  { key: 'system', icon: 'laptop', label: 'Match system theme' }
];

export default function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={mode === opt.key ? 'active' : ''}
          onClick={() => setMode(opt.key)}
          aria-label={opt.label}
          aria-pressed={mode === opt.key}
          title={opt.label}
        >
          <Icon name={opt.icon} size={15} />
        </button>
      ))}
    </div>
  );
}
