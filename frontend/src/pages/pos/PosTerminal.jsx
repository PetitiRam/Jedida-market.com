import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as posApi from '../../api/posApi';
import Icon from '../../components/icons/icon';
import { queueSale, listQueuedSales, removeQueuedSale, replaceProductCache, searchProductCache, findProductByBarcodeInCache } from '../../utils/posOfflineQueue';
import '../../styles/pos-terminal.css';

function money(amount, currency = 'USD') {
  const n = Number(amount || 0);
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The register must be open before a sale can be taken (spec #4/#6) — this
// gate covers both "no register exists yet" and "register exists but is
// closed", so a cashier can never land on a terminal that silently can't
// charge anyone.
function RegisterGate({ shopId, onReady }) {
  const [registers, setRegisters] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openingCash, setOpeningCash] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const load = async () => {
    const { data } = await posApi.listRegisters(shopId);
    setRegisters(data.registers);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!newLabel.trim()) return;
    setBusy(true); setError('');
    try {
      await posApi.createRegister({ label: newLabel.trim() });
      setNewLabel('');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create register.');
    } finally { setBusy(false); }
  };

  const open = async (registerId) => {
    setBusy(true); setError('');
    try {
      const { data } = await posApi.openRegister(registerId, Number(openingCash) || 0);
      onReady(data.register);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not open register.');
    } finally { setBusy(false); }
  };

  if (registers === null) return <div className="pos-gate"><div className="pos-gate-card"><p>Loading…</p></div></div>;

  return (
    <div className="pos-gate">
      <div className="pos-gate-card">
        <Icon name="cashDrawer" size={32} />
        <h2 style={{ marginTop: 10 }}>Open a register</h2>
        <p>Select a register and enter the starting cash amount to begin taking sales.</p>
        {error && <div className="alert alert-error">{error}</div>}
        {registers.length === 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              className="pos-search-input" style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}
              placeholder="Register 01" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            />
            <button className="btn-secondary" onClick={create} disabled={busy}>Create</button>
          </div>
        )}
        {registers.map((r) => (
          <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 10, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.9rem' }}>{r.label}</strong>
              <span style={{ fontSize: '0.75rem', color: r.status === 'open' ? 'var(--forest)' : '#8A968E' }}>
                {r.status === 'open' ? 'Open' : 'Closed'}
              </span>
            </div>
            {r.status === 'open' ? (
              <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => onReady(r)}>Continue</button>
            ) : (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <input
                  type="number" placeholder="Opening cash" value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                />
                <button className="btn-secondary" disabled={busy} onClick={() => open(r.id)}>Open</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PosTerminal({ shopId }) {
  const navigate = useNavigate();
  const [register, setRegister] = useState(null);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState([]); // [{productId, title, unitPrice, currency, quantity, availableQuantity}]
  const [methods, setMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [charging, setCharging] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const searchTimer = useRef(null);

  // Keep a local copy of this shop's catalog so barcode/name search still
  // works offline (searchProductCache), and drain any sales queued while
  // offline the moment connectivity returns.
  const refreshQueuedCount = () => listQueuedSales().then((rows) => setQueuedCount(rows.length));

  const syncQueuedSales = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const pending = await listQueuedSales();
      for (const sale of pending) {
        try {
          await posApi.createSale(sale);
          await removeQueuedSale(sale.clientSaleUuid);
        } catch (err) {
          // A real rejection (e.g. now genuinely out of stock) removes the
          // sale from the queue too — it isn't retryable, and leaving it
          // there would keep failing forever. A network error (no
          // response) leaves it queued for the next reconnect.
          if (err.response) await removeQueuedSale(sale.clientSaleUuid);
        }
      }
    } finally {
      await refreshQueuedCount();
      setSyncing(false);
    }
  };

  useEffect(() => {
    const goOnline = () => { setIsOnline(true); syncQueuedSales(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    refreshQueuedCount();
    if (navigator.onLine) syncQueuedSales();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, shopId]);

  useEffect(() => {
    if (!register) return;
    posApi.searchPosProducts({ shopId, q: '', limit: 500 }).then(({ data }) => {
      if (data.products?.length) replaceProductCache(data.products);
    }).catch(() => {}); // offline on first load — cache just stays whatever it was last time
  }, [register, shopId]);

  useEffect(() => {
    if (!register) return;
    posApi.listPosPaymentMethods(shopId).then(({ data }) => {
      setMethods(data.methods);
      setSelectedMethod(data.methods[0]?.code || null);
    });
  }, [register, shopId]);

  useEffect(() => {
    if (!register) return;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (!navigator.onLine) {
        setProducts(await searchProductCache(query));
        return;
      }
      try {
        const { data } = await posApi.searchPosProducts({ shopId, q: query });
        setProducts(data.products || []);
      } catch {
        setProducts(await searchProductCache(query));
      }
    }, 220);
    return () => clearTimeout(searchTimer.current);
  }, [query, register, shopId]);

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity_available) return prev;
        return prev.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      if (product.quantity_available < 1) return prev;
      return [...prev, {
        productId: product.id, title: product.title, unitPrice: Number(product.price),
        currency: product.currency, quantity: 1, availableQuantity: product.quantity_available,
      }];
    });
  };

  const changeQty = (productId, delta) => {
    setCart((prev) => prev
      .map((i) => (i.productId === productId ? { ...i, quantity: Math.max(0, Math.min(i.availableQuantity, i.quantity + delta)) } : i))
      .filter((i) => i.quantity > 0));
  };

  const removeLine = (productId) => setCart((prev) => prev.filter((i) => i.productId !== productId));

  const total = useMemo(() => cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0), [cart]);
  const currency = cart[0]?.currency || 'USD';
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  const handleBarcodeSubmit = async (code) => {
    if (!code) return;
    if (!navigator.onLine) {
      const product = await findProductByBarcodeInCache(code);
      if (product) { addToCart(product); setQuery(''); }
      else { setError(`No cached product found for barcode "${code}" (offline).`); setTimeout(() => setError(''), 2500); }
      return;
    }
    const { data } = await posApi.searchPosProducts({ shopId, barcode: code });
    if (data.product) {
      addToCart(data.product);
      setQuery('');
    } else {
      setError(`No product found for barcode "${code}".`);
      setTimeout(() => setError(''), 2500);
    }
  };

  const charge = async () => {
    if (cart.length === 0 || !selectedMethod || !register) return;
    setCharging(true); setError('');
    // One clientSaleUuid per physical sale attempt, generated here (not
    // server-side) so it survives an offline queue → sync round trip and
    // a genuine network retry both resolve to the exact same key —
    // required by the backend (see posController.createSale / phase98
    // idempotency table); a duplicate is returned as a no-op replay, not
    // rung up twice.
    const clientSaleUuid = crypto.randomUUID();
    const saleBody = {
      shopId, registerId: register.id, paymentMethod: selectedMethod,
      items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      clientSaleUuid,
    };
    if (!navigator.onLine) {
      await queueSale(saleBody);
      await refreshQueuedCount();
      setReceipt({ total, currency, orders: [], queued: true });
      setCart([]);
      setCharging(false);
      return;
    }
    try {
      const { data } = await posApi.createSale(saleBody);
      setReceipt({ total: data.total, currency: data.currency, orders: data.orders });
      setCart([]);
    } catch (err) {
      // A network-level failure (not a real server rejection) is exactly
      // the offline case above, just discovered mid-request instead of
      // before it — queue it the same way rather than losing the sale.
      if (!err.response) {
        await queueSale(saleBody);
        await refreshQueuedCount();
        setReceipt({ total, currency, orders: [], queued: true });
        setCart([]);
      } else {
        setError(err.response?.data?.error || 'Could not complete this sale.');
      }
    } finally {
      setCharging(false);
    }
  };

  if (!register) return <RegisterGate shopId={shopId} onReady={setRegister} />;

  return (
    <div className="pos-shell">
      <div className="pos-topbar">
        <div className="pos-topbar-left">
          JEDIDA POS
          <span className="pos-topbar-register">{register.label}</span>
        </div>
        <div className="pos-topbar-right">
          <span className={`pos-status-chip ${isOnline ? 'pos-status-online' : 'pos-status-offline'}`}>
            <Icon name={isOnline ? 'wifi' : 'wifi-off'} size={14} />
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {queuedCount > 0 && (
            <span className="pos-status-chip pos-status-queued" title={syncing ? 'Syncing queued sales…' : `${queuedCount} sale(s) waiting to sync`}>
              <Icon name="sync" size={14} />
              {syncing ? 'Syncing…' : `${queuedCount} queued`}
            </span>
          )}
          <span className="pos-cashier-chip">Register open</span>
          <button className="pos-close-btn" onClick={() => navigate(-1)}><Icon name="close" size={20} /></button>
        </div>
      </div>

      <div className="pos-body">
        <div className="pos-catalog">
          <div className="pos-search-row">
            <div className="pos-search-input-wrap">
              <Icon name="search" size={17} />
              <input
                className="pos-search-input"
                placeholder="Search products, or scan a barcode"
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // A barcode scanner types the code fast and sends Enter —
                  // that's what routes this to the exact-match barcode
                  // lookup instead of the debounced fuzzy search above.
                  if (e.key === 'Enter' && query.length >= 6) handleBarcodeSubmit(query);
                }}
              />
            </div>
          </div>

          {error && <div className="pos-inline-error">{error}</div>}

          <div className="pos-product-grid">
            {products.length === 0 && <div className="pos-empty-state">No products match "{query}".</div>}
            {products.map((p) => (
              <button
                key={p.id}
                className="pos-product-tile"
                disabled={p.quantity_available < 1}
                onClick={() => addToCart(p)}
              >
                <div className="pos-product-thumb">
                  {p.images?.[0] ? <img src={p.images[0]} alt="" /> : <Icon name="box" size={28} />}
                </div>
                <div className="pos-product-info">
                  <div className="pos-product-title">{p.title}</div>
                  <div className="pos-product-price">{money(p.price, p.currency)}</div>
                  <div className={`pos-product-stock ${p.quantity_available <= 3 ? 'low' : ''}`}>
                    {p.quantity_available < 1 ? 'Out of stock' : `${p.quantity_available} in stock`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="pos-cart-panel">
          <div className="pos-cart-header">
            <strong>Current sale</strong>
            <span className="pos-cart-count">{itemCount} item{itemCount === 1 ? '' : 's'}</span>
          </div>

          <div className="pos-cart-items">
            {cart.length === 0 && <div className="pos-cart-empty">Scan or tap a product to add it to the sale.</div>}
            {cart.map((line) => (
              <div key={line.productId} className="pos-cart-line">
                <div className="pos-cart-line-top">
                  <span className="pos-cart-line-title">{line.title}</span>
                  <button className="pos-cart-line-remove" onClick={() => removeLine(line.productId)}>Remove</button>
                </div>
                <div className="pos-cart-line-bottom">
                  <div className="pos-qty-stepper">
                    <button className="pos-qty-btn" onClick={() => changeQty(line.productId, -1)}><Icon name="minus" size={14} /></button>
                    <span className="pos-qty-value">{line.quantity}</span>
                    <button className="pos-qty-btn" onClick={() => changeQty(line.productId, 1)}><Icon name="plus" size={14} /></button>
                  </div>
                  <span className="pos-cart-line-price">{money(line.unitPrice * line.quantity, line.currency)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pos-cart-totals">
            <div className="pos-total-row grand"><span>Total</span><span>{money(total, currency)}</span></div>
          </div>

          <div className="pos-payment-section">
            <div className="pos-payment-label">Payment method</div>
            <div className="pos-payment-grid">
              {methods.map((m) => (
                <button
                  key={m.code}
                  className={`pos-payment-option ${selectedMethod === m.code ? 'selected' : ''}`}
                  onClick={() => setSelectedMethod(m.code)}
                >
                  {m.name}
                </button>
              ))}
              {methods.length === 0 && (
                <div style={{ gridColumn: '1 / -1', fontSize: '0.78rem', color: '#8A968E' }}>
                  No payment methods enabled. Connect one in Payment Providers.
                </div>
              )}
            </div>
            <button className="pos-charge-btn" disabled={cart.length === 0 || charging || !selectedMethod} onClick={charge}>
              {charging ? 'Processing…' : `Charge ${money(total, currency)}`}
            </button>
          </div>
        </div>
      </div>

      {receipt && (
        <div className="pos-receipt-overlay" onClick={() => setReceipt(null)}>
          <div className="pos-receipt-card" onClick={(e) => e.stopPropagation()}>
            <div className="pos-receipt-check"><Icon name="check" size={26} /></div>
            <div style={{ fontSize: '0.85rem', color: '#5B6760' }}>{receipt.queued ? 'Sale saved — will sync when back online' : 'Sale complete'}</div>
            <div className="pos-receipt-total">{money(receipt.total, receipt.currency)}</div>
            {receipt.queued
              ? <div className="pos-receipt-ref">Queued offline — receipt available after sync</div>
              : <div className="pos-receipt-ref">Order {receipt.orders?.[0]?.public_ref}</div>}
            <button className="btn-primary" onClick={() => setReceipt(null)}>New sale</button>
          </div>
        </div>
      )}
    </div>
  );
}
