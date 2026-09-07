import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LayoutDashboard, Receipt, FileText, Users, BarChart3, Plus, Trash2, Check, Printer, X, AlertCircle, BookOpen, ListChecks, Landmark } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from './supabaseClient';

const MONTHS_ES = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

function normalizeDate(raw) {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // ya es ISO
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/); // ej. 2-Jan-26
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = MONTHS_ES[m[2].toLowerCase()];
    let year = m[3];
    if (year.length === 2) year = '20' + year;
    if (mon) return `${year}-${String(mon).padStart(2, '0')}-${day}`;
  }
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

function parseAmount(raw) {
  let s = String(raw).trim();
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()$,]/g, '').trim();
  const n = Number(s);
  if (isNaN(n)) return null;
  return negative ? -Math.abs(n) : n;
}

function matchAccountByName(text, accounts) {
  const t = text.trim().toLowerCase();
  let best = accounts.find(a => a.name.toLowerCase() === t);
  if (best) return best.code;
  best = accounts.find(a => t.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(t));
  return best ? best.code : '';
}

function parseBankCSV(text, accounts) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;
    if (/^(date|fecha)$/i.test(cols[0])) continue; // encabezado
    const date = normalizeDate(cols[0]);
    const description = cols[1];
    if (!date || !description) continue;

    if (cols.length >= 4) {
      // formato con categoría (ej. export de Wave): fecha,descripción,categoría,monto
      const category = cols[2];
      const amount = parseAmount(cols[3]);
      if (amount === null) continue;
      let gl = '';
      let mode = 'REVIEW';
      if (/^Invoice #/i.test(category)) {
        gl = matchAccountByName('Accounts Receivable', accounts);
        mode = 'MATCH';
      } else if (/^Refund for /i.test(category)) {
        gl = matchAccountByName(category.replace(/^Refund for /i, ''), accounts);
        mode = gl ? 'AUTO' : 'REVIEW';
      } else {
        gl = matchAccountByName(category.replace(/\s*\+\s*\d+$/, ''), accounts);
        mode = gl ? 'AUTO' : 'REVIEW';
      }
      rows.push({ date, description, amount: Math.abs(amount), gl, mode, rawCategory: category });
    } else {
      const amount = parseAmount(cols[2]);
      if (amount === null) continue;
      rows.push({ date, description, amount });
    }
  }
  return rows;
}

function uid() { return Math.random().toString(36).slice(2, 10); }
function money(n) { return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

function suggestGL(description, rules) {
  const desc = (description || '').toUpperCase();
  const hit = rules.find(r => desc.includes(r.keyword.toUpperCase()));
  return hit ? { gl: hit.gl, mode: hit.mode } : { gl: '', mode: 'REVIEW' };
}

function diffSync(table, prevArr, nextArr, clientId) {
  diffSyncByKey(table, 'id', prevArr, nextArr, clientId);
}

function diffSyncByKey(table, key, prevArr, nextArr, clientId) {
  const prevMap = new Map(prevArr.map(x => [x[key], x]));
  const nextMap = new Map(nextArr.map(x => [x[key], x]));
  const toDelete = prevArr.filter(x => !nextMap.has(x[key])).map(x => x[key]);
  const toInsert = nextArr.filter(x => !prevMap.has(x[key])).map(x => ({ ...x, client_id: clientId }));
  const toUpdate = nextArr.filter(x => prevMap.has(x[key]) && JSON.stringify(prevMap.get(x[key])) !== JSON.stringify(x));
  if (toDelete.length) supabase.from(table).delete().in(key, toDelete).then(({ error }) => error && console.error(table, 'delete', error));
  if (toInsert.length) supabase.from(table).insert(toInsert).then(({ error }) => error && console.error(table, 'insert', error));
  toUpdate.forEach(row => {
    supabase.from(table).update(row).eq(key, row[key]).then(({ error }) => error && console.error(table, 'update', error));
  });
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [profile, setProfile] = useState(null);
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    (async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (!error) {
        setProfile(data);
        if (data.role === 'staff') {
          const { data: cl } = await supabase.from('clients').select('*').order('name');
          setClients(cl || []);
          if (cl && cl.length) setSelectedClientId(cl[0].id);
        } else {
          setSelectedClientId(data.client_id);
        }
      }
    })();
  }, [session]);

  async function handleLogin(e) {
    e.preventDefault();
    setAuthBusy(true); setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password });
    if (error) setAuthError(error.message);
    setAuthBusy(false);
  }
  async function handleLogout() {
    await supabase.auth.signOut();
    setProfile(null); setSelectedClientId(null); setClients([]);
  }

  if (session === undefined) {
    return <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#6B7280' }}>Cargando…</div>;
  }

  if (!session) {
    return (
      <div style={{ minHeight: '640px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', background: '#F4F6F8' }}>
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E5E9', padding: 28, width: 320 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#17365D', marginBottom: 16 }}>TBS Accounting — Entrar</div>
          <form onSubmit={handleLogin}>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 }}>Correo</label>
            <input type="email" required style={{ width: '100%', marginBottom: 10 }} value={authForm.email} onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))} />
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 }}>Contraseña</label>
            <input type="password" required style={{ width: '100%', marginBottom: 16 }} value={authForm.password} onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))} />
            {authError && <div style={{ color: '#B00020', fontSize: 12, marginBottom: 10 }}>{authError}</div>}
            <button type="submit" disabled={authBusy} style={{ width: '100%', background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '10px', cursor: 'pointer' }}>
              {authBusy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!profile || !selectedClientId) {
    return <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#6B7280' }}>Preparando tu espacio de trabajo…</div>;
  }

  return (
    <Workspace
      key={selectedClientId}
      clientId={selectedClientId}
      isStaff={profile.role === 'staff'}
      clients={clients}
      selectedClientId={selectedClientId}
      onSwitchClient={setSelectedClientId}
      onLogout={handleLogout}
      userEmail={session.user.email}
    />
  );
}

