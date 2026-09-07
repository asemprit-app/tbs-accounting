import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LayoutDashboard, Receipt, FileText, Users, BarChart3, Plus, Trash2, Check, Printer, X, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from './supabaseClient';

const GL_ACCOUNTS = [
  { code: '1010', name: 'Banco Principal', type: 'Asset' },
  { code: '1100', name: 'Accounts Receivable', type: 'Asset' },
  { code: '2020', name: 'Tarjeta de Crédito', type: 'Liability' },
  { code: '4000', name: 'Service Revenue', type: 'Revenue' },
  { code: '5010', name: 'Bank Service Charges', type: 'Expense' },
  { code: '6040', name: 'Meals and Entertainment', type: 'Expense' },
  { code: '6050', name: 'Office Supplies', type: 'Expense' },
  { code: '6060', name: 'Business Material', type: 'Expense' },
  { code: '6070', name: 'Repairs & Maintenance', type: 'Expense' },
  { code: '6090', name: 'Uniforms', type: 'Expense' },
  { code: '6100', name: 'Vehicle - Toll', type: 'Expense' },
  { code: '6120', name: 'Education & Training', type: 'Expense' },
  { code: '6160', name: 'Professional Fees', type: 'Expense' },
  { code: '6170', name: 'Rent Expense', type: 'Expense' },
  { code: '6200', name: 'Telephone', type: 'Expense' },
  { code: '6210', name: 'Travel Expense', type: 'Expense' },
  { code: '6220', name: 'Utilities', type: 'Expense' },
  { code: '6900', name: 'Other Expenses', type: 'Expense' },
];

const DEFAULT_RULES = [
  { id: 'r1', keyword: 'IRS', gl: '2250', mode: 'AUTO' },
  { id: 'r2', keyword: 'CHASE CREDIT', gl: '2020', mode: 'MATCH' },
  { id: 'r3', keyword: 'PAYROLL', gl: '5000', mode: 'AUTO' },
  { id: 'r4', keyword: 'RESTAURANT', gl: '6040', mode: 'AUTO' },
  { id: 'r5', keyword: 'OFFICE', gl: '6050', mode: 'AUTO' },
  { id: 'r6', keyword: 'TRANF ATHM', gl: '1100', mode: 'MATCH' },
  { id: 'r7', keyword: 'EFT DEPOSIT', gl: '1100', mode: 'MATCH' },
  { id: 'r8', keyword: 'USATAXPYMT', gl: '2250', mode: 'AUTO' },
  { id: 'r9', keyword: 'UNIFORM', gl: '6090', mode: 'AUTO' },
  { id: 'r10', keyword: 'RENT', gl: '6170', mode: 'AUTO' },
  { id: 'r11', keyword: 'TELEPHONE', gl: '6200', mode: 'AUTO' },
  { id: 'r12', keyword: 'TRAVEL', gl: '6210', mode: 'AUTO' },
  { id: 'r13', keyword: 'ELECTRIC', gl: '6220', mode: 'AUTO' },
  { id: 'r14', keyword: 'WATER', gl: '6220', mode: 'AUTO' },
  { id: 'r15', keyword: 'BANK FEE', gl: '5010', mode: 'AUTO' },
  { id: 'r16', keyword: 'TOLL', gl: '6100', mode: 'AUTO' },
];

function parseBankCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;
    const [date, description, amountRaw] = cols;
    const amount = Number(String(amountRaw).replace(/[^0-9.-]/g, ''));
    if (!date || !description || isNaN(amount)) continue;
    if (/^(date|fecha)$/i.test(date)) continue;
    rows.push({ date, description, amount });
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

