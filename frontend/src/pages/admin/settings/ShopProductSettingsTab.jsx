import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, Toggle } from '../settingsCenterUI';

function useSection(sectionKey) {
  const [form, setForm] = useState(null);
  const load = async () => { const { data } = await api.getSection(sectionKey); setForm(data.value); };
  useEffect(() => { load(); }, []);
  return [form, setForm];
}

export default function ShopProductSettingsTab() {
  const [shop, setShop] = useSection('shop');
  const [product, setProduct] = useSection('product');
  const shopSave = useSaveState();
  const productSave = useSaveState();

  const setShopField = (key, isNum) => (e) => setShop({ ...shop, [key]: isNum ? Number(e.target.value) : e.target.value });
  const setShopToggle = (key) => (val) => setShop({ ...shop, [key]: val });
  const setProductField = (key, isNum) => (e) => setProduct({ ...product, [key]: isNum ? Number(e.target.value) : e.target.value });
  const setProductToggle = (key) => (val) => setProduct({ ...product, [key]: val });

  return (
    <div>
      {shop && (
        <>
          <SaveFeedback message={shopSave.message} />
          <SectionCard title="Shop Settings" description="Rules applied to every seller's shop.">
            <form onSubmit={(e) => { e.preventDefault(); shopSave.run(() => api.updateSection('shop', shop)); }}>
              <Toggle checked={shop.requireShopApproval} onChange={setShopToggle('requireShopApproval')} label="Require admin approval before a shop goes live" />
              <Toggle checked={shop.allowMultipleShops} onChange={setShopToggle('allowMultipleShops')} label="Allow one seller to own multiple shops" />
              <div className="field-row" style={{ marginTop: 12 }}>
                <div className="field-group"><label>Max products per shop</label><input type="number" value={shop.maxProducts} onChange={setShopField('maxProducts', 
true)} /></div>
                <div className="field-group"><label>Max images per product</label><input type="number" value={shop.maxProductImages} 
onChange={setShopField('maxProductImages', true)} /></div>
                <div className="field-group"><label>Max videos per product</label><input type="number" value={shop.maxVideos} onChange={setShopField('maxVideos', true)} 
/></div>
              </div>
              <div className="field-row">
                <div className="field-group"><label>Max image size (MB)</label><input type="number" value={shop.maxImageSizeMb} onChange={setShopField('maxImageSizeMb', 
true)} /></div>
                <div className="field-group"><label>Max categories per shop</label><input type="number" value={shop.maxCategories} 
onChange={setShopField('maxCategories', true)} /></div>
                <div className="field-group">
                  <label>Default shop status</label>
                  <select value={shop.defaultShopStatus} onChange={setShopField('defaultShopStatus')}>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                  </select>
                </div>
              </div>
              <div className="field-group">
                <label>Allowed image formats (comma-separated)</label>
                <input value={shop.allowedImageFormats?.join(', ')} onChange={(e) => setShop({ ...shop, allowedImageFormats: e.target.value.split(',').map((s) => 
s.trim()) })} />
              </div>
              <button className="btn-primary" disabled={shopSave.saving}>{shopSave.saving ? 'Saving…' : 'Save shop settings'}</button>
            </form>
          </SectionCard>
        </>
      )}

      {product && (
        <>
          <SaveFeedback message={productSave.message} />
          <SectionCard title="Product Settings" description="Rules applied to every product listing.">
            <form onSubmit={(e) => { e.preventDefault(); productSave.run(() => api.updateSection('product', product)); }}>
              <div className="field-row">
                <div className="field-group"><label>Max products (global cap)</label><input type="number" value={product.maxProducts} 
onChange={setProductField('maxProducts', true)} /></div>
                <div className="field-group"><label>Max photos</label><input type="number" value={product.maxPhotos} onChange={setProductField('maxPhotos', true)} 
/></div>
                <div className="field-group"><label>Max videos</label><input type="number" value={product.maxVideos} onChange={setProductField('maxVideos', true)} 
/></div>
              </div>
              <div className="field-group"><label>Default currency</label><input value={product.defaultCurrency} onChange={setProductField('defaultCurrency')} /></div>
              <Toggle checked={product.allowDraftProducts} onChange={setProductToggle('allowDraftProducts')} label="Allow sellers to save draft products" />
              <Toggle checked={product.requireProductApproval} onChange={setProductToggle('requireProductApproval')} label="Require admin approval before a listing goes 
live" />
              <Toggle checked={product.enableReviews} onChange={setProductToggle('enableReviews')} label="Enable product reviews" />
              <Toggle checked={product.enableRatings} onChange={setProductToggle('enableRatings')} label="Enable star ratings" />
              <Toggle checked={product.allowProductSharing} onChange={setProductToggle('allowProductSharing')} label="Allow sharing product links externally" />
              <button className="btn-primary" style={{ marginTop: 12 }} disabled={productSave.saving}>{productSave.saving ? 'Saving…' : 'Save product settings'}</button>
            </form>
          </SectionCard>
        </>
      )}

      {(!shop || !product) && <div className="empty-state">Loading shop & product settings…</div>}
    </div>
  );
}
