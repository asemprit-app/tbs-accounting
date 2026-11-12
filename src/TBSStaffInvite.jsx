import React, { useState } from 'react';
import { supabase } from './supabaseClient.js';

const STAFF_EMAIL = 'admin@twelvestrategies.com';

export default function TBSStaffInvite() {
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function sendInvite() {
    setSending(true);
    setNotice('');
    setError('');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (sessionError || !token) throw new Error('Debe iniciar sesión como Supervisor.');
      const response = await fetch('/api/invite-staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ email: STAFF_EMAIL }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.accepted) {
        throw new Error(payload.error || 'No se pudo enviar la invitación.');
      }
      setNotice('Invitación enviada a ' + STAFF_EMAIL + '. El destinatario debe abrir el correo y establecer su contraseña.');
    } catch (e) {
      setError(e.message || 'No se pudo enviar la invitación.');
    } finally {
      setSending(false);
    }
  }
  return (
    <div style={{ maxWidth: 700, background: '#fff', border: '1px solid #DEE5EE', borderRadius: 10, padding: 24 }}>
      <h2 style={{ marginTop: 0, color: '#17365D' }}>Acceso del personal TBS</h2>
      <p>Cuenta autorizada: <strong>{STAFF_EMAIL}</strong></p>
      <p>Rol: <strong>Administrador</strong>. Tendrá acceso a los espacios de todos los clientes y a las operaciones contables y administrativas, excepto el Reporte Financiero Ejecutivo y CFO Close Overview.</p>
      <p>Se enviará un enlace privado de un solo uso para establecer la contraseña. No es necesario compartir ninguna contraseña.</p>
      <button type="button" onClick={sendInvite} disabled={sending}
        style={{ background: '#17365D', color: 'white', border: 0, borderRadius: 6, padding: '11px 16px', cursor: sending ? 'wait' : 'pointer' }}>
        {sending ? 'Enviando...' : 'Enviar invitación por correo'}
      </button>
      {notice && <p role="status" style={{ color: '#176B47' }}>{notice}</p>}
      {error && <p role="alert" style={{ color: '#B00020' }}>{error}</p>}
    </div>
  );
}
