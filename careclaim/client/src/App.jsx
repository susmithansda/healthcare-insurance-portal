import Recovery from './components/Recovery';
import Payments from './components/Payments';
import AuthMedia from './components/AuthMedia';
import PolicyImport, { canImportPolicies } from './components/PolicyImport';
import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, CreditCard, FileCheck2, FileHeart, FileText, FolderHeart, Heart, HeartPulse, LayoutDashboard, Leaf, LoaderCircle, LockKeyhole, LogOut, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Stethoscope, TrendingUp, Upload, Users, Wallet, X } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from './api';
import Experience from './components/Experience';
const money = (n, compact = false) => compact && n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
}).format(Number(n) || 0);
const date = value => value ? new Date(value).toLocaleDateString('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
}) : '—';
const colors = ['#344289', '#b5b7e9', '#e7b79b', '#96b7c3'];
const titles = {
  '/': 'Overview',
  '/claims': 'My claims',
  '/policies': 'My policies',
  '/payments': 'Payments',
  '/analytics': 'Insights & reports',
  '/documents': 'Document vault',
  '/wellness': 'Care corner',
  '/settings': 'My account',
  '/audit': 'Activity log'
};
const roleLabel = {
  patient: 'Member',
  hospital: 'Hospital staff',
  officer: 'Claim officer',
  admin: 'Administrator'
};
const staff = u => ['officer', 'admin'].includes(u?.role);
const csvDownload = (rows, name) => {
  const val = v => `"${String(v ?? '').replace(/^\s*[=+@-]/, m => "'" + m).replaceAll('"', '""')}"`;
  const blob = new Blob(['\uFEFF' + rows.map(r => r.map(val).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8'
  });
  downloadBlob(blob, name);
};
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function Badge({
  status
}) {
  return <span className={`badge ${String(status).toLowerCase()}`}><span />{status}</span>;
}
function Logo() {
  return <div className="logo"><span className="logo-mark"><Plus size={25} strokeWidth={3.5} /></span><span>careclaim<span className="logo-dot">.</span></span></div>;
}
function Button({
  children,
  variant = '',
  className = '',
  ...rest
}) {
  return <button className={`button ${variant} ${className}`} {...rest}>{children}</button>;
}
function Empty({
  title = 'Nothing here just yet',
  description = 'Your records will appear here.',
  action
}) {
  return <div className="empty"><FolderHeart size={35} /><h3>{title}</h3><p>{description}</p>{action}</div>;
}
function Field({
  label,
  children,
  hint
}) {
  const id = React.useId();
  return <div className="field"><label htmlFor={id}>{label}</label>{React.cloneElement(children, {
      id,
      "aria-describedby": hint ? id + "-hint" : undefined
    })}{hint && <small id={id + "-hint"}>{hint}</small>}</div>;
}
function Modal({
  title,
  children,
  onClose,
  wide = false
}) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const handler = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const els = ref.current?.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]');
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = old;
      prev?.focus();
    };
  }, []);
  return <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide ? 'wide' : ''}`}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</section></div>;
}
export default function App() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [mode, setMode] = useState('preview'),
    [claims, setClaims] = useState([]),
    [policies, setPolicies] = useState([]),
    [payments, setPayments] = useState([]),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [modal, setModal] = useState(null),
    [claimDraft, setClaimDraft] = useState(null),
    [importFromClaim, setImportFromClaim] = useState(false),
    [selected, setSelected] = useState(null),
    [menu, setMenu] = useState(false),
    [notifications, setNotifications] = useState(false),
    [query, setQuery] = useState(''),
    [loading, setLoading] = useState(false);
  const location = useLocation(),
    navigate = useNavigate();
  const notify = msg => setToast(msg);
  const refresh = async () => {
    setError('');
    setLoading(true);
    try {
      const [c, p, t] = await Promise.all([api.claims(), api.policies(), api.payments()]);
      setClaims(c.claims);
      setPolicies(p.policies);
      setPayments(t.payments);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const v = await api.init();
        if (!active) return;
        setMode(v.mode);
        try {
          const v = await api.me();
          if (active) setUser(v.user);
        } catch {}
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (user) refresh();
  }, [user?.id]);
  useEffect(() => {
    setMenu(false);
    setQuery('');
  }, [location.pathname]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const login = u => {
    setClaims([]);
    setPolicies([]);
    setPayments([]);
    setMode(api.mode || mode);
    setUser(u);
    navigate('/');
  };
  const openClaim = c => {
    setSelected(c);
    setModal('detail');
  };
  const updated = async () => {
    await refresh();
  };
  const openNewClaim = () => { setClaimDraft(null); setModal('new'); };
  const openPolicyImport = (draft = null) => {
    setClaimDraft(draft); setImportFromClaim(Boolean(draft)); setModal('importPolicies');
  };
  if (!ready) return <div className="boot"><Logo /><LoaderCircle className="spin" /><p>Getting your care workspace ready…</p></div>;
  if (!user && error) return <div className="boot"><Logo /><h2>Your workspace couldn?t connect.</h2><p role="alert">{error}</p><Button onClick={() => window.location.reload()}>Try again</Button></div>;
  if (!user) return <Auth onLogin={login} mode={mode} />;
  const unread = claims.filter(c => c.status === 'Pending').length;
  const exportClaims = () => {
    csvDownload([['Claim ID', 'Patient', 'Condition', 'Hospital', 'Amount INR', 'Status', 'Submitted'], ...claims.map(c => [c.claimId, c.patientName, c.disease, c.hospital, c.claimAmount, c.status, date(c.createdAt)])], 'CareClaim-claims.csv');
    notify('Your claims report has been downloaded.');
  };
  return <div className="app-shell">
  {menu && <div className="sidebar-shade" onClick={() => setMenu(false)} />}
  <aside className={`sidebar ${menu ? 'open' : ''}`}><NavLink to="/" className="brand-link" aria-label="CareClaim overview"><Logo /></NavLink><div className="workspace-label"><span className="live-dot" /> YOUR CARE WORKSPACE</div><nav aria-label="Main navigation"><NavLink to="/" end><LayoutDashboard size={19} />Overview</NavLink><NavLink to="/claims"><FileHeart size={19} />{user.role !== 'patient' ? 'All claims' : 'My claims'}<span className="nav-count">{claims.length}</span></NavLink><NavLink to="/policies"><ShieldCheck size={19} />{user.role !== 'patient' ? 'Policies' : 'My policies'}</NavLink><NavLink to="/payments"><Wallet size={19} />Payments</NavLink><p className="nav-label">A LITTLE MORE CLARITY</p><NavLink to="/analytics"><Activity size={19} />Insights & reports</NavLink><NavLink to="/documents"><FolderHeart size={19} />Document vault</NavLink><NavLink to="/wellness"><Leaf size={19} />Care corner <span className="new-label">NEW</span></NavLink>{staff(user) && <NavLink to="/audit"><Clock3 size={19} />Activity log</NavLink>}</nav><div className="sidebar-bottom"><div className="care-note"><span className="mini-leaf"><Leaf size={20} /></span><h4>A little peace of mind.</h4><p>Your next step to better care is always right here.</p><button onClick={() => navigate('/wellness')}>Visit your care corner <ArrowUpRight size={15} /></button></div><NavLink to="/settings" className="account-link"><span className="avatar">{user.name?.split(' ').map(s => s[0]).slice(0, 2).join('')}</span><span><strong>{user.name}</strong><small>{roleLabel[user.role]}</small></span><Settings2 size={17} /></NavLink></div></aside>
  <div className="app-main"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMenu(true)}><Menu size={21} /></button><span>Workspace</span><ChevronRight size={13} /><strong>{titles[location.pathname] || 'Overview'}</strong></div><div className="topbar-actions"><div className="global-search"><Search size={16} /><input aria-label="Search your claims" placeholder="Search your claims…" value={query} onChange={e => setQuery(e.target.value)} />{query && <div className="search-results">{claims.filter(c => `${c.claimId} ${c.patientName} ${c.disease}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5).map(c => <button key={c.id} onClick={() => {
                openClaim(c);
                setQuery('');
              }}><FileText size={16} /><span><strong>{c.disease}</strong><small>{c.claimId} · {c.patientName}</small></span><ArrowUpRight size={15} /></button>)}{!claims.some(c => `${c.claimId} ${c.patientName} ${c.disease}`.toLowerCase().includes(query.toLowerCase())) && <p>No matching claims</p>}</div>}</div><span className="topbar-divider" /><button className="icon-button notification-button" aria-label="View notifications" onClick={() => setNotifications(true)}><Bell size={19} />{unread > 0 && <i />}</button><button className="avatar top-avatar" aria-label="Open account settings" onClick={() => navigate('/settings')}>{user.name?.split(' ').map(s => s[0]).slice(0, 2).join('')}</button></div></header>
  <main className="page"><div className="demo-strip"><span><span className="live-dot" />{mode === 'mongodb' ? 'Connected workspace' : mode === 'preview' ? 'Interactive preview · Sample data saved in this browser' : 'Demo workspace · Synthetic data'}</span><span className="demo-role">{roleLabel[user.role]} view <LockKeyhole size={11} /></span></div>{error && <div className="error-banner">{error}<button onClick={refresh}>Try again</button></div>}
  <Routes><Route path="/" element={<Dashboard {...{
            user,
            claims,
            policies,
            payments,
            loading,
            openClaim,
            exportClaims
          }} onNew={openNewClaim} onPay={() => navigate('/payments')} />} /><Route path="/claims" element={<ClaimsPage {...{
            user,
            claims,
            openClaim,
            exportClaims
          }} onNew={openNewClaim} />} /><Route path="/policies" element={<Policies {...{
            policies,
            user,
            mode
          }} onImport={() => openPolicyImport()} onPay={() => navigate('/payments')} />} /><Route path="/payments" element={<Payments {...{
            user,
            policies,
            payments,
            notify,
            refresh,
            mode
          }} />} /><Route path="/analytics" element={<Analytics {...{
            claims,
            exportClaims
          }} />} /><Route path="/documents" element={<Documents {...{
            claims,
            openClaim,
            notify
          }} />} /><Route path="/wellness" element={<div><PageHeading eyebrow="MAKE SPACE FOR YOURSELF" title="A little care, beyond the claim." description="Understand the journey. Take a breath. Feel a little more at ease." /><Experience /></div>} /><Route path="/settings" element={<Settings {...{
            user,
            setUser,
            notify,
            mode
          }} onLogout={() => {
            api.logout();
            setClaims([]);
            setPolicies([]);
            setPayments([]);
            setUser(null);
            navigate('/');
          }} />} /><Route path="/audit" element={<Audit user={user} />} /><Route path="*" element={<Empty title="This page has moved" action={<Button onClick={() => navigate('/')}>Back to overview</Button>} />} /></Routes>
  <footer className="page-footer"><span><ShieldCheck size={14} /> A clearer path from claim to care.</span><span>Made with care. CareClaim © 2026</span></footer></main></div>
  {toast && <div className="toast" role="status"><CheckCheck size={19} />{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16} /></button></div>}
  {modal === 'new' && <NewClaim {...{
      user,
      policies,
      notify,
      draft: claimDraft
    }} onImport={canImportPolicies(user, mode) ? openPolicyImport : null} onClose={() => setModal(null)} onSuccess={async () => {
      setModal(null);
      await updated();
      navigate('/claims');
      notify('Claim submitted. You can follow every step here.');
    }} />}
  {modal === 'importPolicies' && <PolicyImport {...{ user, mode }} onClose={() => setModal(importFromClaim ? 'new' : null)} onSuccess={async result => {
    const imported = result.policies || [];
    setPolicies(previous => [...previous.filter(policy => !imported.some(item => item.id === policy.id)), ...imported]);
    if (importFromClaim && imported[0]) setClaimDraft(previous => previous?.data?.policyNumber ? previous : { ...previous, data: { ...previous?.data, policyNumber: imported[0].policyNumber, patientId: imported[0].patientId, patientName: imported[0].patientName } });
    await refresh();
    setModal(importFromClaim ? 'new' : null);
    notify(result.importedCount ? `${result.importedCount} ${result.source === 'sample' ? 'sample ' : ''}${result.importedCount === 1 ? 'policy imported' : 'policies imported'} successfully.` : 'Your sample policies are already linked.');
  }} />}
  {modal === 'detail' && selected && <ClaimDetail claim={claims.find(c => c.id === selected.id) || selected} {...{
      user,
      notify
    }} onClose={() => setModal(null)} onUpdate={updated} />}
  {notifications && <Modal title="Your updates" onClose={() => setNotifications(false)}><div className="notification-list">{claims.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 6).map(c => <button key={c.id} onClick={() => {
          setNotifications(false);
          openClaim(c);
        }}><span className={`notification-icon ${c.status.toLowerCase()}`}><FileCheck2 size={19} /></span><span><strong>{c.claimId} · {c.status}</strong><p>{c.disease} — {c.remarks || 'Your claim timeline is available.'}</p><small>{date(c.updatedAt || c.createdAt)}</small></span><ChevronRight size={17} /></button>)}{!claims.length && <Empty title="You’re all caught up" />}</div></Modal>}
 </div>;
}
function Auth({
  onLogin,
  mode
}) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submit = async (e, role) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = e ? Object.fromEntries(new FormData(e.currentTarget)) : {
        email: `${role}@careclaim.demo`,
        password: 'Demo@12345'
      };
      const result = register && !role ? await api.register(d) : await api.login(d.email, d.password);
      onLogin(result.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return <div className="auth"><div className="auth-story"><Logo /><div className="auth-story-main"><span className="eyebrow light"><span className="live-dot" /> A CLEARER PATH TO CARE</span><h1>Life happens. <br />We’ve got your <br /><em>care covered.</em></h1><p>Claims, cover, and a little more peace of mind. <br />Everything you need, together in one place.</p><AuthMedia /></div><div className="auth-foot"><ShieldCheck size={17} /> Thoughtfully built around your care journey.</div></div><div className="auth-form-panel"><span className="auth-top-note">{mode === 'preview' ? 'INTERACTIVE PREVIEW · SAMPLE DATA' : 'YOUR CARE. YOUR SPACE.'}</span><div className="auth-form-content"><span className="welcome-icon"><HeartPulse size={25} /></span><h2>{register ? 'Start your care journey.' : 'Welcome to a little clarity.'}</h2><p>{register ? mode === 'preview' ? 'Create a sample account. Use a made-up email and password.' : 'Create your member account and keep your care in one place.' : 'Sign in to see your cover, claims, and what comes next.'}</p><form onSubmit={submit}>{register && <Field label="Full name"><input name="name" required minLength={2} maxLength={80} autoComplete="name" placeholder="Your full name" /></Field>}<Field label="Email address"><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={120} /></Field><Field label="Password" hint={register ? 'Use at least 10 characters, including upper/lower case and a number.' : undefined}><input name="password" type="password" required minLength={register ? 10 : 8} autoComplete={register ? 'new-password' : 'current-password'} placeholder="Enter your password" /></Field>{register && <Field label="Phone number (optional)"><input name="phone" type="tel" maxLength={20} autoComplete="tel" placeholder="+91 …" /></Field>}{error && <div className="form-error" role="alert">{error}</div>}<Button type="submit" disabled={busy} className="full">{busy ? <LoaderCircle size={17} className="spin" /> : register ? 'Create account' : 'Sign in to your workspace'}<ArrowRight size={17} /></Button></form><Recovery mode={mode} /><p className="auth-switch">{register ? 'Already a member?' : 'New to CareClaim?'} <button onClick={() => {
            setRegister(!register);
            setError('');
          }}>{register ? 'Sign in' : 'Create an account'}</button></p><div className="demo-login"><div className="or-divider"><span />TAKE A LOOK AROUND<span /></div><p>Explore with sample data. No account needed.</p><div className="demo-options">{Object.entries(roleLabel).map(([r, label]) => <button key={r} disabled={busy} onClick={() => submit(null, r)}>{r === 'patient' ? <Heart size={16} /> : r === 'hospital' ? <Stethoscope size={16} /> : r === 'officer' ? <FileCheck2 size={16} /> : <Users size={16} />}<span>{label}</span><ArrowUpRight size={14} /></button>)}</div><small>{mode === 'preview' ? 'Browser preview · Synthetic records · No real payments' : 'Demo accounts use synthetic records. No real payments in sandbox mode.'}</small></div></div><span className="auth-bottom"><LockKeyhole size={12} /> Your next step starts with peace of mind.</span></div></div>;
}
function PageHeading({
  eyebrow,
  title,
  description,
  children
}) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{children && <div className="heading-actions">{children}</div>}</div>;
}
function Dashboard({
  user,
  claims,
  policies,
  payments,
  loading,
  openClaim,
  onNew,
  exportClaims,
  onPay
}) {
  const nav = useNavigate(),
    total = claims.reduce((n, c) => n + c.claimAmount, 0),
    approved = claims.filter(c => c.status === 'Approved'),
    pending = claims.filter(c => c.status === 'Pending');
  const coverage = policies.reduce((n, p) => n + p.coverageAmount, 0);
  const months = Array.from({
    length: 6
  }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    return {
      month: d.toLocaleDateString('en-IN', {
        month: 'short'
      }),
      submitted: claims.filter(c => c.createdAt.slice(0, 7) === key).reduce((s, c) => s + c.claimAmount, 0),
      approved: claims.filter(c => c.createdAt.slice(0, 7) === key && c.status === 'Approved').reduce((s, c) => s + c.claimAmount, 0)
    };
  });
  return <><PageHeading eyebrow="YOUR HEALTH COVER, AT A GLANCE" title={<>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]} <span className="greeting-spark">✳</span></>} description="A little clarity for your claims. A little more peace of mind."><Button variant="secondary" onClick={exportClaims}><ArrowDownToLine size={16} /> Export report</Button>{user.role !== 'officer' && <Button onClick={onNew}><Plus size={17} /> New claim</Button>}</PageHeading>
 <section className="hero-banner"><div className="hero-copy"><span className="pill"><span className="live-dot" /> HERE FOR EVERY STEP</span><h2>Focus on feeling better.<br />We’ll help with the rest.</h2><p>Your claims, cover, and payments.<br />All together. All a little simpler.</p><button className="text-button" onClick={() => nav('/policies')}>Explore your coverage <ArrowRight size={16} /></button></div><div className="hero-art"><img className="dashboard-care-photo" src="/media/doctor-patient.jpg" alt="A doctor and patient sharing a reassuring conversation in a bright clinic" width="1536" height="1024" decoding="async" fetchPriority="high" /><div className="hero-float"><span className="circle-check"><Check size={15} /></span>Care you can count on.</div></div><span className="hero-corner">MADE FOR YOUR PEACE OF MIND <Heart size={12} /></span></section>
 <div className="stats-grid">{[{
        label: 'Total claimed',
        value: money(total, true),
        icon: FileHeart,
        sub: `${claims.length} claims submitted`,
        color: 'sage'
      }, {
        label: 'Approved amount',
        value: money(approved.reduce((s, c) => s + c.claimAmount, 0), true),
        icon: CheckCheck,
        sub: `${approved.length} claims approved`,
        color: 'lime'
      }, {
        label: 'Awaiting review',
        value: String(pending.length).padStart(2, '0'),
        icon: Clock3,
        sub: money(pending.reduce((s, c) => s + c.claimAmount, 0)) + ' in progress',
        color: 'peach'
      }, {
        label: 'Total cover',
        value: money(coverage, true),
        icon: ShieldCheck,
        sub: `${policies.length} ${policies.length === 1 ? 'policy' : 'policies'} in your workspace`,
        color: 'blue'
      }].map(s => <div className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><span className={`stat-icon ${s.color}`}><s.icon size={18} /></span></div><strong>{s.value}</strong><p><span className="stat-small-dot" />{s.sub}</p></div>)}</div>
 <div className="dashboard-middle"><section className="card chart-card"><div className="card-heading"><div><h3>Every claim tells a story</h3><p>Your claim activity over the last six months</p></div><span className="select-static">Jun – Nov 2026 <ChevronDown size={13} /></span></div><div className="chart-legend"><span><i style={{
              background: '#3c4a92'
            }} />Submitted</span><span><i style={{
              background: '#9da0e2'
            }} />Approved</span><small>AMOUNT (₹)</small></div><div className="chart-container"><ResponsiveContainer width="100%" height="100%"><AreaChart data={months} margin={{
              top: 10,
              right: 10,
              left: -20,
              bottom: 0
            }}><defs><linearGradient id="claimedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5662a2" stopOpacity={.22} /><stop offset="100%" stopColor="#5662a2" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e4e5ed" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{
                fontSize: 11,
                fill: '#8d9690'
              }} dy={10} /><YAxis axisLine={false} tickLine={false} tickFormatter={n => n ? `${n / 1000}k` : '0'} tick={{
                fontSize: 10,
                fill: '#8d9690'
              }} /><Tooltip formatter={v => money(v)} contentStyle={{
                borderRadius: 12,
                border: '1px solid #dedfe9',
                fontSize: 12
              }} /><Area type="monotone" dataKey="submitted" name="Submitted" stroke="#3c4a92" fill="url(#claimedFill)" strokeWidth={2.5} /><Area type="monotone" dataKey="approved" name="Approved" stroke="#9093db" fill="transparent" strokeWidth={2.5} strokeDasharray="5 4" /></AreaChart></ResponsiveContainer></div><div className="chart-foot"><span><TrendingUp size={15} /> A clearer view of your care journey.</span><button onClick={() => nav('/analytics')}>View insights <ArrowUpRight size={14} /></button></div></section>
 <section className="cover-card"><div className="cover-top"><span className="cover-icon"><ShieldCheck size={22} /></span><span>YOUR SAFETY NET</span><MoreHorizontal size={19} /></div><h3>A little cover.<br />A lot of reassurance.</h3><div className="cover-amount">{money(coverage, true)}<span>total sum insured</span></div><div className="coverage-meter"><div style={{
            width: `${Math.min(100, policies.reduce((n, p) => n + p.usedAmount, 0) / (coverage || 1) * 100)}%`
          }} /></div><div className="coverage-caption"><span>{money(policies.reduce((n, p) => n + p.usedAmount, 0), true)} used</span><span>{policies.length} {policies.length === 1 ? 'policy' : 'policies'}</span></div><button onClick={() => nav('/policies')}>View policy details <ArrowUpRight size={16} /></button><span className="cover-flower">✳</span></section></div>
 <section className="card recent-card"><div className="card-heading"><div><h3>Your recent claims <span className="count-pill">{claims.length}</span></h3><p>Every update, right where you need it.</p></div><button className="text-button" onClick={() => nav('/claims')}>View all claims <ArrowRight size={15} /></button></div><ClaimsTable claims={claims.slice(0, 4)} {...{
        openClaim,
        loading
      }} /></section>
 <div className="bottom-reminder"><div className="reminder-icon"><Sparkles size={21} /></div><div><strong>A smoother claim starts with the right documents.</strong><p>Keep your hospital bills and discharge summary together in your document vault.</p></div><button className="text-button" onClick={() => nav('/documents')}>Open your vault <ArrowUpRight size={16} /></button></div></>;
}
function ClaimsTable({
  claims,
  openClaim,
  loading
}) {
  if (loading && !claims.length) return <div className="loading-inline"><LoaderCircle className="spin" /> Loading your claims…</div>;
  if (!claims.length) return <Empty title="No claims to show" description="Submit a claim or try a different search." />;
  return <div className="table-scroll"><table className="claims-table"><thead><tr><th>CLAIM / PATIENT</th><th>TREATMENT</th><th>SUBMITTED</th><th>CLAIM AMOUNT</th><th>STATUS</th><th aria-label="Actions" /></tr></thead><tbody>{claims.map(c => <tr key={c.id} onClick={() => openClaim(c)}><td><span className="table-patient"><span className={`patient-avatar avatar-${c.patientName?.length % 4}`}><FileHeart size={17} /></span><span><strong>{c.claimId}</strong><small>{c.patientName}</small></span></span></td><td><strong>{c.disease}</strong><small>{c.hospital}</small></td><td>{date(c.createdAt)}</td><td className="amount-cell">{money(c.claimAmount)}</td><td><Badge status={c.status} /></td><td><button className="icon-button" aria-label={`View ${c.claimId}`} onClick={e => {
              e.stopPropagation();
              openClaim(c);
            }}><ArrowUpRight size={17} /></button></td></tr>)}</tbody></table></div>;
}
function ClaimsPage({
  claims,
  user,
  onNew,
  openClaim,
  exportClaims
}) {
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('All'),
    [page, setPage] = useState(1),
    [sort, setSort] = useState('newest');
  let filtered = claims.filter(c => (status === 'All' || c.status === status) && `${c.claimId} ${c.patientName} ${c.disease} ${c.hospital}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'amount' ? b.claimAmount - a.claimAmount : new Date(b.createdAt) - new Date(a.createdAt));
  const pages = Math.max(1, Math.ceil(filtered.length / 6));
  useEffect(() => setPage(1), [search, status, sort]);
  return <><PageHeading eyebrow="EVERY STEP, IN ONE PLACE" title={user.role !== 'patient' ? 'Claims, with a clearer view.' : 'Your claims. Less uncertainty.'} description="Follow your progress, find your documents, and know what comes next."><Button variant="secondary" onClick={exportClaims}><ArrowDownToLine size={16} /> Export</Button>{user.role !== 'officer' && <Button onClick={onNew}><Plus size={17} /> New claim</Button>}</PageHeading><section className="card"><div className="filter-toolbar"><div className="tabs">{['All', 'Pending', 'Approved', 'Rejected'].map(s => <button className={status === s ? 'active' : ''} key={s} onClick={() => setStatus(s)}>{s}<span>{claims.filter(c => s === 'All' || c.status === s).length}</span></button>)}</div><div className="table-filters"><div className="input-icon"><Search size={16} /><input aria-label="Filter claims" placeholder="Search claims…" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Sort claims" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="amount">Highest amount</option></select></div></div><ClaimsTable claims={filtered.slice((Math.min(page, pages) - 1) * 6, Math.min(page, pages) * 6)} openClaim={openClaim} /><div className="pagination"><span>{filtered.length} {filtered.length === 1 ? 'claim' : 'claims'} found</span><div><button className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={17} /></button><span>Page {Math.min(page, pages)} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={17} /></button></div></div></section></>;
}
function NewClaim({
  user,
  policies,
  onClose,
  onSuccess,
  onImport,
  draft,
  notify
}) {
  const [step, setStep] = useState(draft?.step || 0),
    [data, setData] = useState(draft?.data || {
      patientName: user.role === 'patient' ? user.name : '',
      patientId: user.role === 'patient' ? user.id : '',
      age: '',
      gender: 'Male',
      policyNumber: '',
      disease: '',
      hospital: '',
      admissionDate: '',
      dischargeDate: '',
      claimAmount: '',
      previousClaimHistory: ''
    }),
    [files, setFiles] = useState(draft?.files || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const form = useRef(null);
  const hasActivePolicy = policies.some(policy => policy.status === 'Active');
  const field = (key, value) => setData(d => ({
    ...d,
    [key]: value
  }));
  const submit = async e => {
    e.preventDefault();
    if (step < 2) {
      setError('');
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => fd.append(k, v));
      files.forEach(f => fd.append('documents', f));
      await api.createClaim(fd);
      onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return <Modal title="Let’s take the next step." onClose={onClose} wide><p className="modal-intro">A few details now. A clearer journey ahead.</p><div className="form-steps">{['Patient & cover', 'Treatment & documents', 'Review & submit'].map((s, i) => <div className={i <= step ? 'active' : ''} key={s}><span>{i < step ? <Check size={14} /> : i + 1}</span>{s}</div>)}</div>{step === 0 && !hasActivePolicy && <div className="claim-policy-empty"><ShieldCheck size={23} /><div><h3>{policies.length ? 'No active policies available' : 'No policies linked yet'}</h3><p>{onImport ? 'Import a policy to continue. Sample cover is available for testing.' : 'Ask your administrator to link an issued policy before submitting a claim.'}</p></div>{onImport && <Button type="button" onClick={() => onImport({ data, files, step })}><Upload size={15} />Import policies</Button>}</div>}<form onSubmit={submit} ref={form}>{step === 0 && <div className="form-grid"><Field label="Patient’s full name"><input value={data.patientName} onChange={e => field('patientName', e.target.value)} required minLength={2} maxLength={80} readOnly={user.role === 'patient'} /></Field><Field label="Policy"><select required disabled={!hasActivePolicy} value={data.policyNumber} onChange={e => {
            const p = policies.find(p => p.policyNumber === e.target.value);
            setData(d => ({
              ...d,
              policyNumber: e.target.value,
              patientId: p?.patientId || user.id,
              patientName: p?.patientName || d.patientName
            }));
          }}><option value="">Choose a policy</option>{policies.filter(p => p.status === 'Active').map(p => <option key={p.id} value={p.policyNumber}>{p.name} · {p.policyNumber}</option>)}</select></Field><Field label="Patient’s age"><input type="number" min="0" max="120" required value={data.age} onChange={e => field('age', e.target.value)} /></Field><Field label="Gender"><select value={data.gender} onChange={e => field('gender', e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select></Field></div>}{step === 1 && <div className="form-grid"><Field label="Treatment / condition"><input required maxLength={120} value={data.disease} onChange={e => field('disease', e.target.value)} placeholder="e.g. Knee surgery" /></Field><Field label="Hospital name"><input required maxLength={160} value={data.hospital} onChange={e => field('hospital', e.target.value)} placeholder="Hospital or care provider" /></Field><Field label="Admission date"><input type="date" required value={data.admissionDate} max={new Date().toISOString().slice(0, 10)} onChange={e => field('admissionDate', e.target.value)} /></Field><Field label="Discharge date"><input type="date" required value={data.dischargeDate} min={data.admissionDate} max={new Date().toISOString().slice(0, 10)} onChange={e => field('dischargeDate', e.target.value)} /></Field><Field label="Claim amount (₹)"><input type="number" min="1" max="10000000" step="0.01" required value={data.claimAmount} onChange={e => field('claimAmount', e.target.value)} /></Field><Field label="Previous claim history (optional)"><input value={data.previousClaimHistory} maxLength={500} onChange={e => field('previousClaimHistory', e.target.value)} /></Field><label className="upload-zone"><Upload size={22} /><strong>{files.length ? `${files.length} documents selected` : 'Add your supporting documents'}</strong><span>Hospital bills, discharge summary · PDF, JPG, PNG · 5 MB each</span><input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={e => {
            const f = [...e.target.files];
            if (f.length > 5 || f.some(x => x.size > 5 * 1024 * 1024)) {
              setError('Choose up to 5 files, at most 5 MB each.');
              return;
            }
            setError('');
            setFiles(f);
          }} /></label>{files.length > 0 && <div className="file-chips">{files.map((f, i) => <span key={i}><FileText size={13} />{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => i !== j))}><X size={13} /></button></span>)}</div>}</div>}{step === 2 && <div><div className="review-box"><h3>A quick check before you submit.</h3><dl className="detail-grid">{[['Patient', data.patientName], ['Policy', data.policyNumber], ['Treatment', data.disease], ['Hospital', data.hospital], ['Admission', date(data.admissionDate)], ['Discharge', date(data.dischargeDate)], ['Claim amount', money(data.claimAmount)], ['Documents', `${files.length} attached`]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div><label className="checkbox"><input type="checkbox" required />I confirm the details are accurate and these documents support this claim.</label></div>}{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><Button type="button" variant="secondary" onClick={() => step ? setStep(step - 1) : onClose()}>{step ? 'Back' : 'Cancel'}</Button><Button type="submit" disabled={busy || step === 0 && !hasActivePolicy}>{busy ? <LoaderCircle className="spin" size={17} /> : step === 2 ? 'Submit claim' : 'Continue'}<ArrowRight size={16} /></Button></div></form></Modal>;
}
function ClaimDetail({
  claim,
  user,
  onClose,
  onUpdate,
  notify
}) {
  const [status, setStatus] = useState(claim.status === 'Pending' ? 'Approved' : claim.status),
    [remarks, setRemarks] = useState(claim.remarks || ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [editing, setEditing] = useState(false);
  const editable = claim.status === 'Pending' && (claim.patientId === user.id || claim.submittedBy === user.id || user.role === 'admin');
  const update = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = staff(user) ? {
        status,
        remarks
      } : Object.fromEntries(new FormData(e.currentTarget));
      await api.updateClaim(claim.id, data);
      await onUpdate();
      setEditing(false);
      notify('Claim updated. The timeline is up to date.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async e => {
    if (!e.target.files.length) return;
    setBusy(true);
    try {
      await api.uploadDocuments(claim.id, [...e.target.files]);
      await onUpdate();
      notify('Documents added to your claim.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };
  return <Modal title={claim.claimId} onClose={onClose} wide><div className="detail-title"><div><h2>{claim.disease}</h2><p>{claim.patientName} · {claim.hospital}</p></div><Badge status={claim.status} /></div><dl className="detail-grid">{[['Claim amount', money(claim.claimAmount)], ['Policy number', claim.policyNumber], ['Submitted', date(claim.createdAt)], ['Patient', `${claim.age} years · ${claim.gender}`], ['Admission', date(claim.admissionDate)], ['Discharge', date(claim.dischargeDate)]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><div className="detail-columns"><div><h3 className="section-title">Your claim journey</h3><div className="timeline">{(claim.timeline?.length ? claim.timeline : [{
            status: 'Submitted',
            at: claim.createdAt,
            note: 'Claim received for review.'
          }]).map((t, i) => <div key={i} className="timeline-item"><span><Check size={13} /></span><div><strong>{t.status}</strong><p>{t.note || t.remarks || 'Status updated'}</p><small>{date(t.at || t.createdAt)}</small></div></div>)}</div></div><div><h3 className="section-title">Supporting documents</h3><div className="document-list">{claim.documents?.map(d => <button key={d.id} onClick={async () => {
            try {
              const url = await api.documentUrl(d.id);
              const a = document.createElement('a');
              a.href = url;
              a.download = d.name;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 3000);
            } catch (e) {
              notify(e.message);
            }
          }}><FileText size={18} /><span>{d.name}<small>{d.size ? `${(d.size / 1024).toFixed(0)} KB` : 'Document'}</small></span><ArrowDownToLine size={16} /></button>)}{!claim.documents?.length && <p className="muted">No documents attached yet.</p>}</div>{editable && <label className="button secondary upload-button"><Upload size={15} /> Add documents<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg" disabled={busy} onChange={upload} /></label>}</div></div>{claim.remarks && <div className="note-box"><strong>Latest note</strong><p>{claim.remarks}</p></div>}{staff(user) && <form onSubmit={update} className="review-form"><h3>Review this claim</h3><div className="form-grid"><Field label="Decision"><select value={status} onChange={e => setStatus(e.target.value)}><option>Approved</option><option>Rejected</option></select></Field><Field label="Review note"><textarea required minLength={5} maxLength={1000} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Explain your decision for the member" /></Field></div><Button disabled={busy || claim.status !== 'Pending'} type="submit">{busy ? <LoaderCircle className="spin" size={16} /> : <CheckCheck size={16} />}Save decision</Button>{claim.status !== 'Pending' && <small className="muted">This claim has a final decision.</small>}</form>}{editable && !staff(user) && <div className="edit-section">{!editing ? <Button variant="secondary" onClick={() => setEditing(true)}><SlidersHorizontal size={15} />Edit pending claim</Button> : <form onSubmit={update}><div className="form-grid"><Field label="Treatment"><input name="disease" defaultValue={claim.disease} required maxLength={120} /></Field><Field label="Hospital"><input name="hospital" defaultValue={claim.hospital} required maxLength={160} /></Field><Field label="Amount (₹)"><input name="claimAmount" type="number" min="1" max="10000000" defaultValue={claim.claimAmount} required /></Field></div><Button type="submit" disabled={busy}>Save changes</Button></form>}</div>}{error && <div className="form-error" role="alert">{error}</div>}</Modal>;
}
function Policies({
  policies,
  user,
  mode,
  onImport,
  onPay
}) {
  return <><PageHeading eyebrow="A LITTLE MORE REASSURANCE" title="Your cover, made clear." description="Know what’s available. Keep the important things close.">{canImportPolicies(user, mode) && <Button onClick={onImport}><Upload size={16} />Import policies</Button>}</PageHeading><div className="policy-grid">{policies.map((p, i) => <section key={p.id} className="card policy-card"><div className="policy-card-top"><span className={`stat-icon ${i % 2 ? 'peach' : 'sage'}`}><ShieldCheck size={23} /></span><Badge status={p.status} /></div><p className="eyebrow">HEALTH COVER</p><h2>{p.name}</h2>{p.sample && <span className="policy-sample-tag">Sample policy</span>}<p className="policy-number">{p.policyNumber} · {p.patientName}</p><div className="policy-sum">{money(p.coverageAmount)}<small>sum insured</small></div><div className="policy-progress"><span style={{
            width: `${Math.min(100, p.usedAmount / p.coverageAmount * 100)}%`
          }} /></div><div className="policy-progress-label"><span>{money(p.usedAmount)} utilized</span><span>{money(Math.max(0, p.coverageAmount - p.usedAmount))} available</span></div><dl className="detail-grid"><div><dt>Cover period</dt><dd>{date(p.startDate)} – {date(p.endDate)}</dd></div><div><dt>Annual premium</dt><dd>{money(p.premiumAmount)}</dd></div><div><dt>Next premium due</dt><dd>{date(p.nextDueDate)}</dd></div><div><dt>Member</dt><dd>{p.patientName}</dd></div></dl><Button variant="secondary" className="full" onClick={onPay}>Manage premium <ArrowRight size={16} /></Button></section>)}</div>{!policies.length && <Empty title="Your cover will appear here" description={canImportPolicies(user, mode) ? 'Import sample cover or a policy CSV to begin submitting claims.' : 'Ask your administrator to add your policy before submitting a claim.'} />}<div className="info-note"><CircleHelp size={20} /><p>Policy limits and eligibility are set by your insurer. These sample plans demonstrate the project workflow; refer to your actual policy wording for real coverage.</p></div></>;
}
function Analytics({
  claims,
  exportClaims
}) {
  const status = ['Approved', 'Pending', 'Rejected'].map(name => ({
      name,
      value: claims.filter(c => c.status === name).length
    })),
    gender = ['Male', 'Female', 'Other', 'Prefer not to say'].map(name => ({
      name,
      value: claims.filter(c => c.gender === name).length
    })).filter(x => x.value),
    patients = Object.values(claims.reduce((a, c) => {
      a[c.patientName] ??= {
        name: c.patientName,
        amount: 0
      };
      a[c.patientName].amount += c.claimAmount;
      return a;
    }, {})),
    ages = [['0–18', 0, 18], ['19–30', 19, 30], ['31–45', 31, 45], ['46–60', 46, 60], ['61+', 61, 120]].map(([name, a, b]) => ({
      name,
      claims: claims.filter(c => c.age >= a && c.age <= b).length
    }));
  const common = {
    axisLine: false,
    tickLine: false,
    tick: {
      fontSize: 11,
      fill: '#869087'
    }
  };
  return <><PageHeading eyebrow="CLARITY IN THE BIGGER PICTURE" title="Your care, in perspective." description="Explore claim patterns and turn your records into useful insights."><Button variant="secondary" onClick={() => window.print()}><FileText size={16} />Print report</Button><Button onClick={exportClaims}><ArrowDownToLine size={16} />Export data</Button></PageHeading><div className="insight-callout"><span><Activity size={23} /></span><p><strong>{claims.length ? Math.round(claims.filter(c => c.status === 'Approved').length / claims.length * 100) : 0}% of claims approved</strong> across {claims.length} records in this workspace. Charts reflect the records your role can access.</p></div><div className="analytics-grid"><section className="card analytics-card"><h3>Claim amount by patient</h3><p>A view of total submitted amounts</p><div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={patients} margin={{
              left: -15,
              right: 10,
              bottom: 15
            }}><CartesianGrid strokeDasharray="3 4" vertical={false} /><XAxis dataKey="name" {...common} tickFormatter={s => s.split(' ')[0]} /><YAxis {...common} tickFormatter={n => `${n / 1000}k`} /><Tooltip formatter={v => money(v)} /><Bar dataKey="amount" name="Amount" fill="#3c4a92" radius={[7, 7, 0, 0]} maxBarSize={45} /></BarChart></ResponsiveContainer></div></section><DonutCard title="Every claim, a status" description="Where your claims stand today" data={status} /><DonutCard title="Gender distribution" description="Patient demographics in this workspace" data={gender} /><section className="card analytics-card"><h3>Claims across age groups</h3><p>Understanding the ages behind the records</p><div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={ages} margin={{
              left: -25,
              right: 15,
              bottom: 15
            }}><CartesianGrid strokeDasharray="3 4" vertical={false} /><XAxis dataKey="name" {...common} /><YAxis {...common} allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="claims" name="Claims" stroke="#3c4a92" strokeWidth={3} dot={{
                r: 5,
                fill: '#b5b7e9',
                stroke: '#3c4a92',
                strokeWidth: 2
              }} /></LineChart></ResponsiveContainer></div></section></div></>;
}
function DonutCard({
  title,
  description,
  data
}) {
  return <section className="card analytics-card"><h3>{title}</h3><p>{description}</p><div className="donut-layout"><div className="donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" innerRadius="62%" outerRadius="87%" paddingAngle={5} cornerRadius={5}>{data.map((d, i) => <Cell key={d.name} fill={colors[i % colors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{data.reduce((s, d) => s + d.value, 0)}</strong><span>records</span></div></div><div className="donut-legend">{data.map((d, i) => <div key={d.name}><i style={{
            background: colors[i % colors.length]
          }} /><span>{d.name}</span><strong>{d.value}</strong></div>)}</div></div></section>;
}
function Documents({
  claims,
  openClaim,
  notify
}) {
  const [search, setSearch] = useState('');
  const docs = claims.flatMap(c => (c.documents || []).map(d => ({
    ...d,
    claim: c
  }))).filter(d => `${d.name} ${d.claim.claimId}`.toLowerCase().includes(search.toLowerCase()));
  return <><PageHeading eyebrow="THE IMPORTANT THINGS, TOGETHER" title="Your documents. A little tidier." description="Bills, reports, and discharge summaries, connected to the right claim." /><div className="document-toolbar"><div className="input-icon"><Search size={17} /><input placeholder="Find a document…" aria-label="Find a document" value={search} onChange={e => setSearch(e.target.value)} /></div><span>{docs.length} documents</span></div><div className="document-grid">{docs.map(d => <div className="card document-card" key={d.id}><span className="document-type"><FileText size={30} /></span><h3>{d.name}</h3><p>{d.claim.claimId} · {d.claim.patientName}</p><small>{d.size ? `${Math.round(d.size / 1024)} KB` : 'Supporting document'} · {date(d.claim.createdAt)}</small><div><button className="text-button" onClick={() => openClaim(d.claim)}>View claim <ArrowUpRight size={14} /></button><button className="icon-button" aria-label={`Download ${d.name}`} onClick={async () => {
            try {
              const url = await api.documentUrl(d.id);
              const a = document.createElement('a');
              a.href = url;
              a.download = d.name;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 3000);
            } catch (e) {
              notify(e.message);
            }
          }}><ArrowDownToLine size={17} /></button></div></div>)}</div>{!docs.length && <Empty title="Make room for a little order" description="Attach documents when you create a claim, or add them to a pending claim. They’ll appear here." />}<div className="info-note"><LockKeyhole size={18} /><p>Documents are linked to claims and protected by the same role permissions. In the browser preview, uploaded files stay on this device.</p></div></>;
}
function Settings({
  user,
  setUser,
  notify,
  onLogout,
  mode
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reduced, setReduced] = useState(localStorage.getItem('careclaim-reduced-motion') === 'true');
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduced);
    localStorage.setItem('careclaim-reduced-motion', String(reduced));
  }, [reduced]);
  const save = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.profile(Object.fromEntries(new FormData(e.currentTarget)));
      setUser(r.user);
      notify('Your profile is up to date.');
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return <><PageHeading eyebrow="MAKE YOURSELF AT HOME" title="A space that feels like you." description="Keep your details current and your workspace comfortable." /><div className="settings-grid"><section className="card settings-card"><h3>Your details</h3><p>A few essentials for your care workspace.</p><form onSubmit={save}><Field label="Full name"><input name="name" defaultValue={user.name} required minLength={2} maxLength={80} /></Field><Field label="Email"><input value={user.email} disabled /></Field><Field label="Phone number"><input name="phone" defaultValue={user.phone || ''} type="tel" maxLength={20} /></Field><Field label="Workspace role"><input value={roleLabel[user.role]} disabled /></Field>{error && <div className="form-error">{error}</div>}<Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Save changes</Button></form></section><div><section className="card settings-card"><h3>Your comfort matters</h3><p>A calmer experience, on your terms.</p><label className="toggle-row"><span><strong>Reduce animations</strong><small>Keep movement to a minimum</small></span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} /></label><div className="preference-note"><Leaf size={19} /><span>Music is always optional. You can turn it on in your care corner.</span></div></section><section className="card settings-card session-card"><h3>Your session</h3><dl className="detail-grid"><div><dt>Workspace</dt><dd>{mode === 'mongodb' ? 'MongoDB connected' : mode === 'preview' ? 'Browser preview' : 'Server demo'}</dd></div><div><dt>Access</dt><dd>{roleLabel[user.role]}</dd></div></dl><Button variant="secondary" onClick={onLogout}><LogOut size={16} />Sign out</Button></section></div></div></>;
}
function Audit({
  user
}) {
  const [logs, setLogs] = useState([]),
    [error, setError] = useState('');
  useEffect(() => {
    if (staff(user)) api.audit().then(r => setLogs(r.logs)).catch(e => setError(e.message));
  }, []);
  if (!staff(user)) return <Empty title="This view is for claim reviewers" />;
  return <><PageHeading eyebrow="TRANSPARENCY AT EVERY STEP" title="A record of every little update." description="Review the actions that keep your claims moving." />{error && <div className="form-error">{error}</div>}<section className="card"><div className="audit-list">{logs.map((l, i) => <div key={l.id || i}><span className="stat-icon sage"><Activity size={17} /></span><div><strong>{l.action}</strong><p>{l.detail || l.details || l.message || l.targetId || l.entityId || l.claimId || ''}</p><small>{l.actorName || l.userName || l.userId || 'Workspace user'} · {date(l.createdAt || l.at)}</small></div></div>)}{!logs.length && <Empty title="Updates will appear here" />}</div></section></>;
}
