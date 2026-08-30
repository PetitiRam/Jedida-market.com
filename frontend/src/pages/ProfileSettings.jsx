import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import MarketplaceHeader from '../components/MarketplaceHeader';
import Icon from '../components/icons/icon';
import { useTheme } from '../contexts/ThemeContext';

// Organized as cards, not one giant form — each section is either a link
// out to the page that already owns that concern (Security, Notifications,
// Verification all have dedicated, more complete pages elsewhere in the
// app already) or a small self-contained inline editor for settings that
// don't have a home yet (Privacy, Appearance, Language). Nothing here
// duplicates logic that already exists.
const LANGUAGES = [
  { key: 'en', label: 'English' },
  { key: 'fr', label: 'French' },
  { key: 'sw', label: 'Swahili' },
  { key: 'lg', label: 'Luganda' },
  { key: 'xog', label: 'Lusoga' }
];

const VISIBILITY_OPTIONS = [
  { key: 'public', label: 'Public', description: 'Anyone can view your full profile.' },
  { key: 'followers', label: 'Followers only', description: 'Only people who follow you can see your activity and stats.' },
  { key: 'private', label: 'Private', description: 'Only your header is visible until someone follows you.' }
];

const MESSAGE_OPTIONS = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'followers', label: 'People who follow you' },
  { key: 'no_one', label: 'No one' }
];

function SettingsCard({ title, description, children }) {
  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>{title}</h3>
      {description && <p style={{ fontSize: '0.85rem', color: '#5B6760', marginBottom: 12 }}>{description}</p>}
      {children}
    </div>
  );
}

function LinkCard({ to, icon, title, description, cta = 'Manage' }) {
  return (
    <Link to={to} className="card-surface" style={{
      display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, color: 'inherit', textDecoration: 'none'
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, background: 'rgba(11,61,36,0.08)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--forest)'
      }}>
        <Icon name={icon} size={19} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{title}</strong>
        <div style={{ fontSize: '0.85rem', color: '#5B6760' }}>{description}</div>
      </div>
      <span className="btn-link">{cta} →</span>
    </Link>
  );
}

function PrivacySection({ user, onSaved }) {
  const [visibility, setVisibility] = useState(user.profile_visibility);
  const [showFollowers, setShowFollowers] = useState(user.show_followers);
  const [showActivity, setShowActivity] = useState(user.show_activity);
  const [allowMessagesFrom, setAllowMessagesFrom] = useState(user.allow_messages_from);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const dirty = visibility !== user.profile_visibility || showFollowers !== user.show_followers
    || showActivity !== user.show_activity || allowMessagesFrom !== user.allow_messages_from;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await client.patch('/profile/me', {
        profileVisibility: visibility, showFollowers, showActivity, allowMessagesFrom
      });
      onSaved(data.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save privacy settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard title="Privacy" description="Control who can see your profile and activity.">
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 8 }}>Profile visibility</label>
        {VISIBILITY_OPTIONS.map((opt) => (
          <label key={opt.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', cursor: 'pointer' }}>
            <input type="radio" name="visibility" checked={visibility === opt.key} onChange={() => setVisibility(opt.key)} style={{ marginTop: 3 }} />
            <div>
              <div style={{ fontSize: '0.9rem' }}>{opt.label}</div>
              <div style={{ fontSize: '0.78rem', color: '#5B6760' }}>{opt.description}</div>
            </div>
          </label>
        ))}
      </div>

      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', cursor: 'pointer' }}>
        <span style={{ fontSize: '0.9rem' }}>Show my followers/following lists publicly</span>
        <input type="checkbox" checked={showFollowers} onChange={(e) => setShowFollowers(e.target.checked)} />
      </label>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', cursor: 'pointer' }}>
        <span style={{ fontSize: '0.9rem' }}>Show my activity (listings, reviews) publicly</span>
        <input type="checkbox" checked={showActivity} onChange={(e) => setShowActivity(e.target.checked)} />
      </label>

      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>Who can message you</label>
        <select value={allowMessagesFrom} onChange={(e) => setAllowMessagesFrom(e.target.value)}>
          {MESSAGE_OPTIONS.map((opt) => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
        </select>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <button className="btn-primary" onClick={save} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save privacy settings'}</button>
        {saved && <span style={{ fontSize: '0.85rem', color: 'var(--forest)' }}>Saved.</span>}
      </div>
    </SettingsCard>
  );
}

function AppearanceSection() {
  const { mode, setMode } = useTheme();
  const options = [
    { key: 'system', label: 'Match device', icon: 'laptop' },
    { key: 'light', label: 'Light', icon: 'sun' },
    { key: 'dark', label: 'Dark', icon: 'moon' }
  ];
  return (
    <SettingsCard title="Appearance">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((opt) => (
          <button
            key={opt.key}
            className={mode === opt.key ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setMode(opt.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name={opt.icon} size={15} /> {opt.label}
          </button>
        ))}
      </div>
    </SettingsCard>
  );
}

function LanguageSection({ user, onSaved }) {
  const [language, setLanguage] = useState(user.preferred_language || 'en');
  const [busy, setBusy] = useState(false);

  const save = async (key) => {
    setLanguage(key);
    setBusy(true);
    try {
      await client.patch('/auth/me/language', { language: key });
      onSaved({ preferred_language: key });
    } catch {
      setLanguage(user.preferred_language || 'en');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard title="Language & region" description="Chat translations and site text use this language. Your city/country (under Profile) are used for regional pricing and delivery.">
      <select value={language} onChange={(e) => save(e.target.value)} disabled={busy}>
        {LANGUAGES.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
      </select>
    </SettingsCard>
  );
}

export default function ProfileSettings() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    client.get('/profile/me').then(({ data }) => setProfile(data)).catch(() => {});
  }, []);

  const patchUser = (patch) => setProfile((prev) => prev && ({ ...prev, user: { ...prev.user, ...patch } }));

  if (!profile) return <div className="empty-state">Loading settings…</div>;
  const { user, verification } = profile;

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body" style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: 20 }}>Settings</h1>

        <LinkCard to="/profile" icon="user" title="Account & Profile" description="Name, username, bio, avatar, cover photo, location" />
        <PrivacySection user={user} onSaved={patchUser} />
        <LinkCard to="/notifications" icon="bell" title="Notifications" description="Choose what you get notified about" />
        <LinkCard to="/account/security" icon="lock" title="Security" description="Password, two-factor authentication, login activity" />
        <LinkCard
          to="/verify-identity"
          icon="checkShield"
          title="Verification"
          description={verification?.isVerified ? 'Your account is verified' : `Status: ${verification?.kycStatus || 'Not started'}`}
          cta={verification?.isVerified ? 'View' : 'Get verified'}
        />
        <AppearanceSection />
        <LanguageSection user={user} onSaved={patchUser} />
      </div>
    </div>
  );
}