function diffSync(table, prevArr, nextArr) {
  const prevMap = new Map(prevArr.map(x => [x.id, x]));
  const nextMap = new Map(nextArr.map(x => [x.id, x]));
  const toDelete = prevArr.filter(x => !nextMap.has(x.id)).map(x => x.id);
  const toInsert = nextArr.filter(x => !prevMap.has(x.id));
  const toUpdate = nextArr.filter(x => prevMap.has(x.id) && JSON.stringify(prevMap.get(x.id)) !== JSON.stringify(x));
  if (toDelete.length) supabase.from(table).delete().in('id', toDelete).then(({ error }) => error && console.error(table, 'delete', error));
  if (toInsert.length) supabase.from(table).insert(toInsert).then(({ error }) => error && console.error(table, 'insert', error));
  toUpdate.forEach(row => {
    supabase.from(table).update(row).eq('id', row.id).then(({ error }) => error && console.error(table, 'update', error));
  });
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [transactions, setTransactionsRaw] = useState([]);
  const [invoices, setInvoicesRaw] = useState([]);
  const [customers, setCustomersRaw] = useState([]);
  const [rules] = useState(DEFAULT_RULES);
  const [printInvoice, setPrintInvoice] = useState(null);

  useEffect(() => {
    (async () => {
      const [t, i, c] = await Promise.all([
        supabase.from('transactions').select('*').order('date'),
        supabase.from('invoices').select('*').order('date'),
        supabase.from('customers').select('*'),
      ]);
      if (t.error || i.error || c.error) {
        setLoadError((t.error || i.error || c.error).message);
      } else {
        setTransactionsRaw((t.data || []).map(r => ({ ...r, amount: Number(r.amount) })));
        setInvoicesRaw((i.data || []).map(r => ({ ...r, retentionPct: r.retention_pct, paid: Number(r.paid) || 0 })));
        setCustomersRaw(c.data || []);
      }
      setLoaded(true);
    })();
  }, []);

  const setTransactions = useCallback((updater) => {
    setTransactionsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      diffSync('transactions', prev, next.map(({ ...r }) => r));
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
      diffSync('invoices', prevForDb, forDb);
      return next;
    });
  }, []);
  const setCustomers = useCallback((updater) => {
    setCustomersRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      diffSync('customers', prev, next);
      return next;
    });
  }, []);

  const glName = (code) => GL_ACCOUNTS.find(g => g.code === code)?.name || 'Sin categoría';

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
      <Sidebar tab={tab} setTab={setTab} reviewCount={summary.review} />
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
            transactions={transactions} setTransactions={setTransactions} rules={rules} glName={glName}
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
        {tab === 'reports' && <ReportsView transactions={transactions} invoices={invoices} glName={glName} invoiceTotal={invoiceTotal} />}
        </>
        )}
      </div>
      {printInvoice && <InvoicePrintModal inv={printInvoice} total={invoiceTotal(printInvoice)} onClose={() => setPrintInvoice(null)} />}
    </div>
  );
}

function Sidebar({ tab, setTab, reviewCount }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transacciones', icon: Receipt, badge: reviewCount },
    { id: 'invoices', label: 'Facturas', icon: FileText },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'reports', label: 'Reportes', icon: BarChart3 },
  ];
  return (
    <div style={{ width: 200, background: '#17365D', color: '#fff', padding: '20px 12px', flexShrink: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 16, padding: '0 10px 20px' }}>TBS Accounting</div>
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

function TransactionsView({ transactions, setTransactions, rules, glName }) {
  const [form, setForm] = useState({ date: todayStr(), description: '', amount: '' });
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importError, setImportError] = useState('');

  function importCSV() {
    const rows = parseBankCSV(csvText);
    if (rows.length === 0) {
      setImportError('No se reconoció ninguna fila válida. Formato esperado por línea: fecha,descripción,monto');
      return;
    }
    setImportError('');
    const newTx = rows.map(r => {
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
                    {GL_ACCOUNTS.map(g => <option key={g.code} value={g.code}>{g.code} — {g.name}</option>)}
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

function ReportsView({ transactions, invoices, glName, invoiceTotal }) {
  const byMonth = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      const m = t.date.slice(0, 7);
      map[m] = map[m] || { revenue: 0, expense: 0 };
      const acct = GL_ACCOUNTS.find(g => g.code === t.gl);
      if (acct?.type === 'Expense') map[m].expense += t.amount;
    });
    invoices.forEach(inv => {
      const m = inv.date.slice(0, 7);
      map[m] = map[m] || { revenue: 0, expense: 0 };
      map[m].revenue += invoiceTotal(inv);
    });
    return Object.entries(map).sort();
  }, [transactions, invoices, invoiceTotal]);

  function downloadCSV() {
    let csv = 'Mes,Ingresos,Gastos,Neto\n';
    byMonth.forEach(([m, v]) => { csv += `${m},${v.revenue.toFixed(2)},${v.expense.toFixed(2)},${(v.revenue - v.expense).toFixed(2)}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'reporte_mensual.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Reportes mensuales</h2>
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
