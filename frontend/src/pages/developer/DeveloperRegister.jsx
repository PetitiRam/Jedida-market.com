import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as developerPlatformApi from '../../api/developerPlatformApi';
import '../../styles/developer-platform.css';

const CATEGORY_OPTIONS = [
  ['independent_developer', 'Independent Developer'],
  ['freelancer', 'Freelancer'],
  ['startup', 'Startup'],
  ['software_company', 'Software Company'],
  ['enterprise', 'Enterprise'],
  ['technology_partner', 'Technology Partner'],
  ['integration_partner', 'Integration Partner'],
  ['educational_institution', 'Educational Institution'],
  ['research_organization', 'Research Organization'],
];

// type=organization pre-selects software_company and shows the org name
// field; the other query-string types (individual / integration_partner /
// enterprise) just pre-select the matching category. Registration itself
// creates one developer profile either way — a full Developer Organization
// (with its own team/roles) is created afterwards, once approved, from the
// dashboard's "Developer Organizations" section.
const TYPE_DEFAULTS = {
  organization: 'software_company',
  integration_partner: 'integration_partner',
  enterprise: 'enterprise',
  individual: 'independent_developer',
};

const AGREEMENTS = [
  ['developer_agreement', 'Jedida Developer Agreement'],
  ['marketplace_policies', 'Jedida Marketplace Policies'],
  ['api_terms', 'Jedida API Terms of Use'],
  ['privacy_policy', 'Jedida Privacy Policy'],
];

export default function DeveloperRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'individual';

  const [form, setForm] = useState({
    developerName: '',
    organizationName: '',
    country: '',
    developerCategory: TYPE_DEFAULTS[type] || 'independent_developer',
    website: '',
    githubUrl: '',
    portfolioUrl: '',
    primaryLanguages: '',
    techStack: '',
    yearsExperience: '',
    businessCategory: '',
    applicationDescription: '',
    expectedApiUsage: '',
  });
  const [agreements, setAgreements] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleAgreement = (key) => setAgreements((a) => ({ ...a, [key]: !a[key] }));

  const allAgreementsAccepted = AGREEMENTS.every(([key]) => agreements[key]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!allAgreementsAccepted) {
      setError('Please accept all four agreements before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      await developerPlatformApi.registerDeveloper({
        ...form,
        primaryLanguages: form.primaryLanguages.split(',').map((s) => s.trim()).filter(Boolean),
        techStack: form.techStack.split(',').map((s) => s.trim()).filter(Boolean),
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : null,
        agreements,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="jdp">
        <div className="jdp-center">
          <div className="jdp-card jdp-welcome">
            <div className="jdp-mark">✓</div>
            <h1>Application received</h1>
            <p>
              Thanks — your developer application is now in review. This is never automatic;
              you'll be notified once an admin has approved, rejected, or requested more
              information. You can check your status any time from the developer dashboard.
            </p>
            <button className="jdp-btn jdp-btn-lime" onClick={() => navigate('/developer/dashboard')}>
              Go to Developer Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jdp">
      <div className="jdp-form-wrap jdp-card">
        <h1>Register as Developer</h1>
        <div className="sub">
          Every application is reviewed by the Jedida team before any API access is granted.
        </div>

        {error && <div className="jdp-alert jdp-alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="jdp-field-row">
            <div className="jdp-field">
              <label>Full name *</label>
              <input value={form.developerName} onChange={set('developerName')} required />
            </div>
            <div className="jdp-field">
              <label>Country *</label>
              <input value={form.country} onChange={set('country')} required />
            </div>
          </div>

          <div className="jdp-field-row">
            <div className="jdp-field">
              <label>Developer category *</label>
              <select value={form.developerCategory} onChange={set('developerCategory')} required>
                {CATEGORY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="jdp-field">
              <label>Organization name (optional)</label>
              <input value={form.organizationName} onChange={set('organizationName')} />
            </div>
          </div>

          <div className="jdp-field-row">
            <div className="jdp-field">
              <label>Website (optional)</label>
              <input value={form.website} onChange={set('website')} placeholder="https://" />
            </div>
            <div className="jdp-field">
              <label>GitHub (optional)</label>
              <input value={form.githubUrl} onChange={set('githubUrl')} placeholder="https://github.com/…" />
            </div>
          </div>

          <div className="jdp-field">
            <label>Portfolio (optional)</label>
            <input value={form.portfolioUrl} onChange={set('portfolioUrl')} placeholder="https://" />
          </div>

          <div className="jdp-field-row">
            <div className="jdp-field">
              <label>Primary programming languages</label>
              <input value={form.primaryLanguages} onChange={set('primaryLanguages')} placeholder="JavaScript, Python, …" />
            </div>
            <div className="jdp-field">
              <label>Technology stack</label>
              <input value={form.techStack} onChange={set('techStack')} placeholder="React, PostgreSQL, …" />
            </div>
          </div>

          <div className="jdp-field-row">
            <div className="jdp-field">
              <label>Years of experience</label>
              <input type="number" min="0" value={form.yearsExperience} onChange={set('yearsExperience')} />
            </div>
            <div className="jdp-field">
              <label>Expected API usage</label>
              <select value={form.expectedApiUsage} onChange={set('expectedApiUsage')}>
                <option value="">Select…</option>
                <option value="light">Light (under 10k requests/month)</option>
                <option value="moderate">Moderate (10k–500k requests/month)</option>
                <option value="heavy">Heavy (500k+ requests/month)</option>
                <option value="enterprise">Enterprise scale</option>
              </select>
            </div>
          </div>

          <div className="jdp-field">
            <label>Business category</label>
            <input value={form.businessCategory} onChange={set('businessCategory')} placeholder="e.g. Logistics, Fintech, Agriculture…" />
          </div>

          <div className="jdp-field">
            <label>Application description *</label>
            <textarea rows={4} value={form.applicationDescription} onChange={set('applicationDescription')} required
              placeholder="What are you planning to build on Jedida?" />
          </div>

          <div style={{ margin: '20px 0' }}>
            {AGREEMENTS.map(([key, label]) => (
              <label className="jdp-check-row" key={key}>
                <input type="checkbox" checked={!!agreements[key]} onChange={() => toggleAgreement(key)} />
                <span>I have read and accept the {label}.</span>
              </label>
            ))}
          </div>

          <button className="jdp-btn jdp-btn-lime" type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        </form>
      </div>
    </div>
  );
}
