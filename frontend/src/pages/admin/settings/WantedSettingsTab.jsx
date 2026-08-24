import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, Toggle } from '../settingsCenterUI';

// Only flags for capabilities actually built and actually checked in
// wantedController.js — see the phase92 migration header for why the
// brief's other §43 items (image requests, a separate AI-sourcing
// toggle, supplier invitations, saved wants, agent moderation, promoted
// wants) aren't listed here yet.
const FLAGS = [
  { key: 'wantedPostsEnabled', label: 'Wanted Posts', description: 'Buyers can post a new Wanted request at all.' },
  { key: 'publicFeedEnabled', label: 'Public Wanted Feed', description: 'Public requests are visible in the feed and to signed-out visitors.' },
  { key: 'privateRequestsEnabled', label: 'Private Requests', description: 'Buyers may post a request visible only to themselves and matched suppliers.' },
  { key: 'likesEnabled', label: 'Likes', description: 'Social engagement only — a like never creates an order.' },
  { key: 'repliesEnabled', label: 'Replies', description: 'Plain social replies on a Wanted post, distinct from a structured Offer.' },
  { key: 'offersEnabled', label: 'Offers', description: 'Businesses may submit a structured Offer (quote) on a request.' },
  { key: 'negotiationEnabled', label: 'Negotiation', description: 'Back-and-forth messages/counter-offers on a submitted Offer.' },
  { key: 'notificationsEnabled', label: 'Notifications', description: 'In-app notifications for matches, offers, replies and negotiation.' },
  {
    key: 'contactProtectionEnabled', label: 'Contact Protection', critical: true,
    description: 'Blocks phone numbers, social handles and off-platform payment language in quotes, replies and negotiation. Turning this off removes that protection for every Wanted message — leave it on unless you have a specific reason.'
  }
];

export default function WantedSettingsTab() {
  const [form, setForm] = useState(null);
  const { saving, message, run } = useSaveState();

  const load = async () => { const { data } = await api.getSection('wanted'); setForm(data.value); };
  useEffect(() => { load(); }, []);

  const save = (e) => { e.preventDefault(); run(() => api.updateSection('wanted', form)); };
  const set = (key) => (value) => setForm({ ...form, [key]: value });

  if (!form) return <div className="empty-state">Loading Jedida Wanted settings…</div>;

  return (
    <div>
      <SaveFeedback message={message} />
      <SectionCard
        title="Jedida Wanted"
        description="Per-capability kill switches for the Wanted reverse marketplace — every toggle here is checked live by the backend, not decorative."
      >
        <form onSubmit={save}>
          {FLAGS.map((f) => (
            <div key={f.key} style={f.critical ? { background: 'rgba(179,38,30,0.06)', borderRadius: 8, padding: '4px 10px', margin: '4px 0' } : undefined}>
              <Toggle checked={form[f.key] !== false} onChange={set(f.key)} label={f.label} />
              <p className="product-card-meta" style={{ margin: '-4px 0 8px 50px' }}>{f.description}</p>
            </div>
          ))}
          <button className="btn-primary" disabled={saving} style={{ marginTop: 8 }}>{saving ? 'Saving…' : 'Save Wanted settings'}</button>
        </form>
      </SectionCard>
    </div>
  );
}
