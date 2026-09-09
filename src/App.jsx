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

const STOPWORDS = new Set(['and', 'the', 'of', 'for', 'a', 'de', 'y', 'la', 'el', 'en', 'expense', 'expenses']);

const CATEGORY_ALIASES = {
  'computer internet': 'Software, Technology Tools and Subscriptions',
  'telephone wireless': 'Telecommunications Expense',
  'uncategorized expense': 'Other Expenses',
  'uncategorized income': 'Service Revenue',
  'vehicle registration': 'Automobile Expense',
  'vehicle toll': 'Parking and Tolls',
  'vehicle fuel': 'Automobile Expense',
};

function matchAccountByName(text, accounts) {
  const t = text.trim().toLowerCase();
  let best = accounts.find(a => a.name.toLowerCase() === t);
  if (best) return best.code;
  best = accounts.find(a => t.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(t));
  if (best) return best.code;
  const key = t.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  if (CATEGORY_ALIASES[key]) {
    const alias = accounts.find(a => a.name === CATEGORY_ALIASES[key]);
    if (alias) return alias.code;
  }
  // third attempt: compare by shared significant words
  const words = t.split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOPWORDS.has(w));
  if (words.length === 0) return '';
  let bestScore = 0, bestCode = '';
  accounts.forEach(a => {
    const aWords = a.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOPWORDS.has(w));
    const shared = words.filter(w => aWords.includes(w)).length;
    if (shared > bestScore) { bestScore = shared; bestCode = a.code; }
  });
  return bestScore > 0 ? bestCode : '';
}

