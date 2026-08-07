import { useEffect, useState } from 'react';
import client from '../../api/client';

export default function AdminSettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState('identity');
  const [message, setMessage] = useState('');

  useEffect(() => {
    client.get('/admin/settings').then(({ data }) => {
      setSettings(data.settings);
    });
  }, []);

  const updateSection = (section, key, value) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  const save = async () => {
    await client.patch('/admin/settings', settings);
    setMessage('Settings saved successfully');
  };

  if (!settings) return <div>Loading settings...</div>;

  return (
    <div className="card-surface">

      {message && <div className="alert alert-success">{message}</div>}

      {/* TABS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {['identity', 'branding', 'payments', 'commerce', 'ai', 'security'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: 8,
              background: activeTab === tab ? '#000' : '#eee',
              color: activeTab === tab ? '#fff' : '#000'
            }}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* IDENTITY TAB */}
      {activeTab === 'identity' && (
        <div>
          <input
            value={settings.identity?.marketplace_name || ''}
            onChange={(e) =>
              updateSection('identity', 'marketplace_name', e.target.value)
            }
            placeholder="Marketplace Name"
          />

          <input
            value={settings.identity?.support_email || ''}
            onChange={(e) =>
              updateSection('identity', 'support_email', e.target.value)
            }
            placeholder="Support Email"
          />
        </div>
      )}

      {/* BRANDING TAB */}
      {activeTab === 'branding' && (
        <div>
          <input
            value={settings.branding?.logo_url || ''}
            onChange={(e) =>
              updateSection('branding', 'logo_url', e.target.value)
            }
            placeholder="Logo URL"
          />
        </div>
      )}

      {/* PAYMENTS TAB */}
      {activeTab === 'payments' && (
        <div>
          <input
            value={settings.payment_settings?.mobileMoneyNumber || ''}
            onChange={(e) =>
              updateSection('payment_settings', 'mobileMoneyNumber', e.target.value)
            }
            placeholder="Mobile Money Number"
          />
        </div>
      )}

      {/* SAVE */}
      <button className="btn-primary" onClick={save}>
        Save Settings
      </button>
    </div>
  );
}
