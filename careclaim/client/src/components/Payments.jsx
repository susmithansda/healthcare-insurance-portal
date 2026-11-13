import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowRight, Check, CheckCheck, ChevronRight, Clock3, CreditCard, FileCheck2, Heart, HeartPulse, Landmark, Leaf, LoaderCircle, LockKeyhole, RefreshCw, Search, ShieldCheck, Smartphone, Wallet, X } from 'lucide-react';
import { api } from '../api';
import './Payments.css';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0);
const date = value => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const methods = [
  { id: 'upi', label: 'UPI', detail: 'Pay with any UPI app', icon: Smartphone },
  { id: 'card', label: 'Cards', detail: 'Debit & credit cards', icon: CreditCard },
  { id: 'netbanking', label: 'Netbanking', detail: 'Pay from your bank', icon: Landmark },
];
const isSample = payment => payment.provider === 'demo' || /demo|sandbox/i.test(payment.method);
const isTest = payment => payment.paymentMode === 'test';
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function receipt(payment) {
  const note = isSample(payment) ? 'SANDBOX RECEIPT — no real money moved.' : isTest(payment) ? 'RAZORPAY TEST RECEIPT — no real money moved.' : 'Payment verified by CareClaim.';
  download(new Blob([`CARECLAIM PAYMENT RECEIPT\n\nReceipt: ${payment.receiptId}\nPolicy: ${payment.policyName}\nAmount: ${money(payment.amount)}\nStatus: ${payment.status}\nMethod: ${payment.method}\nDate: ${date(payment.createdAt)}\nOrder: ${payment.orderId || '—'}\nTransaction: ${payment.gatewayPaymentId || '—'}\n\n${note}`], { type: 'text/plain;charset=utf-8' }), `${payment.receiptId}.txt`);
}
function eligibility(policy) {
  if (!policy) return 'Choose a policy to continue.';
  if (policy.status !== 'Active') return 'This policy is not active.';
  if (policy.nextDueDate > policy.endDate) return 'This policy term is paid. Contact your insurer to renew.';
  const period = policy.billingPeriod || policy.nextDueDate.slice(0, 7);
  if (Date.parse(`${period}-01T00:00:00Z`) > Date.now() + 90 * 86400000) return 'Your next premium is not due yet.';
  return '';
}
function savePending(key, value) {
  try { value ? localStorage.setItem(key, JSON.stringify(value)) : localStorage.removeItem(key); } catch { /* Checkout still works without persistent storage. */ }
}
function readPending(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}
let gatewayScript;
function loadGateway() {
  if (window.Razorpay) return Promise.resolve();
  if (!gatewayScript) gatewayScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const failed = () => {
      clearTimeout(timeout); gatewayScript = null; script.remove();
      reject(new Error('Razorpay could not load. Check your connection and try again.'));
    };
    const timeout = setTimeout(failed, 20000);
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => { clearTimeout(timeout); window.Razorpay ? resolve() : failed(); };
    script.onerror = failed;
    document.body.appendChild(script);
  });
  return gatewayScript;
}

