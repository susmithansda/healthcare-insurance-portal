import { useState } from 'react';
export default function Recovery({ mode }) {
 const token = new URLSearchParams(location.search).get('reset');
 const [open,setOpen]=useState(Boolean(token)),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){e.preventDefault();setBusy(true);setMessage('');try{
 if(mode==='preview') throw new Error('Password recovery requires the connected server.');
 const data=Object.fromEntries(new FormData(e.currentTarget));
 const r=await fetch(`${(import.meta.env.VITE_API_URL || '/api').replace(/\/$/,'')}/auth/${token?'reset-password':'forgot-password'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,token})});
 const result=await r.json();if(!r.ok)throw new Error(result.message || result.error || 'Recovery failed');setMessage(result.message);
 if(token)history.replaceState({},'',location.pathname);
 }catch(err){setMessage(err.message)}finally{setBusy(false)}}
 return <div className="recovery"><button type="button" className="text-button" onClick={()=>setOpen(!open)}>Forgot password?</button>{open&&<form onSubmit={submit}><h3>{token?'Choose a new password':'Recover your account'}</h3><p>{token?'Use 10+ characters with uppercase, lowercase and a number.':'We will email you a link valid for 15 minutes.'}</p>{token?<input aria-label="New password" name="password" type="password" autoComplete="new-password" minLength={10} required/>:<input aria-label="Recovery email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required/>}<button className="button" disabled={busy}>{busy?'Please wait?':token?'Update password':'Send recovery link'}</button></form>}{message&&<p role="status">{message}</p>}</div>
}
