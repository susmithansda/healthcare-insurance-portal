import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, CheckCheck, FileSpreadsheet, LoaderCircle, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { api } from '../api';
import { parsePolicyCsv, policyCsvTemplate } from '../../../shared/policy-csv.js';
import { validatePolicyInput } from '../../../shared/policy-import.js';
import './PolicyImport.css';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
export const canImportPolicies = (user, mode) => user.role === 'admin' || user.role === 'patient' && ['demo', 'preview'].includes(mode);

export default function PolicyImport({ user, mode, onClose, onSuccess }) {
  const sampleAvailable = user.role === 'patient' && ['demo', 'preview'].includes(mode);
  const [source, setSource] = useState(sampleAvailable ? 'sample' : 'csv');
  const [rows, setRows] = useState([]);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null);
  const loading = useRef(false);
  const fileRead = useRef(0);
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = event => {
      if (event.key === 'Escape' && !loading.current) onClose();
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')];
      const first = controls[0], last = controls.at(-1);
      if (!controls.length) { event.preventDefault(); dialog.current.focus(); }
      else if (event.shiftKey && [first, dialog.current].includes(document.activeElement)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && [last, dialog.current].includes(document.activeElement)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);
  const chooseFile = async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const currentRead = ++fileRead.current;
    setRows([]); setFilename(file.name); setError('');
    try {
      if (file.size > 256 * 1024) throw new Error('Choose a CSV smaller than 256 KB.');
      const parsed = parsePolicyCsv(await file.text());
      if (currentRead !== fileRead.current) return;
      const validated = parsed.map((row, index) => {
        try { return validatePolicyInput(row); }
        catch (err) { throw new Error(`Policy ${index + 1}: ${err.message}`); }
      });
      setRows(validated);
    } catch (err) { if (currentRead === fileRead.current) setError(err.message); }
  };
  const template = () => {
    const url = URL.createObjectURL(new Blob([policyCsvTemplate({ includePatientEmail: user.role === 'admin' })], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'CareClaim-policy-import-template.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const submit = async () => {
    if (loading.current || source === 'csv' && !rows.length) return;
    loading.current = true; setBusy(true); setError('');
    try {
      const result = await api.importPolicies(source === 'sample' ? { source: 'sample' } : { policies: rows });
      await onSuccess(result);
    } catch (err) { setError(err.message); }
    finally { loading.current = false; setBusy(false); }
  };
  return <div className="policy-import-overlay" onClick={event => event.target === event.currentTarget && !loading.current && onClose()}><section className="policy-import-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label="Import policies" tabIndex={-1}>
    <div className="policy-import-heading"><div><span className="eyebrow">YOUR COVER, CONNECTED</span><h2>Import policies</h2><p>Add cover to your workspace, then continue your claim.</p></div><button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={21} /></button></div>
    {sampleAvailable && <div className="policy-import-sources" role="group" aria-label="Import source"><button aria-label="Sample policies" aria-pressed={source === 'sample'} disabled={busy} onClick={() => { setSource('sample'); setError(''); }}><Sparkles size={19} /><span><strong>Sample policies</strong><small>Explore the claim journey</small></span></button><button aria-label="CSV file" aria-pressed={source === 'csv'} disabled={busy} onClick={() => { setSource('csv'); setError(''); }}><FileSpreadsheet size={19} /><span><strong>CSV file</strong><small>Bring your policy records</small></span></button></div>}
    {source === 'sample' ? <div className="policy-import-sample"><div className="policy-import-notice"><ShieldCheck size={20} /><div><strong>Sample cover for {user.name}</strong><p>These synthetic policies are for testing claims and premium payments. They do not provide insurance coverage.</p></div></div><div className="policy-import-plans"><article><span><ShieldCheck size={22} /></span><div><h3>Sample Family Cover</h3><p>Health cover for the sample claim journey.</p><strong>{money(500000)}<small>sum insured</small></strong></div></article><article><span><ShieldCheck size={22} /></span><div><h3>Sample Essential Cover</h3><p>A second plan to try policy selection.</p><strong>{money(300000)}<small>sum insured</small></strong></div></article></div><p className="policy-import-caption"><CheckCheck size={15} />Both plans link to your account. Importing them again will keep the same policies.</p></div> : <div className="policy-import-csv"><div className="policy-import-template"><div><h3>Start with a simple spreadsheet.</h3><p>Use the template headers, then export your file as CSV.</p></div><button className="button secondary" onClick={template} disabled={busy}><ArrowDownToLine size={15} />Download CSV template</button></div><label className="policy-import-drop"><Upload size={25} /><strong>{filename || 'Choose a policy CSV'}</strong><span>CSV only · Up to 100 policies · 256 KB maximum</span><input type="file" accept=".csv,text/csv" aria-label="Choose policy CSV" disabled={busy} onChange={chooseFile} /></label>{rows.length > 0 && <div className="policy-import-preview"><div><CheckCheck size={16} /><strong>{rows.length} {rows.length === 1 ? 'policy' : 'policies'} ready to import</strong><span>Showing {Math.min(rows.length, 5)} of {rows.length}</span></div><div className="table-scroll"><table><thead><tr><th>POLICY</th><th>COVERAGE</th><th>PREMIUM</th>{user.role === 'admin' && <th>MEMBER EMAIL</th>}</tr></thead><tbody>{rows.slice(0, 5).map((row, index) => <tr key={index}><td><strong>{row.name}</strong><small>{row.policyNumber}</small></td><td>{money(row.coverageAmount)}</td><td>{money(row.premiumAmount)}</td>{user.role === 'admin' && <td>{row.patientEmail || 'Required'}</td>}</tr>)}</tbody></table></div></div>}<p className="policy-import-caption">Amounts are in INR. Use YYYY-MM-DD dates. {user.role === 'admin' ? 'Each row must include the email of an existing patient account.' : 'Imported policies link to your own sample account.'}</p>{mode !== 'mongodb' && <div className="policy-import-notice"><ShieldCheck size={18} /><p>This workspace uses sample data. CSV import demonstrates policy management and does not verify insurance with an insurer.</p></div>}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="policy-import-actions"><button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button" disabled={busy || source === 'csv' && !rows.length} onClick={submit}>{busy ? <LoaderCircle size={17} className="spin" /> : <Upload size={16} />}{busy ? 'Importing policies…' : source === 'sample' ? 'Import sample policies' : `Import ${rows.length || ''} ${rows.length === 1 ? 'policy' : 'policies'}`}<ArrowRight size={16} /></button></div>
  </section></div>;
}
