import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, Toggle } from '../settingsCenterUI';

function useSection(sectionKey) {
  const [form, setForm] = useState(null);
  const load = async () => { const { data } = await api.getSection(sectionKey); setForm(data.value); };
  useEffect(() => { load(); }, []);
  return [form, setForm];
}

export default function AdsAiNotificationsTab() {
  const [ads, setAds] = useSection('ads');
  const [ai, setAi] = useSection('ai');
  const [notif, setNotif] = useSection('notifications');
  const adsSave = useSaveState();
  const aiSave = useSaveState();
  const notifSave = useSaveState();

  return (
    <div>
      {ads && (
        <>
          <SaveFeedback message={adsSave.message} />
          <SectionCard title="Advertisement Settings" description="Pricing and limits for seller-purchased ad placements.">
            <form onSubmit={(e) => { e.preventDefault(); adsSave.run(() => api.updateSection('ads', ads)); }}>
              <div className="field-row">
                <div className="field-group"><label>Featured product price</label><input type="number" value={ads.featuredProductPrice} onChange={(e) => setAds({ ...ads, 
featuredProductPrice: Number(e.target.value) })} /></div>
                <div className="field-group"><label>Homepage banner price</label><input type="number" value={ads.homepageBannerPrice} onChange={(e) => setAds({ ...ads, 
homepageBannerPrice: Number(e.target.value) })} /></div>
              </div>
              <div className="field-row">
                <div className="field-group"><label>Ad duration (days)</label><input type="number" value={ads.adDurationDays} onChange={(e) => setAds({ ...ads, 
adDurationDays: Number(e.target.value) })} /></div>
                <div className="field-group"><label>Max active ads</label><input type="number" value={ads.maxActiveAds} onChange={(e) => setAds({ ...ads, maxActiveAds: 
Number(e.target.value) })} /></div>
              </div>
              <Toggle checked={ads.adsEnabled} onChange={(v) => setAds({ ...ads, adsEnabled: v })} label="Enable ads platform-wide" />
              <Toggle checked={ads.autoApproveAds} onChange={(v) => setAds({ ...ads, autoApproveAds: v })} label="Auto-approve ads (skip admin review)" />
              <button className="btn-primary" style={{ marginTop: 12 }} disabled={adsSave.saving}>{adsSave.saving ? 'Saving…' : 'Save ad settings'}</button>
            </form>
          </SectionCard>
        </>
      )}

      {ai && (
        <>
          <SaveFeedback message={aiSave.message} />
          <SectionCard title="AI Settings" description="Toggle PETITI/TAUSI-powered features platform-wide.">
            <form onSubmit={(e) => { e.preventDefault(); aiSave.run(() => api.updateSection('ai', ai)); }}>
              <Toggle checked={ai.enableAiAssistant} onChange={(v) => setAi({ ...ai, enableAiAssistant: v })} label="Enable AI assistant" />
              <Toggle checked={ai.enableAiSearch} onChange={(v) => setAi({ ...ai, enableAiSearch: v })} label="Enable AI-powered search" />
              <Toggle checked={ai.enableAiRecommendations} onChange={(v) => setAi({ ...ai, enableAiRecommendations: v })} label="Enable AI recommendations" />
              <Toggle checked={ai.enableAiProductDescriptions} onChange={(v) => setAi({ ...ai, enableAiProductDescriptions: v })} label="Enable AI product description 
polishing (Nsubuga Joseph)" />
              <Toggle checked={ai.enableAiModeration} onChange={(v) => setAi({ ...ai, enableAiModeration: v })} label="Enable AI fraud/content moderation (PETITI)" />
              <Toggle checked={ai.enableAiChat} onChange={(v) => setAi({ ...ai, enableAiChat: v })} label="Enable AI chat assistant for buyers" />
              <button className="btn-primary" style={{ marginTop: 12 }} disabled={aiSave.saving}>{aiSave.saving ? 'Saving…' : 'Save AI settings'}</button>
            </form>
          </SectionCard>
        </>
      )}

      {notif && (
        <>
          <SaveFeedback message={notifSave.message} />
          <SectionCard title="Notifications" description="Channels and site-wide banners.">
            <form onSubmit={(e) => { e.preventDefault(); notifSave.run(() => api.updateSection('notifications', notif)); }}>
              <Toggle checked={notif.emailNotifications} onChange={(v) => setNotif({ ...notif, emailNotifications: v })} label="Email notifications" />
              <Toggle checked={notif.smsNotifications} onChange={(v) => setNotif({ ...notif, smsNotifications: v })} label="SMS notifications" />
              <Toggle checked={notif.pushNotifications} onChange={(v) => setNotif({ ...notif, pushNotifications: v })} label="Push notifications (mobile app)" />
              <Toggle checked={notif.adminAlerts} onChange={(v) => setNotif({ ...notif, adminAlerts: v })} label="Admin alert emails for critical events" />
              <div className="field-group" style={{ marginTop: 10 }}>
                <label>Site-wide announcement banner</label>
                <input value={notif.announcementBanner} onChange={(e) => setNotif({ ...notif, announcementBanner: e.target.value })} placeholder="Leave blank to hide" />
              </div>
              <div className="field-group">
                <label>Maintenance notice text</label>
                <input value={notif.maintenanceNotice} onChange={(e) => setNotif({ ...notif, maintenanceNotice: e.target.value })} placeholder="Leave blank to hide" />
              </div>
              <button className="btn-primary" disabled={notifSave.saving}>{notifSave.saving ? 'Saving…' : 'Save notification settings'}</button>
            </form>
          </SectionCard>
        </>
      )}

      {(!ads || !ai || !notif) && <div className="empty-state">Loading…</div>}
    </div>
  );
}