function Workspace({ clientId, isStaff, clients, selectedClientId, onSwitchClient, onLogout, userEmail }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [transactions, setTransactionsRaw] = useState([]);
  const [invoices, setInvoicesRaw] = useState([]);
  const [customers, setCustomersRaw] = useState([]);
  const [accounts, setAccountsRaw] = useState([]);
  const [rules, setRulesRaw] = useState([]);
  const [journalEntries, setJournalEntriesRaw] = useState([]);
  const [reconciliations, setReconciliationsRaw] = useState([]);
  const [printInvoice, setPrintInvoice] = useState(null);

  useEffect(() => {
    (async () => {
      const [t, i, c, a, r, j, rec] = await Promise.all([
        supabase.from('transactions').select('*').eq('client_id', clientId).order('date'),
        supabase.from('invoices').select('*').eq('client_id', clientId).order('date'),
        supabase.from('customers').select('*').eq('client_id', clientId),
        supabase.from('accounts').select('*').eq('client_id', clientId).order('code'),
        supabase.from('rules').select('*').eq('client_id', clientId),
        supabase.from('journal_entries').select('*').eq('client_id', clientId).order('date'),
        supabase.from('reconciliations').select('*').eq('client_id', clientId).order('period_end'),
      ]);
      const firstErr = [t, i, c, a, r, j, rec].find(x => x.error);
      if (firstErr) {
        setLoadError(firstErr.error.message);
      } else {
        setTransactionsRaw((t.data || []).map(row => ({ ...row, amount: Number(row.amount) })));
        setInvoicesRaw((i.data || []).map(row => ({ ...row, retentionPct: row.retention_pct, paid: Number(row.paid) || 0 })));
        setCustomersRaw(c.data || []);
        setAccountsRaw(a.data || []);
        setRulesRaw(r.data || []);
        setJournalEntriesRaw(j.data || []);
        setReconciliationsRaw((rec.data || []).map(row => ({ ...row, statementBalance: Number(row.statement_balance), ledgerBalance: Number(row.ledger_balance), difference: Number(row.difference), periodEnd: row.period_end })));
      }
      setLoaded(true);
    })();
  }, []);

  const setTransactions = useCallback((updater) => {
    setTransactionsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      diffSync('transactions', prev, next.map(({ ...r }) => r), clientId);
      return next;
    });
  }, []);
  const setInvoices = useCallback((updater) => {
    setInvoicesRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const forDb = next.map(inv => ({
        id: inv.id, number: inv.number, client: inv.client, date: inv.date, lines: inv.lines,
        retention: inv.retention, retention_pct: inv.retentionPct, status: inv.status, paid: inv.paid || 0,
      }));
      const prevForDb = prev.map(inv => ({
        id: inv.id, number: inv.number, client: inv.client, date: inv.date, lines: inv.lines,
        retention: inv.retention, retention_pct: inv.retentionPct, status: inv.status, paid: inv.paid || 0,
      }));
      diffSync('invoices', prevForDb, forDb, clientId);
      return next;
    });
  }, []);
  const setCustomers = useCallback((updater) => {
    setCustomersRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      diffSync('customers', prev, next, clientId);
      return next;
    });
  }, []);
  const setAccounts = useCallback((updater) => {
    setAccountsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      diffSyncByKey('accounts', 'code', prev, next, clientId);
      return next;
    });
  }, []);
  const setRules = useCallback((updater) => {
    setRulesRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      diffSync('rules', prev, next, clientId);
      return next;
    });
  }, []);
  const setJournalEntries = useCallback((updater) => {
    setJournalEntriesRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      diffSync('journal_entries', prev, next, clientId);
      return next;
    });
  }, []);
  const setReconciliations = useCallback((updater) => {
    setReconciliationsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const forDb = next.map(r => ({ id: r.id, gl: r.gl, period_end: r.periodEnd, statement_balance: r.statementBalance, ledger_balance: r.ledgerBalance, difference: r.difference, status: r.status }));
      const prevForDb = prev.map(r => ({ id: r.id, gl: r.gl, period_end: r.periodEnd, statement_balance: r.statementBalance, ledger_balance: r.ledgerBalance, difference: r.difference, status: r.status }));
      diffSync('reconciliations', prevForDb, forDb, clientId);
      return next;
    });
  }, []);

  const glName = (code) => accounts.find(g => g.code === code)?.name || 'Sin categoría';

  const summary = useMemo(() => {
    const month = todayStr().slice(0, 7);
    const revenueMTD = invoices.filter(i => i.date.slice(0, 7) === month)
      .reduce((s, i) => s + invoiceTotal(i), 0);
    const arOpen = invoices.filter(i => i.status !== 'Pagada')
      .reduce((s, i) => s + invoiceTotal(i) - (i.paid || 0), 0);
    const cash = transactions.reduce((s, t) => s + (t.gl === '1010' ? t.amount : 0), 0);
    const review = transactions.filter(t => t.status === 'REVIEW').length;
    return { revenueMTD, arOpen, cash, review };
  }, [transactions, invoices]);

  function invoiceTotal(inv) {
    const sub = inv.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
    const ret = inv.retention ? sub * (Number(inv.retentionPct) || 0) / 100 : 0;
    return sub - ret;
  }

  return (
    <div style={{ display: 'flex', minHeight: '640px', fontFamily: 'system-ui, sans-serif', background: '#F4F6F8', color: '#1F2933' }}>
      <Sidebar tab={tab} setTab={setTab} reviewCount={summary.review} isStaff={isStaff} clients={clients}
        selectedClientId={selectedClientId} onSwitchClient={onSwitchClient} onLogout={onLogout} userEmail={userEmail} />
      <div style={{ flex: 1, padding: '24px 28px', overflow: 'auto' }}>
        {loadError && (
          <div style={{ background: '#FCEBEB', color: '#791F1F', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            No se pudo conectar a la base de datos: {loadError}. Revisa tu archivo .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
          </div>
        )}
        {!loaded ? (
          <div style={{ fontSize: 13, color: '#6B7280' }}>Cargando datos...</div>
        ) : (
        <>
        {tab === 'dashboard' && <Dashboard summary={summary} transactions={transactions} invoices={invoices} />}
        {tab === 'transactions' && (
          <TransactionsView
            transactions={transactions} setTransactions={setTransactions} rules={rules} glName={glName} accounts={accounts}
          />
        )}
        {tab === 'invoices' && (
          <InvoicesView
            invoices={invoices} setInvoices={setInvoices} customers={customers}
            invoiceTotal={invoiceTotal} onPrint={setPrintInvoice}
          />
        )}
        {tab === 'customers' && (
          <CustomersView customers={customers} setCustomers={setCustomers} invoices={invoices} invoiceTotal={invoiceTotal} />
        )}
        {tab === 'reports' && <ReportsView transactions={transactions} invoices={invoices} glName={glName} invoiceTotal={invoiceTotal} accounts={accounts} journalEntries={journalEntries} />}
        {tab === 'accounts' && <ChartOfAccountsView accounts={accounts} setAccounts={setAccounts} />}
        {tab === 'rules' && <RulesView rules={rules} setRules={setRules} accounts={accounts} />}
        {tab === 'journal' && <JournalEntriesView journalEntries={journalEntries} setJournalEntries={setJournalEntries} accounts={accounts} />}
        {tab === 'reconciliation' && <ReconciliationView reconciliations={reconciliations} setReconciliations={setReconciliations} transactions={transactions} accounts={accounts} />}
        </>
        )}
      </div>
      {printInvoice && <InvoicePrintModal inv={printInvoice} total={invoiceTotal(printInvoice)} onClose={() => setPrintInvoice(null)} />}
    </div>
  );
}

function Sidebar({ tab, setTab, reviewCount, isStaff, clients, selectedClientId, onSwitchClient, onLogout, userEmail }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transacciones', icon: Receipt, badge: reviewCount },
    { id: 'invoices', label: 'Facturas', icon: FileText },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'reports', label: 'Reportes', icon: BarChart3 },
    { id: 'accounts', label: 'Plan de Cuentas', icon: BookOpen },
    { id: 'rules', label: 'Reglas', icon: ListChecks },
    { id: 'journal', label: 'Asientos', icon: FileText },
    { id: 'reconciliation', label: 'Reconciliación', icon: Landmark },
  ];
  return (
    <div style={{ width: 210, background: '#17365D', color: '#fff', padding: '20px 12px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontWeight: 700, fontSize: 16, padding: '0 10px 12px' }}>TBS Accounting</div>
      {isStaff && (
        <select value={selectedClientId} onChange={e => onSwitchClient(e.target.value)}
          style={{ margin: '0 10px 16px', fontSize: 12, borderRadius: 6, border: 'none', padding: '6px 8px' }}>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {items.map(it => {
        const Icon = it.icon;
        const active = tab === it.id;
        return (
          <div key={it.id} onClick={() => setTab(it.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderRadius: 6,
              cursor: 'pointer', marginBottom: 4, background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
              fontSize: 14, fontWeight: active ? 600 : 400,
            }}>
            <Icon size={17} />
            <span style={{ flex: 1 }}>{it.label}</span>
            {!!it.badge && (
              <span style={{ background: '#E24B4A', color: '#fff', fontSize: 11, borderRadius: 10, padding: '1px 7px' }}>
                {it.badge}
              </span>
            )}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 10, fontSize: 12 }}>
        <div style={{ opacity: 0.8, marginBottom: 6, wordBreak: 'break-all' }}>{userEmail}</div>
        <div onClick={onLogout} style={{ cursor: 'pointer', opacity: 0.9 }}>Cerrar sesión</div>
      </div>
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E5E9', padding: 16, ...style }}>{children}</div>;
}

function Dashboard({ summary, transactions, invoices }) {
  const cards = [
    { label: 'Banco (neto registrado)', value: money(summary.cash) },
    { label: 'A/R abierto', value: money(summary.arOpen) },
    { label: 'Ingresos este mes', value: money(summary.revenueMTD) },
    { label: 'Transacciones en Review', value: summary.review },
  ];
  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Dashboard</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {cards.map(c => (
          <Card key={c.label}>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{c.value}</div>
          </Card>
        ))}
      </div>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Actividad reciente</div>
        {transactions.slice(-5).reverse().map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #F0F1F3' }}>
            <span>{t.date} — {t.description}</span>
            <span>{money(t.amount)}</span>
          </div>
        ))}
        {transactions.length === 0 && <div style={{ fontSize: 13, color: '#6B7280' }}>Sin transacciones todavía. Ve a la pestaña Transacciones para agregar.</div>}
      </Card>
    </div>
  );
}

function TransactionsView({ transactions, setTransactions, rules, glName, accounts }) {
  const [form, setForm] = useState({ date: todayStr(), description: '', amount: '' });
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importError, setImportError] = useState('');

  function importCSV() {
    const rows = parseBankCSV(csvText, accounts);
    if (rows.length === 0) {
      setImportError('No se reconoció ninguna fila válida. Formato esperado: fecha,descripción,monto — o fecha,descripción,categoría,monto (export de Wave).');
      return;
    }
    setImportError('');
    const newTx = rows.map(r => {
      if (r.gl !== undefined) {
        // fila con categoría (Wave) ya viene con gl/mode resueltos
        return { id: uid(), date: r.date, description: r.description, amount: r.amount, gl: r.gl, status: r.mode };
      }
      const { gl, mode } = suggestGL(r.description, rules);
      return { id: uid(), date: r.date, description: r.description, amount: r.amount, gl, status: mode };
    });
    setTransactions(prev => [...prev, ...newTx]);
    setCsvText('');
    setShowImport(false);
  }

  function addTransaction() {
    if (!form.description.trim() || !form.amount || isNaN(Number(form.amount))) {
      setError('Ingresa una descripción y un monto válido.');
      return;
    }
    setError('');
    const { gl, mode } = suggestGL(form.description, rules);
    const t = { id: uid(), date: form.date, description: form.description.trim(), amount: Number(form.amount), gl, status: mode };
    setTransactions(prev => [...prev, t]);
    setForm({ date: todayStr(), description: '', amount: '' });
  }

  function updateGL(id, gl) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, gl, status: 'AUTO' } : t));
  }
  function confirmRow(id) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: t.gl ? 'AUTO' : 'REVIEW' } : t));
  }
  function removeRow(id) {
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Transacciones</h2>
        <button onClick={() => setShowImport(s => !s)} style={{ ...iconBtn, padding: '8px 14px' }}>Importar CSV del banco</button>
      </div>

      {showImport && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
            Pega el contenido del CSV: una fila por línea, formato <code>fecha,descripción,monto</code> (monto negativo = salida, positivo = entrada).
          </div>
          <textarea rows={6} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
            placeholder={'2026-09-05,RESTAURANTE GUSTO SEVILLA,-45.20\n2026-09-06,EFT DEPOSIT CLIENTE ABC,850.00'}
            value={csvText} onChange={e => setCsvText(e.target.value)} />
          {importError && <div style={{ color: '#B00020', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{importError}</div>}
          <div style={{ marginTop: 8 }}>
            <button onClick={importCSV} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Importar y categorizar</button>
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Fecha</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Descripción</label>
            <input style={{ width: '100%' }} placeholder="Ej. RESTAURANTE GUSTO SEVILLA" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Monto</label>
            <input type="number" step="0.01" style={{ width: 120 }} placeholder="0.00" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <button onClick={addTransaction} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
            <Plus size={15} /> Agregar
          </button>
        </div>
        {error && <div style={{ color: '#B00020', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
      </Card>

      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
              <th style={{ padding: '6px 4px' }}>Fecha</th>
              <th style={{ padding: '6px 4px' }}>Descripción</th>
              <th style={{ padding: '6px 4px' }}>Monto</th>
              <th style={{ padding: '6px 4px' }}>Categoría</th>
              <th style={{ padding: '6px 4px' }}>Estado</th>
              <th style={{ padding: '6px 4px' }}></th>
            </tr>
          </thead>
          <tbody>
            {transactions.slice().reverse().map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #F0F1F3' }}>
                <td style={{ padding: '6px 4px' }}>{t.date}</td>
                <td style={{ padding: '6px 4px' }}>{t.description}</td>
                <td style={{ padding: '6px 4px' }}>{money(t.amount)}</td>
                <td style={{ padding: '6px 4px' }}>
                  <select value={t.gl} onChange={e => updateGL(t.id, e.target.value)}>
                    <option value="">Sin categoría</option>
                    {accounts.map(g => <option key={g.code} value={g.code}>{g.code} — {g.name}</option>)}
                  </select>
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <StatusBadge status={t.status} />
                </td>
                <td style={{ padding: '6px 4px', display: 'flex', gap: 6 }}>
                  {t.status === 'REVIEW' && (
                    <button title="Confirmar" onClick={() => confirmRow(t.id)} style={iconBtn}><Check size={14} /></button>
                  )}
                  <button title="Eliminar" onClick={() => removeRow(t.id)} style={iconBtn}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {transactions.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>No hay transacciones. Agrega la primera arriba.</div>}
      </Card>
    </div>
  );
}

const iconBtn = { border: '1px solid #E2E5E9', background: '#fff', borderRadius: 6, padding: 5, cursor: 'pointer' };

function StatusBadge({ status }) {
  const styles = {
    AUTO: { bg: '#EAF3DE', color: '#27500A' },
    MATCH: { bg: '#E6F1FB', color: '#0C447C' },
    REVIEW: { bg: '#FAEEDA', color: '#854F0B' },
  };
  const s = styles[status] || styles.REVIEW;
  return <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10 }}>{status}</span>;
}

function InvoicesView({ invoices, setInvoices, customers, invoiceTotal, onPrint }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankInvoice());
  const [error, setError] = useState('');
  const [payingId, setPayingId] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payError, setPayError] = useState('');

  function applyPayment(inv) {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) { setPayError('Ingresa un monto válido.'); return; }
    setPayError('');
    setInvoices(prev => prev.map(i => {
      if (i.id !== inv.id) return i;
      const paid = (i.paid || 0) + amt;
      const total = invoiceTotal(i);
      return { ...i, paid, status: paid >= total ? 'Pagada' : 'Parcial' };
    }));
    setPayingId(null);
    setPayAmount('');
  }

  function blankInvoice() {
    return { client: '', date: todayStr(), lines: [{ desc: '', qty: 1, rate: '' }], retention: false, retentionPct: 10, status: 'Pendiente', paid: 0 };
  }

  function updateLine(i, field, val) {
    setForm(f => {
      const lines = f.lines.slice();
      lines[i] = { ...lines[i], [field]: val };
      return { ...f, lines };
    });
  }
  function addLine() { setForm(f => ({ ...f, lines: [...f.lines, { desc: '', qty: 1, rate: '' }] })); }
  function removeLine(i) { setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) })); }

  function saveInvoice() {
    if (!form.client.trim()) { setError('Ingresa el nombre del cliente.'); return; }
    if (form.lines.some(l => !l.desc.trim() || !l.rate)) { setError('Cada línea necesita descripción y precio.'); return; }
    setError('');
    const inv = { ...form, id: uid(), number: 'FAC-' + (invoices.length + 1001) };
    setInvoices(prev => [...prev, inv]);
    setForm(blankInvoice());
    setShowForm(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Facturas</h2>
        <button onClick={() => setShowForm(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
          <Plus size={15} /> Nueva factura
        </button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Cliente</label>
              <input style={{ width: '100%' }} value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="Nombre del cliente" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Fecha</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          {form.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input style={{ flex: 1 }} placeholder="Descripción del servicio" value={l.desc} onChange={e => updateLine(i, 'desc', e.target.value)} />
              <input type="number" style={{ width: 70 }} placeholder="Cant." value={l.qty} onChange={e => updateLine(i, 'qty', e.target.value)} />
              <input type="number" step="0.01" style={{ width: 100 }} placeholder="Precio" value={l.rate} onChange={e => updateLine(i, 'rate', e.target.value)} />
              <span style={{ width: 90, fontSize: 13, textAlign: 'right' }}>{money((Number(l.qty) || 0) * (Number(l.rate) || 0))}</span>
              <button onClick={() => removeLine(i)} style={iconBtn}><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={addLine} style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}><Plus size={13} /> Línea</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={form.retention} onChange={e => setForm(f => ({ ...f, retention: e.target.checked }))} />
              Aplicar retención
            </label>
            {form.retention && (
              <input type="number" style={{ width: 60 }} value={form.retentionPct} onChange={e => setForm(f => ({ ...f, retentionPct: e.target.value }))} />
            )}
            {form.retention && <span style={{ fontSize: 13 }}>%</span>}
          </div>

          <div style={{ fontWeight: 700, marginBottom: 12 }}>Total: {money(invoiceTotal(form))}</div>
          {error && <div style={{ color: '#B00020', fontSize: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
          <button onClick={saveInvoice} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>Guardar factura</button>
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
              <th style={{ padding: '6px 4px' }}>No.</th>
              <th style={{ padding: '6px 4px' }}>Cliente</th>
              <th style={{ padding: '6px 4px' }}>Fecha</th>
              <th style={{ padding: '6px 4px' }}>Total</th>
              <th style={{ padding: '6px 4px' }}>Estado</th>
              <th style={{ padding: '6px 4px' }}></th>
            </tr>
          </thead>
          <tbody>
            {invoices.slice().reverse().map(inv => (
              <tr key={inv.id} style={{ borderBottom: '1px solid #F0F1F3' }}>
                <td style={{ padding: '6px 4px' }}>{inv.number}</td>
                <td style={{ padding: '6px 4px' }}>{inv.client}</td>
                <td style={{ padding: '6px 4px' }}>{inv.date}</td>
                <td style={{ padding: '6px 4px' }}>{money(invoiceTotal(inv))}</td>
                <td style={{ padding: '6px 4px' }}>{inv.status}{inv.paid ? ` (${money(inv.paid)} pagado)` : ''}</td>
                <td style={{ padding: '6px 4px', display: 'flex', gap: 6 }}>
                  <button onClick={() => onPrint(inv)} style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 6 }}><Printer size={14} /> PDF</button>
                  {inv.status !== 'Pagada' && (
                    <button onClick={() => { setPayingId(inv.id); setPayAmount(''); setPayError(''); }} style={iconBtn}>Aplicar cobro</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>No hay facturas todavía.</div>}
      </Card>

      {payingId && (() => {
        const inv = invoices.find(i => i.id === payingId);
        if (!inv) return null;
        const balance = invoiceTotal(inv) - (inv.paid || 0);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <Card style={{ width: 320 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Aplicar cobro — {inv.number}</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>Balance pendiente: {money(balance)}</div>
              <input type="number" step="0.01" style={{ width: '100%', marginBottom: 8 }} placeholder="Monto cobrado"
                value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              {payError && <div style={{ color: '#B00020', fontSize: 12, marginBottom: 8 }}>{payError}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setPayingId(null)} style={iconBtn}>Cancelar</button>
                <button onClick={() => applyPayment(inv)} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Confirmar</button>
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}

function InvoicePrintModal({ inv, total, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      className="no-print-overlay">
      <div style={{ background: '#fff', width: 480, maxHeight: '85vh', overflow: 'auto', borderRadius: 8, padding: 28 }} id="invoice-print-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }} className="print-hide">
          <div style={{ fontWeight: 700, fontSize: 18 }}>Factura {inv.number}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => window.print()} style={{ ...iconBtn, display: 'flex', gap: 6 }}><Printer size={14} /> Guardar como PDF</button>
            <button onClick={onClose} style={iconBtn}><X size={14} /></button>
          </div>
        </div>
        <div style={{ borderTop: '2px solid #17365D', paddingTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 20, color: '#17365D' }}>TBS ACCOUNTING</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>Factura {inv.number} — {inv.date}</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Cliente: <strong>{inv.client}</strong></div>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 16 }}>
            <thead><tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: '4px 0' }}>Descripción</th><th>Cant.</th><th>Precio</th><th style={{ textAlign: 'right' }}>Monto</th>
            </tr></thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i}><td style={{ padding: '4px 0' }}>{l.desc}</td><td>{l.qty}</td><td>{money(l.rate)}</td>
                  <td style={{ textAlign: 'right' }}>{money((Number(l.qty) || 0) * (Number(l.rate) || 0))}</td></tr>
              ))}
            </tbody>
          </table>
          {inv.retention && <div style={{ fontSize: 13, textAlign: 'right' }}>Retención ({inv.retentionPct}%) aplicada</div>}
          <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'right', marginTop: 8 }}>Total: {money(total)}</div>
        </div>
      </div>
      <style>{`@media print { .no-print-overlay { position: static !important; background: none !important; } .print-hide { display: none !important; } body * { visibility: hidden; } #invoice-print-area, #invoice-print-area * { visibility: visible; } #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
    </div>
  );
}

function CustomersView({ customers, setCustomers, invoices, invoiceTotal }) {
  const [name, setName] = useState('');
  function addCustomer() {
    if (!name.trim()) return;
    setCustomers(prev => [...prev, { id: uid(), name: name.trim() }]);
    setName('');
  }
  const balances = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      map[inv.client] = (map[inv.client] || 0) + invoiceTotal(inv) - (inv.paid || 0);
    });
    return map;
  }, [invoices, invoiceTotal]);

  const allNames = Array.from(new Set([...customers.map(c => c.name), ...invoices.map(i => i.client)]));

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Clientes</h2>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ flex: 1 }} placeholder="Nombre del cliente nuevo" value={name} onChange={e => setName(e.target.value)} />
          <button onClick={addCustomer} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Agregar</button>
        </div>
      </Card>
      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>Cliente</th><th style={{ padding: '6px 4px' }}>Balance abierto (A/R)</th>
          </tr></thead>
          <tbody>
            {allNames.map(n => (
              <tr key={n} style={{ borderBottom: '1px solid #F0F1F3' }}>
                <td style={{ padding: '6px 4px' }}>{n}</td>
                <td style={{ padding: '6px 4px' }}>{money(balances[n] || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {allNames.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>No hay clientes todavía.</div>}
      </Card>
    </div>
  );
}

function getPeriodRange(preset, customFrom, customTo) {
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const iso = (d) => d.toISOString().slice(0, 10);
  if (preset === 'this_month') return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  if (preset === 'last_month') return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  if (preset === 'this_quarter') { const q = Math.floor(m / 3); return { from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) }; }
  if (preset === 'this_year') return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
  return { from: customFrom, to: customTo };
}

function naturalAmount(gl, amount, accounts) {
  const acct = accounts.find(a => a.code === gl);
  return { amount, type: acct?.type || 'Expense' };
}

function ReportsView({ transactions, invoices, glName, invoiceTotal, accounts, journalEntries }) {
  const [preset, setPreset] = useState('this_month');
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const { from, to } = getPeriodRange(preset, customFrom, customTo);

  // Todas las líneas contables unificadas: transacciones (una cuenta cada una) + líneas de asientos manuales
  const postings = useMemo(() => {
    const list = [];
    transactions.forEach(t => { if (t.gl) list.push({ date: t.date, gl: t.gl, amount: t.amount }); });
    journalEntries.forEach(je => {
      je.lines.forEach(l => {
        if (!l.gl) return;
        const acct = accounts.find(a => a.code === l.gl);
        const isDebitSide = acct && (acct.type === 'Asset' || acct.type === 'Expense');
        const debit = Number(l.debit) || 0, credit = Number(l.credit) || 0;
        const amt = isDebitSide ? (debit - credit) : (credit - debit);
        list.push({ date: je.date, gl: l.gl, amount: amt });
      });
    });
    return list;
  }, [transactions, journalEntries, accounts]);

  function balanceAsOf(gl, asOfDate) {
    return postings.filter(p => p.gl === gl && p.date <= asOfDate).reduce((s, p) => s + p.amount, 0);
  }
  function activityInPeriod(gl, fromD, toD) {
    return postings.filter(p => p.gl === gl && p.date >= fromD && p.date <= toD).reduce((s, p) => s + p.amount, 0);
  }

  const revenueAccts = accounts.filter(a => a.type === 'Revenue');
  const expenseAccts = accounts.filter(a => a.type === 'Expense');
  const assetAccts = accounts.filter(a => a.type === 'Asset');
  const liabilityAccts = accounts.filter(a => a.type === 'Liability');
  const equityAccts = accounts.filter(a => a.type === 'Equity');
  const cashAccts = assetAccts.filter(a => /banc|bppr|cash|efectivo|caja/i.test(a.name));

  // Facturas emitidas en el período cuentan como ingreso (Service Revenue) además de lo categorizado manualmente
  const invoiceRevenueInPeriod = invoices.filter(inv => inv.date >= from && inv.date <= to).reduce((s, inv) => s + invoiceTotal(inv), 0);

  const revenueRows = revenueAccts.map(a => ({ ...a, value: activityInPeriod(a.code, from, to) }));
  const totalRevenue = revenueRows.reduce((s, r) => s + r.value, 0) + invoiceRevenueInPeriod;
  const expenseRows = expenseAccts.map(a => ({ ...a, value: activityInPeriod(a.code, from, to) }));
  const totalExpense = expenseRows.reduce((s, r) => s + r.value, 0);
  const netIncome = totalRevenue - totalExpense;

  const assetRows = assetAccts.map(a => ({ ...a, value: balanceAsOf(a.code, to) }));
  const totalAssets = assetRows.reduce((s, r) => s + r.value, 0);
  const liabilityRows = liabilityAccts.map(a => ({ ...a, value: balanceAsOf(a.code, to) }));
  const totalLiabilities = liabilityRows.reduce((s, r) => s + r.value, 0);
  const equityRows = equityAccts.map(a => ({ ...a, value: balanceAsOf(a.code, to) }));
  const totalEquity = equityRows.reduce((s, r) => s + r.value, 0) + netIncome; // utilidad del período se suma al capital

  const cashRows = cashAccts.map(a => ({ ...a, change: activityInPeriod(a.code, from, to) }));
  const netCashChange = cashRows.reduce((s, r) => s + r.change, 0);

  const byMonth = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      const m = t.date.slice(0, 7);
      map[m] = map[m] || { revenue: 0, expense: 0 };
      const acct = accounts.find(g => g.code === t.gl);
      if (acct?.type === 'Expense') map[m].expense += t.amount;
    });
    invoices.forEach(inv => {
      const m = inv.date.slice(0, 7);
      map[m] = map[m] || { revenue: 0, expense: 0 };
      map[m].revenue += invoiceTotal(inv);
    });
    return Object.entries(map).sort();
  }, [transactions, invoices, invoiceTotal, accounts]);

  function downloadCSV() {
    let csv = 'Mes,Ingresos,Gastos,Neto\n';
    byMonth.forEach(([m, v]) => { csv += `${m},${v.revenue.toFixed(2)},${v.expense.toFixed(2)},${(v.revenue - v.expense).toFixed(2)}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'reporte_mensual.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const PRESETS = [
    ['this_month', 'Este mes'], ['last_month', 'Mes anterior'], ['this_quarter', 'Este trimestre'],
    ['this_year', 'Este año'], ['custom', 'Personalizado'],
  ];

  const Row = ({ label, value, bold }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span><span>{money(value)}</span>
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Reportes financieros</h2>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {PRESETS.map(([id, label]) => (
            <button key={id} onClick={() => setPreset(id)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E2E5E9', cursor: 'pointer', fontSize: 13,
                background: preset === id ? '#17365D' : '#fff', color: preset === id ? '#fff' : '#1F2933' }}>
              {label}
            </button>
          ))}
          {preset === 'custom' && (
            <>
              <div><label style={{ fontSize: 11, color: '#6B7280', display: 'block' }}>Desde</label>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></div>
              <div><label style={{ fontSize: 11, color: '#6B7280', display: 'block' }}>Hasta</label>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} /></div>
            </>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>Período: {from} a {to}</div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>P&L (Estado de Resultados)</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>Ingresos</div>
          {revenueRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} />)}
          {invoiceRevenueInPeriod !== 0 && <Row label="Facturación (Service Revenue)" value={invoiceRevenueInPeriod} />}
          <Row label="Total Ingresos" value={totalRevenue} bold />
          <div style={{ fontSize: 11, color: '#6B7280', margin: '10px 0 8px' }}>Gastos</div>
          {expenseRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} />)}
          <Row label="Total Gastos" value={totalExpense} bold />
          <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
            <Row label="Utilidad Neta" value={netIncome} bold />
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Balance Sheet (al {to})</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>Activos</div>
          {assetRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} />)}
          <Row label="Total Activos" value={totalAssets} bold />
          <div style={{ fontSize: 11, color: '#6B7280', margin: '10px 0 8px' }}>Pasivos</div>
          {liabilityRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} />)}
          <Row label="Total Pasivos" value={totalLiabilities} bold />
          <div style={{ fontSize: 11, color: '#6B7280', margin: '10px 0 8px' }}>Capital</div>
          {equityRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} />)}
          <Row label="Utilidad del período" value={netIncome} />
          <Row label="Total Capital" value={totalEquity} bold />
          <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
            <Row label="Pasivos + Capital" value={totalLiabilities + totalEquity} bold />
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Cash Flow (método directo)</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>Cambio en cuentas de banco/efectivo</div>
          {cashRows.map(r => <Row key={r.code} label={r.name} value={r.change} />)}
          {cashRows.length === 0 && <div style={{ fontSize: 12, color: '#6B7280' }}>No hay cuentas marcadas como banco/efectivo (el nombre debe incluir "banco", "cash" o similar).</div>}
          <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
            <Row label="Cambio Neto en Efectivo" value={netCashChange} bold />
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 10 }}>
            Este cálculo suma directamente los movimientos de las cuentas de banco en el período — no separa aún operación/inversión/financiamiento.
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Tendencia mensual</h3>
        <button onClick={downloadCSV} style={{ ...iconBtn, padding: '8px 14px' }}>Descargar CSV</button>
      </div>

      {byMonth.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonth.map(([m, v]) => ({ mes: m, Ingresos: Number(v.revenue.toFixed(2)), Gastos: Number(v.expense.toFixed(2)) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
                <Bar dataKey="Ingresos" fill="#0F6E56" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#D85A30" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>Mes</th><th style={{ padding: '6px 4px' }}>Ingresos</th><th style={{ padding: '6px 4px' }}>Gastos</th><th style={{ padding: '6px 4px' }}>Neto</th>
          </tr></thead>
          <tbody>
            {byMonth.map(([m, v]) => (
              <tr key={m} style={{ borderBottom: '1px solid #F0F1F3' }}>
                <td style={{ padding: '6px 4px' }}>{m}</td>
                <td style={{ padding: '6px 4px' }}>{money(v.revenue)}</td>
                <td style={{ padding: '6px 4px' }}>{money(v.expense)}</td>
                <td style={{ padding: '6px 4px', fontWeight: 600 }}>{money(v.revenue - v.expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {byMonth.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>Agrega transacciones y facturas para ver el reporte.</div>}
      </Card>
    </div>
  );
}

function ChartOfAccountsView({ accounts, setAccounts }) {
  const [form, setForm] = useState({ code: '', name: '', type: 'Expense' });
  const [error, setError] = useState('');
  const [editingCode, setEditingCode] = useState(null);

  function addAccount() {
    if (!form.code.trim() || !form.name.trim()) { setError('Ingresa código y nombre.'); return; }
    if (accounts.some(a => a.code === form.code.trim())) { setError('Ese código ya existe.'); return; }
    setError('');
    setAccounts(prev => [...prev, { code: form.code.trim(), name: form.name.trim(), type: form.type }]);
    setForm({ code: '', name: '', type: 'Expense' });
  }
  function updateAccount(code, field, value) {
    setAccounts(prev => prev.map(a => a.code === code ? { ...a, [field]: value } : a));
  }
  function removeAccount(code) {
    setAccounts(prev => prev.filter(a => a.code !== code));
  }

  const types = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  const grouped = types.map(t => ({ type: t, rows: accounts.filter(a => a.type === t).sort((a, b) => a.code.localeCompare(b.code)) }));

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Plan de Cuentas</h2>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Código</label>
            <input style={{ width: 90 }} placeholder="6300" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Nombre</label>
            <input style={{ width: '100%' }} placeholder="Nombre de la cuenta" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Tipo</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button onClick={addAccount} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
            <Plus size={15} /> Agregar cuenta
          </button>
        </div>
        {error && <div style={{ color: '#B00020', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
      </Card>

      {grouped.map(g => g.rows.length > 0 && (
        <Card key={g.type} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{g.type}</div>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              {g.rows.map(a => (
                <tr key={a.code} style={{ borderBottom: '1px solid #F0F1F3' }}>
                  <td style={{ padding: '6px 4px', width: 80 }}>{a.code}</td>
                  <td style={{ padding: '6px 4px' }}>
                    {editingCode === a.code ? (
                      <input style={{ width: '100%' }} value={a.name} onChange={e => updateAccount(a.code, 'name', e.target.value)} onBlur={() => setEditingCode(null)} autoFocus />
                    ) : (
                      <span onClick={() => setEditingCode(a.code)} style={{ cursor: 'pointer' }}>{a.name}</span>
                    )}
                  </td>
                  <td style={{ padding: '6px 4px', width: 40 }}>
                    <button onClick={() => removeAccount(a.code)} style={iconBtn}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
      {accounts.length === 0 && <Card><div style={{ fontSize: 13, color: '#6B7280' }}>No hay cuentas todavía.</div></Card>}
    </div>
  );
}

function RulesView({ rules, setRules, accounts }) {
  const [form, setForm] = useState({ keyword: '', gl: '', mode: 'AUTO' });
  const [error, setError] = useState('');

  function addRule() {
    if (!form.keyword.trim() || !form.gl) { setError('Ingresa la palabra clave y la cuenta.'); return; }
    setError('');
    setRules(prev => [...prev, { id: uid(), keyword: form.keyword.trim().toUpperCase(), gl: form.gl, mode: form.mode }]);
    setForm({ keyword: '', gl: '', mode: 'AUTO' });
  }
  function removeRule(id) {
    setRules(prev => prev.filter(r => r.id !== id));
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Reglas de categorización</h2>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
          Cuando la descripción de una transacción contenga esta palabra, se categoriza sola con la cuenta que elijas.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Palabra clave</label>
            <input style={{ width: '100%' }} placeholder="Ej. NETFLIX" value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Cuenta</label>
            <select value={form.gl} onChange={e => setForm(f => ({ ...f, gl: e.target.value }))}>
              <option value="">Selecciona</option>
              {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Modo</label>
            <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
              <option value="AUTO">AUTO</option>
              <option value="MATCH">MATCH</option>
              <option value="REVIEW">REVIEW</option>
            </select>
          </div>
          <button onClick={addRule} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
            <Plus size={15} /> Agregar regla
          </button>
        </div>
        {error && <div style={{ color: '#B00020', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
      </Card>
      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>Palabra clave</th><th style={{ padding: '6px 4px' }}>Cuenta</th><th style={{ padding: '6px 4px' }}>Modo</th><th></th>
          </tr></thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #F0F1F3' }}>
                <td style={{ padding: '6px 4px' }}>{r.keyword}</td>
                <td style={{ padding: '6px 4px' }}>{r.gl} — {accounts.find(a => a.code === r.gl)?.name || ''}</td>
                <td style={{ padding: '6px 4px' }}><StatusBadge status={r.mode} /></td>
                <td style={{ padding: '6px 4px' }}><button onClick={() => removeRule(r.id)} style={iconBtn}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rules.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>No hay reglas todavía.</div>}
      </Card>
    </div>
  );
}

function JournalEntriesView({ journalEntries, setJournalEntries, accounts }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankJE());
  const [error, setError] = useState('');

  function blankJE() {
    return { date: todayStr(), memo: '', lines: [{ gl: '', debit: '', credit: '', desc: '' }, { gl: '', debit: '', credit: '', desc: '' }] };
  }
  function updateLine(i, field, val) {
    setForm(f => { const lines = f.lines.slice(); lines[i] = { ...lines[i], [field]: val }; return { ...f, lines }; });
  }
  function addLine() { setForm(f => ({ ...f, lines: [...f.lines, { gl: '', debit: '', credit: '', desc: '' }] })); }
  function removeLine(i) { setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) })); }

  const totalDebit = form.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function saveJE() {
    if (form.lines.some(l => !l.gl)) { setError('Cada línea necesita una cuenta.'); return; }
    if (!balanced) { setError('El asiento no balancea: Débito y Crédito deben ser iguales y mayores a cero.'); return; }
    setError('');
    setJournalEntries(prev => [...prev, { ...form, id: uid() }]);
    setForm(blankJE());
    setShowForm(false);
  }
  function removeJE(id) {
    setJournalEntries(prev => prev.filter(j => j.id !== id));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Asientos contables (Journal Entries)</h2>
        <button onClick={() => setShowForm(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
          <Plus size={15} /> Nuevo asiento
        </button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Fecha</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Memo</label>
              <input style={{ width: '100%' }} placeholder="Descripción general del asiento" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
            </div>
          </div>

          {form.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select style={{ width: 200 }} value={l.gl} onChange={e => updateLine(i, 'gl', e.target.value)}>
                <option value="">Cuenta</option>
                {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
              <input style={{ flex: 1 }} placeholder="Descripción de la línea" value={l.desc} onChange={e => updateLine(i, 'desc', e.target.value)} />
              <input type="number" step="0.01" style={{ width: 100 }} placeholder="Débito" value={l.debit} onChange={e => updateLine(i, 'debit', e.target.value)} />
              <input type="number" step="0.01" style={{ width: 100 }} placeholder="Crédito" value={l.credit} onChange={e => updateLine(i, 'credit', e.target.value)} />
              <button onClick={() => removeLine(i)} style={iconBtn}><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={addLine} style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}><Plus size={13} /> Línea</button>

          <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: 12 }}>
            <span>Total débito: <strong>{money(totalDebit)}</strong></span>
            <span>Total crédito: <strong>{money(totalCredit)}</strong></span>
            <span style={{ color: balanced ? '#0F6E56' : '#B00020', fontWeight: 600 }}>{balanced ? 'Balanceado' : 'No balancea'}</span>
          </div>
          {error && <div style={{ color: '#B00020', fontSize: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
          <button onClick={saveJE} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>Guardar asiento</button>
        </Card>
      )}

      <Card>
        {journalEntries.slice().reverse().map(je => (
          <div key={je.id} style={{ borderBottom: '1px solid #F0F1F3', padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
              <span>{je.date} — {je.memo || 'Sin memo'}</span>
              <button onClick={() => removeJE(je.id)} style={iconBtn}><Trash2 size={14} /></button>
            </div>
            {je.lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', paddingLeft: 12 }}>
                <span>{l.gl} — {l.desc}</span>
                <span>{l.debit ? `Db ${money(l.debit)}` : `Cr ${money(l.credit)}`}</span>
              </div>
            ))}
          </div>
        ))}
        {journalEntries.length === 0 && <div style={{ fontSize: 13, color: '#6B7280' }}>No hay asientos manuales todavía.</div>}
      </Card>
    </div>
  );
}

function ReconciliationView({ reconciliations, setReconciliations, transactions, accounts }) {
  const bankAccounts = accounts.filter(a => a.type === 'Asset' || a.type === 'Liability');
  const [form, setForm] = useState({ gl: '', periodEnd: todayStr(), statementBalance: '' });
  const [error, setError] = useState('');

  function ledgerBalanceFor(gl, periodEnd) {
    return transactions.filter(t => t.gl === gl && t.date <= periodEnd).reduce((s, t) => s + t.amount, 0);
  }

  function runReconciliation() {
    if (!form.gl || !form.statementBalance) { setError('Selecciona la cuenta e ingresa el saldo del estado de cuenta.'); return; }
    setError('');
    const ledgerBalance = ledgerBalanceFor(form.gl, form.periodEnd);
    const statementBalance = Number(form.statementBalance);
    const difference = Number((statementBalance - ledgerBalance).toFixed(2));
    const status = Math.abs(difference) < 0.01 ? 'PASS' : 'REVIEW';
    setReconciliations(prev => [...prev, {
      id: uid(), gl: form.gl, periodEnd: form.periodEnd, statementBalance, ledgerBalance, difference, status,
    }]);
    setForm({ gl: '', periodEnd: todayStr(), statementBalance: '' });
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Reconciliación bancaria</h2>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
          Ingresa el saldo real del estado de cuenta al cierre del período. El sistema lo compara automáticamente contra el saldo calculado en tus transacciones.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Cuenta</label>
            <select value={form.gl} onChange={e => setForm(f => ({ ...f, gl: e.target.value }))}>
              <option value="">Selecciona</option>
              {bankAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Corte al</label>
            <input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Saldo del estado de cuenta</label>
            <input type="number" step="0.01" style={{ width: 140 }} value={form.statementBalance} onChange={e => setForm(f => ({ ...f, statementBalance: e.target.value }))} />
          </div>
          <button onClick={runReconciliation} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Reconciliar</button>
        </div>
        {error && <div style={{ color: '#B00020', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
      </Card>
      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>Cuenta</th><th style={{ padding: '6px 4px' }}>Corte</th>
            <th style={{ padding: '6px 4px' }}>Estado de cuenta</th><th style={{ padding: '6px 4px' }}>Libro</th>
            <th style={{ padding: '6px 4px' }}>Diferencia</th><th style={{ padding: '6px 4px' }}>Estado</th>
          </tr></thead>
          <tbody>
            {reconciliations.slice().reverse().map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #F0F1F3' }}>
                <td style={{ padding: '6px 4px' }}>{r.gl} — {accounts.find(a => a.code === r.gl)?.name || ''}</td>
                <td style={{ padding: '6px 4px' }}>{r.periodEnd}</td>
                <td style={{ padding: '6px 4px' }}>{money(r.statementBalance)}</td>
                <td style={{ padding: '6px 4px' }}>{money(r.ledgerBalance)}</td>
                <td style={{ padding: '6px 4px' }}>{money(r.difference)}</td>
                <td style={{ padding: '6px 4px' }}><StatusBadge status={r.status === 'PASS' ? 'AUTO' : 'REVIEW'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {reconciliations.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>No hay reconciliaciones todavía.</div>}
      </Card>
    </div>
  );
}
