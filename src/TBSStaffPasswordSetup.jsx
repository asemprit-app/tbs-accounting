import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';

function readStaffSetupLink() {
  const parts = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const tokenHash = parts.get('token_hash') || '';
  const type = parts.get('type') || '';
  return { tokenHash, type };
}

export default function TBSStaffPasswordSetup({ onComplete }) {
  const [setupLink] = useState(readStaffSetupLink);
  const [verified, setVerified] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Remove the single-use token hash from the address bar before further navigation.
    if (setupLink.tokenHash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [setupLink.tokenHash]);

  async function verifyLink() {
    if (!/^[A-Za-z0-9_-]{24,}$/.test(setupLink.tokenHash) || !['recovery', 'invite'].includes(setupLink.type)) {
      setMessage('El enlace de invitación no es válido. Solicite al Supervisor un correo nuevo desde Staff Access.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: setupLink.tokenHash, type: setupLink.type });
      if (verifyError) throw verifyError;
      const { data: account, error: accountError } = await supabase.auth.getUser();
      if (accountError || !account?.user?.id) throw new Error('No se pudo confirmar la cuenta.');
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('role,access_level').eq('id', account.user.id).single();
      if (profileError || account.user.email?.toLowerCase() !== 'admin@twelvestrategies.com' ||
          profile?.role !== 'staff' || profile?.access_level !== 'admin') {
        await supabase.auth.signOut();
        throw new Error('Esta invitación no corresponde al administrador autorizado de TBS.');
      }
      setVerified(true);
    } catch (error) {
      setMessage((error?.message || 'No se pudo verificar el enlace.') + ' Solicite una nueva invitación si el enlace expiró.');
    } finally { setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();
    if (!verified) return;
    if (newPassword.length < 12 || newPassword !== confirmPassword) {
      setMessage('La contraseña debe tener 12 caracteres como mínimo y ambas entradas deben coincidir.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword, data: { tbs_staff_setup: false } });
      if (error) throw error;
      const url = new URL(window.location.href);
      url.searchParams.delete('setup');
      window.history.replaceState(null, '', url.pathname + url.search);
      setNewPassword(''); setConfirmPassword('');
      onComplete();
    } catch (error) {
      setMessage(error?.message || 'No se pudo guardar la contraseña.');
    } finally { setBusy(false); }
  }

  const style = { display:'block', width:'100%', boxSizing:'border-box', marginBottom:15, padding:9 };
  return <main style={{minHeight:'100vh',display:'flex',justifyContent:'center',alignItems:'center',background:'#F4F6F8',fontFamily:'system-ui'}}>
    <div style={{width:370,padding:25,borderRadius:10,background:'white',border:'1px solid #CFD6DF'}}>
      <h2 style={{color:'#17365D'}}>Configurar acceso TBS</h2>
      {!verified ? <>
        <p>Verifique su invitación para establecer una contraseña personal como administrador.</p>
        <button type="button" onClick={verifyLink} disabled={busy} style={{padding:'10px 14px',color:'white',background:'#17365D',border:0,borderRadius:6}}>
          {busy ? 'Verificando...' : 'Verificar invitación'}
        </button>
      </> : <form onSubmit={submit}>
        <p>Invitación verificada. Establezca su contraseña personal.</p>
        <label>Nueva contraseña (mínimo 12 caracteres)</label>
        <input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} style={style}/>
        <label>Confirmar contraseña</label>
        <input type="password" autoComplete="new-password" required minLength={12} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} style={style}/>
        <button type="submit" disabled={busy} style={{padding:'10px 14px',color:'white',background:'#17365D',border:0,borderRadius:6}}>
          {busy ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </form>}
      {message && <p role="alert" style={{color:'#B00020',fontSize:13}}>{message}</p>}
      <p style={{fontSize:12,color:'#607080'}}>Si el enlace no funciona, el Supervisor puede enviar uno nuevo desde Staff Access.</p>
    </div>
  </main>;
}