export default function Payments({ user, policies, payments, notify, refresh, mode }) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState('');
  const [method, setMethod] = useState('upi');
  const [gateway, setGateway] = useState({ status: 'loading', mode: '' });
  const [checkout, setCheckout] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const pendingKey = `careclaim.payment-pending.${user.id}`;
  const [pending, setPending] = useState(() => readPending(pendingKey));
  const [success, setSuccess] = useState(null);
  const mounted = useRef(true);
  const paying = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (mode === 'preview') { setGateway({ status: 'demo', mode: 'demo' }); return; }
    const controller = new AbortController();
    fetch(`${(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')}/health`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => setGateway({ status: data.payments || 'disabled', mode: data.paymentMode || '' }))
      .catch(() => { if (!controller.signal.aborted) setGateway({ status: 'unavailable', mode: '' }); });
    return () => controller.abort();
  }, [mode]);
  const selected = policies.find(policy => policy.id === selectedId) || policies.find(policy => !eligibility(policy)) || policies[0];
  const gatewayReady = gateway.status === 'razorpay';
  const sandbox = gateway.status === 'demo';
  const testMode = gateway.mode === 'test';
  const available = gatewayReady || sandbox;
  const reason = eligibility(selected) || (selected?.sample && gateway.mode === 'live' ? 'Sample policies support sandbox or Razorpay test payments only.' : '');
  const awaitingCapture = pending?.policyId === selected?.id && pending?.status === 'awaiting_capture';
  const canPay = user.role === 'patient' && available && !reason && !awaitingCapture;
  const total = payments.filter(payment => payment.status === 'Paid').reduce((sum, payment) => sum + payment.amount, 0);
  const history = payments.filter(payment => `${payment.receiptId} ${payment.policyName} ${payment.method} ${payment.gatewayPaymentId || ''}`.toLowerCase().includes(search.toLowerCase()));
  const modeTitle = sandbox ? 'Sandbox checkout' : testMode ? 'Razorpay test mode' : gatewayReady ? 'Secure Razorpay checkout' : gateway.status === 'loading' ? 'Checking payment availability…' : gateway.status === 'unavailable' ? 'Payment connection unavailable' : 'Payments are not configured';
  const modeDescription = sandbox ? 'Explore a sample payment. No real money is collected.' : testMode ? 'Try the payment flow with test payments. No real money is collected.' : gatewayReady ? 'Pay using UPI, cards, or netbanking. Your payment is verified before a receipt is issued.' : gateway.status === 'loading' ? 'Please wait while we check the payment gateway.' : gateway.status === 'unavailable' ? 'Refresh this page to check the connection before paying.' : 'Your administrator can connect Razorpay to enable premium payments.';
  const clearPending = () => { savePending(pendingKey, null); setPending(null); };
  const reconcile = async (orderId, silent = false) => {
    const result = await api.paymentStatus(orderId);
    if (result.status === 'paid' && result.payment) {
      clearPending();
      if (mounted.current) { setSuccess(result.payment); setError(''); }
      if (!silent) notify('Payment verified. Your receipt is ready.');
    } else if (['expired', 'failed'].includes(result.status)) {
      clearPending();
      if (!silent) notify(result.status === 'expired' ? 'Checkout expired. You can start a new payment.' : 'The payment was unsuccessful. You can try again.');
    } else {
      setPending(previous => { const next = previous ? { ...previous, status: result.status } : null; savePending(pendingKey, next); return next; });
      if (!silent) notify(result.status === 'awaiting_capture' ? 'Your bank has authorised this payment. We are waiting for capture confirmation.' : 'No completed payment yet. Your receipt will appear after confirmation.');
    }
    return result;
  };
  useEffect(() => {
    if (!pending?.id || !gatewayReady) return;
    let active = true;
    api.paymentStatus(pending.id).then(async result => {
      if (!active) return;
      if (result.status === 'paid' && result.payment) { clearPending(); setSuccess(result.payment); await refresh(); }
      else if (['expired', 'failed'].includes(result.status)) clearPending();
      else setPending(previous => { const next = previous ? { ...previous, status: result.status } : null; savePending(pendingKey, next); return next; });
    }).catch(() => { /* The visible refresh action allows a later retry. */ });
    return () => { active = false; };
  }, [gatewayReady, pending?.id]);
  const refreshHistory = async () => {
    setRefreshing(true); setError('');
    try {
      if (pending?.id && gatewayReady) await reconcile(pending.id);
      await refresh();
    } catch (err) { setError(err.message); }
    finally { if (mounted.current) setRefreshing(false); }
  };
  const openCheckout = () => { if (!canPay) return; setError(''); setConsent(false); setCheckout(selected); };
  const pay = async () => {
    if (!consent || !checkout || paying.current || pending?.policyId === checkout.id && pending?.status === 'awaiting_capture') return;
    paying.current = true; setBusy(true); setError('');
    let gatewayOrder;
    try {
      const result = await api.createOrder(checkout.id);
      let verified;
      if (result.provider === 'demo') {
        verified = await api.verifyPayment({ orderId: result.order.id });
        notify('Sandbox payment complete. Your demo receipt is ready.');
      } else {
        gatewayOrder = result.order.id;
        const pendingOrder = { id: gatewayOrder, policyId: checkout.id };
        setPending(pendingOrder); savePending(pendingKey, pendingOrder);
        await loadGateway();
        verified = await new Promise((resolve, reject) => {
          let confirming = false;
          const gatewayCheckout = new window.Razorpay({
            key: result.keyId,
            order_id: result.order.order_id,
            amount: result.order.amount,
            currency: result.order.currency,
            name: 'CareClaim',
            description: `Policy premium · ${checkout.policyNumber}`,
            prefill: { name: user.name, email: user.email, contact: user.phone || '' },
            config: { display: {
              blocks: { preferred: { name: 'Your selected payment method', instruments: [{ method }] } },
              sequence: ['block.preferred'], preferences: { show_default_blocks: true },
            } },
            theme: { color: '#176bda', backdrop_color: '#0d1c32' },
            handler: async response => {
              confirming = true;
              try { resolve(await api.verifyPayment({ orderId: result.order.id, ...response })); }
              catch (err) { reject(new Error(`Payment confirmation is pending. Refresh status before trying again. ${err.message}`)); }
            },
            retry: { enabled: true },
            modal: { confirm_close: true, ondismiss: () => { if (!confirming) reject(new Error('Checkout closed. Refresh status to check whether a payment was completed.')); } },
          });
          // Razorpay can retry within the same checkout. Keep it open until success or dismissal.
          gatewayCheckout.on('payment.failed', event => {
            if (mounted.current) setError(`${event.error?.description || 'Payment was unsuccessful.'} You can retry in checkout or close it and refresh status.`);
          });
          gatewayCheckout.open();
        });
        clearPending();
        notify('Payment verified. Your receipt is ready.');
      }
      if (mounted.current) { setError(''); setSuccess(verified.payment); setCheckout(null); }
      await refresh();
    } catch (err) {
      let recovered = false;
      if (gatewayOrder) {
        try {
          const result = await reconcile(gatewayOrder, true);
          if (result.status === 'paid') { recovered = true; setCheckout(null); await refresh(); notify('Payment verified. Your receipt is ready.'); }
        } catch { /* Preserve the order for the refresh action if reconciliation is offline. */ }
      }
      if (!recovered && mounted.current) setError(err.message);
    } finally { paying.current = false; if (mounted.current) setBusy(false); }
  };
  return <div className="payments-page">
    <div className="billing-page-heading"><div><span className="eyebrow">A LITTLE LESS TO WORRY ABOUT</span><h1>Payments & peace of mind<span>.</span></h1><p>Your cover, kept current. Your receipts, all together.</p></div><span className="billing-header-label"><ShieldCheck size={15} /> Your care comes first</span></div>

    <div className="billing-grid">
      <section className="billing-story">
        <div className="billing-story-tag"><span className="billing-mini-icon"><HeartPulse size={18} /></span> CONTINUITY OF CARE</div>
        <h2>Your health matters.<br />Your peace of mind,<br /><em>just as much.</em></h2>
        <p className="billing-story-intro">A little planning today means one less worry tomorrow. Keep your health cover close, with a simpler way to pay your premium.</p>
        <div className="billing-benefits">
          <div><span><ShieldCheck size={23} /></span><div><h3>Keep your care covered</h3><p>Stay on top of premiums for your health policy.</p></div></div>
          <div><span><Smartphone size={23} /></span><div><h3>Your payment, your way</h3><p>UPI, cards, or netbanking in one secure checkout.</p></div></div>
          <div><span><FileCheck2 size={23} /></span><div><h3>A little more clarity</h3><p>Verified payments. Downloadable receipts. All here.</p></div></div>
        </div>
        <div className="billing-story-foot"><Leaf size={19} /><span>Taking care of the little things. Together.</span><Heart size={62} strokeWidth={.7} aria-hidden="true" /></div>
      </section>

      <section className="billing-checkout" aria-labelledby="premium-heading">
        <div className="billing-section-heading"><div><span className="eyebrow">KEEP YOUR COVER CLOSE</span><h2 id="premium-heading">Your next premium</h2></div><span className="billing-step">01 <span>/</span> 02</span></div>
        <div className={`billing-mode ${testMode || sandbox ? 'is-test' : ''}`} role="status"><ShieldCheck size={20} /><div><strong>{modeTitle}</strong><p>{modeDescription}</p></div></div>
        {policies.length ? <>
          <label className="billing-label" htmlFor="premium-policy">Choose your policy</label>
          <div className="billing-policy-select"><ShieldCheck size={20} /><select id="premium-policy" value={selected?.id || ''} onChange={event => { setSelectedId(event.target.value); setError(''); }}>{policies.map(policy => <option key={policy.id} value={policy.id}>{policy.name} · {policy.policyNumber}</option>)}</select></div>
          <div className="billing-policy-meta"><span>{selected.patientName}</span><span>Due {date(selected.nextDueDate)}</span></div>
          <div className="billing-amount"><span>Annual premium <small>INR</small></span><strong>{money(selected.premiumAmount)}</strong><span className="billing-amount-caption">Amount set by your policy. No additional CareClaim fee.</span></div>
          <span className="billing-label" id="payment-method-label">How would you like to pay?</span>
          <div className="billing-methods" role="group" aria-labelledby="payment-method-label">{methods.map(({ id, label, detail, icon: Icon }) => <button key={id} className={method === id ? 'is-selected' : ''} aria-pressed={method === id} onClick={() => setMethod(id)}><span className="billing-method-check">{method === id && <Check size={11} />}</span><Icon size={23} /><strong>{label}</strong><small>{detail}</small></button>)}</div>
          {reason && <p className="billing-eligibility"><CheckCheck size={16} />{reason}</p>}
          {user.role !== 'patient' && <p className="billing-eligibility"><LockKeyhole size={16} />Only the policyholder can pay this premium.</p>}
          <button className="button billing-pay-button" disabled={!canPay} onClick={openCheckout}>{awaitingCapture ? 'Awaiting payment confirmation' : reason && selected.nextDueDate > selected.endDate ? 'Up to date' : 'Pay premium'}{canPay && <><span>{money(selected.premiumAmount)}</span><ArrowRight size={19} /></>}</button>
          <div className="billing-secure"><LockKeyhole size={13} />{sandbox ? 'Sample checkout · No money moves' : testMode ? 'Secured by Razorpay · Test mode' : 'Secure payment through Razorpay'}</div>
          <p className="billing-disclaimer">This payment is for your policy premium. Claim reimbursements are managed separately by your insurer.</p>
        </> : <div className="payment-empty"><span className="payment-empty-icon"><ShieldCheck size={30} /></span><h3>Link your cover before you pay.</h3><p>Your account has no policies yet. Ask your insurer or administrator to link your policy; eligible premiums will appear here.</p><button className="button secondary" onClick={() => navigate('/policies')}>View my policies<ArrowRight size={16} /></button></div>}
      </section>
    </div>

    {pending && <div className="billing-pending" role="status"><Clock3 size={20} /><div><strong>A payment may be awaiting confirmation.</strong><p>Refresh status before trying again. We’ll check the gateway for your latest checkout.</p></div><button className="button secondary" onClick={refreshHistory} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />Refresh status</button></div>}
    {error && !checkout && <div className="form-error" role="alert">{error}</div>}
    {success && <div className="billing-success" role="status"><span><CheckCheck size={21} /></span><div><strong>{isSample(success) ? 'A little practice, a little peace of mind.' : isTest(success) ? 'Your test payment is complete.' : 'Your premium is taken care of.'}</strong><p>{isSample(success) || isTest(success) ? 'No real money moved. Your sample receipt is ready.' : 'Payment verified. Your receipt is ready.'}</p></div><button className="button secondary" onClick={() => receipt(success)}><ArrowDownToLine size={15} />Download receipt</button><button className="icon-button" aria-label="Dismiss payment confirmation" onClick={() => setSuccess(null)}><X size={17} /></button></div>}

    <div className="payment-summary billing-summary"><div><span className="stat-icon sage"><Wallet size={21} /></span><span><small>PREMIUMS RECORDED</small><strong>{money(total)}</strong></span></div><div><span className="stat-icon sage"><ShieldCheck size={21} /></span><span><small>POLICIES TO MANAGE</small><strong>{policies.length.toString().padStart(2, '0')}</strong></span></div><div><span className="stat-icon sage"><FileCheck2 size={21} /></span><span><small>RECEIPTS, ALL TOGETHER</small><strong>{payments.length.toString().padStart(2, '0')}</strong></span></div></div>

    <section className="billing-history" aria-labelledby="payment-history-heading">
      <div className="billing-history-heading"><div><span className="eyebrow">A LITTLE CLARITY, RECORDED</span><h2 id="payment-history-heading">Your payment history</h2><p>A tidy home for every receipt.</p></div><div className="billing-history-actions"><button className="button secondary" disabled={refreshing} onClick={refreshHistory}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />Refresh status</button><button className="button secondary" disabled={!payments.length} onClick={() => {
        const cell = value => `"${String(value ?? '').replace(/^\s*[=+@-]/, match => "'" + match).replaceAll('"', '""')}"`;
        const rows = [['Receipt', 'Policy', 'Amount INR', 'Status', 'Method', 'Mode', 'Date', 'Transaction'], ...payments.map(payment => [payment.receiptId, payment.policyName, payment.amount, payment.status, payment.method, isSample(payment) ? 'Sandbox' : payment.paymentMode || 'Gateway', date(payment.createdAt), payment.gatewayPaymentId || ''])];
        download(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'CareClaim-payments.csv');
      }}><ArrowDownToLine size={15} />Export</button></div></div>
      <div className="billing-history-card"><div className="billing-history-toolbar"><span><span className="billing-live-dot" />{payments.length} {payments.length === 1 ? 'transaction' : 'transactions'}</span><label className="billing-search"><Search size={15} /><input aria-label="Search payments" placeholder="Find a receipt or policy…" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
        <div className="table-scroll"><table className="claims-table billing-table"><thead><tr><th>PAYMENT / POLICY</th><th>DATE</th><th>RECEIPT / TRANSACTION</th><th>STATUS</th><th>AMOUNT</th><th><span className="billing-sr-only">Actions</span></th></tr></thead><tbody>{history.map(payment => <tr key={payment.id}><td><span className="billing-table-policy"><span className="billing-receipt-icon"><CreditCard size={18} /></span><span><strong>{payment.policyName}</strong><small>{payment.method}{isSample(payment) ? ' · Sandbox' : isTest(payment) ? ' · Test mode' : ''}</small></span></span></td><td>{date(payment.createdAt)}</td><td><strong className="billing-receipt-id">{payment.receiptId}</strong>{payment.gatewayPaymentId && <small>{payment.gatewayPaymentId}</small>}</td><td><span className="billing-paid-badge"><Check size={11} />{payment.status}</span></td><td className="amount-cell">{money(payment.amount)}</td><td><button className="icon-button billing-receipt-button" aria-label={`Download receipt ${payment.receiptId}`} onClick={() => receipt(payment)}><ArrowDownToLine size={17} /></button></td></tr>)}</tbody></table></div>
        {!history.length && <div className="billing-empty-history"><FileCheck2 size={29} /><h3>{search ? 'No matching payments' : 'Your first receipt is waiting'}</h3><p>{search ? 'Try another receipt number or policy name.' : 'Completed payments will appear here.'}</p></div>}
      </div><p className="billing-history-foot"><ShieldCheck size={13} />{payments.some(isSample) || payments.some(isTest) ? 'Sandbox and test receipts are labelled. These payments do not move real money.' : 'Your receipt is issued after your payment is verified.'}</p>
    </section>

    {checkout && <CheckoutDialog policy={checkout} method={method} setMethod={setMethod} consent={consent} setConsent={setConsent} busy={busy} blocked={pending?.policyId === checkout.id && pending?.status === 'awaiting_capture'} error={error} sandbox={sandbox} testMode={testMode} onClose={() => !paying.current && setCheckout(null)} onPay={pay} user={user} />}
  </div>;
}

