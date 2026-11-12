import React, { useState } from 'react';
import { supabase } from './supabaseClient.js';

export default function TBSStaffPasswordSetup({ onComplete }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (newPassword.length < 12 || newPassword !== confirmPassword) {
      setMessage('La contraseña debe tener 12 caracteres como mínimo y ambas entradas deben coincidir.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.updateUser({ password: newPassword, data: { tbs_staff_setup: false } });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    const url = new URL(window.location.href);
    url.searchParams.delete('setup');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    setNewPassword(''); setConfirmPassword('');
    onComplete();
  }
  return <main style={{minHeight:'100vh',display:'flex',justifyContent:'center',alignItems:'center',background:'#F4F6F8',fontFamily:'system-ui'}}>
    <form onSubmit={submit} style={{width:370,padding:25,borderRadius:10,background:'white',border:'1px solid #CFD6DF'}}>
      <h2 style={{color:'#17365D'}}>Establecer contraseña de TBS</h2>
      <p>Para completar su invitación, establezca su contraseña personal.</p>
      <label>Nueva contraseña (mínimo 12 caracteres)</label>
      <input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box',marginBottom:15,padding:9}}/>
      <label>Confirmar contraseña</label>
      <input type="password" autoComplete="new-password" required minLength={12} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box',marginBottom:15,padding:9}}/>
      {message && <p role="alert" style={{color:'#B00020'}}>{message}</p>}
      <button type="submit" disabled={busy} style={{padding:'10px 14px',color:'white',background:'#17365D',border:0,borderRadius:6}}>{busy?'Guardando...':'Guardar contraseña'}</button>
    </form>
  </main>;
}