import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LayoutDashboard, Receipt, FileText, Users, BarChart3, Plus, Trash2, Check, Printer, X, AlertCircle, BookOpen, ListChecks, Landmark, Wallet } from 'lucide-react';
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

const TWELVE_LOGO_DATA_URI = 'data:image/png;base64,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';
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

function AccountSearchSelect({ value, onChange, accounts, emptyLabel, width }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const selected = accounts.find(a => a.code === value);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q ? accounts.filter(a => a.name.toLowerCase().includes(q) || a.code.includes(q)) : accounts;
  const grouped = ACCOUNT_TYPE_ORDER.map(t => ({ type: t, rows: filtered.filter(a => a.type === t) })).filter(g => g.rows.length);

  function pick(code) {
    onChange(code);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: width || '100%' }}>
      <input
        style={{ width: '100%', boxSizing: 'border-box' }}
        value={open ? query : (selected ? `${selected.code} — ${selected.name}` : (emptyLabel || ''))}
        placeholder="Type to search…"
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div style={{ position: 'absolute', zIndex: 60, top: '100%', left: 0, background: '#fff', border: '1px solid #E2E5E9', borderRadius: 6, maxHeight: 240, overflowY: 'auto', width: 280, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
          {emptyLabel && (
            <div onClick={() => pick('')} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 14, color: '#6B7280' }}>{emptyLabel}</div>
          )}
          {grouped.map(g => (
            <div key={g.type}>
              <div style={{ padding: '4px 10px', fontSize: 12, fontWeight: 700, color: '#6B7280', background: '#F7F8FA' }}>{ACCOUNT_TYPE_LABELS[g.type]}</div>
              {g.rows.map(a => (
                <div key={a.code} onClick={() => pick(a.code)} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 14 }}>{a.code} — {a.name}</div>
              ))}
            </div>
          ))}
          {grouped.length === 0 && <div style={{ padding: '8px 10px', fontSize: 13, color: '#6B7280' }}>No matches</div>}
        </div>
      )}
    </div>
  );
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

function CustomerSearchSelect({ value, onChange, customers }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const q = (value || '').trim().toLowerCase();
  const filtered = q ? customers.filter(c => c.name.toLowerCase().includes(q)) : customers;

  function pick(name) {
    onChange(name);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <input
        style={{ width: '100%', boxSizing: 'border-box' }}
        value={value}
        placeholder="Customer name"
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
      />
      {open && (
        <div style={{ position: 'absolute', zIndex: 60, top: '100%', left: 0, background: '#fff', border: '1px solid #E2E5E9', borderRadius: 6, maxHeight: 240, overflowY: 'auto', width: '100%', boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
          {filtered.map(c => (
            <div key={c.id} onClick={() => pick(c.name)} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 14 }}>{c.name}</div>
          ))}
          {customers.length === 0 && <div style={{ padding: '8px 10px', fontSize: 13, color: '#6B7280' }}>No customers added yet in the Customers tab — this will be saved as a new name.</div>}
          {customers.length > 0 && filtered.length === 0 && <div style={{ padding: '8px 10px', fontSize: 13, color: '#6B7280' }}>No existing customer matches — this will be saved as a new name.</div>}
        </div>
      )}
    </div>
  );
}

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

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function diffSyncByKey(table, key, prevArr, nextArr, clientId) {
  const prevMap = new Map(prevArr.map(x => [x[key], x]));
  const nextMap = new Map(nextArr.map(x => [x[key], x]));
  const toDelete = prevArr.filter(x => !nextMap.has(x[key])).map(x => x[key]);
  const toInsert = nextArr.filter(x => !prevMap.has(x[key])).map(x => ({ ...x, client_id: clientId }));
  const toUpdate = nextArr.filter(x => prevMap.has(x[key]) && JSON.stringify(prevMap.get(x[key])) !== JSON.stringify(x));
  if (toDelete.length) {
    chunk(toDelete, 200).forEach(batch => {
      supabase.from(table).delete().in(key, batch).then(({ error }) => error && console.error(table, 'delete', error));
    });
  }
  if (toInsert.length) {
    chunk(toInsert, 200).forEach(batch => {
      supabase.from(table).insert(batch).then(({ error }) => error && console.error(table, 'insert', error));
    });
  }
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
  const [addClientBusy, setAddClientBusy] = useState(false);

  async function addClient(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    setAddClientBusy(true);
    try {
      const { data, error } = await supabase.from('clients').insert({ name: trimmed }).select().single();
      if (error) { alert('Could not create the client: ' + error.message); return; }
      await supabase.rpc('sync_chart_of_accounts_from_tbs');
      setClients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      window.localStorage.setItem('tbs_last_client_id', data.id);
      setSelectedClientId(data.id);
    } finally {
      setAddClientBusy(false);
    }
  }

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
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block', marginBottom: 4 }}>Email</label>
            <input type="email" required style={{ width: '100%', marginBottom: 10 }} value={authForm.email} onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))} />
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block', marginBottom: 4 }}>Password</label>
            <input type="password" required style={{ width: '100%', marginBottom: 16 }} value={authForm.password} onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))} />
            {authError && <div style={{ color: '#B00020', fontSize: 13, marginBottom: 10 }}>{authError}</div>}
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
      onAddClient={addClient}
      addClientBusy={addClientBusy}
      onLogout={handleLogout}
      userEmail={session.user.email}
    />
  );
}