function CheckoutDialog({ policy, method, setMethod, consent, setConsent, busy, blocked, error, sandbox, testMode, onClose, onPay, user }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keydown = event => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const controls = [...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')];
      if (!controls.length) { event.preventDefault(); ref.current.focus(); return; }
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  const selectedMethod = methods.find(item => item.id === method);
  const MethodIcon = selectedMethod.icon;
  return <div className="billing-dialog-overlay" onClick={event => event.target === event.currentTarget && onClose()}><section className="billing-dialog" role="dialog" aria-modal="true" aria-label="Review your premium payment" ref={ref} tabIndex={-1}>
    <aside className="billing-dialog-summary"><div className="billing-dialog-brand"><span><HeartPulse size={24} /></span>careclaim<span>.</span></div><span className="billing-dialog-mode">{sandbox ? 'SANDBOX CHECKOUT' : testMode ? 'RAZORPAY TEST MODE' : 'SECURE CHECKOUT'}</span><div className="billing-price-summary"><small>Price summary</small><strong>{money(policy.premiumAmount)}</strong><span>Annual policy premium</span></div><div className="billing-dialog-policy"><ShieldCheck size={20} /><div><strong>{policy.name}</strong><small>{policy.policyNumber}</small></div></div><div className="billing-dialog-member"><Heart size={16} />Paying as {user.name}</div><div className="billing-dialog-reassurance"><HeartPulse size={74} strokeWidth={.8} /><h3>A little reassurance,<br />renewed.</h3><p>One less thing between you<br />and your peace of mind.</p></div><div className="billing-dialog-trust"><LockKeyhole size={13} />{sandbox ? 'Sample payment · No money moves' : 'Secured by Razorpay'}</div></aside>
    <div className="billing-dialog-main"><div className="billing-dialog-heading"><h2>Payment options</h2><button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} /></button></div><div className="billing-dialog-body"><div className="billing-dialog-methods" role="group" aria-label="Checkout payment method">{methods.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setMethod(id)} disabled={busy} className={method === id ? 'is-selected' : ''} aria-pressed={method === id}><Icon size={20} /><span>{label}</span><ChevronRight size={15} /></button>)}</div><div className="billing-dialog-detail"><span className="billing-dialog-method-icon"><MethodIcon size={30} /></span><h3>{method === 'upi' ? 'A simpler way to pay.' : method === 'card' ? 'Your card. Your cover.' : 'Pay directly from your bank.'}</h3><p>{sandbox ? 'Try the complete premium payment journey with a sample transaction. No payment details are needed.' : method === 'upi' ? testMode ? 'Explore UPI in Razorpay test checkout. Live UPI QR and app payments are available when your merchant account is in live mode.' : 'Scan the secure QR code in Razorpay checkout, or pay with a UPI app on your phone.' : method === 'card' ? 'Enter your debit or credit card details securely in Razorpay checkout.' : 'Choose your bank in Razorpay checkout and complete payment on your bank’s website.'}</p><div className="billing-dialog-provider"><ShieldCheck size={18} /><div><strong>{sandbox ? 'This is a sandbox payment' : testMode ? 'Razorpay test mode' : 'Payment details stay with Razorpay'}</strong><small>{sandbox || testMode ? 'No real money will be collected.' : 'CareClaim does not store your card or banking details.'}</small></div></div><label className="checkbox billing-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />I’ve checked this policy and premium amount.</label>{error && <div className="form-error" role="alert">{error}</div>}<button className="button billing-pay-button" disabled={!consent || busy || blocked} onClick={onPay}>{busy ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={16} />}<span>{blocked ? 'Awaiting confirmation' : busy ? 'Confirming payment\u2026' : 'Continue to payment'}</span>{!busy && <ArrowRight size={17} />}</button><small className="billing-dialog-caption">{sandbox ? 'A sample receipt will be added to your payment history.' : 'Your selected method opens in Razorpay. You can choose another there.'}</small></div></div><div className="billing-dialog-footer"><ShieldCheck size={14} />Your cover. Your choice. A little more peace of mind.</div></div>
  </section></div>;
}
