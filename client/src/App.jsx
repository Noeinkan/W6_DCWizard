import React, { useEffect, useState } from 'react';

const headers = () => {
  const h = { Accept: 'application/json' };
  const k = import.meta.env.VITE_DOC_CONTROLLER_API_KEY;
  if (k) h['X-Doc-Controller-Api-Key'] = k;
  return h;
};

export default function App() {
  const [connections, setConnections] = useState([]);
  const [violations, setViolations] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const r = await fetch('/api/connections', { headers: headers() });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Failed');
      setConnections(j.connections || []);
      if (j.connections?.length && !selected) setSelected(j.connections[0].id);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      try {
        const r = await fetch(`/api/connections/${selected}/violations?limit=100`, {
          headers: headers()
        });
        const j = await r.json();
        if (j.success) setViolations(j.violations || []);
      } catch {
        setViolations([]);
      }
    })();
  }, [selected]);

  const runScan = async (id) => {
    setError(null);
    try {
      const r = await fetch(`/api/connections/${id}/scan`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' }
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Scan failed');
      await load();
      const rv = await fetch(`/api/connections/${id}/violations?limit=100`, { headers: headers() });
      const vj = await rv.json();
      if (vj.success) setViolations(vj.violations || []);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 960, margin: '2rem auto', padding: 16 }}>
      <h1>Document Controller</h1>
      <p style={{ color: '#555' }}>
        ACC compliance worker. Configure connections via{' '}
        <code>POST /api/connections</code> (see README). Set{' '}
        <code>VITE_DOC_CONTROLLER_API_KEY</code> when the API uses <code>DOC_CONTROLLER_API_KEY</code>.
      </p>
      {error && <p style={{ color: 'coral' }}>{error}</p>}
      <button type="button" onClick={load}>
        Refresh
      </button>
      <h2>Connections</h2>
      {connections.length === 0 ? (
        <p>No connections yet.</p>
      ) : (
        <ul>
          {connections.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setSelected(c.id)}>
                {c.name}
              </button>{' '}
              <button type="button" onClick={() => runScan(c.id)}>
                Scan
              </button>
              <span style={{ marginLeft: 8, color: '#666' }}>
                {c.status} · last sync {c.lastSyncedAt || '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <h2>Violations {selected ? `(${selected.slice(0, 8)}…)` : ''}</h2>
      <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th>Type</th>
            <th>Severity</th>
            <th>File</th>
          </tr>
        </thead>
        <tbody>
          {violations.map((v) => (
            <tr key={v.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{v.violation_type}</td>
              <td>{v.severity}</td>
              <td>{v.filename}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