function Workspace({ clientId, isStaff, clients, selectedClientId, onSwitchClient, onAddClient, addClientBusy, onLogout, userEmail }) {
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
  const [employees, setEmployeesRaw] = useState([]);
  const [payrollRuns, setPayrollRunsRaw] = useState([]);
  const [payrollLines, setPayrollLinesRaw] = useState([]);
  const [businessName, setBusinessName] = useState('');
  const [reconcilingReviewId, setReconcilingReviewId] = useState(null);
  const [reconcilingVerified, setReconcilingVerified] = useState([]);
  const [printInvoice, setPrintInvoice] = useState(null);
  const [statementClient, setStatementClient] = useState(null);

async function fetchAllRows(table, clientId, orderCol) {
  const pageSize = 1000;
  let allRows = [];
  let page = 0;
  while (true) {
    let q = supabase.from(table).select('*').eq('client_id', clientId);
    if (orderCol) q = q.order(orderCol);
    q = q.range(page * pageSize, page * pageSize + pageSize - 1);
    const { data, error } = await q;
    if (error) return { data: null, error };
    allRows = allRows.concat(data || []);
    if (!data || data.length < pageSize) break;
    page++;
  }
  return { data: allRows, error: null };
}

  useEffect(() => {
    (async () => {
      const results = await Promise.all([
        fetchAllRows('transactions', clientId, 'date'),
        fetchAllRows('invoices', clientId, 'date'),
        supabase.from('customers').select('*').eq('client_id', clientId),
        supabase.from('accounts').select('*').eq('client_id', clientId).order('code'),
        supabase.from('rules').select('*').eq('client_id', clientId),
        fetchAllRows('journal_entries', clientId, 'date'),
        supabase.from('reconciliations').select('*').eq('client_id', clientId).order('period_end'),
        supabase.from('dismissed_suggestions').select('*').eq('client_id', clientId),
        supabase.from('clients').select('name').eq('id', clientId).single(),
        supabase.from('employees').select('*').eq('client_id', clientId).order('name'),
        supabase.from('payroll_runs').select('*').eq('client_id', clientId).order('period_end'),
        fetchAllRows('payroll_lines', clientId),
      ]);
      const [t, i, c, a, r, j, rec, ds, cl, emp, pr, pl] = results;
      const firstErr = [t, i, c, a, r, j, rec, ds, emp, pr, pl].find(x => x.error);
      if (firstErr) {
        setLoadError(firstErr.error.message);
      } else {
        setTransactionsRaw((t.data || []).map(row => ({ ...row, amount: Number(row.amount), sourceGL: row.source_gl })));
        setInvoicesRaw((i.data || []).map(row => ({ ...row, retentionPct: row.retention_pct, paid: Number(row.paid) || 0 })));
        setCustomersRaw(c.data || []);
        setAccountsRaw((a.data || []).map(row => ({ ...row, isCogs: !!row.is_cogs })));
        setRulesRaw(r.data || []);
        setJournalEntriesRaw(j.data || []);
        setReconciliationsRaw((rec.data || []).map(row => ({ ...row, statementBalance: Number(row.statement_balance), ledgerBalance: Number(row.ledger_balance), difference: Number(row.difference), periodEnd: row.period_end, verifiedIds: row.verified_ids || [] })));
        setDismissedSuggestionsRaw((ds.data || []).map(row => row.suggestion_key));
        setBusinessName(cl?.data?.name || 'Business');
        setEmployeesRaw((emp.data || []).map(row => ({ ...row, rate: Number(row.rate), payType: row.pay_type, active: row.active !== false })));
        setPayrollRunsRaw((pr.data || []).map(row => ({ ...row, periodStart: row.period_start, periodEnd: row.period_end, payDate: row.pay_date, postedJeId: row.posted_je_id || null })));
        setPayrollLinesRaw((pl.data || []).map(row => ({
          ...row, payrollRunId: row.payroll_run_id, employeeId: row.employee_id,
          hours: row.hours === null ? '' : Number(row.hours), extraGross: Number(row.extra_gross) || 0,
          gross: Number(row.gross), federalIncomeTax: Number(row.federal_income_tax) || 0,
          prIncomeTax: Number(row.pr_income_tax) || 0, socialSecurity: Number(row.social_security) || 0,
          medicare: Number(row.medicare) || 0, sinot: Number(row.sinot) || 0,
          otherDeductions: Number(row.other_deductions) || 0, otherDeductionsDesc: row.other_deductions_desc || '',
          reimbursement: Number(row.reimbursement) || 0,
        })));
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
    let pendingWrites = [];
    setAccountsRaw(prev => {
      let next = typeof updater === 'function' ? updater(prev) : updater;
      next = next.slice().sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      // ojo: "code" se repite entre clientes (cada cliente tiene su propio 6050, etc.), así que
      // cada operación debe ir siempre acompañada de client_id — nunca solo por code.
      const prevMap = new Map(prev.map(x => [x.code, x]));
      const nextMap = new Map(next.map(x => [x.code, x]));
      const toDelete = prev.filter(x => !nextMap.has(x.code)).map(x => x.code);
      const toInsert = next.filter(x => !prevMap.has(x.code)).map(x => ({ code: x.code, name: x.name, type: x.type, is_cogs: x.isCogs || false, client_id: clientId }));
      const toUpdate = next.filter(x => prevMap.has(x.code) && JSON.stringify(prevMap.get(x.code)) !== JSON.stringify(x));
      if (toDelete.length) pendingWrites.push(supabase.from('accounts').delete().eq('client_id', clientId).in('code', toDelete));
      if (toInsert.length) pendingWrites.push(supabase.from('accounts').insert(toInsert));
      toUpdate.forEach(row => {
        pendingWrites.push(supabase.from('accounts').update({ name: row.name, type: row.type, is_cogs: row.isCogs || false }).eq('client_id', clientId).eq('code', row.code));
      });
      return next;
    });
    // solo Twelve es el maestro: si algo cambió ahí, espera a que se guarde y sincroniza sola a todos los demás
    if (pendingWrites.length && businessName === 'Twelve Business Strategies') {
      Promise.all(pendingWrites).then(results => {
        const err = results.find(r => r.error);
        if (err) { console.error('accounts write', err.error); return; }
        supabase.rpc('sync_chart_of_accounts_from_tbs').then(({ error }) => error && console.error('auto-sync', error));
      });
    } else if (pendingWrites.length) {
      pendingWrites.forEach(p => p.then(({ error }) => error && console.error('accounts write', error)));
    }
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
      const forDb = next.map(r => ({ id: r.id, gl: r.gl, period_end: r.periodEnd, statement_balance: r.statementBalance, ledger_balance: r.ledgerBalance, difference: r.difference, status: r.status, verified_ids: r.verifiedIds || [] }));
      const prevForDb = prev.map(r => ({ id: r.id, gl: r.gl, period_end: r.periodEnd, statement_balance: r.statementBalance, ledger_balance: r.ledgerBalance, difference: r.difference, status: r.status, verified_ids: r.verifiedIds || [] }));
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

  const setEmployees = useCallback((updater) => {
    setEmployeesRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const toDb = arr => arr.map(e => ({ id: e.id, name: e.name, pay_type: e.payType, rate: e.rate, active: e.active !== false }));
      diffSync('employees', toDb(prev), toDb(next), clientId);
      return next;
    });
  }, []);
  const setPayrollRuns = useCallback((updater) => {
    setPayrollRunsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const toDb = arr => arr.map(r => ({ id: r.id, period_start: r.periodStart, period_end: r.periodEnd, pay_date: r.payDate, status: r.status, posted_je_id: r.postedJeId || null }));
      diffSync('payroll_runs', toDb(prev), toDb(next), clientId);
      return next;
    });
  }, []);
  const setPayrollLines = useCallback((updater) => {
    setPayrollLinesRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const toDb = arr => arr.map(l => ({
        id: l.id, payroll_run_id: l.payrollRunId, employee_id: l.employeeId,
        hours: l.hours === '' ? null : Number(l.hours), extra_gross: Number(l.extraGross) || 0,
        gross: Number(l.gross), federal_income_tax: Number(l.federalIncomeTax) || 0,
        pr_income_tax: Number(l.prIncomeTax) || 0, social_security: Number(l.socialSecurity) || 0,
        medicare: Number(l.medicare) || 0, sinot: Number(l.sinot) || 0,
        other_deductions: Number(l.otherDeductions) || 0, other_deductions_desc: l.otherDeductionsDesc || '',
        reimbursement: Number(l.reimbursement) || 0,
      }));
      diffSync('payroll_lines', toDb(prev), toDb(next), clientId);
      return next;
    });
  }, []);

  const glName = (code) => accounts.find(g => g.code === code)?.name || 'Uncategorized';

  const summary = useMemo(() => {
    const month = todayStr().slice(0, 7);
    const year = todayStr().slice(0, 4);
    const revenueMTD = invoices.filter(i => i.date.slice(0, 7) === month)
      .reduce((s, i) => s + invoiceTotal(i), 0);
    const invoiceRevenueYTD = invoices.filter(i => i.date.slice(0, 4) === year)
      .reduce((s, i) => s + invoiceTotal(i), 0);
    const txRevenueYTD = transactions.filter(t => t.date.slice(0, 4) === year).reduce((s, t) => {
      const acct = accounts.find(a => a.code === t.gl);
      return acct?.type === 'Revenue' ? s + Math.abs(t.amount) : s;
    }, 0);
    const salesYTD = invoiceRevenueYTD + txRevenueYTD;
    const arOpen = invoices.filter(i => i.status !== 'Paid')
      .reduce((s, i) => s + invoiceTotal(i) - (i.paid || 0), 0);
    const cash = transactions.reduce((s, t) => s + (t.gl === '1010' ? t.amount : 0), 0);
    const review = transactions.filter(t => t.status === 'REVIEW').length;
    return { revenueMTD, salesYTD, arOpen, cash, review };
  }, [transactions, invoices, accounts]);

  function invoiceSubtotal(inv) {
    return inv.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  }
  function invoiceTotal(inv) {
    const sub = invoiceSubtotal(inv);
    const ret = inv.retention ? sub * (Number(inv.retentionPct) || 0) / 100 : 0;
    return sub - ret;
  }

  return (
    <div style={{ display: 'flex', minHeight: '640px', fontFamily: 'system-ui, sans-serif', background: '#F4F6F8', color: '#1F2933' }}>
      <Sidebar tab={tab} setTab={setTab} reviewCount={summary.review} isStaff={isStaff} clients={clients}
        selectedClientId={selectedClientId} onSwitchClient={onSwitchClient} onAddClient={onAddClient} addClientBusy={addClientBusy} onLogout={onLogout} userEmail={userEmail} businessName={businessName} />
      <div style={{ flex: 1, padding: '24px 28px', overflow: 'auto' }}>
        {loadError && (
          <div style={{ background: '#FCEBEB', color: '#791F1F', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            Could not connect to the database: {loadError}. Check your .env file (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
          </div>
        )}
        {!loaded ? (
          <div style={{ fontSize: 14, color: '#6B7280' }}>Loading data...</div>
        ) : (
        <>
        {tab === 'dashboard' && <Dashboard summary={summary} transactions={transactions} invoices={invoices} accounts={accounts} invoiceTotal={invoiceTotal} />}
        {tab === 'transactions' && (
          <TransactionsView
            transactions={transactions} setTransactions={setTransactions} rules={rules} setRules={setRules} glName={glName} accounts={accounts}
            invoices={invoices} setInvoices={setInvoices} invoiceTotal={invoiceTotal}
            dismissedSuggestions={dismissedSuggestions} setDismissedSuggestions={setDismissedSuggestions}
            journalEntries={journalEntries} reconciliations={reconciliations} setReconciliations={setReconciliations}
            pendingReviewIds={reconcilingVerified} setReconcilingVerified={setReconcilingVerified}
          />
        )}
        {tab === 'invoices' && (
          <InvoicesView
            invoiceSubtotal={invoiceSubtotal}
            invoices={invoices} setInvoices={setInvoices} customers={customers}
            invoiceTotal={invoiceTotal} onPrint={setPrintInvoice} businessName={businessName}
          />
        )}
        {tab === 'customers' && (
          <CustomersView customers={customers} setCustomers={setCustomers} invoices={invoices} setInvoices={setInvoices} invoiceTotal={invoiceTotal} invoiceSubtotal={invoiceSubtotal} onPrintStatement={setStatementClient} />
        )}
        {tab === 'reports' && <ReportsView transactions={transactions} invoices={invoices} glName={glName} invoiceTotal={invoiceTotal} accounts={accounts} journalEntries={journalEntries} businessName={businessName} reconciliations={reconciliations} />}
        {tab === 'accounts' && <ChartOfAccountsView accounts={accounts} setAccounts={setAccounts} isMaster={businessName === 'Twelve Business Strategies'} />}
        {tab === 'rules' && <RulesView rules={rules} setRules={setRules} accounts={accounts} />}
        {tab === 'journal' && <JournalEntriesView journalEntries={journalEntries} setJournalEntries={setJournalEntries} accounts={accounts} />}
        {tab === 'reconciliation' && <ReconciliationView reconciliations={reconciliations} setReconciliations={setReconciliations} transactions={transactions} setTransactions={setTransactions} accounts={accounts} journalEntries={journalEntries}
          reviewingId={reconcilingReviewId} setReviewingId={setReconcilingReviewId} verified={reconcilingVerified} setVerified={setReconcilingVerified} />}
        {tab === 'payroll' && <PayrollView employees={employees} setEmployees={setEmployees} payrollRuns={payrollRuns} setPayrollRuns={setPayrollRuns}
          payrollLines={payrollLines} setPayrollLines={setPayrollLines} businessName={businessName} accounts={accounts}
          journalEntries={journalEntries} setJournalEntries={setJournalEntries} />}
        </>
        )}
      </div>
      {printInvoice && <InvoicePrintModal inv={printInvoice} total={invoiceTotal(printInvoice)} onClose={() => setPrintInvoice(null)} businessName={businessName} />}
      {statementClient && <CustomerStatementModal client={statementClient} invoices={invoices} invoiceTotal={invoiceTotal} invoiceSubtotal={invoiceSubtotal} onClose={() => setStatementClient(null)} businessName={businessName} />}
    </div>
  );
}

function Sidebar({ tab, setTab, reviewCount, isStaff, clients, selectedClientId, onSwitchClient, onAddClient, addClientBusy, onLogout, userEmail, businessName }) {
  const [addingClient, setAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  function submitNewClient() {
    if (!newClientName.trim()) return;
    onAddClient(newClientName);
    setNewClientName('');
    setAddingClient(false);
  }
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
    { id: 'payroll', label: 'Payroll', icon: Wallet },
  ];
  return (
    <div style={{ width: 210, background: '#17365D', color: '#fff', padding: '20px 12px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontWeight: 700, fontSize: 16, padding: '0 10px 12px' }}>{businessName || 'Accounting'}</div>
      {isStaff && (
        <>
          <select value={selectedClientId} onChange={e => onSwitchClient(e.target.value)}
            style={{ margin: '0 10px 8px', fontSize: 13, borderRadius: 6, border: 'none', padding: '6px 8px' }}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!addingClient ? (
            <button onClick={() => setAddingClient(true)} style={{ margin: '0 10px 16px', display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#fff', border: '1px dashed rgba(255,255,255,0.4)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12 }}>
              <Plus size={13} /> New client
            </button>
          ) : (
            <div style={{ margin: '0 10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input autoFocus placeholder="Client name" value={newClientName} onChange={e => setNewClientName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitNewClient(); if (e.key === 'Escape') { setAddingClient(false); setNewClientName(''); } }}
                style={{ fontSize: 13, borderRadius: 6, border: 'none', padding: '6px 8px' }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={submitNewClient} disabled={addClientBusy} style={{ flex: 1, background: '#0F6E56', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12 }}>
                  {addClientBusy ? 'Creating…' : 'Create'}
                </button>
                <button onClick={() => { setAddingClient(false); setNewClientName(''); }} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              </div>
            </div>
          )}
        </>
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
              <span style={{ background: '#E24B4A', color: '#fff', fontSize: 12, borderRadius: 10, padding: '1px 7px' }}>
                {it.badge}
              </span>
            )}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 10, fontSize: 13 }}>
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
    { label: 'Total Sales (YTD)', value: money(summary.salesYTD) },
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {cards.map(c => (
          <Card key={c.label}>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{c.value}</div>
          </Card>
        ))}
      </div>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Recent activity</div>
        {transactions.slice(-5).reverse().map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', borderBottom: '1px solid #F0F1F3' }}>
            <span>{t.date} — {t.description}</span>
            <span>{money(t.amount)}</span>
          </div>
        ))}
        {transactions.length === 0 && <div style={{ fontSize: 14, color: '#6B7280' }}>No transactions yet. Go to the Transactions tab to add one.</div>}
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
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
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
        {byMonth.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>Add transactions and invoices to see the trend.</div>}
      </Card>
    </div>
  );
}

function TransactionsView({ transactions, setTransactions, rules, setRules, glName, accounts, invoices, setInvoices, invoiceTotal, dismissedSuggestions, setDismissedSuggestions, journalEntries, reconciliations, setReconciliations, pendingReviewIds, setReconcilingVerified }) {
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
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', gl: '', sourceGL: '', status: '', amount: '', reconciled: '', sign: '' });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState([]);
  const [bulkGL, setBulkGL] = useState(null);
  const [bulkSourceGL, setBulkSourceGL] = useState('');

  const reconciledIds = useMemo(() => {
    const set = new Set();
    (reconciliations || []).filter(r => r.status === 'PASS').forEach(r => (r.verifiedIds || []).forEach(id => set.add(id)));
    return set;
  }, [reconciliations]);

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
      if (filters.amount.trim() && Math.abs(abs - Number(filters.amount)) > 0.005) return false;
      if (filters.sign === 'positive' && t.amount < 0) return false;
      if (filters.sign === 'negative' && t.amount >= 0) return false;
      if (filters.reconciled) {
        const isReconciled = reconciledIds.has(t.id);
        const isPending = (pendingReviewIds || []).includes(t.id);
        if (filters.reconciled === 'reconciled' && !isReconciled) return false;
        if (filters.reconciled === 'pending' && !isPending) return false;
        if (filters.reconciled === 'none' && (isReconciled || isPending)) return false;
      }
      if (search.trim() && !t.description.toUpperCase().includes(search.trim().toUpperCase())) return false;
      return true;
    });
  }, [transactions, filters, search, reconciledIds, pendingReviewIds]);
  const filtersActive = filters.dateFrom || filters.dateTo || filters.gl || filters.sourceGL || filters.status || filters.amount.trim() || filters.reconciled || filters.sign || search.trim();

  const quickPeriods = useMemo(() => {
    const months = new Set();
    const years = new Set();
    transactions.forEach(t => {
      months.add(t.date.slice(0, 7));
      years.add(t.date.slice(0, 4));
    });
    const monthOpts = Array.from(months).sort().reverse().map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const from = `${m}-01`;
      const to = formatLocalDate2(new Date(Number(y), Number(mo), 0));
      return { value: `m:${m}`, label, from, to };
    });
    const yearOpts = Array.from(years).sort().reverse().map(y => ({ value: `y:${y}`, label: y, from: `${y}-01-01`, to: `${y}-12-31` }));
    return { monthOpts, yearOpts };
  }, [transactions]);
  function formatLocalDate2(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function applyQuickPeriod(value) {
    if (!value) return;
    const opt = [...quickPeriods.yearOpts, ...quickPeriods.monthOpts].find(o => o.value === value);
    if (opt) setFilters(f => ({ ...f, dateFrom: opt.from, dateTo: opt.to }));
  }

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
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(combinedRows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const reversed = combinedRows.slice().reverse();
    const start = (page - 1) * PAGE_SIZE;
    return reversed.slice(start, start + PAGE_SIZE);
  }, [combinedRows, page]);
  useEffect(() => { setPage(1); }, [filters, search]);
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
    if (bulkGL === null || selected.length === 0) return;
    const status = bulkGL === '' ? 'REVIEW' : 'AUTO';
    setTransactions(prev => prev.map(t => selected.includes(t.id) ? { ...t, gl: bulkGL, status } : t));
    setSelected([]);
    setBulkGL(null);
  }
  function deleteSelected() {
    const reconciledSelected = selected.filter(id => reconciledIds.has(id));
    if (reconciledSelected.length > 0) {
      alert(`${reconciledSelected.length} of the selected transactions are part of an approved reconciliation and can't be deleted. Go to Reconciliation, reopen that period, and reset its approval first — then try again.`);
      return;
    }
    if (!window.confirm(`Delete ${selected.length} transaction${selected.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
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
  function createSelectedSuggestions() {
    const toCreate = ruleSuggestions.filter(s => selectedSuggestions.includes(s.key + '|' + s.gl));
    setRules(prev => [...prev, ...toCreate.map(s => ({ id: uid(), keyword: s.key, gl: s.gl, mode: 'AUTO' }))]);
    setDismissedSuggestions(prev => [...prev, ...toCreate.map(s => s.key + '|' + s.gl)]);
    setSelectedSuggestions([]);
  }
  function dismissSelectedSuggestions() {
    setDismissedSuggestions(prev => [...prev, ...selectedSuggestions]);
    setSelectedSuggestions([]);
  }
  function toggleSuggestion(id) {
    setSelectedSuggestions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleSuggestionAll() {
    const ids = ruleSuggestions.map(s => s.key + '|' + s.gl);
    const allSelected = ids.length > 0 && ids.every(id => selectedSuggestions.includes(id));
    setSelectedSuggestions(allSelected ? [] : ids);
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
  function updateDate(id, date) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, date } : t));
  }
  function updateDescription(id, description) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, description } : t));
  }
  function updateAmount(id, amount) {
    if (amount === '' || isNaN(Number(amount))) return;
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, amount: Number(amount) } : t));
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
  function exportFilteredCSV() {
    let csv = 'Date,Description,Amount,Category,Account,Status\n';
    const escape = v => `"${String(v).replace(/"/g, '""')}"`;
    filteredTransactions.forEach(t => {
      csv += [t.date, escape(t.description), t.amount.toFixed(2), escape(glName(t.gl) || 'Uncategorized'), escape(glName(t.sourceGL) || ''), t.status].join(',') + '\n';
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const glSuffix = filters.gl && !filters.gl.startsWith('__uncat') ? `_${filters.gl}` : '';
    a.href = url; a.download = `transactions${glSuffix}_${todayStr()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  function removeRow(id) {
    if (reconciledIds.has(id)) {
      alert("This transaction is part of an approved reconciliation and can't be deleted. Go to Reconciliation, reopen that period, and reset its approval first — then try again.");
      return;
    }
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  function openSplit(t) {
    if (reconciledIds.has(t.id) || (pendingReviewIds || []).includes(t.id)) {
      if (!window.confirm("This transaction is already marked in a reconciliation (approved or in review). Splitting it will carry that verified mark over to the new split lines automatically, so the reconciled total stays correct. Continue?")) return;
    }
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
      amount: Number(l.amount), gl: l.gl, sourceGL: original.sourceGL, status: 'AUTO',
    }));
    const newIds = newRows.map(r => r.id);
    setTransactions(prev => [...prev.filter(t => t.id !== splittingId), ...newRows]);
    // Si la transacción original ya estaba marcada en alguna reconciliación (aprobada o en revisión),
    // las filas nuevas heredan esa marca en su lugar, para que el total siga cuadrando sin rehacer nada.
    if (reconciledIds.has(splittingId) || (pendingReviewIds || []).includes(splittingId)) {
      setReconciliations(prev => prev.map(r => {
        if (!r.verifiedIds || !r.verifiedIds.includes(splittingId)) return r;
        return { ...r, verifiedIds: [...r.verifiedIds.filter(id => id !== splittingId), ...newIds] };
      }));
      if ((pendingReviewIds || []).includes(splittingId) && setReconcilingVerified) {
        setReconcilingVerified(prev => [...prev.filter(id => id !== splittingId), ...newIds]);
      }
    }
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportFilteredCSV} style={{ ...iconBtn, padding: '8px 14px' }}>Export CSV ({filteredTransactions.length})</button>
          <button onClick={() => setShowImport(s => !s)} style={{ ...iconBtn, padding: '8px 14px' }}>Import bank CSV</button>
        </div>
      </div>

      {showImport && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6 }}>
            Paste the CSV content: one row per line, format <code>date,description,amount</code> (negative amount = outflow, positive = inflow) —
            or <code>date,description,category,amount</code> (Wave export).
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" checked={importSource === 'bank'} onChange={() => setImportSource('bank')} /> Bank (expenses negative)
            </label>
            <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
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
          <textarea rows={6} style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
            placeholder={'2026-09-05,RESTAURANTE GUSTO SEVILLA,-45.20\n2026-09-06,EFT DEPOSIT CLIENTE ABC,850.00'}
            value={csvText} onChange={e => setCsvText(e.target.value)} />
          {importError && <div style={{ color: '#B00020', fontSize: 13, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{importError}</div>}
          <div style={{ marginTop: 8 }}>
            <button onClick={importCSV} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Import and categorize</button>
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Description</label>
            <input style={{ width: '100%' }} placeholder="E.g. RESTAURANT GUSTO SEVILLA" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Amount</label>
            <input type="number" step="0.01" style={{ width: 120 }} placeholder="0.00" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Account (bank/card)</label>
            <select value={form.sourceGL} onChange={e => setForm(f => ({ ...f, sourceGL: e.target.value }))}>
              <option value="">—</option>
              <AccountOptions accounts={accounts.filter(a => a.type === 'Asset' || a.type === 'Liability')} />
            </select>
          </div>
          <button onClick={addTransaction} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
            <Plus size={15} /> Add
          </button>
        </div>
        {error && <div style={{ color: '#B00020', fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Search description</label>
            <input style={{ width: '100%' }} placeholder="E.g. STARBUCKS, UTILITIES..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Period</label>
            <select onChange={e => applyQuickPeriod(e.target.value)} defaultValue="">
              <option value="">Custom range...</option>
              <optgroup label="Years">
                {quickPeriods.yearOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
              <optgroup label="Months">
                {quickPeriods.monthOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
            </select>
          </div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>From</label>
            <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} /></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>To</label>
            <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} /></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Category</label>
            <select value={filters.gl} onChange={e => setFilters(f => ({ ...f, gl: e.target.value }))}>
              <option value="">All</option>
              <option value="__uncat__">Uncategorized (all)</option>
              <option value="__uncat_income__">Uncategorized Income</option>
              <option value="__uncat_expense__">Uncategorized Expenses</option>
              <AccountOptions accounts={accounts} />
            </select></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Account</label>
            <select value={filters.sourceGL} onChange={e => setFilters(f => ({ ...f, sourceGL: e.target.value }))}>
              <option value="">All</option>
              <option value="__unassigned__">Unassigned</option>
              <AccountOptions accounts={accounts.filter(a => a.type === 'Asset' || a.type === 'Liability')} />
            </select></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Status</label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All</option>
              <option value="AUTO">AUTO</option>
              <option value="MATCH">MATCH</option>
              <option value="REVIEW">REVIEW</option>
            </select></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Amount</label>
            <input type="number" step="0.01" placeholder="e.g. 397.02" style={{ width: 120 }} value={filters.amount} onChange={e => setFilters(f => ({ ...f, amount: e.target.value }))} /></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Reconciled</label>
            <select value={filters.reconciled} onChange={e => setFilters(f => ({ ...f, reconciled: e.target.value }))}>
              <option value="">All</option>
              <option value="reconciled">Reconciled</option>
              <option value="pending">Marked (pending)</option>
              <option value="none">Not marked</option>
            </select></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Sign</label>
            <select value={filters.sign} onChange={e => setFilters(f => ({ ...f, sign: e.target.value }))}>
              <option value="">All</option>
              <option value="positive">Positive only</option>
              <option value="negative">Negative only</option>
            </select></div>
          {filtersActive && (
            <button onClick={() => { setFilters({ dateFrom: '', dateTo: '', gl: '', sourceGL: '', status: '', amount: '', reconciled: '', sign: '' }); setSearch(''); }} style={iconBtn}>Clear filters</button>
          )}
        </div>
        {filtersActive && <div style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>{filteredTransactions.length} of {transactions.length} transactions</div>}
      </Card>

      {ruleSuggestions.length > 0 && (
        <Card style={{ marginBottom: 20, borderColor: '#B7E4C7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>Rule suggestions ({ruleSuggestions.length})</div>
            {selectedSuggestions.length > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#6B7280', alignSelf: 'center' }}>{selectedSuggestions.length} selected</span>
                <button onClick={createSelectedSuggestions} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>Create selected</button>
                <button onClick={dismissSelectedSuggestions} style={iconBtn}>Dismiss selected</button>
              </div>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>
            These patterns repeated 4 or more times with the same category. Create the rule so similar future transactions get categorized automatically.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #E2E5E9', fontSize: 13, color: '#6B7280' }}>
            <input type="checkbox" checked={ruleSuggestions.length > 0 && ruleSuggestions.every(s => selectedSuggestions.includes(s.key + '|' + s.gl))} onChange={toggleSuggestionAll} style={{ marginRight: 8 }} />
            Select all
          </div>
          {ruleSuggestions.map(s => {
            const id = s.key + '|' + s.gl;
            return (
              <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F0F1F3', fontSize: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={selectedSuggestions.includes(id)} onChange={() => toggleSuggestion(id)} />
                  "{s.key}" → {s.gl} — {glName(s.gl)} <span style={{ color: '#6B7280' }}>({s.count} times)</span>
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => createRuleFromSuggestion(s)} style={iconBtn}>Create rule</button>
                  <button onClick={() => dismissSuggestion(s)} style={iconBtn}><X size={14} /></button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {selected.length > 0 && (
        <Card style={{ marginBottom: 20, borderColor: '#17365D' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{selected.length} selected</span>
            <div style={{ width: 220 }}>
              <AccountSearchSelect value={bulkGL === null ? '' : bulkGL} onChange={v => setBulkGL(v)} accounts={accounts} emptyLabel="Uncategorized" />
            </div>
            <button onClick={applyBulkCategory} disabled={bulkGL === null} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Apply category</button>
            <div style={{ width: 220 }}>
              <AccountSearchSelect value={bulkSourceGL} onChange={setBulkSourceGL} accounts={accounts.filter(a => a.type === 'Asset' || a.type === 'Liability')} emptyLabel="Choose account..." />
            </div>
            <button onClick={applyBulkAccount} disabled={!bulkSourceGL} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Set account</button>
            <button onClick={deleteSelected} style={iconBtn}>Delete selected</button>
            <button onClick={() => setSelected([])} style={iconBtn}>Cancel selection</button>
          </div>
        </Card>
      )}

      <Card>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
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
              <th style={{ padding: '6px 4px' }}>Reconciled</th>
              <th style={{ padding: '6px 4px' }}></th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map(t => t.isJE ? (
              <tr key={t.id} style={{ borderBottom: '1px solid #F0F1F3', background: '#FAF7FF' }}>
                <td style={{ padding: '6px 4px' }}></td>
                <td style={{ padding: '6px 4px' }}>{t.date}</td>
                <td style={{ padding: '6px 4px' }}>{t.description} <span style={{ fontSize: 11, color: '#6B7280' }}>(edit from Journal Entries tab)</span></td>
                <td style={{ padding: '6px 4px' }}>{money(t.amount)}</td>
                <td style={{ padding: '6px 4px', fontSize: 13, color: '#6B7280' }}>—</td>
                <td style={{ padding: '6px 4px', fontSize: 13, color: '#6B7280' }}>{glName(t.gl)}</td>
                <td style={{ padding: '6px 4px' }}><StatusBadge status="JOURNAL ENTRY" /></td>
                <td style={{ padding: '6px 4px', fontSize: 13, color: '#6B7280' }}>—</td>
                <td style={{ padding: '6px 4px' }}></td>
              </tr>
            ) : (
              <tr key={t.id} style={{ borderBottom: '1px solid #F0F1F3', background: selected.includes(t.id) ? '#F0F5FA' : 'transparent' }}>
                <td style={{ padding: '6px 4px' }}>
                  <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggleSelect(t.id)} />
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <input type="date" style={{ width: 130 }} value={t.date} onChange={e => updateDate(t.id, e.target.value)} />
                </td>
                <td style={{ padding: '6px 4px', minWidth: 200 }}>
                  <input type="text" style={{ width: '100%', boxSizing: 'border-box' }} value={t.description} onChange={e => updateDescription(t.id, e.target.value)} />
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <input type="number" step="0.01" style={{ width: 100 }} defaultValue={t.amount} key={t.id + '-' + t.amount} onBlur={e => updateAmount(t.id, e.target.value)} />
                </td>
                <td style={{ padding: '6px 4px', minWidth: 160 }}>
                  <AccountSearchSelect value={t.sourceGL || ''} onChange={gl => updateSourceGL(t.id, gl)}
                    accounts={accounts.filter(a => a.type === 'Asset' || a.type === 'Liability')} emptyLabel="—" />
                </td>
                <td style={{ padding: '6px 4px', minWidth: 200 }}>
                  <AccountSearchSelect value={t.gl} onChange={gl => updateGL(t.id, gl)}
                    accounts={accounts} emptyLabel="Uncategorized" />
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <StatusBadge status={t.status} />
                </td>
                <td style={{ padding: '6px 4px' }}>
                  {reconciledIds.has(t.id)
                    ? <span style={{ color: '#0F6E56', fontWeight: 600, fontSize: 13 }}>✓ Reconciled</span>
                    : (pendingReviewIds || []).includes(t.id)
                      ? <span style={{ color: '#0C447C', fontWeight: 600, fontSize: 13 }}>Marked (pending)</span>
                      : <span style={{ color: '#6B7280', fontSize: 13 }}>—</span>}
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
        {combinedRows.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>{transactions.length === 0 ? 'No transactions yet. Add the first one above.' : 'No transactions match these filters.'}</div>}
        {combinedRows.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 14 }}>
            <span style={{ color: '#6B7280' }}>{combinedRows.length} total — page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={iconBtn}>Previous</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={iconBtn}>Next</button>
            </div>
          </div>
        )}
      </Card>

      {splittingId && (() => {
        const original = transactions.find(t => t.id === splittingId);
        if (!original) return null;
        const splitSum = splitLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
        const remaining = Number((original.amount - splitSum).toFixed(2));
        const balanced = Math.abs(remaining) <= 0.01;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <Card style={{ width: 420 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Split transaction — {money(original.amount)}</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>{original.description}</div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, padding: '6px 0', borderTop: '1px solid #E2E5E9', marginBottom: 10 }}>
                <span>Remaining to allocate</span>
                <span style={{ color: balanced ? '#0F6E56' : '#B00020' }}>{money(remaining)}</span>
              </div>
              {splitError && <div style={{ color: '#B00020', fontSize: 13, marginBottom: 10 }}>{splitError}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setSplittingId(null)} style={iconBtn}>Cancel</button>
                <button onClick={confirmSplit} disabled={!balanced} style={{ background: balanced ? '#17365D' : '#A9B4C2', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: balanced ? 'pointer' : 'default' }}>Confirm split</button>
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
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>{t.description} — {money(t.amount)}</div>
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
  return <span style={{ background: s.bg, color: s.color, fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 10 }}>{status}</span>;
}

function InvoicesView({ invoices, setInvoices, customers, invoiceTotal, invoiceSubtotal, onPrint, businessName }) {
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
  const monthYearOptions = useMemo(() => {
    const months = new Set();
    invoices.forEach(inv => months.add(inv.date.slice(0, 7)));
    return Array.from(months).sort().reverse().map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const first = `${m}-01`;
      const lastDay = new Date(Number(y), Number(mo), 0).getDate();
      const last = `${m}-${String(lastDay).padStart(2, '0')}`;
      return { value: m, label, first, last };
    });
  }, [invoices]);
  function applyMonthYear(value) {
    if (!value) return;
    const opt = monthYearOptions.find(o => o.value === value);
    if (opt) setFilters(f => ({ ...f, dateFrom: opt.first, dateTo: opt.last }));
  }
  const filteredTotal = filteredInvoices.reduce((s, inv) => s + invoiceTotal(inv), 0);
  const filteredSubtotal = filteredInvoices.reduce((s, inv) => s + invoiceSubtotal(inv), 0);
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

  function sendInvoiceEmail(inv) {
    const customer = customers.find(c => c.name === inv.client);
    const email = customer?.email || '';
    if (!email) {
      if (!window.confirm(`No email on file for ${inv.client} (add one in the Customers tab for next time). Open Gmail anyway so you can type the address?`)) return;
    }
    const subject = encodeURIComponent(`Invoice ${inv.number}`);
    const body = encodeURIComponent(
      `Hi ${inv.client},\n\nHere's Invoice ${inv.number} for the amount of ${money(invoiceTotal(inv))}.\n\nIf you have any questions, feel free to reach out.\n\nThank you,\n\n${businessName}`
    );
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(email)}&su=${subject}&body=${body}&authuser=asemprit%40twelvestrategies.com`;
    window.open(gmailUrl, '_blank');
  }
  function saveInvoice() {
    if (!form.client.trim()) { setError("Enter the customer's name."); return; }
    if (form.lines.some(l => !l.desc.trim() || !l.rate)) { setError('Each line needs a description and price.'); return; }
    setError('');
    const tbsCount = invoices.filter(i => i.number && i.number.startsWith('TBS-')).length;
    const number = 'TBS-' + String(tbsCount + 1).padStart(4, '0');
    const inv = { ...form, id: uid(), number };
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
              <label style={{ fontSize: 14, color: '#6B7280', display: 'block' }}>Customer</label>
              <CustomerSearchSelect value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} customers={customers} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          {form.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input style={{ flex: 1 }} placeholder="Service description" value={l.desc} onChange={e => updateLine(i, 'desc', e.target.value)} />
              <input type="number" style={{ width: 70 }} placeholder="Qty." value={l.qty} onChange={e => updateLine(i, 'qty', e.target.value)} />
              <input type="number" step="0.01" style={{ width: 100 }} placeholder="Price" value={l.rate} onChange={e => updateLine(i, 'rate', e.target.value)} />
              <span style={{ width: 90, fontSize: 14, textAlign: 'right' }}>{money((Number(l.qty) || 0) * (Number(l.rate) || 0))}</span>
              <button onClick={() => removeLine(i)} style={iconBtn}><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={addLine} style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}><Plus size={13} /> Line</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={form.retention} onChange={e => setForm(f => ({ ...f, retention: e.target.checked }))} />
              Apply withholding
            </label>
            {form.retention && (
              <input type="number" style={{ width: 60 }} value={form.retentionPct} onChange={e => setForm(f => ({ ...f, retentionPct: e.target.value }))} />
            )}
            {form.retention && <span style={{ fontSize: 14 }}>%</span>}
          </div>

          <div style={{ fontWeight: 700, marginBottom: 12 }}>Total: {money(invoiceTotal(form))}</div>
          {error && <div style={{ color: '#B00020', fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
          <button onClick={saveInvoice} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>Save invoice</button>
        </Card>
      )}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Search (invoice # or customer)</label>
            <input style={{ width: '100%' }} placeholder="E.g. 3133, Bivona's..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
          </div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>From</label>
            <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} /></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>To</label>
            <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} /></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Status</label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Partial">Partial</option>
              <option value="Paid">Paid</option>
            </select></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Month/Year</label>
            <select onChange={e => applyMonthYear(e.target.value)} defaultValue="">
              <option value="">Select…</option>
              {monthYearOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></div>
          {filtersActive && (
            <button onClick={() => setFilters({ search: '', dateFrom: '', dateTo: '', status: '' })} style={iconBtn}>Clear filters</button>
          )}
        </div>
        {filtersActive && (
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 10, display: 'flex', gap: 16 }}>
            <span>{filteredInvoices.length} of {invoices.length} invoices</span>
            <span>Total: <strong>{money(filteredTotal)}</strong></span>
            <span>Outstanding balance: <strong>{money(filteredBalance)}</strong></span>
          </div>
        )}
      </Card>

      <Card>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
              <th style={{ padding: '6px 4px' }}>No.</th>
              <th style={{ padding: '6px 4px' }}>Customer</th>
              <th style={{ padding: '6px 4px' }}>Date</th>
              <th style={{ padding: '6px 4px' }}>Amount (before withholding)</th>
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
                <td style={{ padding: '6px 4px' }}>{money(invoiceSubtotal(inv))}</td>
                <td style={{ padding: '6px 4px' }}>{money(invoiceTotal(inv))}</td>
                <td style={{ padding: '6px 4px' }}>{inv.status}{inv.paid ? ` (${money(inv.paid)} paid)` : ''}</td>
                <td style={{ padding: '6px 4px', display: 'flex', gap: 6 }}>
                  <button onClick={() => onPrint(inv)} style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 6 }}><Printer size={14} /> PDF</button>
                  <button onClick={() => sendInvoiceEmail(inv)} style={iconBtn}>Email</button>
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
                <td style={{ padding: '6px 4px' }}>{money(filteredSubtotal)}</td>
                <td style={{ padding: '6px 4px' }}>{money(filteredTotal)}</td>
                <td colSpan={2} style={{ padding: '6px 4px' }}>Outstanding: {money(filteredBalance)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {filteredInvoices.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>{invoices.length === 0 ? 'No invoices yet.' : 'No invoices match these filters.'}</div>}
      </Card>

      {payingId && (() => {
        const inv = invoices.find(i => i.id === payingId);
        if (!inv) return null;
        const balance = invoiceTotal(inv) - (inv.paid || 0);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <Card style={{ width: 320 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Apply payment — {inv.number}</div>
              <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 10 }}>Outstanding balance: {money(balance)}</div>
              <input type="number" step="0.01" style={{ width: '100%', marginBottom: 8 }} placeholder="Amount cobrado"
                value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              {payError && <div style={{ color: '#B00020', fontSize: 13, marginBottom: 8 }}>{payError}</div>}
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
  const subtotal = inv.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  const withholding = inv.retention ? subtotal * (Number(inv.retentionPct) || 0) / 100 : 0;
  const showLogo = businessName === 'Twelve Business Strategies';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      className="no-print-overlay">
      <div style={{ background: '#fff', width: 620, maxHeight: '90vh', overflow: 'auto', borderRadius: 8, padding: 40 }} id="invoice-print-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }} className="print-hide">
          <div style={{ fontWeight: 700, fontSize: 18 }}>Invoice {inv.number}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => window.print()} style={{ ...iconBtn, display: 'flex', gap: 6 }}><Printer size={14} /> Save as PDF</button>
            <button onClick={onClose} style={iconBtn}><X size={14} /></button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>{showLogo && <img src={TWELVE_LOGO_DATA_URI} alt={businessName} style={{ height: 64 }} />}</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, letterSpacing: 2, color: '#1F2933' }}>INVOICE</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>{businessName}</div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #D8DCE1', marginBottom: 18 }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Bill to</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{inv.client}</div>
          </div>
          <div style={{ fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 3 }}>
              <span style={{ color: '#6B7280' }}>Invoice Number:</span><span style={{ fontWeight: 700 }}>{inv.number}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 3 }}>
              <span style={{ color: '#6B7280' }}>Invoice Date:</span><span style={{ fontWeight: 700 }}>{inv.date}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 8 }}>
              <span style={{ color: '#6B7280' }}>Payment Due:</span><span style={{ fontWeight: 700 }}>{inv.date}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, background: '#F3F4F6', padding: '6px 10px', borderRadius: 4 }}>
              <span style={{ color: '#6B7280' }}>Amount Due (USD):</span><span style={{ fontWeight: 700 }}>{money(total)}</span>
            </div>
          </div>
        </div>

        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead><tr style={{ background: '#3B3F45', color: '#fff', textAlign: 'left' }}>
            <th style={{ padding: '8px 10px' }}>Items</th>
            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Quantity</th>
            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Price</th>
            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
          </tr></thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #EEE' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{l.desc}</td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.qty}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{money(l.rate)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{money((Number(l.qty) || 0) * (Number(l.rate) || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #D8DCE1' }}>
              <span style={{ color: '#6B7280' }}>Total:</span><span>{money(subtotal)}</span>
            </div>
            {inv.retention && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: '#6B7280' }}>Withholding ({inv.retentionPct}%):</span><span>-{money(withholding)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #D8DCE1', fontWeight: 700 }}>
              <span>Amount Due (USD):</span><span>{money(total)}</span>
            </div>
          </div>
        </div>
      </div>
      <style>{`@media print { .no-print-overlay { position: static !important; background: none !important; } .print-hide { display: none !important; } body * { visibility: hidden; } #invoice-print-area, #invoice-print-area * { visibility: visible; } #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
    </div>
  );
}