function parseBankCSV(text, accounts, rules, source = 'bank', cardGL = '') {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const delim = line.includes('\t') ? '\t' : ',';
    const cols = line.split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;
    if (/^(date|fecha)$/i.test(cols[0])) continue; // encabezado
    const date = normalizeDate(cols[0]);
    const description = cols[1];
    if (!date || !description) continue;

    if (cols.length >= 4) {
      // category format (e.g. Wave export): date,description,category,amount
      const category = cols[2];
      let amount = parseAmount(cols[3]);
      if (amount === null) continue;
      let gl = '';
      let mode = 'REVIEW';
      let finalDesc = description;
      if (/^Invoice #/i.test(category)) {
        gl = matchAccountByName('Accounts Receivable', accounts);
        mode = 'MATCH';
        // store the Wave reference as a visible note, for manual linking later
        const m = category.match(/Invoice #(\S+)\s*\|\s*Payment from (.+)$/i);
        if (m) finalDesc = `${description} (Wave: Invoice #${m[1]} — ${m[2].replace(/\s*\+\s*\d+$/, '')})`;
      } else if (/^Transfer (from|to)\s+/i.test(category) && source === 'card' && cardGL) {
        // on a card import, a "Transfer" is a payment to/from the card itself
        gl = cardGL;
        mode = 'MATCH';
      } else if (/^Refund for /i.test(category)) {
        gl = matchAccountByName(category.replace(/^Refund for /i, ''), accounts);
        mode = gl ? 'AUTO' : 'REVIEW';
      } else {
        gl = matchAccountByName(category.replace(/\s*\+\s*\d+$/, ''), accounts);
        mode = gl ? 'AUTO' : 'REVIEW';
      }
      // if the category name didn't match an account, try the description rules before giving up
      if (!gl) {
        const bySuggest = suggestGL(description, rules);
        if (bySuggest.gl) { gl = bySuggest.gl; mode = bySuggest.mode; }
      }
      // on a credit card, a charge (expense) arrives positive — it needs to be inverted so
      // the internal sign stays consistent (negative = expense), same as the bank format.
      if (source === 'card' && gl) {
        const acct = accounts.find(a => a.code === gl);
        if (acct?.type === 'Expense') amount = -amount;
      }
      rows.push({ date, description: finalDesc, amount, gl, mode, rawCategory: category });
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

const ACCOUNT_TYPE_LABELS = { Asset: 'Assets', Liability: 'Liabilities', Equity: 'Capital', Revenue: 'Income', Expense: 'Expenses' };
const ACCOUNT_TYPE_ORDER = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
function AccountOptions({ accounts }) {
  return ACCOUNT_TYPE_ORDER.map(t => {
    const rows = accounts.filter(a => a.type === t);
    if (rows.length === 0) return null;
    return (
      <optgroup key={t} label={ACCOUNT_TYPE_LABELS[t]}>
        {rows.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
      </optgroup>
    );
  });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

function ReportHeader({ businessName, reportName }) {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FFFFFF', color: '#1B2333', width: '100%', boxSizing: 'border-box', marginBottom: 20 }}>
      <div style={{ marginBottom: 18, marginTop: 10 }}>
        <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 26, fontWeight: 600, color: '#14213D', lineHeight: 1.15, marginBottom: 6 }}>
          {businessName}
        </div>
        <div style={{ fontSize: 15, color: '#5B6472', fontWeight: 500 }}>{reportName}</div>
      </div>
      <div style={{ height: 2, background: 'linear-gradient(90deg, #B08D57 0%, #E4D3B0 60%, transparent 100%)' }} />
    </div>
  );
}

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
          if (cl && cl.length) {
            const savedId = window.localStorage.getItem('tbs_last_client_id');
            const savedClient = savedId && cl.find(c => c.id === savedId);
            const defaultClient = savedClient || cl.find(c => c.name === 'Twelve Business Strategies') || cl[0];
            setSelectedClientId(defaultClient.id);
          }
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
    window.localStorage.removeItem('tbs_last_client_id');
    setProfile(null); setSelectedClientId(null); setClients([]);
  }

  if (session === undefined) {
    return <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#6B7280' }}>Loading…</div>;
  }

  if (!session) {
    return (
      <div style={{ minHeight: '640px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', background: '#F4F6F8' }}>
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E5E9', padding: 28, width: 320 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#17365D', marginBottom: 16 }}>TBS Accounting — Sign In</div>
          <form onSubmit={handleLogin}>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 }}>Email</label>
            <input type="email" required style={{ width: '100%', marginBottom: 10 }} value={authForm.email} onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))} />
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 }}>Password</label>
            <input type="password" required style={{ width: '100%', marginBottom: 16 }} value={authForm.password} onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))} />
            {authError && <div style={{ color: '#B00020', fontSize: 12, marginBottom: 10 }}>{authError}</div>}
            <button type="submit" disabled={authBusy} style={{ width: '100%', background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '10px', cursor: 'pointer' }}>
              {authBusy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!profile || !selectedClientId) {
    return <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#6B7280' }}>Preparing your workspace…</div>;
  }

  return (
    <Workspace
      key={selectedClientId}
      clientId={selectedClientId}
      isStaff={profile.role === 'staff'}
      clients={clients}
      selectedClientId={selectedClientId}
      onSwitchClient={(id) => { window.localStorage.setItem('tbs_last_client_id', id); setSelectedClientId(id); }}
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
  const [dismissedSuggestions, setDismissedSuggestionsRaw] = useState([]);
  const [businessName, setBusinessName] = useState('');
  const [printInvoice, setPrintInvoice] = useState(null);
  const [statementClient, setStatementClient] = useState(null);

  useEffect(() => {
    (async () => {
      const results = await Promise.all([
        supabase.from('transactions').select('*').eq('client_id', clientId).order('date'),
        supabase.from('invoices').select('*').eq('client_id', clientId).order('date'),
        supabase.from('customers').select('*').eq('client_id', clientId),
        supabase.from('accounts').select('*').eq('client_id', clientId).order('code'),
        supabase.from('rules').select('*').eq('client_id', clientId),
        supabase.from('journal_entries').select('*').eq('client_id', clientId).order('date'),
        supabase.from('reconciliations').select('*').eq('client_id', clientId).order('period_end'),
        supabase.from('dismissed_suggestions').select('*').eq('client_id', clientId),
        supabase.from('clients').select('name').eq('id', clientId).single(),
      ]);
      const [t, i, c, a, r, j, rec, ds, cl] = results;
      const firstErr = [t, i, c, a, r, j, rec, ds].find(x => x.error);
      if (firstErr) {
        setLoadError(firstErr.error.message);
      } else {
        setTransactionsRaw((t.data || []).map(row => ({ ...row, amount: Number(row.amount), sourceGL: row.source_gl })));
        setInvoicesRaw((i.data || []).map(row => ({ ...row, retentionPct: row.retention_pct, paid: Number(row.paid) || 0 })));
        setCustomersRaw(c.data || []);
        setAccountsRaw(a.data || []);
        setRulesRaw(r.data || []);
        setJournalEntriesRaw(j.data || []);
        setReconciliationsRaw((rec.data || []).map(row => ({ ...row, statementBalance: Number(row.statement_balance), ledgerBalance: Number(row.ledger_balance), difference: Number(row.difference), periodEnd: row.period_end })));
        setDismissedSuggestionsRaw((ds.data || []).map(row => row.suggestion_key));
        setBusinessName(cl?.data?.name || 'Business');
      }
      setLoaded(true);
    })();
  }, []);

  const setTransactions = useCallback((updater) => {
    setTransactionsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const toDb = arr => arr.map(t => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, gl: t.gl, status: t.status, source_gl: t.sourceGL || null }));
      diffSync('transactions', toDb(prev), toDb(next), clientId);
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
      let next = typeof updater === 'function' ? updater(prev) : updater;
      next = next.slice().sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      // ojo: "code" se repite entre clientes (cada cliente tiene su propio 6050, etc.), así que
      // cada operación debe ir siempre acompañada de client_id — nunca solo por code.
      const prevMap = new Map(prev.map(x => [x.code, x]));
      const nextMap = new Map(next.map(x => [x.code, x]));
      const toDelete = prev.filter(x => !nextMap.has(x.code)).map(x => x.code);
      const toInsert = next.filter(x => !prevMap.has(x.code)).map(x => ({ ...x, client_id: clientId }));
      const toUpdate = next.filter(x => prevMap.has(x.code) && JSON.stringify(prevMap.get(x.code)) !== JSON.stringify(x));
      if (toDelete.length) supabase.from('accounts').delete().eq('client_id', clientId).in('code', toDelete).then(({ error }) => error && console.error('accounts delete', error));
      if (toInsert.length) supabase.from('accounts').insert(toInsert).then(({ error }) => error && console.error('accounts insert', error));
      toUpdate.forEach(row => {
        supabase.from('accounts').update({ name: row.name, type: row.type }).eq('client_id', clientId).eq('code', row.code)
          .then(({ error }) => error && console.error('accounts update', error));
      });
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
  const setDismissedSuggestions = useCallback((updater) => {
    setDismissedSuggestionsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const toDb = arr => arr.map(key => ({ id: key, suggestion_key: key }));
      diffSync('dismissed_suggestions', toDb(prev), toDb(next), clientId);
      return next;
    });
  }, []);

  const glName = (code) => accounts.find(g => g.code === code)?.name || 'Uncategorized';

  const summary = useMemo(() => {
    const month = todayStr().slice(0, 7);
    const revenueMTD = invoices.filter(i => i.date.slice(0, 7) === month)
      .reduce((s, i) => s + invoiceTotal(i), 0);
    const arOpen = invoices.filter(i => i.status !== 'Paid')
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
        selectedClientId={selectedClientId} onSwitchClient={onSwitchClient} onLogout={onLogout} userEmail={userEmail} businessName={businessName} />
      <div style={{ flex: 1, padding: '24px 28px', overflow: 'auto' }}>
        {loadError && (
          <div style={{ background: '#FCEBEB', color: '#791F1F', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            Could not connect to the database: {loadError}. Check your .env file (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
          </div>
        )}
        {!loaded ? (
          <div style={{ fontSize: 13, color: '#6B7280' }}>Loading data...</div>
        ) : (
        <>
        {tab === 'dashboard' && <Dashboard summary={summary} transactions={transactions} invoices={invoices} accounts={accounts} invoiceTotal={invoiceTotal} />}
        {tab === 'transactions' && (
          <TransactionsView
            transactions={transactions} setTransactions={setTransactions} rules={rules} setRules={setRules} glName={glName} accounts={accounts}
            invoices={invoices} setInvoices={setInvoices} invoiceTotal={invoiceTotal}
            dismissedSuggestions={dismissedSuggestions} setDismissedSuggestions={setDismissedSuggestions}
            journalEntries={journalEntries}
          />
        )}
        {tab === 'invoices' && (
          <InvoicesView
            invoices={invoices} setInvoices={setInvoices} customers={customers}
            invoiceTotal={invoiceTotal} onPrint={setPrintInvoice}
          />
        )}
        {tab === 'customers' && (
          <CustomersView customers={customers} setCustomers={setCustomers} invoices={invoices} invoiceTotal={invoiceTotal} onPrintStatement={setStatementClient} />
        )}
        {tab === 'reports' && <ReportsView transactions={transactions} invoices={invoices} glName={glName} invoiceTotal={invoiceTotal} accounts={accounts} journalEntries={journalEntries} businessName={businessName} />}
        {tab === 'accounts' && <ChartOfAccountsView accounts={accounts} setAccounts={setAccounts} isMaster={businessName === 'Twelve Business Strategies'} />}
        {tab === 'rules' && <RulesView rules={rules} setRules={setRules} accounts={accounts} />}
        {tab === 'journal' && <JournalEntriesView journalEntries={journalEntries} setJournalEntries={setJournalEntries} accounts={accounts} />}
        {tab === 'reconciliation' && <ReconciliationView reconciliations={reconciliations} setReconciliations={setReconciliations} transactions={transactions} setTransactions={setTransactions} accounts={accounts} journalEntries={journalEntries} />}
        </>
        )}
      </div>
      {printInvoice && <InvoicePrintModal inv={printInvoice} total={invoiceTotal(printInvoice)} onClose={() => setPrintInvoice(null)} businessName={businessName} />}
      {statementClient && <CustomerStatementModal client={statementClient} invoices={invoices} invoiceTotal={invoiceTotal} onClose={() => setStatementClient(null)} businessName={businessName} />}
    </div>
  );
}

function Sidebar({ tab, setTab, reviewCount, isStaff, clients, selectedClientId, onSwitchClient, onLogout, userEmail, businessName }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', icon: Receipt, badge: reviewCount },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'accounts', label: 'Chart of Accounts', icon: BookOpen },
    { id: 'rules', label: 'Rules', icon: ListChecks },
    { id: 'journal', label: 'Journal Entries', icon: FileText },
    { id: 'reconciliation', label: 'Reconciliation', icon: Landmark },
  ];
  return (
    <div style={{ width: 210, background: '#17365D', color: '#fff', padding: '20px 12px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontWeight: 700, fontSize: 16, padding: '0 10px 12px' }}>{businessName || 'Accounting'}</div>
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
        <div onClick={onLogout} style={{ cursor: 'pointer', opacity: 0.9 }}>Sign out</div>
      </div>
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E5E9', padding: 16, ...style }}>{children}</div>;
}

function Dashboard({ summary, transactions, invoices, accounts, invoiceTotal }) {
  const cards = [
    { label: 'Bank (net recorded)', value: money(summary.cash) },
    { label: 'Open A/R', value: money(summary.arOpen) },
    { label: 'Revenue this month', value: money(summary.revenueMTD) },
    { label: 'Transactions in Review', value: summary.review },
  ];
  const byMonth = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      const m = t.date.slice(0, 7);
      map[m] = map[m] || { revenue: 0, expense: 0 };
      const acct = accounts.find(g => g.code === t.gl);
      if (acct?.type === 'Expense') map[m].expense += Math.abs(t.amount);
      if (acct?.type === 'Revenue') map[m].revenue += Math.abs(t.amount);
    });
    invoices.forEach(inv => {
      const m = inv.date.slice(0, 7);
      map[m] = map[m] || { revenue: 0, expense: 0 };
      map[m].revenue += invoiceTotal(inv);
    });
    return Object.entries(map).sort();
  }, [transactions, invoices, invoiceTotal, accounts]);

  function downloadCSV() {
    let csv = 'Month,Revenue,Expenses,Net\n';
    byMonth.forEach(([m, v]) => { csv += `${m},${v.revenue.toFixed(2)},${v.expense.toFixed(2)},${(v.revenue - v.expense).toFixed(2)}\n`; });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'monthly_trend.csv'; a.click();
    URL.revokeObjectURL(url);
  }

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
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Recent activity</div>
        {transactions.slice(-5).reverse().map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #F0F1F3' }}>
            <span>{t.date} — {t.description}</span>
            <span>{money(t.amount)}</span>
          </div>
        ))}
        {transactions.length === 0 && <div style={{ fontSize: 13, color: '#6B7280' }}>No transactions yet. Go to the Transactions tab to add one.</div>}
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Monthly trend</h3>
        <button onClick={downloadCSV} style={{ ...iconBtn, padding: '8px 14px' }}>Download CSV</button>
      </div>

      {byMonth.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonth.map(([m, v]) => ({ mes: m, Revenue: Number(v.revenue.toFixed(2)), Expenses: Number(v.expense.toFixed(2)) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
                <Bar dataKey="Revenue" fill="#0F6E56" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill="#D85A30" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>Month</th><th style={{ padding: '6px 4px' }}>Revenue</th><th style={{ padding: '6px 4px' }}>Expenses</th><th style={{ padding: '6px 4px' }}>Net</th>
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
        {byMonth.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>Add transactions and invoices to see the trend.</div>}
      </Card>
    </div>
  );
}

function TransactionsView({ transactions, setTransactions, rules, setRules, glName, accounts, invoices, setInvoices, invoiceTotal, dismissedSuggestions, setDismissedSuggestions, journalEntries }) {
  const [form, setForm] = useState({ date: todayStr(), description: '', amount: '', sourceGL: '' });
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importError, setImportError] = useState('');
  const [splittingId, setSplittingId] = useState(null);
  const [splitLines, setSplitLines] = useState([]);
  const [splitError, setSplitError] = useState('');
  const [linkingId, setLinkingId] = useState(null);
  const [linkInvoiceId, setLinkInvoiceId] = useState('');
  const [importSource, setImportSource] = useState('bank');
  const [importCardGL, setImportCardGL] = useState('');
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', gl: '', sourceGL: '', status: '', amountMin: '', amountMax: '' });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [bulkGL, setBulkGL] = useState('');
  const [bulkSourceGL, setBulkSourceGL] = useState('');

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filters.dateFrom && t.date < filters.dateFrom) return false;
      if (filters.dateTo && t.date > filters.dateTo) return false;
      if (filters.gl === '__uncat__' && t.gl) return false;
      if (filters.gl === '__uncat_income__' && (t.gl || t.amount < 0)) return false;
      if (filters.gl === '__uncat_expense__' && (t.gl || t.amount >= 0)) return false;
      if (filters.gl && !filters.gl.startsWith('__uncat') && t.gl !== filters.gl) return false;
      if (filters.sourceGL === '__unassigned__' && t.sourceGL) return false;
      if (filters.sourceGL && filters.sourceGL !== '__unassigned__' && t.sourceGL !== filters.sourceGL) return false;
      if (filters.status && t.status !== filters.status) return false;
      const abs = Math.abs(t.amount);
      if (filters.amountMin && abs < Number(filters.amountMin)) return false;
      if (filters.amountMax && abs > Number(filters.amountMax)) return false;
      if (search.trim() && !t.description.toUpperCase().includes(search.trim().toUpperCase())) return false;
      return true;
    });
  }, [transactions, filters, search]);
  const filtersActive = filters.dateFrom || filters.dateTo || filters.gl || filters.sourceGL || filters.status || filters.amountMin || filters.amountMax || search.trim();

  function jeNaturalAmount(gl, line) {
    const acct = accounts.find(a => a.code === gl);
    const debit = Number(line.debit) || 0, credit = Number(line.credit) || 0;
    const isDebitSide = acct && (acct.type === 'Asset' || acct.type === 'Expense');
    return isDebitSide ? (debit - credit) : (credit - debit);
  }
  // Journal Entries se muestran mezcladas en esta pantalla solo para que se vean junto al resto de la actividad
  // de la cuenta (como en Wave) — pero se siguen editando desde la pestaña Journal Entries, no aquí.
  const journalEntryRows = useMemo(() => {
    const rows = [];
    (journalEntries || []).forEach(je => {
      je.lines.forEach((l, idx) => {
        if (!l.gl) return;
        rows.push({
          id: `je-${je.id}-${idx}`, date: je.date,
          description: `Journal Entry — ${je.memo || l.desc || 'no memo'}`,
          amount: jeNaturalAmount(l.gl, l), gl: l.gl, sourceGL: null, isJE: true,
        });
      });
    });
    return rows.filter(r => {
      if (filters.dateFrom && r.date < filters.dateFrom) return false;
      if (filters.dateTo && r.date > filters.dateTo) return false;
      if (search.trim() && !r.description.toUpperCase().includes(search.trim().toUpperCase())) return false;
      return true;
    });
  }, [journalEntries, filters.dateFrom, filters.dateTo, search, accounts]);

  const combinedRows = useMemo(() => {
    return [...filteredTransactions, ...journalEntryRows].sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredTransactions, journalEntryRows]);
  function normalizeDesc(d) {
    return d.toUpperCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
  }
  const ruleSuggestions = useMemo(() => {
    const arAccount = accounts.find(a => a.name.toLowerCase().includes('accounts receivable'));
    const groups = {};
    transactions.forEach(t => {
      if (!t.gl) return;
      if (arAccount && t.gl === arAccount.code) return; // invoice payments are linked individually, they aren't grouped into a rule
      const key = normalizeDesc(t.description);
      if (key.length < 4) return;
      groups[key] = groups[key] || {};
      groups[key][t.gl] = (groups[key][t.gl] || 0) + 1;
    });
    const suggestions = [];
    Object.entries(groups).forEach(([key, byGl]) => {
      Object.entries(byGl).forEach(([gl, count]) => {
        if (count < 4) return;
        const alreadyRule = rules.some(r => key.includes(r.keyword.toUpperCase()) || r.keyword.toUpperCase().includes(key));
        if (alreadyRule) return;
        if (dismissedSuggestions.includes(key + '|' + gl)) return;
        suggestions.push({ key, gl, count });
      });
    });
    return suggestions.sort((a, b) => b.count - a.count);
  }, [transactions, rules, dismissedSuggestions, accounts]);

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleSelectAll() {
    const visibleIds = filteredTransactions.map(t => t.id);
    const allSelected = visibleIds.every(id => selected.includes(id)) && visibleIds.length > 0;
    setSelected(allSelected ? selected.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...selected, ...visibleIds])));
  }
  function applyBulkCategory() {
    if (!bulkGL || selected.length === 0) return;
    setTransactions(prev => prev.map(t => selected.includes(t.id) ? { ...t, gl: bulkGL, status: 'AUTO' } : t));
    setSelected([]);
    setBulkGL('');
  }
  function deleteSelected() {
    setTransactions(prev => prev.filter(t => !selected.includes(t.id)));
    setSelected([]);
  }

  function createRuleFromSuggestion(s) {
    setRules(prev => [...prev, { id: uid(), keyword: s.key, gl: s.gl, mode: 'AUTO' }]);
    setDismissedSuggestions(prev => [...prev, s.key + '|' + s.gl]);
  }
  function dismissSuggestion(s) {
    setDismissedSuggestions(prev => [...prev, s.key + '|' + s.gl]);
  }

  function importCSV() {
    const rows = parseBankCSV(csvText, accounts, rules, importSource, importCardGL);
    if (rows.length === 0) {
      setImportError('No valid rows were recognized. Expected format: date,description,amount — or date,description,category,amount (Wave export).');
      return;
    }
    setImportError('');
    const newTx = rows.map(r => {
      if (r.gl !== undefined) {
        // category row (Wave) already comes with gl/mode resolved
        return { id: uid(), date: r.date, description: r.description, amount: r.amount, gl: r.gl, status: r.mode, sourceGL: importCardGL || null };
      }
      const { gl, mode } = suggestGL(r.description, rules);
      return { id: uid(), date: r.date, description: r.description, amount: r.amount, gl, status: mode, sourceGL: importCardGL || null };
    });
    setTransactions(prev => [...prev, ...newTx]);
    setCsvText('');
    setShowImport(false);
  }

  function addTransaction() {
    if (!form.description.trim() || !form.amount || isNaN(Number(form.amount))) {
      setError('Enter a description and a valid amount.');
      return;
    }
    setError('');
    const { gl, mode } = suggestGL(form.description, rules);
    const t = { id: uid(), date: form.date, description: form.description.trim(), amount: Number(form.amount), gl, status: mode, sourceGL: form.sourceGL || null };
    setTransactions(prev => [...prev, t]);
    setForm({ date: todayStr(), description: '', amount: '', sourceGL: '' });
  }

  function updateGL(id, gl) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, gl, status: 'AUTO' } : t));
  }
  function updateSourceGL(id, sourceGL) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, sourceGL } : t));
  }
  function applyBulkAccount() {
    if (!bulkSourceGL || selected.length === 0) return;
    setTransactions(prev => prev.map(t => selected.includes(t.id) ? { ...t, sourceGL: bulkSourceGL } : t));
    setSelected([]);
    setBulkSourceGL('');
  }
  function confirmRow(id) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: t.gl ? 'AUTO' : 'REVIEW' } : t));
  }
  function removeRow(id) {
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  function openSplit(t) {
    setSplittingId(t.id);
    setSplitLines([{ gl: t.gl || '', amount: t.amount }, { gl: '', amount: 0 }]);
    setSplitError('');
  }
  function updateSplitLine(i, field, val) {
    setSplitLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }
  function addSplitLine() { setSplitLines(prev => [...prev, { gl: '', amount: 0 }]); }
  function removeSplitLine(i) { setSplitLines(prev => prev.filter((_, idx) => idx !== i)); }
  function confirmSplit() {
    const original = transactions.find(t => t.id === splittingId);
    if (!original) return;
    const sum = splitLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    if (Math.abs(sum - original.amount) > 0.01) {
      setSplitError(`The sum of the lines (${money(sum)}) must equal the original amount (${money(original.amount)}).`);
      return;
    }
    if (splitLines.some(l => !l.gl)) { setSplitError('Each line needs an account.'); return; }
    setSplitError('');
    const newRows = splitLines.map(l => ({
      id: uid(), date: original.date, description: original.description + ' (split)',
      amount: Number(l.amount), gl: l.gl, status: 'AUTO',
    }));
    setTransactions(prev => [...prev.filter(t => t.id !== splittingId), ...newRows]);
    setSplittingId(null);
  }

  function openLink(t) { setLinkingId(t.id); setLinkInvoiceId(''); }
  function confirmLink() {
    const t = transactions.find(x => x.id === linkingId);
    const inv = invoices.find(i => i.id === linkInvoiceId);
    if (!t || !inv) return;
    setInvoices(prev => prev.map(i => {
      if (i.id !== inv.id) return i;
      const paid = (i.paid || 0) + t.amount;
      const total = invoiceTotal(i);
      return { ...i, paid, status: paid >= total ? 'Paid' : 'Partial' };
    }));
    setTransactions(prev => prev.map(x => x.id === t.id ? { ...x, description: x.description + ` [Vinculado to ${inv.number}]`, status: 'AUTO' } : x));
    setLinkingId(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Transactions</h2>
        <button onClick={() => setShowImport(s => !s)} style={{ ...iconBtn, padding: '8px 14px' }}>Import bank CSV</button>
      </div>

      {showImport && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
            Paste the CSV content: one row per line, format <code>date,description,amount</code> (negative amount = outflow, positive = inflow) —
            or <code>date,description,category,amount</code> (Wave export).
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" checked={importSource === 'bank'} onChange={() => setImportSource('bank')} /> Bank (expenses negative)
            </label>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" checked={importSource === 'card'} onChange={() => setImportSource('card')} /> Credit card (expenses positive)
            </label>
            {importSource === 'card' && (
              <select value={importCardGL} onChange={e => setImportCardGL(e.target.value)}>
                <option value="">Which card is this?</option>
                {accounts.filter(a => a.type === 'Liability').map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
            )}
            {importSource === 'bank' && (
              <select value={importCardGL} onChange={e => setImportCardGL(e.target.value)}>
                <option value="">Which bank account is this?</option>
                {accounts.filter(a => a.type === 'Asset').map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
            )}
          </div>
          <textarea rows={6} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
            placeholder={'2026-09-05,RESTAURANTE GUSTO SEVILLA,-45.20\n2026-09-06,EFT DEPOSIT CLIENTE ABC,850.00'}
            value={csvText} onChange={e => setCsvText(e.target.value)} />
          {importError && <div style={{ color: '#B00020', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{importError}</div>}
          <div style={{ marginTop: 8 }}>
            <button onClick={importCSV} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Import and categorize</button>
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Description</label>
            <input style={{ width: '100%' }} placeholder="E.g. RESTAURANT GUSTO SEVILLA" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Amount</label>
            <input type="number" step="0.01" style={{ width: 120 }} placeholder="0.00" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Account (bank/card)</label>
            <select value={form.sourceGL} onChange={e => setForm(f => ({ ...f, sourceGL: e.target.value }))}>
              <option value="">—</option>
              <AccountOptions accounts={accounts.filter(a => a.type === 'Asset' || a.type === 'Liability')} />
            </select>
          </div>
          <button onClick={addTransaction} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
            <Plus size={15} /> Add
          </button>
        </div>
        {error && <div style={{ color: '#B00020', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Search description</label>
            <input style={{ width: '100%' }} placeholder="E.g. STARBUCKS, NICOLE VALENTIN..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>From</label>
            <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} /></div>
          <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>To</label>
            <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} /></div>
          <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Category</label>
            <select value={filters.gl} onChange={e => setFilters(f => ({ ...f, gl: e.target.value }))}>
              <option value="">All</option>
              <option value="__uncat__">Uncategorized (all)</option>
              <option value="__uncat_income__">Uncategorized Income</option>
              <option value="__uncat_expense__">Uncategorized Expenses</option>
              <AccountOptions accounts={accounts} />
            </select></div>
          <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Account</label>
            <select value={filters.sourceGL} onChange={e => setFilters(f => ({ ...f, sourceGL: e.target.value }))}>
              <option value="">All</option>
              <option value="__unassigned__">Unassigned</option>
              <AccountOptions accounts={accounts.filter(a => a.type === 'Asset' || a.type === 'Liability')} />
            </select></div>
          <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Status</label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All</option>
              <option value="AUTO">AUTO</option>
              <option value="MATCH">MATCH</option>
              <option value="REVIEW">REVIEW</option>
            </select></div>
          <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Min. amount</label>
            <input type="number" step="0.01" style={{ width: 100 }} value={filters.amountMin} onChange={e => setFilters(f => ({ ...f, amountMin: e.target.value }))} /></div>
          <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Max. amount</label>
            <input type="number" step="0.01" style={{ width: 100 }} value={filters.amountMax} onChange={e => setFilters(f => ({ ...f, amountMax: e.target.value }))} /></div>
          {filtersActive && (
            <button onClick={() => { setFilters({ dateFrom: '', dateTo: '', gl: '', sourceGL: '', status: '', amountMin: '', amountMax: '' }); setSearch(''); }} style={iconBtn}>Clear filters</button>
          )}
        </div>
        {filtersActive && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>{filteredTransactions.length} of {transactions.length} transactions</div>}
      </Card>

      {ruleSuggestions.length > 0 && (
        <Card style={{ marginBottom: 20, borderColor: '#B7E4C7' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Sugerencias of reglas ({ruleSuggestions.length})</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
            These patterns repeated 4 or more times with the same category. Create the rule so similar future transactions get categorized automatically.
          </div>
          {ruleSuggestions.map(s => (
            <div key={s.key + s.gl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F0F1F3', fontSize: 13 }}>
              <span>"{s.key}" → {s.gl} — {glName(s.gl)} <span style={{ color: '#6B7280' }}>({s.count} times)</span></span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => createRuleFromSuggestion(s)} style={iconBtn}>Create rule</button>
                <button onClick={() => dismissSuggestion(s)} style={iconBtn}><X size={14} /></button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {selected.length > 0 && (
        <Card style={{ marginBottom: 20, borderColor: '#17365D' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.length} selected</span>
            <select value={bulkGL} onChange={e => setBulkGL(e.target.value)}>
              <option value="">Choose account...</option>
              <AccountOptions accounts={accounts} />
            </select>
            <button onClick={applyBulkCategory} disabled={!bulkGL} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Apply category</button>
            <select value={bulkSourceGL} onChange={e => setBulkSourceGL(e.target.value)}>
              <option value="">Choose account...</option>
              <AccountOptions accounts={accounts.filter(a => a.type === 'Asset' || a.type === 'Liability')} />
            </select>
            <button onClick={applyBulkAccount} disabled={!bulkSourceGL} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Set account</button>
            <button onClick={deleteSelected} style={iconBtn}>Delete selected</button>
            <button onClick={() => setSelected([])} style={iconBtn}>Cancel selection</button>
          </div>
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
              <th style={{ padding: '6px 4px' }}>
                <input type="checkbox"
                  checked={filteredTransactions.length > 0 && filteredTransactions.every(t => selected.includes(t.id))}
                  onChange={toggleSelectAll} />
              </th>
              <th style={{ padding: '6px 4px' }}>Date</th>
              <th style={{ padding: '6px 4px' }}>Description</th>
              <th style={{ padding: '6px 4px' }}>Amount</th>
              <th style={{ padding: '6px 4px' }}>Account</th>
              <th style={{ padding: '6px 4px' }}>Category</th>
              <th style={{ padding: '6px 4px' }}>Status</th>
              <th style={{ padding: '6px 4px' }}></th>
            </tr>
          </thead>
          <tbody>
            {combinedRows.slice().reverse().map(t => t.isJE ? (
              <tr key={t.id} style={{ borderBottom: '1px solid #F0F1F3', background: '#FAF7FF' }}>
                <td style={{ padding: '6px 4px' }}></td>
                <td style={{ padding: '6px 4px' }}>{t.date}</td>
                <td style={{ padding: '6px 4px' }}>{t.description} <span style={{ fontSize: 10, color: '#6B7280' }}>(edit from Journal Entries tab)</span></td>
                <td style={{ padding: '6px 4px' }}>{money(t.amount)}</td>
                <td style={{ padding: '6px 4px', fontSize: 12, color: '#6B7280' }}>—</td>
                <td style={{ padding: '6px 4px', fontSize: 12, color: '#6B7280' }}>{glName(t.gl)}</td>
                <td style={{ padding: '6px 4px' }}><StatusBadge status="JOURNAL ENTRY" /></td>
                <td style={{ padding: '6px 4px' }}></td>
              </tr>
            ) : (
              <tr key={t.id} style={{ borderBottom: '1px solid #F0F1F3', background: selected.includes(t.id) ? '#F0F5FA' : 'transparent' }}>
                <td style={{ padding: '6px 4px' }}>
                  <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggleSelect(t.id)} />
                </td>
                <td style={{ padding: '6px 4px' }}>{t.date}</td>
                <td style={{ padding: '6px 4px' }}>{t.description}</td>
                <td style={{ padding: '6px 4px' }}>{money(t.amount)}</td>
                <td style={{ padding: '6px 4px' }}>
                  <select value={t.sourceGL || ''} onChange={e => updateSourceGL(t.id, e.target.value)}>
                    <option value="">—</option>
                    <AccountOptions accounts={accounts.filter(a => a.type === 'Asset' || a.type === 'Liability')} />
                  </select>
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <select value={t.gl} onChange={e => updateGL(t.id, e.target.value)}>
                    <option value="">Uncategorized</option>
                    <AccountOptions accounts={accounts} />
                  </select>
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <StatusBadge status={t.status} />
                </td>
                <td style={{ padding: '6px 4px', display: 'flex', gap: 6 }}>
                  {t.status === 'REVIEW' && (
                    <button title="Confirm" onClick={() => confirmRow(t.id)} style={iconBtn}><Check size={14} /></button>
                  )}
                  <button title="Split across multiple accounts" onClick={() => openSplit(t)} style={iconBtn}>Split</button>
                  {t.gl === '1100' && (
                    <button title="Link to a real invoice" onClick={() => openLink(t)} style={iconBtn}>Link to invoice</button>
                  )}
                  <button title="Delete" onClick={() => removeRow(t.id)} style={iconBtn}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {combinedRows.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>{transactions.length === 0 ? 'No transactions yet. Add the first one above.' : 'No transactions match these filters.'}</div>}
      </Card>

      {splittingId && (() => {
        const original = transactions.find(t => t.id === splittingId);
        if (!original) return null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <Card style={{ width: 420 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Split transaction — {money(original.amount)}</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>{original.description}</div>
              {splitLines.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select style={{ flex: 1 }} value={l.gl} onChange={e => updateSplitLine(i, 'gl', e.target.value)}>
                    <option value="">Account</option>
                    <AccountOptions accounts={accounts} />
                  </select>
                  <input type="number" step="0.01" style={{ width: 100 }} value={l.amount} onChange={e => updateSplitLine(i, 'amount', e.target.value)} />
                  <button onClick={() => removeSplitLine(i)} style={iconBtn}><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={addSplitLine} style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}><Plus size={13} /> Line</button>
              {splitError && <div style={{ color: '#B00020', fontSize: 12, marginBottom: 10 }}>{splitError}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setSplittingId(null)} style={iconBtn}>Cancel</button>
                <button onClick={confirmSplit} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Confirm split</button>
              </div>
            </Card>
          </div>
        );
      })()}

      {linkingId && (() => {
        const t = transactions.find(x => x.id === linkingId);
        if (!t) return null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <Card style={{ width: 380 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Link to invoice real</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>{t.description} — {money(t.amount)}</div>
              <select style={{ width: '100%', marginBottom: 12 }} value={linkInvoiceId} onChange={e => setLinkInvoiceId(e.target.value)}>
                <option value="">Select the invoice</option>
                {(() => {
                  const openInv = invoices.filter(i => i.status !== 'Paid');
                  const byClient = {};
                  openInv.forEach(i => { (byClient[i.client] = byClient[i.client] || []).push(i); });
                  const clientNames = Object.keys(byClient).sort((a, b) => a.localeCompare(b));
                  return clientNames.map(client => (
                    <optgroup key={client} label={client}>
                      {byClient[client].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })).map(i => (
                        <option key={i.id} value={i.id}>{i.number} — {money(invoiceTotal(i) - (i.paid || 0))} outstanding</option>
                      ))}
                    </optgroup>
                  ));
                })()}
              </select>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setLinkingId(null)} style={iconBtn}>Cancel</button>
                <button onClick={confirmLink} disabled={!linkInvoiceId} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Apply payment</button>
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}

const iconBtn = { border: '1px solid #E2E5E9', background: '#fff', borderRadius: 6, padding: 5, cursor: 'pointer' };

function StatusBadge({ status }) {
  const styles = {
    AUTO: { bg: '#EAF3DE', color: '#27500A' },
    MATCH: { bg: '#E6F1FB', color: '#0C447C' },
    REVIEW: { bg: '#FAEEDA', color: '#854F0B' },
    APPROVED: { bg: '#EAF3DE', color: '#27500A' },
    'JOURNAL ENTRY': { bg: '#EFE6FB', color: '#5B2C9E' },
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
  const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '', status: '' });

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (filters.search.trim()) {
        const q = filters.search.trim().toUpperCase();
        if (!inv.number.toUpperCase().includes(q) && !inv.client.toUpperCase().includes(q)) return false;
      }
      if (filters.dateFrom && inv.date < filters.dateFrom) return false;
      if (filters.dateTo && inv.date > filters.dateTo) return false;
      if (filters.status && inv.status !== filters.status) return false;
      return true;
    });
  }, [invoices, filters]);
  const filtersActive = filters.search.trim() || filters.dateFrom || filters.dateTo || filters.status;
  const filteredTotal = filteredInvoices.reduce((s, inv) => s + invoiceTotal(inv), 0);
  const filteredBalance = filteredInvoices.reduce((s, inv) => s + invoiceTotal(inv) - (inv.paid || 0), 0);

  function applyPayment(inv) {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) { setPayError('Enter a valid amount.'); return; }
    setPayError('');
    setInvoices(prev => prev.map(i => {
      if (i.id !== inv.id) return i;
      const paid = (i.paid || 0) + amt;
      const total = invoiceTotal(i);
      return { ...i, paid, status: paid >= total ? 'Paid' : 'Partial' };
    }));
    setPayingId(null);
    setPayAmount('');
  }

  function blankInvoice() {
    return { client: '', date: todayStr(), lines: [{ desc: '', qty: 1, rate: '' }], retention: false, retentionPct: 10, status: 'Pending', paid: 0 };
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
    if (!form.client.trim()) { setError("Enter the customer's name."); return; }
    if (form.lines.some(l => !l.desc.trim() || !l.rate)) { setError('Each line needs a description and price.'); return; }
    setError('');
    const inv = { ...form, id: uid(), number: 'FAC-' + (invoices.length + 1001) };
    setInvoices(prev => [...prev, inv]);
    setForm(blankInvoice());
    setShowForm(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Invoices</h2>
        <button onClick={() => setShowForm(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
          <Plus size={15} /> New invoice
        </button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Customer</label>
              <input style={{ width: '100%' }} value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="Customer name" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          {form.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input style={{ flex: 1 }} placeholder="Service description" value={l.desc} onChange={e => updateLine(i, 'desc', e.target.value)} />
              <input type="number" style={{ width: 70 }} placeholder="Qty." value={l.qty} onChange={e => updateLine(i, 'qty', e.target.value)} />
              <input type="number" step="0.01" style={{ width: 100 }} placeholder="Price" value={l.rate} onChange={e => updateLine(i, 'rate', e.target.value)} />
              <span style={{ width: 90, fontSize: 13, textAlign: 'right' }}>{money((Number(l.qty) || 0) * (Number(l.rate) || 0))}</span>
              <button onClick={() => removeLine(i)} style={iconBtn}><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={addLine} style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}><Plus size={13} /> Line</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={form.retention} onChange={e => setForm(f => ({ ...f, retention: e.target.checked }))} />
              Apply withholding
            </label>
            {form.retention && (
              <input type="number" style={{ width: 60 }} value={form.retentionPct} onChange={e => setForm(f => ({ ...f, retentionPct: e.target.value }))} />
            )}
            {form.retention && <span style={{ fontSize: 13 }}>%</span>}
          </div>

          <div style={{ fontWeight: 700, marginBottom: 12 }}>Total: {money(invoiceTotal(form))}</div>
          {error && <div style={{ color: '#B00020', fontSize: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
          <button onClick={saveInvoice} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>Save invoice</button>
        </Card>
      )}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Search (invoice # or customer)</label>
            <input style={{ width: '100%' }} placeholder="E.g. 3133, Bivona's..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
          </div>
          <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>From</label>
            <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} /></div>
          <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>To</label>
            <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} /></div>
          <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Status</label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Partial">Partial</option>
              <option value="Paid">Paid</option>
            </select></div>
          {filtersActive && (
            <button onClick={() => setFilters({ search: '', dateFrom: '', dateTo: '', status: '' })} style={iconBtn}>Clear filters</button>
          )}
        </div>
        {filtersActive && (
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 10, display: 'flex', gap: 16 }}>
            <span>{filteredInvoices.length} of {invoices.length} invoices</span>
            <span>Total: <strong>{money(filteredTotal)}</strong></span>
            <span>Outstanding balance: <strong>{money(filteredBalance)}</strong></span>
          </div>
        )}
      </Card>

      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
              <th style={{ padding: '6px 4px' }}>No.</th>
              <th style={{ padding: '6px 4px' }}>Customer</th>
              <th style={{ padding: '6px 4px' }}>Date</th>
              <th style={{ padding: '6px 4px' }}>Total</th>
              <th style={{ padding: '6px 4px' }}>Status</th>
              <th style={{ padding: '6px 4px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.slice().reverse().map(inv => (
              <tr key={inv.id} style={{ borderBottom: '1px solid #F0F1F3' }}>
                <td style={{ padding: '6px 4px' }}>{inv.number}</td>
                <td style={{ padding: '6px 4px' }}>{inv.client}</td>
                <td style={{ padding: '6px 4px' }}>{inv.date}</td>
                <td style={{ padding: '6px 4px' }}>{money(invoiceTotal(inv))}</td>
                <td style={{ padding: '6px 4px' }}>{inv.status}{inv.paid ? ` (${money(inv.paid)} paid)` : ''}</td>
                <td style={{ padding: '6px 4px', display: 'flex', gap: 6 }}>
                  <button onClick={() => onPrint(inv)} style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 6 }}><Printer size={14} /> PDF</button>
                  {inv.status !== 'Paid' && (
                    <button onClick={() => { setPayingId(inv.id); setPayAmount(''); setPayError(''); }} style={iconBtn}>Apply payment</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {filteredInvoices.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid #E2E5E9', fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: '6px 4px' }}>Total ({filteredInvoices.length})</td>
                <td style={{ padding: '6px 4px' }}>{money(filteredTotal)}</td>
                <td colSpan={2} style={{ padding: '6px 4px' }}>Outstanding: {money(filteredBalance)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {filteredInvoices.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>{invoices.length === 0 ? 'No invoices yet.' : 'No invoices match these filters.'}</div>}
      </Card>

      {payingId && (() => {
        const inv = invoices.find(i => i.id === payingId);
        if (!inv) return null;
        const balance = invoiceTotal(inv) - (inv.paid || 0);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <Card style={{ width: 320 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Apply payment — {inv.number}</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>Outstanding balance: {money(balance)}</div>
              <input type="number" step="0.01" style={{ width: '100%', marginBottom: 8 }} placeholder="Amount cobrado"
                value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              {payError && <div style={{ color: '#B00020', fontSize: 12, marginBottom: 8 }}>{payError}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setPayingId(null)} style={iconBtn}>Cancel</button>
                <button onClick={() => applyPayment(inv)} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Confirm</button>
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}

function InvoicePrintModal({ inv, total, onClose, businessName }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      className="no-print-overlay">
      <div style={{ background: '#fff', width: 480, maxHeight: '85vh', overflow: 'auto', borderRadius: 8, padding: 28 }} id="invoice-print-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }} className="print-hide">
          <div style={{ fontWeight: 700, fontSize: 18 }}>Invoice {inv.number}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => window.print()} style={{ ...iconBtn, display: 'flex', gap: 6 }}><Printer size={14} /> Save as PDF</button>
            <button onClick={onClose} style={iconBtn}><X size={14} /></button>
          </div>
        </div>
        <ReportHeader businessName={businessName} reportName={`Invoice ${inv.number}`} periodStart={inv.date} periodEnd={inv.date} logoUrl={null} />
        <div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Customer: <strong>{inv.client}</strong></div>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 16 }}>
            <thead><tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: '4px 0' }}>Description</th><th>Qty.</th><th>Price</th><th style={{ textAlign: 'right' }}>Amount</th>
            </tr></thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i}><td style={{ padding: '4px 0' }}>{l.desc}</td><td>{l.qty}</td><td>{money(l.rate)}</td>
                  <td style={{ textAlign: 'right' }}>{money((Number(l.qty) || 0) * (Number(l.rate) || 0))}</td></tr>
              ))}
            </tbody>
          </table>
          {inv.retention && <div style={{ fontSize: 13, textAlign: 'right' }}>Withholding ({inv.retentionPct}%) applied</div>}
          <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'right', marginTop: 8 }}>Total: {money(total)}</div>
        </div>
      </div>
      <style>{`@media print { .no-print-overlay { position: static !important; background: none !important; } .print-hide { display: none !important; } body * { visibility: hidden; } #invoice-print-area, #invoice-print-area * { visibility: visible; } #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
    </div>
  );
}

function CustomersView({ customers, setCustomers, invoices, invoiceTotal, onPrintStatement }) {
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
      <h2 style={{ margin: '0 0 16px' }}>Customers</h2>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ flex: 1 }} placeholder="New customer name" value={name} onChange={e => setName(e.target.value)} />
          <button onClick={addCustomer} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Add</button>
        </div>
      </Card>
      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>Customer</th><th style={{ padding: '6px 4px' }}>Open balance (A/R)</th><th></th>
          </tr></thead>
          <tbody>
            {allNames.map(n => (
              <tr key={n} style={{ borderBottom: '1px solid #F0F1F3' }}>
                <td style={{ padding: '6px 4px' }}>{n}</td>
                <td style={{ padding: '6px 4px' }}>{money(balances[n] || 0)}</td>
                <td style={{ padding: '6px 4px' }}><button onClick={() => onPrintStatement(n)} style={iconBtn}>Statement</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {allNames.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>No customers yet.</div>}
      </Card>
    </div>
  );
}

function CustomerStatementModal({ client, invoices, invoiceTotal, onClose, businessName }) {
  const rows = invoices.filter(i => i.client === client).sort((a, b) => a.date.localeCompare(b.date));
  const totalInvoiced = rows.reduce((s, i) => s + invoiceTotal(i), 0);
  const totalPaid = rows.reduce((s, i) => s + (i.paid || 0), 0);
  const balance = totalInvoiced - totalPaid;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} className="no-print-overlay">
      <div style={{ background: '#fff', width: 560, maxHeight: '85vh', overflow: 'auto', borderRadius: 8, padding: 28 }} id="invoice-print-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }} className="print-hide">
          <div style={{ fontWeight: 700, fontSize: 18 }}>Statement — {client}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => window.print()} style={{ ...iconBtn, display: 'flex', gap: 6 }}><Printer size={14} /> Print / PDF</button>
            <button onClick={onClose} style={iconBtn}><X size={14} /></button>
          </div>
        </div>
        <ReportHeader businessName={businessName} reportName={`Customer Statement — ${client}`} periodStart={rows[0]?.date || todayStr()} periodEnd={todayStr()} logoUrl={null} />
        <div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Customer: <strong>{client}</strong></div>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 16 }}>
            <thead><tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: '4px 0' }}>Invoice</th><th>Date</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Paid</th><th style={{ textAlign: 'right' }}>Balance</th>
            </tr></thead>
            <tbody>
              {rows.map(i => (
                <tr key={i.id}>
                  <td style={{ padding: '4px 0' }}>{i.number}</td><td>{i.date}</td>
                  <td style={{ textAlign: 'right' }}>{money(invoiceTotal(i))}</td>
                  <td style={{ textAlign: 'right' }}>{money(i.paid || 0)}</td>
                  <td style={{ textAlign: 'right' }}>{money(invoiceTotal(i) - (i.paid || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 15, fontWeight: 700, textAlign: 'right' }}>Total balance: {money(balance)}</div>
        </div>
      </div>
      <style>{`@media print { .no-print-overlay { position: static !important; background: none !important; } .print-hide { display: none !important; } body * { visibility: hidden; } #invoice-print-area, #invoice-print-area * { visibility: visible; } #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
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

function ReportsView({ transactions, invoices, glName, invoiceTotal, accounts, journalEntries, businessName }) {
  const [preset, setPreset] = useState('this_month');
  const [selectedReport, setSelectedReport] = useState('pnl');
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const { from, to } = getPeriodRange(preset, customFrom, customTo);

  // All unified accounting lines: transactions (one category each) + their source bank/card account +
  // manual journal entry lines. A single bank transaction affects TWO accounts: the category it was
  // coded to (Meals, Office Supplies...) AND the bank/card it moved through (sourceGL) — both need to
  // count, or a bank/card's own balance would miss almost everything categorized to an expense.
  const postings = useMemo(() => {
    const list = [];
    transactions.forEach(t => {
      if (t.gl) {
        const acct = accounts.find(a => a.code === t.gl);
        // in the bank register, negative = outflow, positive = inflow.
        // so a categorized expense shows as an expense increase (positive), the sign is only flipped there.
        const amount = acct?.type === 'Expense' ? -t.amount : t.amount;
        list.push({ date: t.date, gl: t.gl, amount, source: 'Transaction' });
      }
      if (t.sourceGL && t.sourceGL !== t.gl) {
        list.push({ date: t.date, gl: t.sourceGL, amount: t.amount, source: 'Transaction' });
      }
    });
    journalEntries.forEach(je => {
      je.lines.forEach(l => {
        if (!l.gl) return;
        const acct = accounts.find(a => a.code === l.gl);
        const isDebitSide = acct && (acct.type === 'Asset' || acct.type === 'Expense');
        const debit = Number(l.debit) || 0, credit = Number(l.credit) || 0;
        const amt = isDebitSide ? (debit - credit) : (credit - debit);
        list.push({ date: je.date, gl: l.gl, amount: amt, source: 'Journal Entry' });
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

  // Invoices issued in the period count as revenue (Service Revenue) in addition to what's manually categorized
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
  const totalEquity = equityRows.reduce((s, r) => s + r.value, 0) + netIncome; // period income is added to equity

  const cashRows = cashAccts.map(a => ({ ...a, change: activityInPeriod(a.code, from, to) }));
  const netCashChange = cashRows.reduce((s, r) => s + r.change, 0);

  // ---- Full Cash Flow Statement (approximates the Sales/Purchases/Payroll/Owners grouping used by Wave) ----
  function dayBefore(dateStr) {
    const d = new Date(dateStr); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  const isPayrollLiability = a => a.type === 'Liability' && /payroll|s&w|fica|sinot|income tax/i.test(a.name);
  const otherLiabilityAccts = liabilityAccts.filter(a => !isPayrollLiability(a));
  const payrollLiabilityAccts = liabilityAccts.filter(isPayrollLiability);
  const otherAssetAccts = assetAccts.filter(a => !cashAccts.includes(a) && !/receivable/i.test(a.name));

  const cfSalesRows = revenueAccts.map(a => ({ ...a, value: activityInPeriod(a.code, from, to) }));
  const cfTotalSales = cfSalesRows.reduce((s, r) => s + r.value, 0) + invoiceRevenueInPeriod;
  const cfPurchaseRows = [
    ...expenseAccts.filter(a => !/wages|s&w|payroll/i.test(a.name)).map(a => ({ ...a, value: -activityInPeriod(a.code, from, to) })),
    ...otherLiabilityAccts.map(a => ({ ...a, value: activityInPeriod(a.code, from, to) })),
  ];
  const cfTotalPurchases = cfPurchaseRows.reduce((s, r) => s + r.value, 0);
  const cfPayrollRows = [
    ...expenseAccts.filter(a => /wages|s&w|payroll/i.test(a.name)).map(a => ({ ...a, value: -activityInPeriod(a.code, from, to) })),
    ...payrollLiabilityAccts.map(a => ({ ...a, value: activityInPeriod(a.code, from, to) })),
  ];
  const cfTotalPayroll = cfPayrollRows.reduce((s, r) => s + r.value, 0);
  const cfOperating = cfTotalSales + cfTotalPurchases + cfTotalPayroll;

  const cfInvestingRows = otherAssetAccts.map(a => ({ ...a, value: -activityInPeriod(a.code, from, to) }));
  const cfInvesting = cfInvestingRows.reduce((s, r) => s + r.value, 0);

  const cfFinancingRows = equityAccts.map(a => ({ ...a, value: activityInPeriod(a.code, from, to) }));
  const cfFinancing = cfFinancingRows.reduce((s, r) => s + r.value, 0);

  const cfStartingRows = cashAccts.map(a => ({ ...a, value: balanceAsOf(a.code, dayBefore(from)) }));
  const cfTotalStarting = cfStartingRows.reduce((s, r) => s + r.value, 0);
  const cfEndingRows = cashAccts.map(a => ({ ...a, value: balanceAsOf(a.code, to) }));
  const cfTotalEnding = cfEndingRows.reduce((s, r) => s + r.value, 0);
  const cfGrossInflow = postings.filter(p => cashAccts.some(a => a.code === p.gl) && p.date >= from && p.date <= to && p.amount > 0).reduce((s, p) => s + p.amount, 0);
  const cfGrossOutflow = postings.filter(p => cashAccts.some(a => a.code === p.gl) && p.date >= from && p.date <= to && p.amount < 0).reduce((s, p) => s + p.amount, 0);

  const openInvoicesForExport = invoices.filter(i => i.status !== 'Paid').sort((a, b) => a.date.localeCompare(b.date));

  const REPORT_OPTIONS = [
    ['pnl', 'P&L (Income Statement)'],
    ['balance_sheet', 'Balance Sheet'],
    ['cash_flow', 'Cash Flow'],
    ['ap', 'A/P (Accounts Payable)'],
    ['open_invoices', 'Open Invoices'],
  ];

  function getReportData(key) {
    if (key === 'pnl') {
      const rows = [
        ...revenueRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ...(invoiceRevenueInPeriod !== 0 ? [['', 'Invoicing (Service Revenue)', invoiceRevenueInPeriod]] : []),
        ['', 'Total Revenue', totalRevenue],
        ...expenseRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ['', 'Total Expenses', totalExpense],
        ['', 'Net Income', netIncome],
      ];
      return { title: `P&L — ${from} to ${to}`, header: ['Code', 'Account', 'Amount'], rows };
    }
    if (key === 'balance_sheet') {
      const rows = [
        ...assetRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ['', 'Total Assets', totalAssets],
        ...liabilityRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ['', 'Total Liabilities', totalLiabilities],
        ...equityRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ['', 'Period Income', netIncome],
        ['', 'Total Equity', totalEquity],
      ];
      return { title: `Balance Sheet — as of ${to}`, header: ['Code', 'Account', 'Amount'], rows };
    }
    if (key === 'cash_flow') {
      const rows = [
        ['', 'OPERATING ACTIVITIES', ''],
        ...cfSalesRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ['', 'Total Sales', cfTotalSales],
        ...cfPurchaseRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ['', 'Total Purchases', cfTotalPurchases],
        ...cfPayrollRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ['', 'Total Payroll', cfTotalPayroll],
        ['', 'Net Cash from Operating Activities', cfOperating],
        ['', 'INVESTING ACTIVITIES', ''],
        ...cfInvestingRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ['', 'Net Cash from Investing Activities', cfInvesting],
        ['', 'FINANCING ACTIVITIES', ''],
        ...cfFinancingRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ['', 'Net Cash from Financing Activities', cfFinancing],
        ['', 'OVERVIEW', ''],
        ...cfStartingRows.map(r => [r.code, r.name, r.value]),
        ['', 'Total Starting Balance', cfTotalStarting],
        ...cfEndingRows.map(r => [r.code, r.name, r.value]),
        ['', 'Total Ending Balance', cfTotalEnding],
        ['', 'Gross Cash Inflow', cfGrossInflow],
        ['', 'Gross Cash Outflow', cfGrossOutflow],
        ['', 'Net Cash Change', netCashChange],
      ];
      return { title: `Cash Flow — ${from} to ${to}`, header: ['Code', 'Line', 'Amount'], rows };
    }
    if (key === 'ap') {
      const rows = [
        ...liabilityRows.filter(r => r.value !== 0).map(r => [r.code, r.name, -r.value]),
        ['', 'Total A/P', -totalLiabilities],
      ];
      return { title: `A/P — as of ${to}`, header: ['Code', 'Account', 'Amount'], rows };
    }
    if (key === 'open_invoices') {
      const rows = openInvoicesForExport.map(i => [i.number, i.client, i.date, invoiceTotal(i), invoiceTotal(i) - (i.paid || 0), i.status]);
      return { title: `Open Invoices — as of ${todayStr()}`, header: ['Invoice #', 'Customer', 'Date', 'Total', 'Balance', 'Status'], rows };
    }
    return { title: '', header: [], rows: [] };
  }

  function downloadReportCSV() {
    const { title, header, rows } = getReportData(selectedReport);
    let csv = businessName + '\n' + title + '\n\n' + header.join(',') + '\n';
    rows.forEach(r => { csv += r.map(v => typeof v === 'number' ? v.toFixed(2) : `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n'; });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${selectedReport}_${from}_to_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const byMonth = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      const m = t.date.slice(0, 7);
      map[m] = map[m] || { revenue: 0, expense: 0 };
      const acct = accounts.find(g => g.code === t.gl);
      if (acct?.type === 'Expense') map[m].expense += Math.abs(t.amount);
      if (acct?.type === 'Revenue') map[m].revenue += Math.abs(t.amount);
    });
    invoices.forEach(inv => {
      const m = inv.date.slice(0, 7);
      map[m] = map[m] || { revenue: 0, expense: 0 };
      map[m].revenue += invoiceTotal(inv);
    });
    return Object.entries(map).sort();
  }, [transactions, invoices, invoiceTotal, accounts]);

  function downloadCSV() {
    let csv = 'Month,Revenue,Expenses,Net\n';
    byMonth.forEach(([m, v]) => { csv += `${m},${v.revenue.toFixed(2)},${v.expense.toFixed(2)},${(v.revenue - v.expense).toFixed(2)}\n`; });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'monthly_report.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const PRESETS = [
    ['this_month', 'This month'], ['last_month', 'Last month'], ['this_quarter', 'This quarter'],
    ['this_year', 'This year'], ['custom', 'Custom'],
  ];

  const [drillDown, setDrillDown] = useState(null); // { gl, label, mode: 'period' | 'asOf' }

  const Row = ({ label, value, bold, gl, mode }) => (
    <div
      onClick={gl ? () => setDrillDown({ gl, label, mode }) : undefined}
      style={{
        display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, fontWeight: bold ? 700 : 400,
        cursor: gl ? 'pointer' : 'default', color: gl ? '#0C447C' : 'inherit', textDecoration: gl ? 'underline' : 'none',
      }}>
      <span>{label}</span><span>{money(value)}</span>
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Financial Reports</h2>

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
              <div><label style={{ fontSize: 11, color: '#6B7280', display: 'block' }}>From</label>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></div>
              <div><label style={{ fontSize: 11, color: '#6B7280', display: 'block' }}>To</label>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} /></div>
            </>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>Period: {from} to {to}</div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Report</label>
            <select value={selectedReport} onChange={e => setSelectedReport(e.target.value)}>
              {REPORT_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <button onClick={() => setShowExportPreview(true)} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Download PDF</button>
          <button onClick={downloadReportCSV} style={iconBtn}>Download CSV</button>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>P&L (Income Statement)</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>Revenue</div>
          {revenueRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} gl={r.code} mode="period" />)}
          {invoiceRevenueInPeriod !== 0 && <Row label="Invoicing (Service Revenue)" value={invoiceRevenueInPeriod} gl="__invoices__" mode="period" />}
          <Row label="Total Revenue" value={totalRevenue} bold />
          <div style={{ fontSize: 11, color: '#6B7280', margin: '10px 0 8px' }}>Expenses</div>
          {expenseRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} gl={r.code} mode="period" />)}
          <Row label="Total Expenses" value={totalExpense} bold />
          <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
            <Row label="Net Income" value={netIncome} bold />
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Balance Sheet (as of {to})</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>Assets</div>
          {assetRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} gl={r.code} mode="asOf" />)}
          <Row label="Total Assets" value={totalAssets} bold />
          <div style={{ fontSize: 11, color: '#6B7280', margin: '10px 0 8px' }}>Liabilities</div>
          {liabilityRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} gl={r.code} mode="asOf" />)}
          <Row label="Total Liabilities" value={totalLiabilities} bold />
          <div style={{ fontSize: 11, color: '#6B7280', margin: '10px 0 8px' }}>Equity</div>
          {equityRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} gl={r.code} mode="asOf" />)}
          <Row label="Period income" value={netIncome} />
          <Row label="Total Equity" value={totalEquity} bold />
          <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
            <Row label="Liabilities + Equity" value={totalLiabilities + totalEquity} bold />
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Cash Flow</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 14 }}>{from} to {to}</div>

        <div style={{ fontWeight: 700, background: '#F0F1F3', padding: '4px 8px', marginBottom: 4 }}>Operating Activities</div>
        <div style={{ fontSize: 12, color: '#6B7280', margin: '6px 0 2px', paddingLeft: 8 }}>Sales</div>
        {cfSalesRows.filter(r => r.value !== 0).map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="period" /></div>)}
        {invoiceRevenueInPeriod !== 0 && <div style={{ paddingLeft: 16 }}><Row label="Invoicing (Service Revenue)" value={invoiceRevenueInPeriod} gl="__invoices__" mode="period" /></div>}
        <div style={{ paddingLeft: 16 }}><Row label="Total Sales" value={cfTotalSales} bold /></div>

        <div style={{ fontSize: 12, color: '#6B7280', margin: '10px 0 2px', paddingLeft: 8 }}>Purchases</div>
        {cfPurchaseRows.filter(r => r.value !== 0).map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="period" /></div>)}
        <div style={{ paddingLeft: 16 }}><Row label="Total Purchases" value={cfTotalPurchases} bold /></div>

        <div style={{ fontSize: 12, color: '#6B7280', margin: '10px 0 2px', paddingLeft: 8 }}>Payroll</div>
        {cfPayrollRows.filter(r => r.value !== 0).map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="period" /></div>)}
        {cfPayrollRows.every(r => r.value === 0) && <div style={{ paddingLeft: 16, fontSize: 12, color: '#6B7280' }}>No payroll activity in this period.</div>}
        <div style={{ paddingLeft: 16 }}><Row label="Total Payroll" value={cfTotalPayroll} bold /></div>

        <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
          <Row label="Net Cash from Operating Activities" value={cfOperating} bold />
        </div>

        <div style={{ fontWeight: 700, background: '#F0F1F3', padding: '4px 8px', margin: '16px 0 4px' }}>Investing Activities</div>
        {cfInvestingRows.filter(r => r.value !== 0).map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="period" /></div>)}
        {cfInvestingRows.every(r => r.value === 0) && <div style={{ paddingLeft: 16, fontSize: 12, color: '#6B7280' }}>No investing activity in this period.</div>}
        <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
          <Row label="Net Cash from Investing Activities" value={cfInvesting} bold />
        </div>

        <div style={{ fontWeight: 700, background: '#F0F1F3', padding: '4px 8px', margin: '16px 0 4px' }}>Financing Activities</div>
        <div style={{ fontSize: 12, color: '#6B7280', margin: '6px 0 2px', paddingLeft: 8 }}>Owners and Shareholders</div>
        {cfFinancingRows.filter(r => r.value !== 0).map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="period" /></div>)}
        {cfFinancingRows.every(r => r.value === 0) && <div style={{ paddingLeft: 16, fontSize: 12, color: '#6B7280' }}>No financing activity in this period.</div>}
        <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
          <Row label="Net Cash from Financing Activities" value={cfFinancing} bold />
        </div>

        <div style={{ fontWeight: 700, background: '#F0F1F3', padding: '4px 8px', margin: '16px 0 4px' }}>Overview</div>
        <div style={{ fontSize: 12, color: '#6B7280', margin: '6px 0 2px', paddingLeft: 8 }}>Starting Balance (as of {dayBefore(from)})</div>
        {cfStartingRows.map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="asOf" /></div>)}
        <div style={{ paddingLeft: 16 }}><Row label="Total Starting Balance" value={cfTotalStarting} bold /></div>

        <div style={{ fontSize: 12, color: '#6B7280', margin: '10px 0 2px', paddingLeft: 8 }}>Ending Balance (as of {to})</div>
        {cfEndingRows.map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="asOf" /></div>)}
        <div style={{ paddingLeft: 16 }}><Row label="Total Ending Balance" value={cfTotalEnding} bold /></div>

        <div style={{ paddingLeft: 8, marginTop: 10 }}>
          <Row label="Gross Cash Inflow" value={cfGrossInflow} />
          <Row label="Gross Cash Outflow" value={cfGrossOutflow} />
          <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 4, paddingTop: 4 }}>
            <Row label="Net Cash Change" value={netCashChange} bold />
          </div>
        </div>

        {cashRows.length === 0 && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 10 }}>No accounts are marked as bank/cash (the name must include "bank", "cash", or similar).</div>}
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 14 }}>
          Purchases/Payroll/Investing/Financing groupings are approximated from your account types and names (Wages/Payroll/FICA/SINOT/Income Tax → Payroll; other liabilities → Purchases; other assets → Investing; equity → Financing). Click any line to see the transactions behind it.
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 20 }}>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>A/R Aging (Accounts Receivable)</div>
          {(() => {
            const buckets = ['Current', '1-30', '31-60', '61-90', '90+'];
            const byClient = {};
            const todayD = new Date(todayStr());
            invoices.filter(i => i.status !== 'Paid').forEach(inv => {
              const bal = invoiceTotal(inv) - (inv.paid || 0);
              if (bal <= 0) return;
              const days = Math.floor((todayD - new Date(inv.date)) / 86400000);
              const bucket = days <= 0 ? 'Current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
              byClient[inv.client] = byClient[inv.client] || { Current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
              byClient[inv.client][bucket] += bal;
            });
            const clients = Object.keys(byClient);
            const totals = buckets.reduce((acc, b) => ({ ...acc, [b]: clients.reduce((s, c) => s + byClient[c][b], 0) }), {});
            return (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'right', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Customer</th>
                  {buckets.map(b => <th key={b} style={{ padding: '4px' }}>{b}</th>)}
                </tr></thead>
                <tbody>
                  {clients.map(c => (
                    <tr key={c} style={{ borderBottom: '1px solid #F0F1F3' }}>
                      <td style={{ padding: '4px', textAlign: 'left' }}>{c}</td>
                      {buckets.map(b => <td key={b} style={{ padding: '4px', textAlign: 'right' }}>{byClient[c][b] ? money(byClient[c][b]) : '—'}</td>)}
                    </tr>
                  ))}
                  {clients.length === 0 && <tr><td colSpan={6} style={{ padding: 8, color: '#6B7280' }}>No open invoices.</td></tr>}
                </tbody>
                {clients.length > 0 && (
                  <tfoot><tr style={{ borderTop: '2px solid #E2E5E9', fontWeight: 700 }}>
                    <td style={{ padding: '4px' }}>Total</td>
                    {buckets.map(b => <td key={b} style={{ padding: '4px', textAlign: 'right' }}>{money(totals[b])}</td>)}
                  </tr></tfoot>
                )}
              </table>
            );
          })()}
        </Card>

        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>A/P (Accounts Payable)</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>Current balance of your liability accounts (cards, payroll, and taxes payable)</div>
          {liabilityRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={-r.value} gl={r.code} mode="asOf" />)}
          <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
            <Row label="Total A/P" value={-totalLiabilities} bold />
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 10 }}>
            This reflects your liability accounts as they stand today; the system doesn't yet track individual vendor bills.
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Open Invoices</div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>Invoice</th><th style={{ padding: '6px 4px' }}>Customer</th><th style={{ padding: '6px 4px' }}>Date</th>
            <th style={{ padding: '6px 4px' }}>Total</th><th style={{ padding: '6px 4px' }}>Balance</th><th style={{ padding: '6px 4px' }}>Status</th>
          </tr></thead>
          <tbody>
            {invoices.filter(i => i.status !== 'Paid').sort((a, b) => a.date.localeCompare(b.date)).map(i => (
              <tr key={i.id} style={{ borderBottom: '1px solid #F0F1F3' }}>
                <td style={{ padding: '6px 4px' }}>{i.number}</td>
                <td style={{ padding: '6px 4px' }}>{i.client}</td>
                <td style={{ padding: '6px 4px' }}>{i.date}</td>
                <td style={{ padding: '6px 4px' }}>{money(invoiceTotal(i))}</td>
                <td style={{ padding: '6px 4px' }}>{money(invoiceTotal(i) - (i.paid || 0))}</td>
                <td style={{ padding: '6px 4px' }}>{i.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.filter(i => i.status !== 'Paid').length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>No open invoices.</div>}
      </Card>

      {drillDown && (() => {
        const { gl, label, mode } = drillDown;
        const items = [];
        if (gl === '__invoices__') {
          invoices.forEach(inv => {
            if (mode === 'period' && (inv.date < from || inv.date > to)) return;
            if (mode === 'asOf' && inv.date > to) return;
            items.push({ id: inv.id, date: inv.date, description: `Invoice ${inv.number} — ${inv.client}`, amount: invoiceTotal(inv), type: 'Invoice' });
          });
        } else {
        transactions.forEach(t => {
          const matchesCategory = t.gl === gl;
          const matchesSource = t.sourceGL === gl && t.sourceGL !== t.gl;
          if (!matchesCategory && !matchesSource) return;
          if (mode === 'period' && (t.date < from || t.date > to)) return;
          if (mode === 'asOf' && t.date > to) return;
          let amount;
          if (matchesCategory) {
            const acct = accounts.find(a => a.code === gl);
            amount = acct?.type === 'Expense' ? -t.amount : t.amount;
          } else {
            amount = t.amount; // as the source bank/card, the amount is already the natural change
          }
          items.push({ id: t.id + (matchesSource ? '-src' : ''), date: t.date, description: t.description, amount, type: 'Transaction' });
        });
        journalEntries.forEach(je => {
          je.lines.forEach(l => {
            if (l.gl !== gl) return;
            if (mode === 'period' && (je.date < from || je.date > to)) return;
            if (mode === 'asOf' && je.date > to) return;
            const acct = accounts.find(a => a.code === gl);
            const isDebitSide = acct && (acct.type === 'Asset' || acct.type === 'Expense');
            const debit = Number(l.debit) || 0, credit = Number(l.credit) || 0;
            const amount = isDebitSide ? (debit - credit) : (credit - debit);
            items.push({ id: `je-${je.id}`, date: je.date, description: `Journal Entry — ${je.memo || l.desc || 'no memo'}`, amount, type: 'Journal Entry' });
          });
        });
        }
        items.sort((a, b) => a.date.localeCompare(b.date));
        const total = items.reduce((s, i) => s + i.amount, 0);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <Card style={{ width: 640, maxHeight: '85vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>{label}</div>
                <button onClick={() => setDrillDown(null)} style={iconBtn}><X size={14} /></button>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>
                {mode === 'period' ? `Activity from ${from} to ${to}` : `Balance as of ${to}`} — {items.length} item{items.length === 1 ? '' : 's'}
              </div>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
                  <th style={{ padding: '4px' }}>Date</th><th style={{ padding: '4px' }}>Description</th>
                  <th style={{ padding: '4px' }}>Source</th><th style={{ padding: '4px', textAlign: 'right' }}>Amount</th>
                </tr></thead>
                <tbody>
                  {items.map(i => (
                    <tr key={i.id} style={{ borderBottom: '1px solid #F0F1F3' }}>
                      <td style={{ padding: '4px' }}>{i.date}</td>
                      <td style={{ padding: '4px' }}>{i.description}</td>
                      <td style={{ padding: '4px' }}>{i.type}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>{money(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>No transactions or journal entries behind this number.</div>}
              <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 10, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13 }}>
                <span>Total</span><span>{money(total)}</span>
              </div>
            </Card>
          </div>
        );
      })()}

      {showExportPreview && (() => {
        const { title, header, rows } = getReportData(selectedReport);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} className="no-print-overlay">
            <div style={{ background: '#fff', width: 640, maxHeight: '85vh', overflow: 'auto', borderRadius: 8, padding: 28 }} id="invoice-print-area">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }} className="print-hide">
                <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => window.print()} style={{ ...iconBtn, display: 'flex', gap: 6 }}><Printer size={14} /> Save as PDF</button>
                  <button onClick={() => setShowExportPreview(false)} style={iconBtn}><X size={14} /></button>
                </div>
              </div>
              <ReportHeader businessName={businessName} reportName={title} periodStart={from} periodEnd={to} logoUrl={null} />
              <div>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                    {header.map(h => <th key={h} style={{ padding: '4px 6px', textAlign: h === header[header.length - 1] ? 'right' : 'left' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const isTotal = typeof r[1] === 'string' && /^Total|^Net |ACTIVITIES$|OVERVIEW$/.test(r[1]);
                      return (
                        <tr key={i} style={{ fontWeight: isTotal ? 700 : 400, borderTop: isTotal ? '1px solid #E2E5E9' : 'none' }}>
                          {r.map((cell, ci) => (
                            <td key={ci} style={{ padding: '4px 6px', textAlign: ci === r.length - 1 && typeof cell === 'number' ? 'right' : 'left' }}>
                              {typeof cell === 'number' ? money(cell) : cell}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <style>{`@media print { .no-print-overlay { position: static !important; background: none !important; } .print-hide { display: none !important; } body * { visibility: hidden; } #invoice-print-area, #invoice-print-area * { visibility: visible; } #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
          </div>
        );
      })()}
    </div>
  );
}

function ChartOfAccountsView({ accounts, setAccounts, isMaster }) {
  const [form, setForm] = useState({ code: '', name: '', type: 'Expense' });
  const [error, setError] = useState('');
  const [editingCode, setEditingCode] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: '', type: 'Expense' });

  function addAccount() {
    if (!form.code.trim() || !form.name.trim()) { setError('Enter a code and name.'); return; }
    if (accounts.some(a => a.code === form.code.trim())) { setError('That code already exists.'); return; }
    setError('');
    setAccounts(prev => [...prev, { code: form.code.trim(), name: form.name.trim(), type: form.type }]);
    setForm({ code: '', name: '', type: 'Expense' });
  }
  function updateAccount(code, field, value) {
    setAccounts(prev => prev.map(a => a.code === code ? { ...a, [field]: value } : a));
  }
  function startEdit(a) {
    setEditingCode(a.code);
    setEditDraft({ name: a.name, type: a.type });
  }
  function saveEdit(code) {
    setAccounts(prev => prev.map(a => a.code === code ? { ...a, name: editDraft.name, type: editDraft.type } : a));
    setEditingCode(null);
  }
  function removeAccount(code) {
    setAccounts(prev => prev.filter(a => a.code !== code));
  }

  const types = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  const grouped = types.map(t => ({ type: t, rows: accounts.filter(a => a.type === t).sort((a, b) => a.code.localeCompare(b.code)) }));

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Chart of Accounts</h2>

      {!isMaster && (
        <Card style={{ marginBottom: 20, background: '#FFF8E6', borderColor: '#F0D896' }}>
          <div style={{ fontSize: 13, color: '#7A5B00' }}>
            This chart of accounts is managed centrally from <strong>Twelve Business Strategies</strong> and kept in sync across all clients — it's read-only here to avoid conflicting edits.
          </div>
        </Card>
      )}

      {isMaster && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Code</label>
              <input style={{ width: 90 }} placeholder="6300" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Name</label>
              <input style={{ width: '100%' }} placeholder="Account name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button onClick={addAccount} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
              <Plus size={15} /> Add account
            </button>
          </div>
          {error && <div style={{ color: '#B00020', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
        </Card>
      )}

      {grouped.map(g => g.rows.length > 0 && (
        <Card key={g.type} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{g.type}</div>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              {g.rows.map(a => (
                <tr key={a.code} style={{ borderBottom: '1px solid #F0F1F3' }}>
                  <td style={{ padding: '6px 4px', width: 80, color: '#6B7280' }}>{a.code}</td>
                  {editingCode === a.code ? (
                    <>
                      <td style={{ padding: '6px 4px' }}>
                        <input style={{ width: '100%' }} value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} autoFocus />
                      </td>
                      <td style={{ padding: '6px 4px', width: 130 }}>
                        <select value={editDraft.type} onChange={e => setEditDraft(d => ({ ...d, type: e.target.value }))}>
                          {types.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '6px 4px', width: 90, display: 'flex', gap: 4 }}>
                        <button onClick={() => saveEdit(a.code)} style={iconBtn}><Check size={14} /></button>
                        <button onClick={() => setEditingCode(null)} style={iconBtn}><X size={14} /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '6px 4px' }}>{a.name}</td>
                      <td style={{ padding: '6px 4px', width: 130, color: '#6B7280' }}>{a.type}</td>
                      {isMaster && (
                        <td style={{ padding: '6px 4px', width: 90, display: 'flex', gap: 4 }}>
                          <button onClick={() => startEdit(a)} style={iconBtn}>Edit</button>
                          <button onClick={() => removeAccount(a.code)} style={iconBtn}><Trash2 size={14} /></button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
      {accounts.length === 0 && <Card><div style={{ fontSize: 13, color: '#6B7280' }}>No accounts yet.</div></Card>}
    </div>
  );
}

function RulesView({ rules, setRules, accounts }) {
  const [form, setForm] = useState({ keyword: '', gl: '', mode: 'AUTO' });
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ keyword: '', gl: '' });

  function addRule() {
    if (!form.keyword.trim() || !form.gl) { setError('Enter the keyword and the account.'); return; }
    setError('');
    setRules(prev => [...prev, { id: uid(), keyword: form.keyword.trim().toUpperCase(), gl: form.gl, mode: form.mode }]);
    setForm({ keyword: '', gl: '', mode: 'AUTO' });
  }
  function removeRule(id) {
    setRules(prev => prev.filter(r => r.id !== id));
  }
  const filteredRules = useMemo(() => {
    return rules.filter(r => {
      if (filters.keyword.trim() && !r.keyword.toUpperCase().includes(filters.keyword.trim().toUpperCase())) return false;
      if (filters.gl && r.gl !== filters.gl) return false;
      return true;
    });
  }, [rules, filters]);
  const filtersActive = filters.keyword.trim() || filters.gl;

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Categorization Rules</h2>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
          When to transaction's description contains this word, it will be categorized automatically with the account you choose.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Keyword</label>
            <input style={{ width: '100%' }} placeholder="Ej. NETFLIX" value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Account</label>
            <select value={form.gl} onChange={e => setForm(f => ({ ...f, gl: e.target.value }))}>
              <option value="">Select</option>
              <AccountOptions accounts={accounts} />
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Mode</label>
            <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
              <option value="AUTO">AUTO</option>
              <option value="MATCH">MATCH</option>
              <option value="REVIEW">REVIEW</option>
            </select>
          </div>
          <button onClick={addRule} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
            <Plus size={15} /> Add rule
          </button>
        </div>
        {error && <div style={{ color: '#B00020', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Filter by keyword</label>
            <input style={{ width: '100%' }} placeholder="Search keyword..." value={filters.keyword} onChange={e => setFilters(f => ({ ...f, keyword: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Filter by account</label>
            <select value={filters.gl} onChange={e => setFilters(f => ({ ...f, gl: e.target.value }))}>
              <option value="">All</option>
              <AccountOptions accounts={accounts} />
            </select>
          </div>
          {filtersActive && (
            <button onClick={() => setFilters({ keyword: '', gl: '' })} style={iconBtn}>Clear filters</button>
          )}
        </div>
        {filtersActive && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>{filteredRules.length} of {rules.length} rules</div>}
      </Card>

      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>Keyword</th><th style={{ padding: '6px 4px' }}>Account</th><th style={{ padding: '6px 4px' }}>Mode</th><th></th>
          </tr></thead>
          <tbody>
            {filteredRules.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #F0F1F3' }}>
                <td style={{ padding: '6px 4px' }}>{r.keyword}</td>
                <td style={{ padding: '6px 4px' }}>{r.gl} — {accounts.find(a => a.code === r.gl)?.name || ''}</td>
                <td style={{ padding: '6px 4px' }}><StatusBadge status={r.mode} /></td>
                <td style={{ padding: '6px 4px' }}><button onClick={() => removeRule(r.id)} style={iconBtn}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRules.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>{rules.length === 0 ? 'No rules yet.' : 'No rules match these filters.'}</div>}
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
    if (form.lines.some(l => !l.gl)) { setError('Each line needs an account.'); return; }
    if (!balanced) { setError("The entry doesn't balance: Debit and Credit must be equal and greater than zero."); return; }
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
        <h2 style={{ margin: 0 }}>Journal Entries</h2>
        <button onClick={() => setShowForm(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
          <Plus size={15} /> New entry
        </button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Memo</label>
              <input style={{ width: '100%' }} placeholder="Description general del asiento" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
            </div>
          </div>

          {form.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select style={{ width: 200 }} value={l.gl} onChange={e => updateLine(i, 'gl', e.target.value)}>
                <option value="">Account</option>
                <AccountOptions accounts={accounts} />
              </select>
              <input style={{ flex: 1 }} placeholder="Line description" value={l.desc} onChange={e => updateLine(i, 'desc', e.target.value)} />
              <input type="number" step="0.01" style={{ width: 100 }} placeholder="Debit" value={l.debit} onChange={e => updateLine(i, 'debit', e.target.value)} />
              <input type="number" step="0.01" style={{ width: 100 }} placeholder="Credit" value={l.credit} onChange={e => updateLine(i, 'credit', e.target.value)} />
              <button onClick={() => removeLine(i)} style={iconBtn}><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={addLine} style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}><Plus size={13} /> Line</button>

          <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: 12 }}>
            <span>Total debit: <strong>{money(totalDebit)}</strong></span>
            <span>Total credit: <strong>{money(totalCredit)}</strong></span>
            <span style={{ color: balanced ? '#0F6E56' : '#B00020', fontWeight: 600 }}>{balanced ? "Balanced" : "Doesn't balance"}</span>
          </div>
          {error && <div style={{ color: '#B00020', fontSize: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
          <button onClick={saveJE} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>Save entry</button>
        </Card>
      )}

      <Card>
        {journalEntries.slice().reverse().map(je => (
          <div key={je.id} style={{ borderBottom: '1px solid #F0F1F3', padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
              <span>{je.date} — {je.memo || 'No memo'}</span>
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
        {journalEntries.length === 0 && <div style={{ fontSize: 13, color: '#6B7280' }}>No manual entries yet.</div>}
      </Card>
    </div>
  );
}

function ReconciliationView({ reconciliations, setReconciliations, transactions, setTransactions, accounts, journalEntries }) {
  const bankAccounts = accounts.filter(a => a.type === 'Asset' || a.type === 'Liability');
  const [form, setForm] = useState({ gl: '', periodEnd: todayStr(), statementBalance: '' });
  const [error, setError] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [verified, setVerified] = useState([]);
  const [selected, setSelected] = useState([]);

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleSelectAll() {
    const ids = reconciliations.map(r => r.id);
    const allSelected = ids.length > 0 && ids.every(id => selected.includes(id));
    setSelected(allSelected ? [] : ids);
  }
  function deleteSelected() {
    setReconciliations(prev => prev.filter(r => !selected.includes(r.id)));
    setSelected([]);
  }
  function deleteOne(id) {
    setReconciliations(prev => prev.filter(r => r.id !== id));
    setSelected(prev => prev.filter(x => x !== id));
  }

  // la cuenta de origen (sourceGL) es la que refleja de verdad qué banco/tarjeta movió el dinero;
  // además, cualquier journal entry manual que toque esta misma cuenta también debe contar
  function jeAmountFor(gl, line) {
    const acct = accounts.find(a => a.code === gl);
    const debit = Number(line.debit) || 0, credit = Number(line.credit) || 0;
    const isDebitSide = acct && (acct.type === 'Asset' || acct.type === 'Expense');
    return isDebitSide ? (debit - credit) : (credit - debit);
  }
  function jePostingsFor(gl, periodEnd) {
    const list = [];
    journalEntries.forEach(je => {
      if (je.date > periodEnd) return;
      je.lines.forEach(l => {
        if (l.gl !== gl) return;
        list.push({ id: `je-${je.id}-${l.gl}`, date: je.date, description: `Journal Entry — ${je.memo || l.desc || 'no memo'}`, amount: jeAmountFor(gl, l), isJE: true });
      });
    });
    return list;
  }
  function ledgerBalanceFor(gl, periodEnd) {
    const txTotal = transactions.filter(t => t.sourceGL === gl && t.date <= periodEnd).reduce((s, t) => s + t.amount, 0);
    const jeTotal = jePostingsFor(gl, periodEnd).reduce((s, p) => s + p.amount, 0);
    return txTotal + jeTotal;
  }

  function runReconciliation() {
    if (!form.gl || !form.statementBalance) { setError('Select the account and enter the statement balance.'); return; }
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

  function refreshReconciliation(r, ledgerBalanceOverride) {
    const ledgerBalance = ledgerBalanceOverride !== undefined ? ledgerBalanceOverride : ledgerBalanceFor(r.gl, r.periodEnd);
    const difference = Number((r.statementBalance - ledgerBalance).toFixed(2));
    const status = Math.abs(difference) < 0.01 ? 'PASS' : 'REVIEW';
    setReconciliations(prev => prev.map(x => x.id === r.id ? { ...x, ledgerBalance, difference, status } : x));
  }

  function openReview(id) { setReviewingId(id); setVerified([]); }
  function toggleVerified(id) {
    setVerified(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleVerifiedAll(periodTx) {
    const ids = periodTx.map(t => t.id);
    const allChecked = ids.length > 0 && ids.every(id => verified.includes(id));
    setVerified(allChecked ? verified.filter(id => !ids.includes(id)) : Array.from(new Set([...verified, ...ids])));
  }
  function editTxDate(id, date) { setTransactions(prev => prev.map(t => t.id === id ? { ...t, date } : t)); }
  function editTxAmount(id, amount) { setTransactions(prev => prev.map(t => t.id === id ? { ...t, amount: Number(amount) } : t)); }
  function editTxAccount(id, sourceGL) { setTransactions(prev => prev.map(t => t.id === id ? { ...t, sourceGL } : t)); }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Bank Reconciliation</h2>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
          Enter the real statement balance at period close. The system automatically compares it against the balance calculated from your transactions.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Account</label>
            <select value={form.gl} onChange={e => setForm(f => ({ ...f, gl: e.target.value }))}>
              <option value="">Select</option>
              {bankAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>As of</label>
            <input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Statement balance</label>
            <input type="number" step="0.01" style={{ width: 140 }} value={form.statementBalance} onChange={e => setForm(f => ({ ...f, statementBalance: e.target.value }))} />
          </div>
          <button onClick={runReconciliation} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Reconcile</button>
        </div>
        {error && <div style={{ color: '#B00020', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
      </Card>
      {selected.length > 0 && (
        <Card style={{ marginBottom: 20, borderColor: '#17365D' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.length} selected</span>
            <button onClick={deleteSelected} style={iconBtn}>Delete selected</button>
            <button onClick={() => setSelected([])} style={iconBtn}>Cancel selection</button>
          </div>
        </Card>
      )}
      <Card style={{ marginBottom: 20 }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>
              <input type="checkbox" checked={reconciliations.length > 0 && reconciliations.every(r => selected.includes(r.id))} onChange={toggleSelectAll} />
            </th>
            <th style={{ padding: '6px 4px' }}>Account</th><th style={{ padding: '6px 4px' }}>As of</th>
            <th style={{ padding: '6px 4px' }}>Statement</th><th style={{ padding: '6px 4px' }}>Book</th>
            <th style={{ padding: '6px 4px' }}>Difference</th><th style={{ padding: '6px 4px' }}>Status</th><th></th>
          </tr></thead>
          <tbody>
            {reconciliations.slice().reverse().map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #F0F1F3', background: selected.includes(r.id) ? '#F0F5FA' : 'transparent' }}>
                <td style={{ padding: '6px 4px' }}>
                  <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} />
                </td>
                <td style={{ padding: '6px 4px' }}>{r.gl} — {accounts.find(a => a.code === r.gl)?.name || ''}</td>
                <td style={{ padding: '6px 4px' }}>{r.periodEnd}</td>
                <td style={{ padding: '6px 4px' }}>{money(r.statementBalance)}</td>
                <td style={{ padding: '6px 4px' }}>{money(r.ledgerBalance)}</td>
                <td style={{ padding: '6px 4px' }}>{money(r.difference)}</td>
                <td style={{ padding: '6px 4px' }}><StatusBadge status={r.status === 'PASS' ? 'APPROVED' : 'REVIEW'} /></td>
                <td style={{ padding: '6px 4px', display: 'flex', gap: 6 }}>
                  {r.status !== 'PASS' && <button onClick={() => openReview(r.id)} style={iconBtn}>Review transactions</button>}
                  <button onClick={() => deleteOne(r.id)} style={iconBtn}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {reconciliations.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>No reconciliations yet.</div>}
      </Card>

      {reviewingId && (() => {
        const r = reconciliations.find(x => x.id === reviewingId);
        if (!r) return null;
        const periodTx = [
          ...transactions.filter(t => t.sourceGL === r.gl && t.date <= r.periodEnd),
          ...jePostingsFor(r.gl, r.periodEnd),
        ].sort((a, b) => a.date.localeCompare(b.date));
        const liveLedger = periodTx.filter(t => verified.includes(t.id)).reduce((s, t) => s + t.amount, 0);
        const liveDiff = Number((r.statementBalance - liveLedger).toFixed(2));
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <Card style={{ width: 820, maxHeight: '85vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 600 }}>{accounts.find(a => a.code === r.gl)?.name} — as of {r.periodEnd}</div>
                <button onClick={() => setReviewingId(null)} style={iconBtn}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', gap: 20, fontSize: 13, marginBottom: 12 }}>
                <span>Statement: <strong>{money(r.statementBalance)}</strong></span>
                <span>Book (verified only): <strong>{money(liveLedger)}</strong></span>
                <span style={{ color: Math.abs(liveDiff) < 0.01 ? '#0F6E56' : '#B00020', fontWeight: 600 }}>Difference: {money(liveDiff)}</span>
                <span style={{ color: '#6B7280' }}>{verified.length} of {periodTx.length} verified</span>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
                Check off each transaction that matches your bank statement exactly — only checked transactions count toward "Book" below. Edit the date, amount, or account on any that don't match, then check it once it's correct, and click Recalculate to save.
              </div>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
                  <th style={{ padding: '4px' }}>
                    <input type="checkbox" checked={periodTx.length > 0 && periodTx.every(t => verified.includes(t.id))} onChange={() => toggleVerifiedAll(periodTx)} />
                  </th>
                  <th style={{ padding: '4px' }}>Date</th><th style={{ padding: '4px' }}>Description</th>
                  <th style={{ padding: '4px' }}>Amount</th><th style={{ padding: '4px' }}>Account</th>
                </tr></thead>
                <tbody>
                  {periodTx.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #F0F1F3', background: verified.includes(t.id) ? '#EAF3DE' : 'transparent' }}>
                      <td style={{ padding: '4px' }}><input type="checkbox" checked={verified.includes(t.id)} onChange={() => toggleVerified(t.id)} /></td>
                      {t.isJE ? (
                        <>
                          <td style={{ padding: '4px' }}>{t.date}</td>
                          <td style={{ padding: '4px' }}>{t.description} <span style={{ fontSize: 10, color: '#6B7280' }}>(edit from Journal Entries tab)</span></td>
                          <td style={{ padding: '4px' }}>{money(t.amount)}</td>
                          <td style={{ padding: '4px', color: '#6B7280', fontSize: 12 }}>—</td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '4px' }}><input type="date" style={{ width: 130 }} value={t.date} onChange={e => editTxDate(t.id, e.target.value)} /></td>
                          <td style={{ padding: '4px' }}>{t.description}</td>
                          <td style={{ padding: '4px' }}><input type="number" step="0.01" style={{ width: 100 }} value={t.amount} onChange={e => editTxAmount(t.id, e.target.value)} /></td>
                          <td style={{ padding: '4px' }}>
                            <select value={t.sourceGL || ''} onChange={e => editTxAccount(t.id, e.target.value)}>
                              <option value="">—</option>
                              {bankAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                            </select>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {periodTx.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', padding: 8 }}>No transactions found for this account and period.</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => setReviewingId(null)} style={iconBtn}>Close</button>
                <button onClick={() => { refreshReconciliation(r, liveLedger); setReviewingId(null); }} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Recalculate</button>
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
