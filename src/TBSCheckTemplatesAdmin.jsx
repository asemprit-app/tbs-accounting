import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { normalizeCustomCheckProfileLibrary } from './tbsCustomCheckProfiles.js';

export default function TBSCheckTemplatesAdmin({ clients, selectedClientId, onSwitchClient }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  async function refresh() {
    setBusy(true);
    setError('');
    const { data, error: loadError } = await supabase.from('tbs_check_print_profiles')
      .select('client_id, library, updated_at').order('updated_at', { ascending: false });
    if (loadError) setError(loadError.message);
    else setRows(data || []);
    setBusy(false);
  }
  useEffect(() => { refresh(); }, []);

  const byClient = new Map(rows.map(row => [row.client_id, row]));
  return (
    <div style={{ maxWidth: 1050 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>TBS Administration — Check Templates</h2>
        <button onClick={refresh} disabled={busy} style={{ border: '1px solid #CBD5E1', background: 'white', padding: '7px 12px', borderRadius: 6 }}>
          {busy ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <div style={{ fontSize: 13, color: '#516170', marginBottom: 16 }}>
        Custom check calibrations are saved separately for each client in the TBS database. Only staff can view this all-client list.
        Open Payroll or Services for the selected client to adjust and save their templates.
      </div>
      {error && <div role="alert" style={{ color: '#B00020', marginBottom: 12 }}>Cannot load check templates: {error}</div>}
      {!busy && !error && <div style={{ background: '#fff', border: '1px solid #E2E5E9', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F1F5F9', textAlign: 'left' }}>
            <th style={{ padding: 12 }}>Client</th><th style={{ padding: 12 }}>Saved check formats</th>
            <th style={{ padding: 12 }}>Last update</th><th style={{ padding: 12 }}>Action</th>
          </tr></thead>
          <tbody>
            {clients.map(client => {
              const row = byClient.get(client.id);
              const names = normalizeCustomCheckProfileLibrary(row?.library).presets.map(p => `${p.name} (${p.sheetParts}-part)`);
              return <tr key={client.id} style={{ borderTop: '1px solid #E2E5E9' }}>
                <td style={{ padding: 12, fontWeight: client.id === selectedClientId ? 700 : 400 }}>{client.name}</td>
                <td style={{ padding: 12 }}>{names.length ? names.join(' · ') : 'No saved formats'}</td>
                <td style={{ padding: 12 }}>{row?.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}</td>
                <td style={{ padding: 12 }}>
                  <button onClick={() => onSwitchClient(client.id)} disabled={client.id === selectedClientId}
                    style={{ border: '1px solid #CBD5E1', borderRadius: 5, padding: '5px 8px', background: '#fff' }}>
                    {client.id === selectedClientId ? 'Selected' : 'Select client'}
                  </button>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </div>
  );
}