function CustomersView({ customers, setCustomers, invoices, setInvoices, invoiceTotal, invoiceSubtotal, onPrintStatement }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [editingName, setEditingName] = useState(null);
  const [editEmail, setEditEmail] = useState('');
  const [editNameDraft, setEditNameDraft] = useState('');
  function addCustomer() {
    if (!name.trim()) return;
    setCustomers(prev => [...prev, { id: uid(), name: name.trim(), email: email.trim() }]);
    setName('');
    setEmail('');
  }
  function startEditEmail(c) { setEditingName(c.name); setEditEmail(c.email || ''); setEditNameDraft(c.name); }
  function saveEditEmail(c) {
    const newName = editNameDraft.trim();
    if (!newName) { setEditingName(null); return; }
    const renamed = newName !== c.name;
    if (customers.some(x => x.name === c.name)) {
      setCustomers(prev => prev.map(x => x.name === c.name ? { ...x, name: newName, email: editEmail.trim() } : x));
    } else {
      // el nombre viene de una factura pero todavía no existe como Customer registrado
      setCustomers(prev => [...prev, { id: uid(), name: newName, email: editEmail.trim() }]);
    }
    if (renamed) {
      setInvoices(prev => prev.map(inv => inv.client === c.name ? { ...inv, client: newName } : inv));
    }
    setEditingName(null);
  }
  function removeCustomer(c) {
    const hasInvoices = invoices.some(inv => inv.client === c.name);
    const msg = hasInvoices
      ? `Delete ${c.name} from Customers? They still have invoices on file, so they'll keep showing in this list (without an email) until those invoices are gone.`
      : `Delete ${c.name} from Customers?`;
    if (!window.confirm(msg)) return;
    setCustomers(prev => prev.filter(x => x.name !== c.name));
  }
  const balances = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      map[inv.client] = (map[inv.client] || 0) + invoiceTotal(inv) - (inv.paid || 0);
    });
    return map;
  }, [invoices, invoiceTotal]);
  const billedBeforeWithholding = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      map[inv.client] = (map[inv.client] || 0) + invoiceSubtotal(inv);
    });
    return map;
  }, [invoices, invoiceSubtotal]);

  const allNames = Array.from(new Set([...customers.map(c => c.name), ...invoices.map(i => i.client)]));
  const totalBilledBeforeWithholding = allNames.reduce((s, n) => s + (billedBeforeWithholding[n] || 0), 0);
  const totalOpenBalance = allNames.reduce((s, n) => s + (balances[n] || 0), 0);

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Customers</h2>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ flex: 1 }} placeholder="New customer name" value={name} onChange={e => setName(e.target.value)} />
          <input style={{ flex: 1 }} placeholder="Email (for sending invoices)" value={email} onChange={e => setEmail(e.target.value)} />
          <button onClick={addCustomer} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Add</button>
        </div>
      </Card>
      <Card>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>Customer</th>
            <th style={{ padding: '6px 4px' }}>Email</th>
            <th style={{ padding: '6px 4px' }}>Total billed (before withholding)</th>
            <th style={{ padding: '6px 4px' }}>Open balance (A/R)</th><th></th>
          </tr></thead>
          <tbody>
            {allNames.map(n => {
              const c = customers.find(x => x.name === n);
              return (
                <tr key={n} style={{ borderBottom: '1px solid #F0F1F3' }}>
                  {editingName === n ? (
                    <>
                      <td style={{ padding: '6px 4px' }}>
                        <input style={{ width: 140 }} value={editNameDraft} onChange={e => setEditNameDraft(e.target.value)} />
                      </td>
                      <td style={{ padding: '6px 4px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input style={{ width: 160 }} value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="Email" />
                          <button onClick={() => saveEditEmail({ name: n, email: c?.email })} style={iconBtn}><Check size={14} /></button>
                          <button onClick={() => setEditingName(null)} style={iconBtn}><X size={14} /></button>
                        </div>
                      </td>
                      <td style={{ padding: '6px 4px' }}>{money(billedBeforeWithholding[n] || 0)}</td>
                      <td style={{ padding: '6px 4px' }}>{money(balances[n] || 0)}</td>
                      <td></td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '6px 4px' }}>{n}</td>
                      <td style={{ padding: '6px 4px' }}>
                        <span style={{ color: c?.email ? '#1F2933' : '#9CA3AF' }}>{c?.email || 'No email'}</span>
                      </td>
                      <td style={{ padding: '6px 4px' }}>{money(billedBeforeWithholding[n] || 0)}</td>
                      <td style={{ padding: '6px 4px' }}>{money(balances[n] || 0)}</td>
                      <td style={{ padding: '6px 4px', display: 'flex', gap: 4 }}>
                        <button onClick={() => onPrintStatement(n)} style={iconBtn}>Statement</button>
                        <button onClick={() => startEditEmail({ name: n, email: c?.email })} style={iconBtn}>Edit</button>
                        <button onClick={() => removeCustomer({ name: n })} style={iconBtn}><Trash2 size={14} /></button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
          {allNames.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid #E2E5E9', fontWeight: 700 }}>
                <td style={{ padding: '6px 4px' }}>Total ({allNames.length})</td>
                <td></td>
                <td style={{ padding: '6px 4px' }}>{money(totalBilledBeforeWithholding)}</td>
                <td style={{ padding: '6px 4px' }}>{money(totalOpenBalance)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
        {allNames.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>No customers yet.</div>}
      </Card>
    </div>
  );
}

function CustomerStatementModal({ client, invoices, invoiceTotal, invoiceSubtotal, onClose, businessName }) {
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
          <div style={{ fontSize: 14, marginBottom: 16 }}>Customer: <strong>{client}</strong></div>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse', marginBottom: 16 }}>
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
  if (preset === 'last_year') return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) };
  return { from: customFrom, to: customTo };
}

function naturalAmount(gl, amount, accounts) {
  const acct = accounts.find(a => a.code === gl);
  return { amount, type: acct?.type || 'Expense' };
}

function ReportsView({ transactions, invoices, glName, invoiceTotal, accounts, journalEntries, businessName, reconciliations }) {
  const [preset, setPreset] = useState('this_month');
  const [selectedReport, setSelectedReport] = useState('pnl');
  const [breakdown, setBreakdown] = useState('none');
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
  const cogsRows = expenseRows.filter(r => r.isCogs);
  const otherExpenseRows = expenseRows.filter(r => !r.isCogs);
  const totalCogs = cogsRows.reduce((s, r) => s + r.value, 0);
  const totalOtherExpense = otherExpenseRows.reduce((s, r) => s + r.value, 0);
  const totalExpense = totalCogs + totalOtherExpense;
  const grossProfit = totalRevenue - totalCogs;
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
    ['trial_balance', 'Trial Balance'],
    ['ap', 'A/P (Accounts Payable)'],
    ['open_invoices', 'Open Invoices'],
    ['unreconciled', 'Unreconciled Transactions'],
  ];

  function getReportData(key) {
    if (key === 'pnl') {
      const rows = [
        ...revenueRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ...(invoiceRevenueInPeriod !== 0 ? [['', 'Invoicing (Service Revenue)', invoiceRevenueInPeriod]] : []),
        ['', 'Total Sales', totalRevenue],
        ...(cogsRows.length > 0 ? [
          ...cogsRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
          ['', 'Total COGS', totalCogs],
          ['', 'Gross Profit', grossProfit],
        ] : []),
        ...otherExpenseRows.filter(r => r.value !== 0).map(r => [r.code, r.name, r.value]),
        ['', 'Total Expenses', totalOtherExpense],
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
    if (key === 'trial_balance') {
      const trialRows = accounts.map(a => {
        const bal = balanceAsOf(a.code, to);
        const isDebitNormal = a.type === 'Asset' || a.type === 'Expense';
        let debit = 0, credit = 0;
        if (isDebitNormal) { if (bal >= 0) debit = bal; else credit = -bal; }
        else { if (bal >= 0) credit = bal; else debit = -bal; }
        return { code: a.code, name: a.name, type: a.type, debit, credit };
      }).filter(r => r.debit !== 0 || r.credit !== 0);
      const totalDebit = trialRows.reduce((s, r) => s + r.debit, 0);
      const totalCredit = trialRows.reduce((s, r) => s + r.credit, 0);
      const rows = [
        ...trialRows.map(r => [r.code, r.name, r.type, r.debit || '', r.credit || '']),
        ['', 'Total', '', totalDebit, totalCredit],
      ];
      return { title: `Trial Balance — as of ${to}`, header: ['Code', 'Account', 'Type', 'Debit', 'Credit'], rows };
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
    if (key === 'unreconciled') {
      const latestApproved = {};
      const cumulativeVerifiedByGl = {};
      (reconciliations || []).filter(r => r.status === 'PASS').forEach(r => {
        const cur = latestApproved[r.gl];
        if (!cur || r.periodEnd > cur.periodEnd) latestApproved[r.gl] = r;
        cumulativeVerifiedByGl[r.gl] = cumulativeVerifiedByGl[r.gl] || new Set();
        (r.verifiedIds || []).forEach(id => cumulativeVerifiedByGl[r.gl].add(id));
      });
      const rows = [];
      Object.values(latestApproved).forEach(r => {
        const verifiedSet = cumulativeVerifiedByGl[r.gl] || new Set();
        transactions.forEach(t => {
          if (t.sourceGL !== r.gl || t.date > r.periodEnd || verifiedSet.has(t.id)) return;
          rows.push([t.date, t.description, t.amount, `${r.gl} — ${accounts.find(a => a.code === r.gl)?.name || ''}`, `Approved through ${r.periodEnd}`]);
        });
      });
      rows.sort((a, b) => a[0].localeCompare(b[0]));
      return { title: 'Unreconciled Transactions (in already-approved periods)', header: ['Date', 'Description', 'Amount', 'Account', 'Last approved period'], rows };
    }
    return { title: '', header: [], rows: [] };
  }

  function parseLocalDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function formatLocalDate(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function toNumeralDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${m}-${d}-${y}`;
  }
  function getSubPeriods(fromD, toD, kind) {
    const periods = [];
    let cursor = parseLocalDate(fromD);
    const end = parseLocalDate(toD);
    while (cursor <= end) {
      let periodFrom, periodTo, label;
      if (kind === 'monthly') {
        periodFrom = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        periodTo = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        label = periodFrom.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      } else if (kind === 'quarterly') {
        const q = Math.floor(cursor.getMonth() / 3);
        periodFrom = new Date(cursor.getFullYear(), q * 3, 1);
        periodTo = new Date(cursor.getFullYear(), q * 3 + 3, 0);
        label = `Q${q + 1} ${cursor.getFullYear()}`;
        cursor = new Date(cursor.getFullYear(), q * 3 + 3, 1);
      } else {
        periodFrom = new Date(cursor.getFullYear(), 0, 1);
        periodTo = new Date(cursor.getFullYear(), 11, 31);
        label = String(cursor.getFullYear());
        cursor = new Date(cursor.getFullYear() + 1, 0, 1);
      }
      const pf = periodFrom < parseLocalDate(fromD) ? fromD : formatLocalDate(periodFrom);
      const pt = periodTo > end ? toD : formatLocalDate(periodTo);
      periods.push({ label, from: pf, to: pt });
    }
    return periods;
  }

  function getBreakdownData(key, kind) {
    const periods = getSubPeriods(from, to, kind);
    const isAsOf = key === 'balance_sheet';
    let rowAccounts = [];
    if (key === 'pnl') rowAccounts = [...revenueAccts, ...expenseAccts];
    else if (key === 'balance_sheet') rowAccounts = [...assetAccts, ...liabilityAccts, ...equityAccts];
    else if (key === 'ap') rowAccounts = liabilityAccts;
    else return null;

    const header = ['Code', 'Account', ...periods.map(p => p.label)];
    const rows = rowAccounts.map(a => {
      const values = periods.map(p => {
        if (isAsOf) return balanceAsOf(a.code, p.to);
        const v = activityInPeriod(a.code, p.from, p.to);
        return key === 'ap' ? -v : v;
      });
      return [a.code, a.name, ...values];
    }).filter(r => r.slice(2).some(v => v !== 0));
    return { title: `${REPORT_OPTIONS.find(([id]) => id === key)[1]} — ${toNumeralDate(from)} to ${toNumeralDate(to)} (${kind})`, header, rows };
  }

  function downloadReportCSV() {
    const usesBreakdown = breakdown !== 'none' && ['pnl', 'balance_sheet', 'ap'].includes(selectedReport);
    const { title, header, rows } = usesBreakdown ? getBreakdownData(selectedReport, breakdown) : getReportData(selectedReport);
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
    ['this_year', 'This year'], ['last_year', 'Last year'], ['custom', 'Custom'],
  ];

  const [drillDown, setDrillDown] = useState(null); // { gl, label, mode: 'period' | 'asOf' }

  const Row = ({ label, value, bold, gl, mode }) => (
    <div
      onClick={gl ? () => setDrillDown({ gl, label, mode }) : undefined}
      style={{
        display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14, fontWeight: bold ? 700 : 400,
        cursor: gl ? 'pointer' : 'default', color: gl ? '#0C447C' : 'inherit', textDecoration: gl ? 'underline' : 'none',
      }}>
      <span>{label}</span><span>{money(value)}</span>
    </div>
  );

  const monthYearOptions = useMemo(() => {
    const months = new Set();
    transactions.forEach(t => months.add(t.date.slice(0, 7)));
    return Array.from(months).sort().reverse().map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const first = `${m}-01`;
      const lastDay = new Date(Number(y), Number(mo), 0).getDate();
      const last = `${m}-${String(lastDay).padStart(2, '0')}`;
      return { value: m, label, first, last };
    });
  }, [transactions]);
  function applyMonthYear(value) {
    if (!value) return;
    const opt = monthYearOptions.find(o => o.value === value);
    if (opt) { setCustomFrom(opt.first); setCustomTo(opt.last); setPreset('custom'); }
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Financial Reports</h2>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {PRESETS.map(([id, label]) => (
            <button key={id} onClick={() => setPreset(id)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E2E5E9', cursor: 'pointer', fontSize: 14,
                background: preset === id ? '#17365D' : '#fff', color: preset === id ? '#fff' : '#1F2933' }}>
              {label}
            </button>
          ))}
          <div>
            <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Month/Year</label>
            <select onChange={e => applyMonthYear(e.target.value)} defaultValue="">
              <option value="">Select…</option>
              {monthYearOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {preset === 'custom' && (
            <>
              <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>From</label>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></div>
              <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>To</label>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} /></div>
            </>
          )}
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>Period: {from} to {to}</div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Report</label>
            <select value={selectedReport} onChange={e => setSelectedReport(e.target.value)}>
              {REPORT_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          {preset === 'custom' && ['pnl', 'balance_sheet', 'ap'].includes(selectedReport) && (
            <div>
              <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Breakdown</label>
              <select value={breakdown} onChange={e => setBreakdown(e.target.value)}>
                <option value="none">Single total</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </div>
          )}
          <button onClick={() => setShowExportPreview(true)} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Download PDF</button>
          <button onClick={downloadReportCSV} style={iconBtn}>Download CSV</button>
        </div>
        {preset === 'custom' && breakdown !== 'none' && ['pnl', 'balance_sheet', 'ap'].includes(selectedReport) && (
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>Each column will be one {breakdown === 'monthly' ? 'month' : breakdown === 'quarterly' ? 'quarter' : 'year'} within your custom period.</div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>P&L (Income Statement)</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>Sales</div>
          {revenueRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} gl={r.code} mode="period" />)}
          {invoiceRevenueInPeriod !== 0 && <Row label="Invoicing (Service Revenue)" value={invoiceRevenueInPeriod} gl="__invoices__" mode="period" />}
          <Row label="Total Sales" value={totalRevenue} bold />
          {cogsRows.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: '#6B7280', margin: '10px 0 8px' }}>Cost of Goods Sold</div>
              {cogsRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} gl={r.code} mode="period" />)}
              <Row label="Total COGS" value={totalCogs} bold />
              <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
                <Row label="Gross Profit" value={grossProfit} bold />
              </div>
            </>
          )}
          <div style={{ fontSize: 12, color: '#6B7280', margin: '10px 0 8px' }}>Expenses</div>
          {otherExpenseRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} gl={r.code} mode="period" />)}
          <Row label="Total Expenses" value={totalOtherExpense} bold />
          <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
            <Row label="Net Income" value={netIncome} bold />
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Balance Sheet (as of {to})</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>Assets</div>
          {assetRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} gl={r.code} mode="asOf" />)}
          <Row label="Total Assets" value={totalAssets} bold />
          <div style={{ fontSize: 12, color: '#6B7280', margin: '10px 0 8px' }}>Liabilities</div>
          {liabilityRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={r.value} gl={r.code} mode="asOf" />)}
          <Row label="Total Liabilities" value={totalLiabilities} bold />
          <div style={{ fontSize: 12, color: '#6B7280', margin: '10px 0 8px' }}>Equity</div>
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
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 14 }}>{from} to {to}</div>

        <div style={{ fontWeight: 700, background: '#F0F1F3', padding: '4px 8px', marginBottom: 4 }}>Operating Activities</div>
        <div style={{ fontSize: 13, color: '#6B7280', margin: '6px 0 2px', paddingLeft: 8 }}>Sales</div>
        {cfSalesRows.filter(r => r.value !== 0).map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="period" /></div>)}
        {invoiceRevenueInPeriod !== 0 && <div style={{ paddingLeft: 16 }}><Row label="Invoicing (Service Revenue)" value={invoiceRevenueInPeriod} gl="__invoices__" mode="period" /></div>}
        <div style={{ paddingLeft: 16 }}><Row label="Total Sales" value={cfTotalSales} bold /></div>

        <div style={{ fontSize: 13, color: '#6B7280', margin: '10px 0 2px', paddingLeft: 8 }}>Purchases</div>
        {cfPurchaseRows.filter(r => r.value !== 0).map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="period" /></div>)}
        <div style={{ paddingLeft: 16 }}><Row label="Total Purchases" value={cfTotalPurchases} bold /></div>

        <div style={{ fontSize: 13, color: '#6B7280', margin: '10px 0 2px', paddingLeft: 8 }}>Payroll</div>
        {cfPayrollRows.filter(r => r.value !== 0).map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="period" /></div>)}
        {cfPayrollRows.every(r => r.value === 0) && <div style={{ paddingLeft: 16, fontSize: 13, color: '#6B7280' }}>No payroll activity in this period.</div>}
        <div style={{ paddingLeft: 16 }}><Row label="Total Payroll" value={cfTotalPayroll} bold /></div>

        <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
          <Row label="Net Cash from Operating Activities" value={cfOperating} bold />
        </div>

        <div style={{ fontWeight: 700, background: '#F0F1F3', padding: '4px 8px', margin: '16px 0 4px' }}>Investing Activities</div>
        {cfInvestingRows.filter(r => r.value !== 0).map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="period" /></div>)}
        {cfInvestingRows.every(r => r.value === 0) && <div style={{ paddingLeft: 16, fontSize: 13, color: '#6B7280' }}>No investing activity in this period.</div>}
        <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
          <Row label="Net Cash from Investing Activities" value={cfInvesting} bold />
        </div>

        <div style={{ fontWeight: 700, background: '#F0F1F3', padding: '4px 8px', margin: '16px 0 4px' }}>Financing Activities</div>
        <div style={{ fontSize: 13, color: '#6B7280', margin: '6px 0 2px', paddingLeft: 8 }}>Owners and Shareholders</div>
        {cfFinancingRows.filter(r => r.value !== 0).map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="period" /></div>)}
        {cfFinancingRows.every(r => r.value === 0) && <div style={{ paddingLeft: 16, fontSize: 13, color: '#6B7280' }}>No financing activity in this period.</div>}
        <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
          <Row label="Net Cash from Financing Activities" value={cfFinancing} bold />
        </div>

        <div style={{ fontWeight: 700, background: '#F0F1F3', padding: '4px 8px', margin: '16px 0 4px' }}>Overview</div>
        <div style={{ fontSize: 13, color: '#6B7280', margin: '6px 0 2px', paddingLeft: 8 }}>Starting Balance (as of {dayBefore(from)})</div>
        {cfStartingRows.map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="asOf" /></div>)}
        <div style={{ paddingLeft: 16 }}><Row label="Total Starting Balance" value={cfTotalStarting} bold /></div>

        <div style={{ fontSize: 13, color: '#6B7280', margin: '10px 0 2px', paddingLeft: 8 }}>Ending Balance (as of {to})</div>
        {cfEndingRows.map(r => <div key={r.code} style={{ paddingLeft: 16 }}><Row label={r.name} value={r.value} gl={r.code} mode="asOf" /></div>)}
        <div style={{ paddingLeft: 16 }}><Row label="Total Ending Balance" value={cfTotalEnding} bold /></div>

        <div style={{ paddingLeft: 8, marginTop: 10 }}>
          <Row label="Gross Cash Inflow" value={cfGrossInflow} />
          <Row label="Gross Cash Outflow" value={cfGrossOutflow} />
          <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 4, paddingTop: 4 }}>
            <Row label="Net Cash Change" value={netCashChange} bold />
          </div>
        </div>

        {cashRows.length === 0 && <div style={{ fontSize: 13, color: '#6B7280', marginTop: 10 }}>No accounts are marked as bank/cash (the name must include "bank", "cash", or similar).</div>}
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 14 }}>
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
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
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
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>Current balance of your liability accounts (cards, payroll, and taxes payable)</div>
          {liabilityRows.filter(r => r.value !== 0).map(r => <Row key={r.code} label={r.name} value={-r.value} gl={r.code} mode="asOf" />)}
          <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 8, paddingTop: 8 }}>
            <Row label="Total A/P" value={-totalLiabilities} bold />
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 10 }}>
            This reflects your liability accounts as they stand today; the system doesn't yet track individual vendor bills.
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Trial Balance</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>Every account's balance as of {to}, split into Debit or Credit — the two totals should match.</div>
        {(() => {
          const trialRows = accounts.map(a => {
            const bal = balanceAsOf(a.code, to);
            const isDebitNormal = a.type === 'Asset' || a.type === 'Expense';
            let debit = 0, credit = 0;
            if (isDebitNormal) { if (bal >= 0) debit = bal; else credit = -bal; }
            else { if (bal >= 0) credit = bal; else debit = -bal; }
            return { code: a.code, name: a.name, type: a.type, debit, credit };
          }).filter(r => r.debit !== 0 || r.credit !== 0);
          const totalDebit = trialRows.reduce((s, r) => s + r.debit, 0);
          const totalCredit = trialRows.reduce((s, r) => s + r.credit, 0);
          return (
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
                <th style={{ padding: '6px 4px' }}>Code</th><th style={{ padding: '6px 4px' }}>Account</th>
                <th style={{ padding: '6px 4px' }}>Type</th>
                <th style={{ padding: '6px 4px', textAlign: 'right' }}>Debit</th>
                <th style={{ padding: '6px 4px', textAlign: 'right' }}>Credit</th>
              </tr></thead>
              <tbody>
                {trialRows.map(r => (
                  <tr key={r.code} style={{ borderBottom: '1px solid #F0F1F3' }}>
                    <td style={{ padding: '6px 4px' }}>{r.code}</td>
                    <td style={{ padding: '6px 4px' }}>{r.name}</td>
                    <td style={{ padding: '6px 4px', color: '#6B7280' }}>{r.type}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>{r.debit ? money(r.debit) : ''}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>{r.credit ? money(r.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #E2E5E9', fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: '6px 4px' }}>Total</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{money(totalDebit)}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{money(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          );
        })()}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Open Invoices</div>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
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
        {invoices.filter(i => i.status !== 'Paid').length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>No open invoices.</div>}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Unreconciled Transactions</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
          For each account's most recently approved reconciliation, these are the transactions dated on or before that period that were never checked off — carry these into your next reconciliation.
        </div>
        {(() => {
          const { rows } = getReportData('unreconciled');
          return (
            <>
              <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
                  <th style={{ padding: '6px 4px' }}>Date</th><th style={{ padding: '6px 4px' }}>Description</th>
                  <th style={{ padding: '6px 4px' }}>Amount</th><th style={{ padding: '6px 4px' }}>Account</th><th style={{ padding: '6px 4px' }}>Last approved period</th>
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F0F1F3' }}>
                      <td style={{ padding: '6px 4px' }}>{r[0]}</td>
                      <td style={{ padding: '6px 4px' }}>{r[1]}</td>
                      <td style={{ padding: '6px 4px' }}>{money(r[2])}</td>
                      <td style={{ padding: '6px 4px' }}>{r[3]}</td>
                      <td style={{ padding: '6px 4px' }}>{r[4]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>Nothing pending — every approved period has all its transactions checked off.</div>}
            </>
          );
        })()}
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
        function exportDrillDownCSV() {
          let csv = 'Date,Description,Type,Amount\n';
          const escape = v => `"${String(v).replace(/"/g, '""')}"`;
          items.forEach(i => { csv += [i.date, escape(i.description), i.type, i.amount.toFixed(2)].join(',') + '\n'; });
          const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${(label || gl).replace(/[^a-z0-9]+/gi, '_')}_${from}_to_${to}.csv`; a.click();
          URL.revokeObjectURL(url);
        }
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <Card style={{ width: 640, maxHeight: '85vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>{label}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {items.length > 0 && <button onClick={exportDrillDownCSV} style={iconBtn}>Export CSV</button>}
                  <button onClick={() => setDrillDown(null)} style={iconBtn}><X size={14} /></button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>
                {mode === 'period' ? `Activity from ${from} to ${to}` : `Balance as of ${to}`} — {items.length} item{items.length === 1 ? '' : 's'}
              </div>
              <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
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
              {items.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>No transactions or journal entries behind this number.</div>}
              <div style={{ borderTop: '1px solid #E2E5E9', marginTop: 10, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                <span>Total</span><span>{money(total)}</span>
              </div>
            </Card>
          </div>
        );
      })()}

      {showExportPreview && (() => {
        const usesBreakdownPdf = breakdown !== 'none' && ['pnl', 'balance_sheet', 'ap'].includes(selectedReport);
        const { title, header, rows } = usesBreakdownPdf ? getBreakdownData(selectedReport, breakdown) : getReportData(selectedReport);
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
                <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                    {header.map(h => <th key={h} style={{ padding: '4px 6px', textAlign: h === header[header.length - 1] ? 'right' : 'left' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const isTotal = typeof r[1] === 'string' && /^Total|^Net |^Gross Profit$|ACTIVITIES$|OVERVIEW$/.test(r[1]);
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
  const [form, setForm] = useState({ code: '', name: '', type: 'Expense', isCogs: false });
  const [error, setError] = useState('');
  const [editingCode, setEditingCode] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: '', type: 'Expense', isCogs: false });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null); // 'ok' | 'error' | null

  async function runSync() {
    setSyncing(true);
    setSyncResult(null);
    const { error } = await supabase.rpc('sync_chart_of_accounts_from_tbs');
    setSyncing(false);
    setSyncResult(error ? 'error' : 'ok');
  }

  function addAccount() {
    if (!form.code.trim() || !form.name.trim()) { setError('Enter a code and name.'); return; }
    if (accounts.some(a => a.code === form.code.trim())) { setError('That code already exists.'); return; }
    setError('');
    setAccounts(prev => [...prev, { code: form.code.trim(), name: form.name.trim(), type: form.type, isCogs: form.type === 'Expense' ? form.isCogs : false }]);
    setForm({ code: '', name: '', type: 'Expense', isCogs: false });
  }
  function updateAccount(code, field, value) {
    setAccounts(prev => prev.map(a => a.code === code ? { ...a, [field]: value } : a));
  }
  function startEdit(a) {
    setEditingCode(a.code);
    setEditDraft({ name: a.name, type: a.type, isCogs: !!a.isCogs });
  }
  function saveEdit(code) {
    setAccounts(prev => prev.map(a => a.code === code ? { ...a, name: editDraft.name, type: editDraft.type, isCogs: editDraft.type === 'Expense' ? editDraft.isCogs : false } : a));
    setEditingCode(null);
  }
  function removeAccount(code) {
    const acc = accounts.find(a => a.code === code);
    if (!window.confirm(`Delete account ${code} — ${acc?.name || ''}? This can't be undone, and if any transactions already use this account, they'll show as uncategorized.`)) return;
    setAccounts(prev => prev.filter(a => a.code !== code));
  }

  const types = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  const grouped = types.map(t => ({ type: t, rows: accounts.filter(a => a.type === t).sort((a, b) => a.code.localeCompare(b.code)) }));

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Chart of Accounts</h2>

      {isMaster && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={runSync} disabled={syncing} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: syncing ? 'default' : 'pointer' }}>
              {syncing ? 'Syncing…' : 'Sync to all clients'}
            </button>
            <span style={{ fontSize: 13, color: '#6B7280' }}>This now happens automatically after every change — use this only if you edited accounts directly in Supabase.</span>
            {syncResult === 'ok' && <span style={{ fontSize: 13, color: '#0F6E56', fontWeight: 600 }}>✓ Synced successfully</span>}
            {syncResult === 'error' && <span style={{ fontSize: 13, color: '#B00020', fontWeight: 600 }}>Sync failed — the function may not exist yet in Supabase.</span>}
          </div>
        </Card>
      )}

      {!isMaster && (
        <Card style={{ marginBottom: 20, background: '#FFF8E6', borderColor: '#F0D896' }}>
          <div style={{ fontSize: 14, color: '#7A5B00' }}>
            This chart of accounts is managed centrally from <strong>Twelve Business Strategies</strong> and kept in sync across all clients — it's read-only here to avoid conflicting edits.
          </div>
        </Card>
      )}

      {isMaster && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Code</label>
              <input style={{ width: 90 }} placeholder="6300" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Name</label>
              <input style={{ width: '100%' }} placeholder="Account name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {form.type === 'Expense' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, marginBottom: 8 }}>
                <input type="checkbox" checked={form.isCogs} onChange={e => setForm(f => ({ ...f, isCogs: e.target.checked }))} /> Cost of Goods Sold
              </label>
            )}
            <button onClick={addAccount} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
              <Plus size={15} /> Add account
            </button>
          </div>
          {error && <div style={{ color: '#B00020', fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
        </Card>
      )}

      {grouped.map(g => g.rows.length > 0 && (
        <Card key={g.type} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{g.type}</div>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
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
                        {editDraft.type === 'Expense' && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginTop: 4, whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={editDraft.isCogs} onChange={e => setEditDraft(d => ({ ...d, isCogs: e.target.checked }))} /> COGS
                          </label>
                        )}
                      </td>
                      <td style={{ padding: '6px 4px', width: 90, display: 'flex', gap: 4 }}>
                        <button onClick={() => saveEdit(a.code)} style={iconBtn}><Check size={14} /></button>
                        <button onClick={() => setEditingCode(null)} style={iconBtn}><X size={14} /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '6px 4px' }}>{a.name}</td>
                      <td style={{ padding: '6px 4px', width: 130, color: '#6B7280' }}>{a.type}{a.isCogs ? ' (COGS)' : ''}</td>
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
      {accounts.length === 0 && <Card><div style={{ fontSize: 14, color: '#6B7280' }}>No accounts yet.</div></Card>}
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
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>
          When to transaction's description contains this word, it will be categorized automatically with the account you choose.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Keyword</label>
            <input style={{ width: '100%' }} placeholder="Ej. NETFLIX" value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Account</label>
            <select value={form.gl} onChange={e => setForm(f => ({ ...f, gl: e.target.value }))}>
              <option value="">Select</option>
              <AccountOptions accounts={accounts} />
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Mode</label>
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
        {error && <div style={{ color: '#B00020', fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Filter by keyword</label>
            <input style={{ width: '100%' }} placeholder="Search keyword..." value={filters.keyword} onChange={e => setFilters(f => ({ ...f, keyword: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Filter by account</label>
            <select value={filters.gl} onChange={e => setFilters(f => ({ ...f, gl: e.target.value }))}>
              <option value="">All</option>
              <AccountOptions accounts={accounts} />
            </select>
          </div>
          {filtersActive && (
            <button onClick={() => setFilters({ keyword: '', gl: '' })} style={iconBtn}>Clear filters</button>
          )}
        </div>
        {filtersActive && <div style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>{filteredRules.length} of {rules.length} rules</div>}
      </Card>

      <Card>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
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
        {filteredRules.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>{rules.length === 0 ? 'No rules yet.' : 'No rules match these filters.'}</div>}
      </Card>
    </div>
  );
}

function JournalEntriesView({ journalEntries, setJournalEntries, accounts }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankJE());
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);

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
    if (editingId) {
      setJournalEntries(prev => prev.map(j => j.id === editingId ? { ...form, id: editingId } : j));
    } else {
      setJournalEntries(prev => [...prev, { ...form, id: uid() }]);
    }
    setForm(blankJE());
    setEditingId(null);
    setShowForm(false);
  }
  function editJE(je) {
    setForm({ date: je.date, memo: je.memo, lines: je.lines.map(l => ({ ...l })) });
    setEditingId(je.id);
    setShowForm(true);
    setError('');
  }
  function cancelForm() {
    setForm(blankJE());
    setEditingId(null);
    setShowForm(false);
    setError('');
  }
  function removeJE(id) {
    setJournalEntries(prev => prev.filter(j => j.id !== id));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Journal Entries</h2>
        <button onClick={() => { if (showForm) { cancelForm(); } else { setForm(blankJE()); setEditingId(null); setShowForm(true); } }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
          <Plus size={15} /> New entry
        </button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{editingId ? 'Editing entry' : 'New entry'}</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Memo</label>
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

          <div style={{ display: 'flex', gap: 16, fontSize: 14, marginBottom: 12 }}>
            <span>Total debit: <strong>{money(totalDebit)}</strong></span>
            <span>Total credit: <strong>{money(totalCredit)}</strong></span>
            <span style={{ color: balanced ? '#0F6E56' : '#B00020', fontWeight: 600 }}>{balanced ? "Balanced" : "Doesn't balance"}</span>
          </div>
          {error && <div style={{ color: '#B00020', fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveJE} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>{editingId ? 'Update entry' : 'Save entry'}</button>
            {editingId && <button onClick={cancelForm} style={iconBtn}>Cancel</button>}
          </div>
        </Card>
      )}

      <Card>
        {journalEntries.slice().reverse().map(je => (
          <div key={je.id} style={{ borderBottom: '1px solid #F0F1F3', padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
              <span>{je.date} — {je.memo || 'No memo'}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => editJE(je)} style={iconBtn}>Edit</button>
                <button onClick={() => removeJE(je.id)} style={iconBtn}><Trash2 size={14} /></button>
              </div>
            </div>
            {je.lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6B7280', paddingLeft: 12 }}>
                <span>{l.gl} — {l.desc}</span>
                <span>{l.debit ? `Db ${money(l.debit)}` : `Cr ${money(l.credit)}`}</span>
              </div>
            ))}
          </div>
        ))}
        {journalEntries.length === 0 && <div style={{ fontSize: 14, color: '#6B7280' }}>No manual entries yet.</div>}
      </Card>
    </div>
  );
}

// ============ PAYROLL ============

const SS_RATE = 0.062;
const MEDICARE_RATE = 0.0145;
const SS_WAGE_BASE_DEFAULT = 168600; // tope anual de Social Security — verifica/actualiza cada año

function blankEmployee() { return { name: '', payType: 'hourly', rate: '', active: true }; }

function computeGross(employee, hours, extraGross) {
  const extra = Number(extraGross) || 0;
  if (!employee) return extra;
  if (employee.payType === 'hourly') return (Number(hours) || 0) * (Number(employee.rate) || 0) + extra;
  return (Number(employee.rate) || 0) + extra; // salary: rate = monto del período
}

// Suma el gross ya pagado a este empleado en el mismo año calendario, en OTRAS corridas
// (para aplicar el tope anual de Social Security correctamente).
function ytdGrossBeforeRun(employeeId, run, payrollRuns, payrollLines) {
  if (!run) return 0;
  const year = run.payDate.slice(0, 4);
  const otherRunIds = payrollRuns.filter(r => r.id !== run.id && r.payDate.slice(0, 4) === year && r.payDate <= run.payDate).map(r => r.id);
  return payrollLines
    .filter(l => l.employeeId === employeeId && otherRunIds.includes(l.payrollRunId))
    .reduce((s, l) => s + (Number(l.gross) || 0), 0);
}

function autoSocialSecurity(gross, ytdBefore, ssWageBase) {
  const remaining = Math.max(0, ssWageBase - ytdBefore);
  const taxable = Math.min(gross, remaining);
  return Math.max(0, taxable) * SS_RATE;
}
function autoMedicare(gross) { return gross * MEDICARE_RATE; }

function lineNet(l) {
  return (Number(l.gross) || 0) - (Number(l.federalIncomeTax) || 0) - (Number(l.prIncomeTax) || 0)
    - (Number(l.socialSecurity) || 0) - (Number(l.medicare) || 0) - (Number(l.sinot) || 0)
    - (Number(l.otherDeductions) || 0) + (Number(l.reimbursement) || 0);
}

function findAccountCode(accounts, name) {
  const acc = accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
  return acc ? acc.code : null;
}

function PayrollView({ employees, setEmployees, payrollRuns, setPayrollRuns, payrollLines, setPayrollLines, businessName, accounts, journalEntries, setJournalEntries }) {
  const [subTab, setSubTab] = useState('runs'); // 'employees' | 'runs'
  const [openRunId, setOpenRunId] = useState(null);
  const [printRunId, setPrintRunId] = useState(null);

  function postPayrollToJournal(run) {
    const lines = payrollLines.filter(l => l.payrollRunId === run.id);
    if (lines.length === 0) { alert('This run has no employees added yet.'); return; }
    if (run.postedJeId && journalEntries.some(j => j.id === run.postedJeId)) {
      alert('This payroll run was already posted to Journal Entries.');
      return;
    }
    const totalGross = lines.reduce((s, l) => s + (Number(l.gross) || 0), 0);
    const totalFederal = lines.reduce((s, l) => s + (Number(l.federalIncomeTax) || 0), 0);
    const totalSS = lines.reduce((s, l) => s + (Number(l.socialSecurity) || 0), 0);
    const totalMedicare = lines.reduce((s, l) => s + (Number(l.medicare) || 0), 0);
    const totalFica = totalSS + totalMedicare;
    const totalSinot = lines.reduce((s, l) => s + (Number(l.sinot) || 0), 0);
    const totalPR = lines.reduce((s, l) => s + (Number(l.prIncomeTax) || 0), 0);
    const totalOther = lines.reduce((s, l) => s + (Number(l.otherDeductions) || 0), 0);
    const totalReimb = lines.reduce((s, l) => s + (Number(l.reimbursement) || 0), 0);
    const totalNet = lines.reduce((s, l) => s + lineNet(l), 0);

    const codes = {
      wages: findAccountCode(accounts, 'Wages, Commissions and Employee Bonuses'),
      payrollTaxExp: findAccountCode(accounts, 'Payroll Tax Expense (Employer Match)'),
      ficaPayable: findAccountCode(accounts, 'FICA Taxes Payable'),
      ficaWithheld: findAccountCode(accounts, 'FICA Taxes Withheld Payable'),
      sinotPayable: findAccountCode(accounts, 'SINOT Payable'),
      sinotWithheld: findAccountCode(accounts, 'SINOT Withheld Payable'),
      incomeTax: findAccountCode(accounts, 'Income Taxes Payable'),
      netPayable: findAccountCode(accounts, 'S&W Payroll Payable'),
    };
    const missing = Object.entries(codes).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      alert('These accounts are missing from the Chart of Accounts: ' + missing.join(', ') + '. Run the payroll GL setup script first.');
      return;
    }

    const jeLines = [{ gl: codes.wages, debit: totalGross.toFixed(2), credit: '', desc: 'Gross wages' }];
    if (totalFica + totalSinot > 0) {
      jeLines.push({ gl: codes.payrollTaxExp, debit: (totalFica + totalSinot).toFixed(2), credit: '', desc: 'Employer FICA + SINOT match' });
    }
    if (totalReimb > 0) {
      jeLines.push({ gl: codes.wages, debit: totalReimb.toFixed(2), credit: '', desc: 'Reimbursements' });
    }
    if (totalFica > 0) {
      jeLines.push({ gl: codes.ficaPayable, debit: '', credit: totalFica.toFixed(2), desc: 'FICA employer match payable' });
      jeLines.push({ gl: codes.ficaWithheld, debit: '', credit: totalFica.toFixed(2), desc: 'FICA withheld from employees' });
    }
    if (totalSinot > 0) {
      jeLines.push({ gl: codes.sinotPayable, debit: '', credit: totalSinot.toFixed(2), desc: 'SINOT employer match payable' });
      jeLines.push({ gl: codes.sinotWithheld, debit: '', credit: totalSinot.toFixed(2), desc: 'SINOT withheld from employees' });
    }
    if (totalPR > 0) jeLines.push({ gl: codes.incomeTax, debit: '', credit: totalPR.toFixed(2), desc: 'PR income tax withheld' });
    if (totalFederal > 0) jeLines.push({ gl: codes.incomeTax, debit: '', credit: totalFederal.toFixed(2), desc: 'Federal income tax withheld' });
    if (totalOther > 0) jeLines.push({ gl: codes.incomeTax, debit: '', credit: totalOther.toFixed(2), desc: 'Other payroll deductions' });
    jeLines.push({ gl: codes.netPayable, debit: '', credit: totalNet.toFixed(2), desc: 'Net pay payable to employees' });

    const jeId = uid();
    const je = { id: jeId, date: run.payDate, memo: `Payroll — ${run.periodStart} to ${run.periodEnd}`, lines: jeLines };
    setJournalEntries(prev => [...prev, je]);
    setPayrollRuns(prev => prev.map(r => r.id === run.id ? { ...r, postedJeId: jeId } : r));
    alert('Posted to Journal Entries.');
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Payroll</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setSubTab('runs')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E2E5E9', cursor: 'pointer', fontSize: 14, background: subTab === 'runs' ? '#17365D' : '#fff', color: subTab === 'runs' ? '#fff' : '#1F2933' }}>Payroll Runs</button>
          <button onClick={() => setSubTab('employees')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E2E5E9', cursor: 'pointer', fontSize: 14, background: subTab === 'employees' ? '#17365D' : '#fff', color: subTab === 'employees' ? '#fff' : '#1F2933' }}>Employees</button>
        </div>
      </div>

      {subTab === 'employees' && <EmployeesTab employees={employees} setEmployees={setEmployees} />}
      {subTab === 'runs' && !openRunId && (
        <PayrollRunsList payrollRuns={payrollRuns} setPayrollRuns={setPayrollRuns} payrollLines={payrollLines}
          employees={employees} onOpenRun={setOpenRunId} onPrintRun={setPrintRunId} onPost={postPayrollToJournal} />
      )}
      {subTab === 'runs' && openRunId && (
        <PayrollRunDetail runId={openRunId} payrollRuns={payrollRuns} payrollLines={payrollLines} setPayrollLines={setPayrollLines}
          employees={employees} onBack={() => setOpenRunId(null)} onPrint={() => setPrintRunId(openRunId)} onPost={postPayrollToJournal} />
      )}
      {printRunId && (
        <PayrollRegisterModal runId={printRunId} payrollRuns={payrollRuns} payrollLines={payrollLines} employees={employees}
          businessName={businessName} onClose={() => setPrintRunId(null)} />
      )}
    </div>
  );
}

function EmployeesTab({ employees, setEmployees }) {
  const [form, setForm] = useState(blankEmployee());
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(blankEmployee());

  function addEmployee() {
    if (!form.name.trim()) { setError('Enter the employee name.'); return; }
    if (!form.rate || Number(form.rate) <= 0) { setError(form.payType === 'hourly' ? 'Enter an hourly rate.' : 'Enter the salary amount per period.'); return; }
    setError('');
    setEmployees(prev => [...prev, { id: uid(), name: form.name.trim(), payType: form.payType, rate: Number(form.rate), active: true }]);
    setForm(blankEmployee());
  }
  function startEdit(e) { setEditingId(e.id); setEditDraft({ name: e.name, payType: e.payType, rate: e.rate, active: e.active }); }
  function saveEdit(id) {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...editDraft, rate: Number(editDraft.rate) } : e));
    setEditingId(null);
  }
  function toggleActive(e) { setEmployees(prev => prev.map(x => x.id === e.id ? { ...x, active: !x.active } : x)); }
  function removeEmployee(id) {
    if (!window.confirm('Delete this employee? This does not remove them from past payroll runs already saved.')) return;
    setEmployees(prev => prev.filter(e => e.id !== id));
  }

  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Add employee</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Pay type</label>
            <select value={form.payType} onChange={e => setForm(f => ({ ...f, payType: e.target.value }))}>
              <option value="hourly">Hourly</option>
              <option value="salary">Salary (per period)</option>
            </select></div>
          <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>{form.payType === 'hourly' ? 'Hourly rate' : 'Salary per period'}</label>
            <input type="number" step="0.01" style={{ width: 120 }} value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} /></div>
          <button onClick={addEmployee} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
            <Plus size={15} /> Add
          </button>
        </div>
        {error && <div style={{ color: '#B00020', fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
      </Card>

      <Card>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>Name</th><th style={{ padding: '6px 4px' }}>Pay type</th>
            <th style={{ padding: '6px 4px' }}>Rate</th><th style={{ padding: '6px 4px' }}>Status</th><th></th>
          </tr></thead>
          <tbody>
            {employees.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid #F0F1F3' }}>
                {editingId === e.id ? (
                  <>
                    <td style={{ padding: '6px 4px' }}><input value={editDraft.name} onChange={ev => setEditDraft(d => ({ ...d, name: ev.target.value }))} /></td>
                    <td style={{ padding: '6px 4px' }}>
                      <select value={editDraft.payType} onChange={ev => setEditDraft(d => ({ ...d, payType: ev.target.value }))}>
                        <option value="hourly">Hourly</option><option value="salary">Salary (per period)</option>
                      </select></td>
                    <td style={{ padding: '6px 4px' }}><input type="number" step="0.01" style={{ width: 100 }} value={editDraft.rate} onChange={ev => setEditDraft(d => ({ ...d, rate: ev.target.value }))} /></td>
                    <td style={{ padding: '6px 4px' }}>{e.active ? 'Active' : 'Inactive'}</td>
                    <td style={{ padding: '6px 4px', display: 'flex', gap: 4 }}>
                      <button onClick={() => saveEdit(e.id)} style={iconBtn}><Check size={14} /></button>
                      <button onClick={() => setEditingId(null)} style={iconBtn}><X size={14} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: '6px 4px' }}>{e.name}</td>
                    <td style={{ padding: '6px 4px', color: '#6B7280' }}>{e.payType === 'hourly' ? 'Hourly' : 'Salary'}</td>
                    <td style={{ padding: '6px 4px' }}>{money(e.rate)}{e.payType === 'hourly' ? '/hr' : '/period'}</td>
                    <td style={{ padding: '6px 4px' }}>{e.active ? 'Active' : 'Inactive'}</td>
                    <td style={{ padding: '6px 4px', display: 'flex', gap: 4 }}>
                      <button onClick={() => startEdit(e)} style={iconBtn}>Edit</button>
                      <button onClick={() => toggleActive(e)} style={iconBtn}>{e.active ? 'Deactivate' : 'Activate'}</button>
                      <button onClick={() => removeEmployee(e.id)} style={iconBtn}><Trash2 size={14} /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {employees.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>No employees yet.</div>}
      </Card>
    </div>
  );
}

function PayrollRunsList({ payrollRuns, setPayrollRuns, payrollLines, employees, onOpenRun, onPrintRun, onPost }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ periodStart: todayStr(), periodEnd: todayStr(), payDate: todayStr() });
  const [error, setError] = useState('');

  function createRun() {
    if (!form.periodStart || !form.periodEnd || !form.payDate) { setError('Fill in all three dates.'); return; }
    setError('');
    const runId = uid();
    setPayrollRuns(prev => [...prev, { id: runId, periodStart: form.periodStart, periodEnd: form.periodEnd, payDate: form.payDate, status: 'DRAFT' }]);
    setShowForm(false);
    setForm({ periodStart: todayStr(), periodEnd: todayStr(), payDate: todayStr() });
    onOpenRun(runId);
  }
  function removeRun(id) {
    if (!window.confirm('Delete this payroll run and all its lines? This cannot be undone.')) return;
    setPayrollRuns(prev => prev.filter(r => r.id !== id));
  }
  function runTotals(runId) {
    const lines = payrollLines.filter(l => l.payrollRunId === runId);
    return { gross: lines.reduce((s, l) => s + (Number(l.gross) || 0), 0), net: lines.reduce((s, l) => s + lineNet(l), 0), count: lines.length };
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setShowForm(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
          <Plus size={15} /> New payroll run
        </button>
      </div>
      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Period start</label>
              <input type="date" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} /></div>
            <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Period end</label>
              <input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} /></div>
            <div><label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Pay date</label>
              <input type="date" value={form.payDate} onChange={e => setForm(f => ({ ...f, payDate: e.target.value }))} /></div>
            <button onClick={createRun} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>Create</button>
          </div>
          {error && <div style={{ color: '#B00020', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </Card>
      )}
      <Card>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '6px 4px' }}>Period</th><th style={{ padding: '6px 4px' }}>Pay date</th>
            <th style={{ padding: '6px 4px' }}>Employees</th><th style={{ padding: '6px 4px' }}>Gross</th>
            <th style={{ padding: '6px 4px' }}>Net</th><th style={{ padding: '6px 4px' }}>Status</th><th></th>
          </tr></thead>
          <tbody>
            {payrollRuns.slice().sort((a, b) => b.payDate.localeCompare(a.payDate)).map(r => {
              const t = runTotals(r.id);
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #F0F1F3' }}>
                  <td style={{ padding: '6px 4px' }}>{r.periodStart} → {r.periodEnd}</td>
                  <td style={{ padding: '6px 4px' }}>{r.payDate}</td>
                  <td style={{ padding: '6px 4px' }}>{t.count}</td>
                  <td style={{ padding: '6px 4px' }}>{money(t.gross)}</td>
                  <td style={{ padding: '6px 4px' }}>{money(t.net)}</td>
                  <td style={{ padding: '6px 4px' }}>
                    <span style={{ color: r.status === 'FINAL' ? '#0F6E56' : '#6B7280', fontWeight: r.status === 'FINAL' ? 600 : 400 }}>{r.status}</span>
                  </td>
                  <td style={{ padding: '6px 4px', display: 'flex', gap: 6 }}>
                    <button onClick={() => onOpenRun(r.id)} style={iconBtn}>Open</button>
                    <button onClick={() => onPrintRun(r.id)} style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 6 }}><Printer size={14} /> Register</button>
                    {r.postedJeId
                      ? <span style={{ fontSize: 12, color: '#0F6E56', alignSelf: 'center' }}>✓ Posted</span>
                      : <button onClick={() => onPost(r)} style={iconBtn}>Post to JE</button>}
                    <button onClick={() => removeRun(r.id)} style={iconBtn}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {payrollRuns.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>No payroll runs yet.</div>}
      </Card>
    </div>
  );
}

function PayrollRunDetail({ runId, payrollRuns, payrollLines, setPayrollLines, employees, onBack, onPrint, onPost }) {
  const run = payrollRuns.find(r => r.id === runId);
  const [ssWageBase, setSsWageBase] = useState(SS_WAGE_BASE_DEFAULT);
  const linesForRun = payrollLines.filter(l => l.payrollRunId === runId);
  const employeeIdsInRun = new Set(linesForRun.map(l => l.employeeId));
  const availableToAdd = employees.filter(e => e.active && !employeeIdsInRun.has(e.id));

  if (!run) return <div>Run not found.</div>;

  function addEmployeeLine(employeeId) {
    const emp = employees.find(e => e.id === employeeId);
    const line = {
      id: uid(), payrollRunId: runId, employeeId, hours: emp.payType === 'hourly' ? '' : '',
      extraGross: 0, gross: 0, federalIncomeTax: 0, prIncomeTax: 0, socialSecurity: 0, medicare: 0, sinot: 0,
      otherDeductions: 0, otherDeductionsDesc: '', reimbursement: 0,
    };
    setPayrollLines(prev => [...prev, line]);
  }
  function updateLine(id, patch) {
    setPayrollLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, ...patch };
      const emp = employees.find(e => e.id === updated.employeeId);
      const gross = computeGross(emp, updated.hours, updated.extraGross);
      const ytdBefore = ytdGrossBeforeRun(updated.employeeId, run, payrollRuns, payrollLines.filter(x => x.id !== id));
      updated.gross = gross;
      // Solo re-calcula automático SS/Medicare si el usuario no los tocó manualmente ya (heurística simple: siempre recalcula al cambiar horas/extra, el usuario puede sobreescribir después).
      if (patch.hours !== undefined || patch.extraGross !== undefined) {
        updated.socialSecurity = Number(autoSocialSecurity(gross, ytdBefore, ssWageBase).toFixed(2));
        updated.medicare = Number(autoMedicare(gross).toFixed(2));
      }
      return updated;
    }));
  }
  function removeLine(id) {
    setPayrollLines(prev => prev.filter(l => l.id !== id));
  }
  function recalcFica(id) {
    const l = linesForRun.find(x => x.id === id);
    if (!l) return;
    const ytdBefore = ytdGrossBeforeRun(l.employeeId, run, payrollRuns, payrollLines.filter(x => x.id !== id));
    updateLine(id, { socialSecurity: Number(autoSocialSecurity(l.gross, ytdBefore, ssWageBase).toFixed(2)), medicare: Number(autoMedicare(l.gross).toFixed(2)) });
  }

  const totalGross = linesForRun.reduce((s, l) => s + (Number(l.gross) || 0), 0);
  const totalNet = linesForRun.reduce((s, l) => s + lineNet(l), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <button onClick={onBack} style={{ ...iconBtn, marginBottom: 8 }}>← Back to Payroll Runs</button>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{run.periodStart} → {run.periodEnd} <span style={{ color: '#6B7280', fontWeight: 400, fontSize: 14 }}>(pay date {run.payDate})</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onPrint} style={{ display: 'flex', alignItems: 'center', gap: 6, ...iconBtn }}><Printer size={14} /> Payroll Register</button>
          {run.postedJeId
            ? <span style={{ fontSize: 13, color: '#0F6E56', alignSelf: 'center' }}>✓ Posted to Journal Entries</span>
            : <button onClick={() => onPost(run)} style={iconBtn}>Post to Journal Entries</button>}
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Social Security wage base (annual cap)</label>
            <input type="number" style={{ width: 120 }} value={ssWageBase} onChange={e => setSsWageBase(Number(e.target.value) || 0)} /></div>
          <div style={{ fontSize: 12, color: '#6B7280', maxWidth: 420 }}>Verifica este monto cada año — se usa para no seguir descontando Social Security a un empleado una vez llega al tope anual. Medicare (1.45%) no tiene tope.</div>
          {availableToAdd.length > 0 && (
            <div style={{ marginLeft: 'auto' }}>
              <select onChange={e => { if (e.target.value) { addEmployeeLine(e.target.value); e.target.value = ''; } }} defaultValue="">
                <option value="">+ Add employee to this run…</option>
                {availableToAdd.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
            <th style={{ padding: '4px' }}>Employee</th>
            <th style={{ padding: '4px' }}>Hours</th>
            <th style={{ padding: '4px' }}>Extra (bonus/OT)</th>
            <th style={{ padding: '4px' }}>Gross</th>
            <th style={{ padding: '4px' }}>Federal Tax</th>
            <th style={{ padding: '4px' }}>PR Tax</th>
            <th style={{ padding: '4px' }}>Soc. Sec.</th>
            <th style={{ padding: '4px' }}>Medicare</th>
            <th style={{ padding: '4px' }}>SINOT</th>
            <th style={{ padding: '4px' }}>Other</th>
            <th style={{ padding: '4px' }}>Reimb.</th>
            <th style={{ padding: '4px' }}>Net Pay</th>
            <th></th>
          </tr></thead>
          <tbody>
            {linesForRun.map(l => {
              const emp = employees.find(e => e.id === l.employeeId);
              return (
                <tr key={l.id} style={{ borderBottom: '1px solid #F0F1F3' }}>
                  <td style={{ padding: '4px', fontWeight: 600 }}>{emp?.name || '(deleted employee)'}</td>
                  <td style={{ padding: '4px' }}>
                    {emp?.payType === 'hourly'
                      ? <input type="number" step="0.01" style={{ width: 70 }} value={l.hours} onChange={e => updateLine(l.id, { hours: e.target.value })} />
                      : <span style={{ color: '#6B7280' }}>—</span>}
                  </td>
                  <td style={{ padding: '4px' }}><input type="number" step="0.01" style={{ width: 80 }} value={l.extraGross} onChange={e => updateLine(l.id, { extraGross: e.target.value })} /></td>
                  <td style={{ padding: '4px', fontWeight: 600 }}>{money(l.gross)}</td>
                  <td style={{ padding: '4px' }}><input type="number" step="0.01" style={{ width: 80 }} value={l.federalIncomeTax} onChange={e => updateLine(l.id, { federalIncomeTax: e.target.value })} /></td>
                  <td style={{ padding: '4px' }}><input type="number" step="0.01" style={{ width: 80 }} value={l.prIncomeTax} onChange={e => updateLine(l.id, { prIncomeTax: e.target.value })} /></td>
                  <td style={{ padding: '4px' }}>
                    <input type="number" step="0.01" style={{ width: 80 }} value={l.socialSecurity} onChange={e => updateLine(l.id, { socialSecurity: e.target.value })} />
                  </td>
                  <td style={{ padding: '4px' }}><input type="number" step="0.01" style={{ width: 80 }} value={l.medicare} onChange={e => updateLine(l.id, { medicare: e.target.value })} /></td>
                  <td style={{ padding: '4px' }}><input type="number" step="0.01" style={{ width: 70 }} value={l.sinot} onChange={e => updateLine(l.id, { sinot: e.target.value })} /></td>
                  <td style={{ padding: '4px' }}><input type="number" step="0.01" style={{ width: 80 }} value={l.otherDeductions} onChange={e => updateLine(l.id, { otherDeductions: e.target.value })} /></td>
                  <td style={{ padding: '4px' }}><input type="number" step="0.01" style={{ width: 70 }} value={l.reimbursement} onChange={e => updateLine(l.id, { reimbursement: e.target.value })} /></td>
                  <td style={{ padding: '4px', fontWeight: 700 }}>{money(lineNet(l))}</td>
                  <td style={{ padding: '4px', display: 'flex', gap: 4 }}>
                    <button onClick={() => recalcFica(l.id)} style={iconBtn} title="Recalculate Social Security & Medicare">↻ FICA</button>
                    <button onClick={() => removeLine(l.id)} style={iconBtn}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {linesForRun.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid #E2E5E9', fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: '4px' }}>Total ({linesForRun.length})</td>
                <td style={{ padding: '4px' }}>{money(totalGross)}</td>
                <td colSpan={7}></td>
                <td style={{ padding: '4px' }}>{money(totalNet)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
        {linesForRun.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>No employees added to this run yet — use the dropdown above.</div>}
      </Card>
    </div>
  );
}

function PayrollRegisterModal({ runId, payrollRuns, payrollLines, employees, businessName, onClose }) {
  const run = payrollRuns.find(r => r.id === runId);
  const lines = payrollLines.filter(l => l.payrollRunId === runId).map(l => ({ ...l, employee: employees.find(e => e.id === l.employeeId) }));
  const totals = lines.reduce((acc, l) => ({
    gross: acc.gross + (Number(l.gross) || 0),
    federal: acc.federal + (Number(l.federalIncomeTax) || 0),
    pr: acc.pr + (Number(l.prIncomeTax) || 0),
    ss: acc.ss + (Number(l.socialSecurity) || 0),
    medicare: acc.medicare + (Number(l.medicare) || 0),
    sinot: acc.sinot + (Number(l.sinot) || 0),
    other: acc.other + (Number(l.otherDeductions) || 0),
    reimbursement: acc.reimbursement + (Number(l.reimbursement) || 0),
    net: acc.net + lineNet(l),
  }), { gross: 0, federal: 0, pr: 0, ss: 0, medicare: 0, sinot: 0, other: 0, reimbursement: 0, net: 0 });

  function exportCSV() {
    let csv = 'Employee,Hours,Gross,PR Tax,Social Security,Medicare,FICA,SINOT,Other Deductions,Reimbursement,Net Pay\n';
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    lines.forEach(l => {
      const fica = (Number(l.socialSecurity) || 0) + (Number(l.medicare) || 0);
      csv += [esc(l.employee?.name || ''), l.hours || '', (Number(l.gross) || 0).toFixed(2),
        (Number(l.prIncomeTax) || 0).toFixed(2), (Number(l.socialSecurity) || 0).toFixed(2), (Number(l.medicare) || 0).toFixed(2), fica.toFixed(2),
        (Number(l.sinot) || 0).toFixed(2), (Number(l.otherDeductions) || 0).toFixed(2), (Number(l.reimbursement) || 0).toFixed(2), lineNet(l).toFixed(2)].join(',') + '\n';
    });
    const totalFica = totals.ss + totals.medicare;
    csv += `TOTAL,,${totals.gross.toFixed(2)},${totals.pr.toFixed(2)},${totals.ss.toFixed(2)},${totals.medicare.toFixed(2)},${totalFica.toFixed(2)},${totals.sinot.toFixed(2)},${totals.other.toFixed(2)},${totals.reimbursement.toFixed(2)},${totals.net.toFixed(2)}\n`;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `payroll_register_${run.payDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!run) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} className="no-print-overlay">
      <div style={{ background: '#fff', width: 980, maxHeight: '88vh', overflow: 'auto', borderRadius: 8, padding: 28 }} id="invoice-print-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }} className="print-hide">
          <div style={{ fontWeight: 700, fontSize: 18 }}>Payroll Register</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportCSV} style={iconBtn}>Export CSV</button>
            <button onClick={() => window.print()} style={{ ...iconBtn, display: 'flex', gap: 6 }}><Printer size={14} /> Print / PDF</button>
            <button onClick={onClose} style={iconBtn}><X size={14} /></button>
          </div>
        </div>
        <ReportHeader businessName={businessName} reportName="Payroll Register" periodStart={run.periodStart} periodEnd={run.periodEnd} logoUrl={null} />
        <div style={{ fontSize: 13, marginBottom: 14 }}>Pay date: <strong>{run.payDate}</strong></div>
        <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead><tr style={{ borderBottom: '1px solid #999', textAlign: 'left' }}>
            <th style={{ padding: '4px 4px' }}>Employee</th>
            <th style={{ padding: '4px', textAlign: 'right' }}>Gross</th>
            <th style={{ padding: '4px', textAlign: 'right' }}>PR Tax</th>
            <th style={{ padding: '4px', textAlign: 'right' }}>Soc. Sec.</th>
            <th style={{ padding: '4px', textAlign: 'right' }}>Medicare</th>
            <th style={{ padding: '4px', textAlign: 'right' }}>FICA</th>
            <th style={{ padding: '4px', textAlign: 'right' }}>SINOT</th>
            <th style={{ padding: '4px', textAlign: 'right' }}>Other</th>
            <th style={{ padding: '4px', textAlign: 'right' }}>Reimb.</th>
            <th style={{ padding: '4px', textAlign: 'right' }}>Net Pay</th>
          </tr></thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 4px' }}>{l.employee?.name || '(deleted)'}</td>
                <td style={{ padding: '4px', textAlign: 'right' }}>{money(l.gross)}</td>
                <td style={{ padding: '4px', textAlign: 'right' }}>{money(l.prIncomeTax)}</td>
                <td style={{ padding: '4px', textAlign: 'right' }}>{money(l.socialSecurity)}</td>
                <td style={{ padding: '4px', textAlign: 'right' }}>{money(l.medicare)}</td>
                <td style={{ padding: '4px', textAlign: 'right' }}>{money((Number(l.socialSecurity) || 0) + (Number(l.medicare) || 0))}</td>
                <td style={{ padding: '4px', textAlign: 'right' }}>{money(l.sinot)}</td>
                <td style={{ padding: '4px', textAlign: 'right' }}>{money(l.otherDeductions)}</td>
                <td style={{ padding: '4px', textAlign: 'right' }}>{money(l.reimbursement)}</td>
                <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700 }}>{money(lineNet(l))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #333', fontWeight: 700 }}>
              <td style={{ padding: '4px 4px' }}>Total ({lines.length})</td>
              <td style={{ padding: '4px', textAlign: 'right' }}>{money(totals.gross)}</td>
              <td style={{ padding: '4px', textAlign: 'right' }}>{money(totals.pr)}</td>
              <td style={{ padding: '4px', textAlign: 'right' }}>{money(totals.ss)}</td>
              <td style={{ padding: '4px', textAlign: 'right' }}>{money(totals.medicare)}</td>
              <td style={{ padding: '4px', textAlign: 'right' }}>{money(totals.ss + totals.medicare)}</td>
              <td style={{ padding: '4px', textAlign: 'right' }}>{money(totals.sinot)}</td>
              <td style={{ padding: '4px', textAlign: 'right' }}>{money(totals.other)}</td>
              <td style={{ padding: '4px', textAlign: 'right' }}>{money(totals.reimbursement)}</td>
              <td style={{ padding: '4px', textAlign: 'right' }}>{money(totals.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <style>{`@media print { .no-print-overlay { position: static !important; background: none !important; } .print-hide { display: none !important; } body * { visibility: hidden; } #invoice-print-area, #invoice-print-area * { visibility: visible; } #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
    </div>
  );
}


function ReconciliationView({ reconciliations, setReconciliations, transactions, setTransactions, accounts, journalEntries, reviewingId, setReviewingId, verified, setVerified }) {
  const bankAccounts = accounts.filter(a => a.type === 'Asset' || a.type === 'Liability');
  const [form, setForm] = useState({ gl: '', periodEnd: todayStr(), statementBalance: '' });
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [reviewFilters, setReviewFilters] = useState({ dateFrom: '', dateTo: '', description: '', amount: '' });
  const [reviewSort, setReviewSort] = useState({ column: null, dir: 'asc' });
  const [reviewSign, setReviewSign] = useState(''); // '' | 'positive' | 'negative'
  const [reviewDates, setReviewDates] = useState([]); // fechas específicas seleccionadas (vacío = todas)
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  function toggleReviewSort(column) {
    setReviewSort(prev => prev.column === column ? { column, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { column, dir: 'asc' });
  }

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
    const newId = uid();
    const matchingTxIds = transactions.filter(t => t.sourceGL === form.gl && t.date <= form.periodEnd).map(t => t.id);
    const matchingJeIds = jePostingsFor(form.gl, form.periodEnd).map(p => p.id);
    const verifiedIds = status === 'PASS' ? [...matchingTxIds, ...matchingJeIds] : [];
    setReconciliations(prev => [...prev, {
      id: newId, gl: form.gl, periodEnd: form.periodEnd, statementBalance, ledgerBalance, difference, status, verifiedIds,
    }]);
    setForm({ gl: '', periodEnd: todayStr(), statementBalance: '' });
    if (status !== 'PASS') openReview(newId);
  }

  function refreshReconciliation(r, ledgerBalanceOverride, verifiedIdsOverride) {
    const ledgerBalance = ledgerBalanceOverride !== undefined ? ledgerBalanceOverride : ledgerBalanceFor(r.gl, r.periodEnd);
    const difference = Number((r.statementBalance - ledgerBalance).toFixed(2));
    const status = Math.abs(difference) < 0.01 ? 'PASS' : 'REVIEW';
    setReconciliations(prev => prev.map(x => x.id === r.id ? { ...x, ledgerBalance, difference, status, verifiedIds: verifiedIdsOverride !== undefined ? verifiedIdsOverride : x.verifiedIds } : x));
  }

  function openReview(id) {
    setReviewingId(id);
    const r = reconciliations.find(x => x.id === id);
    // se recuerdan siempre las marcas guardadas, sin importar si el período ya quedó
    // aprobado o sigue en REVIEW — así no se pierde el trabajo mientras completas el proceso.
    setVerified(r?.verifiedIds || []);
    setVerifiedHistory([]);
    setReviewSort({ column: null, dir: 'asc' });
    setReviewFilters({ dateFrom: '', dateTo: '', description: '', amount: '' });
    setReviewSign('');
    setReviewDates([]);
  }
  const [verifiedHistory, setVerifiedHistory] = useState([]);
  function toggleVerified(id) {
    setVerifiedHistory(h => [...h, verified]);
    setVerified(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleVerifiedAll(periodTx) {
    setVerifiedHistory(h => [...h, verified]);
    const ids = periodTx.map(t => t.id);
    const allChecked = ids.length > 0 && ids.every(id => verified.includes(id));
    setVerified(allChecked ? verified.filter(id => !ids.includes(id)) : Array.from(new Set([...verified, ...ids])));
  }
  function undoLastMark() {
    setVerifiedHistory(h => {
      if (h.length === 0) return h;
      setVerified(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }
  function editTxDate(id, date) { setTransactions(prev => prev.map(t => t.id === id ? { ...t, date } : t)); }
  function editTxAmount(id, amount) { setTransactions(prev => prev.map(t => t.id === id ? { ...t, amount: Number(amount) } : t)); }
  function editTxAccount(id, sourceGL) { setTransactions(prev => prev.map(t => t.id === id ? { ...t, sourceGL } : t)); }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Bank Reconciliation</h2>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>
          Enter the real statement balance at period close. The system automatically compares it against the balance calculated from your transactions.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Account</label>
            <select value={form.gl} onChange={e => setForm(f => ({ ...f, gl: e.target.value }))}>
              <option value="">Select</option>
              {bankAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>As of</label>
            <input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#6B7280', display: 'block' }}>Statement balance</label>
            <input type="number" step="0.01" style={{ width: 140 }} value={form.statementBalance} onChange={e => setForm(f => ({ ...f, statementBalance: e.target.value }))} />
          </div>
          <button onClick={runReconciliation} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Reconcile</button>
        </div>
        {error && <div style={{ color: '#B00020', fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} />{error}</div>}
      </Card>
      {selected.length > 0 && (
        <Card style={{ marginBottom: 20, borderColor: '#17365D' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{selected.length} selected</span>
            <button onClick={deleteSelected} style={iconBtn}>Delete selected</button>
            <button onClick={() => setSelected([])} style={iconBtn}>Cancel selection</button>
          </div>
        </Card>
      )}
      <Card style={{ marginBottom: 20 }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
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
        {reconciliations.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>No reconciliations yet.</div>}
      </Card>

      {reviewingId && (() => {
        const r = reconciliations.find(x => x.id === reviewingId);
        if (!r) return null;
        const priorApprovedVerified = new Set();
        reconciliations.filter(x => x.gl === r.gl && x.status === 'PASS' && x.periodEnd < r.periodEnd && x.id !== r.id)
          .forEach(x => (x.verifiedIds || []).forEach(id => priorApprovedVerified.add(id)));
        const allMatching = [
          ...transactions.filter(t => t.sourceGL === r.gl && t.date <= r.periodEnd),
          ...jePostingsFor(r.gl, r.periodEnd),
        ];
        const priorApprovedTotal = allMatching.filter(t => priorApprovedVerified.has(t.id)).reduce((s, t) => s + t.amount, 0);
        const periodTx = allMatching.filter(t => !priorApprovedVerified.has(t.id)).sort((a, b) => a.date.localeCompare(b.date));
        const availableDates = Array.from(new Set(periodTx.map(t => t.date))).sort();
        const filteredPeriodTxUnsorted = periodTx.filter(t => {
          if (reviewFilters.dateFrom && t.date < reviewFilters.dateFrom) return false;
          if (reviewFilters.dateTo && t.date > reviewFilters.dateTo) return false;
          if (reviewFilters.description.trim() && !t.description.toUpperCase().includes(reviewFilters.description.trim().toUpperCase())) return false;
          if (reviewFilters.amount.trim() && Math.abs(Math.abs(t.amount) - Number(reviewFilters.amount)) > 0.005) return false;
          if (reviewSign === 'positive' && t.amount < 0) return false;
          if (reviewSign === 'negative' && t.amount >= 0) return false;
          if (reviewDates.length > 0 && !reviewDates.includes(t.date)) return false;
          return true;
        });
        const filteredPeriodTx = filteredPeriodTxUnsorted.slice().sort((a, b) => {
          if (!reviewSort.column) return 0;
          let cmp = 0;
          if (reviewSort.column === 'date') cmp = a.date.localeCompare(b.date);
          else if (reviewSort.column === 'description') cmp = a.description.localeCompare(b.description);
          else if (reviewSort.column === 'amount') cmp = a.amount - b.amount;
          return reviewSort.dir === 'asc' ? cmp : -cmp;
        });
        const verifiedTx = periodTx.filter(t => verified.includes(t.id));
        const liveLedger = priorApprovedTotal + verifiedTx.reduce((s, t) => s + t.amount, 0);
        const verifiedDebits = verifiedTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
        const verifiedCredits = verifiedTx.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
        const liveDiff = Number((r.statementBalance - liveLedger).toFixed(2));
        const reviewFiltersActive = reviewFilters.dateFrom || reviewFilters.dateTo || reviewFilters.description.trim() || reviewFilters.amount.trim() || reviewSign || reviewDates.length > 0;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <Card style={{ width: 900, maxHeight: '85vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 600 }}>{accounts.find(a => a.code === r.gl)?.name} — as of {r.periodEnd}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={undoLastMark} disabled={verifiedHistory.length === 0} style={iconBtn}>Undo</button>
                  <button onClick={() => { if (window.confirm('Clear all checkmarks for this period and start over?')) { setVerified([]); setVerifiedHistory([]); } }} style={iconBtn}>Reset marks</button>
                  <button onClick={() => setReviewingId(null)} style={iconBtn}><X size={14} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20, fontSize: 14, marginBottom: 8, flexWrap: 'wrap' }}>
                <span>Statement: <strong>{money(r.statementBalance)}</strong></span>
                <span>Book (verified only): <strong>{money(liveLedger)}</strong></span>
                <span style={{ color: Math.abs(liveDiff) < 0.01 ? '#0F6E56' : '#B00020', fontWeight: 600 }}>Difference: {money(liveDiff)}</span>
                <span style={{ color: '#6B7280' }}>{verified.length} of {periodTx.length} verified</span>
              </div>
              <div style={{ display: 'flex', gap: 20, fontSize: 14, marginBottom: 12 }}>
                <span>Verified debits: <strong>{money(verifiedDebits)}</strong></span>
                <span>Verified credits: <strong>{money(verifiedCredits)}</strong></span>
              </div>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>
                Check off each transaction that matches your bank statement exactly — only checked transactions count toward "Book" below. Edit the date, amount, or account on any that don't match, then check it once it's correct, and click Recalculate to save.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10, padding: 8, background: '#F7F8FA', borderRadius: 6 }}>
                <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Search description</label>
                  <input style={{ width: 180 }} value={reviewFilters.description} onChange={e => setReviewFilters(f => ({ ...f, description: e.target.value }))} /></div>
                <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>From</label>
                  <input type="date" value={reviewFilters.dateFrom} onChange={e => setReviewFilters(f => ({ ...f, dateFrom: e.target.value }))} /></div>
                <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>To</label>
                  <input type="date" value={reviewFilters.dateTo} onChange={e => setReviewFilters(f => ({ ...f, dateTo: e.target.value }))} /></div>
                <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Amount</label>
                  <input type="number" step="0.01" placeholder="e.g. 397.02" style={{ width: 110 }} value={reviewFilters.amount} onChange={e => setReviewFilters(f => ({ ...f, amount: e.target.value }))} /></div>
                <div><label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Sign</label>
                  <select value={reviewSign} onChange={e => setReviewSign(e.target.value)}>
                    <option value="">All</option>
                    <option value="positive">Positive only</option>
                    <option value="negative">Negative only</option>
                  </select></div>
                <div style={{ position: 'relative' }}>
                  <label style={{ fontSize: 12, color: '#6B7280', display: 'block' }}>Dates</label>
                  <button onClick={() => setDateDropdownOpen(o => !o)} style={{ ...iconBtn, minWidth: 130, textAlign: 'left' }}>
                    {reviewDates.length === 0 ? 'All dates' : `${reviewDates.length} selected`} ▾
                  </button>
                  {dateDropdownOpen && (
                    <div style={{ position: 'absolute', zIndex: 60, top: '100%', left: 0, background: '#fff', border: '1px solid #E2E5E9', borderRadius: 6, maxHeight: 220, overflowY: 'auto', width: 160, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', padding: 6 }}>
                      <div style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 6, borderBottom: '1px solid #F0F1F3', paddingBottom: 6 }}>
                        <span onClick={() => setReviewDates(availableDates)} style={{ cursor: 'pointer', color: '#0C447C' }}>Select all</span>
                        <span onClick={() => setReviewDates([])} style={{ cursor: 'pointer', color: '#0C447C' }}>Clear</span>
                      </div>
                      {availableDates.map(d => (
                        <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '2px 0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={reviewDates.includes(d)}
                            onChange={() => setReviewDates(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])} />
                          {d}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {reviewFiltersActive && (
                  <button onClick={() => { setReviewFilters({ dateFrom: '', dateTo: '', description: '', amount: '' }); setReviewSign(''); setReviewDates([]); }} style={iconBtn}>Clear filters</button>
                )}
                {reviewFiltersActive && <span style={{ fontSize: 12, color: '#6B7280', alignSelf: 'center' }}>{filteredPeriodTx.length} of {periodTx.length} shown</span>}
              </div>
              <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E2E5E9' }}>
                  <th style={{ padding: '4px' }}>
                    <input type="checkbox" checked={filteredPeriodTx.length > 0 && filteredPeriodTx.every(t => verified.includes(t.id))} onChange={() => toggleVerifiedAll(filteredPeriodTx)} />
                  </th>
                  <th style={{ padding: '4px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleReviewSort('date')}>Date {reviewSort.column === 'date' ? (reviewSort.dir === 'asc' ? '▲' : '▼') : ''}</th>
                  <th style={{ padding: '4px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleReviewSort('description')}>Description {reviewSort.column === 'description' ? (reviewSort.dir === 'asc' ? 'A-Z' : 'Z-A') : ''}</th>
                  <th style={{ padding: '4px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleReviewSort('amount')}>Amount {reviewSort.column === 'amount' ? (reviewSort.dir === 'asc' ? '▲ min-max' : '▼ max-min') : ''}</th>
                  <th style={{ padding: '4px' }}>Account</th>
                </tr></thead>
                <tbody>
                  {filteredPeriodTx.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #F0F1F3', background: verified.includes(t.id) ? '#EAF3DE' : 'transparent' }}>
                      <td style={{ padding: '4px' }}><input type="checkbox" checked={verified.includes(t.id)} onChange={() => toggleVerified(t.id)} /></td>
                      {t.isJE ? (
                        <>
                          <td style={{ padding: '4px' }}>{t.date}</td>
                          <td style={{ padding: '4px' }}>{t.description} <span style={{ fontSize: 11, color: '#6B7280' }}>(edit from Journal Entries tab)</span></td>
                          <td style={{ padding: '4px' }}>{money(t.amount)}</td>
                          <td style={{ padding: '4px', color: '#6B7280', fontSize: 13 }}>—</td>
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
              {periodTx.length === 0 && <div style={{ fontSize: 14, color: '#6B7280', padding: 8 }}>No transactions found for this account and period.</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => setReviewingId(null)} style={iconBtn}>Close</button>
                <button onClick={() => { refreshReconciliation(r, liveLedger, verified); setReviewingId(null); }} style={{ background: '#17365D', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Recalculate</button>
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
