import { useEffect, useState } from 'react';
import client from '../../api/client';
import { CATEGORIES } from '../../constants/categories';
import { aiTrainingApi } from '../../api/aiTrainingApi';
import { KNOWLEDGE_COLLECTIONS } from '../../api/adminAiTrainingApi';

function Section({ title, subtitle, children }) {
  return (
    <div className="card-surface" style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 2 }}>{title}</h3>
      {subtitle && <p style={{ color: '#5B6760', fontSize: '0.85rem', marginTop: 0, marginBottom: 12 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

export default function AIAssistantHubPanel() {
  // ---- Amina: store designer ----
  const [bizDescription, setBizDescription] = useState('');
  const [design, setDesign] = useState(null);
  const [designBusy, setDesignBusy] = useState(false);

  // ---- Nsubuga Joseph: product reviewer ----
  const [draft, setDraft] = useState({ title: '', description: '', category: 'other', price: '', currency: 'USD' });
  const [analysis, setAnalysis] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  // ---- TAUSI: analytics ----
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // ---- TAUSI: marketing ----
  const [myProducts, setMyProducts] = useState([]);
  const [marketingProductId, setMarketingProductId] = useState('');
  const [marketingKind, setMarketingKind] = useState('social_post');
  const [marketingCopy, setMarketingCopy] = useState(null);
  const [marketingBusy, setMarketingBusy] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignBudget, setCampaignBudget] = useState('');

  // ---- PETITI: security ----
  const [security, setSecurity] = useState(null);

  // ---- Business memory ----
  const [memory, setMemory] = useState([]);
  const [newNote, setNewNote] = useState('');

  // ---- AI Training Center: suggest a knowledge item ----
  const [suggestion, setSuggestion] = useState({ collection: 'seller_success', question: '', suggestedAnswer: '' });
  const [mySuggestions, setMySuggestions] = useState([]);
  const [suggestBusy, setSuggestBusy] = useState(false);

  useEffect(() => {
    client.get('/ai-business/analytics').then(({ data }) => setAnalytics(data.analytics)).catch(() => {}).finally(() => setAnalyticsLoading(false));
    client.get('/products/mine').then(({ data }) => setMyProducts(data.products || [])).catch(() => {});
    client.get('/ai-business/marketing/campaigns').then(({ data }) => setCampaigns(data.campaigns || [])).catch(() => {});
    client.get('/ai-business/security').then(({ data }) => setSecurity(data)).catch(() => {});
    client.get('/ai-business/memory').then(({ data }) => setMemory(data.memory || [])).catch(() => {});
    aiTrainingApi.mySuggestions().then(({ data }) => setMySuggestions(data.suggestions || [])).catch(() => {});
  }, []);

  const submitKnowledgeSuggestion = async () => {
    if (!suggestion.question.trim() || !suggestion.suggestedAnswer.trim()) return;
    setSuggestBusy(true);
    try {
      await aiTrainingApi.submitSuggestion(suggestion);
      setSuggestion({ collection: 'seller_success', question: '', suggestedAnswer: '' });
      const { data } = await aiTrainingApi.mySuggestions();
      setMySuggestions(data.suggestions || []);
    } catch (err) {
      alert(err.friendlyMessage || 'Could not submit your suggestion.');
    } finally { setSuggestBusy(false); }
  };

  const runDesign = async () => {
    if (!bizDescription.trim()) return;
    setDesignBusy(true);
    try {
      const { data } = await client.post('/ai-business/store-design', { businessDescription: bizDescription, overwriteDescription: !!design });
      setDesign(data.design);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not design your storefront.');
    } finally {
      setDesignBusy(false);
    }
  };

  const runReview = async () => {
    if (!draft.title.trim()) return;
    setReviewBusy(true);
    try {
      const { data } = await client.post('/ai-business/product-review', draft);
      setAnalysis(data.analysis);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not review this product.');
    } finally {
      setReviewBusy(false);
    }
  };

  const generateMarketing = async () => {
    setMarketingBusy(true);
    try {
      const { data } = await client.post('/ai-business/marketing/generate', { productId: marketingProductId || undefined, kind: marketingKind });
      setMarketingCopy(data.copy);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not generate marketing copy.');
    } finally {
      setMarketingBusy(false);
    }
  };

  const submitCampaign = async () => {
    if (!marketingCopy) return;
    try {
      const { data } = await client.post('/ai-business/marketing/campaigns', {
        productId: marketingProductId || undefined,
        title: marketingCopy.headline,
        budget: Number(campaignBudget) || 0,
      });
      setCampaigns((c) => [data.campaign, ...c]);
      setCampaignBudget('');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not submit campaign for review.');
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const { data } = await client.post('/ai-business/memory', { content: newNote, category: 'note' });
    setMemory((m) => [data.entry, ...m]);
    setNewNote('');
  };

  const removeNote = async (id) => {
    await client.delete(`/ai-business/memory/${id}`);
    setMemory((m) => m.filter((n) => n.id !== id));
  };

  return (
    <div>
      <Section title="🏪 Design your store with Amina" subtitle="Describe your business in plain language — Amina writes your storefront description, suggests categories, and sketches homepage sections suited to your business.">
        <div className="field-group" style={{ marginBottom: 10 }}>
          <label>What do you sell?</label>
          <textarea
            rows={2}
            value={bizDescription}
            onChange={(e) => setBizDescription(e.target.value)}
            placeholder="e.g. I sell Ugandan coffee — beans and ground, wholesale and retail"
          />
        </div>
        <button className="btn-primary" onClick={runDesign} disabled={designBusy}>
          {designBusy ? 'Designing…' : design ? '✨ Regenerate' : '✨ Design my store'}
        </button>

        {design && (
          <div style={{ marginTop: 14, fontSize: '0.88rem' }}>
            <p><b>Tagline:</b> {design.tagline}</p>
            <p><b>Description</b> (saved to your shop): {design.description}</p>
            <p><b>Category suggestions:</b> {design.categorySuggestions?.join(', ')}</p>
            <p><b>Banner:</b> {design.bannerHeadline} — {design.bannerSubtext}</p>
            {design.sections?.map((s, i) => (
              <div key={i} style={{ marginTop: 6 }}><b>{s.title}:</b> {s.body}</div>
            ))}
          </div>
        )}
      </Section>

      <Section title="📦 Review a product with Nsubuga Joseph" subtitle="Get polished copy, missing-info flags, and a real pricing comparison before you list.">
        <div className="field-row">
          <div className="field-group"><label>Title</label><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
          <div className="field-group"><label>Category</label>
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div className="field-group" style={{ marginBottom: 10 }}>
          <label>Description</label>
          <textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </div>
        <div className="field-row" style={{ marginBottom: 10 }}>
          <div className="field-group"><label>Price</label><input type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></div>
          <div className="field-group"><label>Currency</label><input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} /></div>
        </div>
        <button className="btn-primary" onClick={runReview} disabled={reviewBusy}>{reviewBusy ? 'Reviewing…' : '🔍 Review listing'}</button>

        {analysis && (
          <div style={{ marginTop: 14, fontSize: '0.88rem' }}>
            <p><b>Polished title:</b> {analysis.polishedTitle}</p>
            <p><b>Polished description:</b> {analysis.polishedDescription}</p>
            {analysis.missingInfo?.length > 0 && (
              <div><b>⚠️ Missing:</b><ul>{analysis.missingInfo.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
            )}
            {analysis.categorySuggestion && (
              <p><b>Category suggestion:</b> {analysis.categorySuggestion.suggested} ({analysis.categorySuggestion.confidence}% confidence)</p>
            )}
            {analysis.pricing && <p><b>Pricing:</b> {analysis.pricing.guidance}</p>}
          </div>
        )}
      </Section>

      <Section title="📊 Business performance — TAUSI" subtitle="Real numbers from your listings, with plain-language suggestions.">
        {analyticsLoading && <p>Loading…</p>}
        {analytics && (
          <div style={{ fontSize: '0.88rem' }}>
            <p>{analytics.summary}</p>
            {analytics.suggestions?.length > 0 && (
              <ul>{analytics.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
            )}
            <p style={{ color: '#5B6760' }}>{analytics.totalViews} total views · {analytics.totalOrders} total orders · {analytics.conversionRate}% conversion</p>
          </div>
        )}
      </Section>

      <Section title="📣 Marketing assistant — TAUSI" subtitle="Generate ready-to-post copy for a product, then submit it as an ad campaign for review.">
        <div className="field-row" style={{ marginBottom: 10 }}>
          <div className="field-group">
            <label>Product (optional)</label>
            <select value={marketingProductId} onChange={(e) => setMarketingProductId(e.target.value)}>
              <option value="">General shop promotion</option>
              {myProducts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label>Type</label>
            <select value={marketingKind} onChange={(e) => setMarketingKind(e.target.value)}>
              <option value="social_post">Social media post</option>
              <option value="ad">Advertisement</option>
              <option value="promo">Promotional message</option>
              <option value="seasonal">Seasonal offer</option>
            </select>
          </div>
        </div>
        <button className="btn-primary" onClick={generateMarketing} disabled={marketingBusy}>{marketingBusy ? 'Writing…' : '✨ Generate copy'}</button>

        {marketingCopy && (
          <div style={{ marginTop: 14, fontSize: '0.88rem' }}>
            <p><b>{marketingCopy.headline}</b></p>
            <p>{marketingCopy.body}</p>
            {marketingCopy.hashtags && <p style={{ color: '#5B6760' }}>{marketingCopy.hashtags.join(' ')}</p>}
            {marketingKind === 'ad' && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input placeholder="Budget" type="number" value={campaignBudget} onChange={(e) => setCampaignBudget(e.target.value)} style={{ maxWidth: 120 }} />
                <button className="btn-primary" onClick={submitCampaign}>Submit for review</button>
              </div>
            )}
          </div>
        )}

        {campaigns.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <b style={{ fontSize: '0.85rem' }}>Your campaigns</b>
            {campaigns.map((c) => (
              <div key={c.id} style={{ fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid #E7EFE9' }}>
                <span>{c.title}</span><span>{c.status}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="🛡️ Security overview — PETITI" subtitle="Fraud/risk signals concerning your account or listings.">
        {security && (
          <div style={{ fontSize: '0.88rem' }}>
            <p>Risk score: <b>{security.riskScore}</b> ({security.reportCount} report(s) on file)</p>
            {security.reports?.length > 0 ? (
              <ul>{security.reports.map((r) => <li key={r.id}>{r.category.replace(/_/g, ' ')} — {r.details}</li>)}</ul>
            ) : (
              <p style={{ color: '#5B6760' }}>No security signals on your account or listings.</p>
            )}
          </div>
        )}
      </Section>

      <Section title="🧠 What the AI remembers about your business" subtitle="Add facts, style notes, or common customer questions so every AI feature gets more useful over time.">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input style={{ flex: 1 }} value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="e.g. We only ship on Mondays and Thursdays" />
          <button className="btn-primary" onClick={addNote}>Add</button>
        </div>
        {memory.map((m) => (
          <div key={m.id} style={{ fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid #E7EFE9' }}>
            <span>{m.content}</span>
            <button onClick={() => removeNote(m.id)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </Section>

      <Section title="🎓 Suggest knowledge for the AI Training Center" subtitle="Submit a business FAQ or product knowledge tip. An admin reviews and approves it before the Jedida AI can use it — nothing here reaches the AI automatically.">
        <select value={suggestion.collection} onChange={(e) => setSuggestion({ ...suggestion, collection: e.target.value })} style={{ marginBottom: 8 }}>
          {KNOWLEDGE_COLLECTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input
          style={{ width: '100%', marginBottom: 8 }}
          placeholder="A question buyers or sellers often ask"
          value={suggestion.question}
          onChange={(e) => setSuggestion({ ...suggestion, question: e.target.value })}
        />
        <textarea
          style={{ width: '100%', marginBottom: 8 }}
          rows={3}
          placeholder="The answer you'd suggest"
          value={suggestion.suggestedAnswer}
          onChange={(e) => setSuggestion({ ...suggestion, suggestedAnswer: e.target.value })}
        />
        <button className="btn-primary" disabled={suggestBusy} onClick={submitKnowledgeSuggestion}>Submit for review</button>

        {mySuggestions.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <b style={{ fontSize: '0.85rem' }}>Your submissions</b>
            {mySuggestions.map((s) => (
              <div key={s.id} style={{ fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid #E7EFE9' }}>
                <span>{s.question}</span><span style={{ textTransform: 'capitalize' }}>{s.status}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
