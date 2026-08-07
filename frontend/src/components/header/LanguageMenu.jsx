import DropdownShell from './DropdownShell';
import RippleIconButton from './RippleIconButton';
import Icon from '../icons/icon';
import client from '../../api/client';

// Same language set the in-app translated chat already offers, so a
// person's choice here is consistent with the rest of the marketplace.
const LANGUAGES = [
  { key: 'en', label: 'English', flag: '🇬🇧' },
  { key: 'fr', label: 'French', flag: '🇫🇷' },
  { key: 'sw', label: 'Swahili', flag: '🇰🇪' },
  { key: 'lg', label: 'Luganda', flag: '🇺🇬' },
  { key: 'xog', label: 'Lusoga', flag: '🇺🇬' }
];

export default function LanguageMenu({ current = 'en', onChange }) {
  const active = LANGUAGES.find((l) => l.key === current) || LANGUAGES[0];

  const select = (key, close) => {
    onChange?.(key);
    client.patch('/auth/me/language', { language: key }).catch(() => {});
    close();
  };

  return (
    <DropdownShell
      width={200}
      trigger={({ open, toggle }) => (
        <RippleIconButton label="Language" active={open} onClick={toggle}>
          <Icon name="globe" size={18} />
        </RippleIconButton>
      )}
    >
      {({ close }) => (
        <>
          <div className="jd-menu-header"><span>Language</span></div>
          <div className="jd-menu-list">
            {LANGUAGES.map((l) => (
              <button
                key={l.key}
                type="button"
                className={`jd-menu-row jd-lang-row ${l.key === active.key ? 'is-active' : ''}`}
                onClick={() => select(l.key, close)}
              >
                <span className="jd-lang-flag">{l.flag}</span>
                <span className="jd-menu-row-title">{l.label}</span>
                {l.key === active.key && <span className="jd-lang-check">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </DropdownShell>
  );
}
