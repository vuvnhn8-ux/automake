'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';

interface WorkerRow {
  workerId: string;
  hostname: string;
  status: string;
  currentJob: string | null;
  version: string | null;
  concurrency: number;
  ffmpegAvailable: boolean;
  lastSeenAt: string;
  online: boolean;
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<WorkerRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ workers: WorkerRow[] }>('/api/workers')
      .then((d) => setWorkers(d.workers))
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <Shell>
        <div className="error">{error}</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Workers</h2>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        Heartbeat status for every worker in the fleet. A worker is online when
        it has reported within the last 45 seconds.
      </p>

      {workers === null ? (
        <p className="muted">Loading…</p>
      ) : workers.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>
            No workers have reported a heartbeat yet. Start a worker process and
            it will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Hostname</th>
                <th>Status</th>
                <th>Current job</th>
                <th>Version</th>
                <th>Concurrency</th>
                <th>FFmpeg</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.workerId}>
                  <td>{w.workerId}</td>
                  <td>{w.hostname}</td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: w.online ? 'var(--ok-bg, #e6f4ea)' : 'var(--panel-2)',
                        color: w.online ? 'var(--ok, #137333)' : 'var(--muted)',
                      }}
                    >
                      {w.online ? w.status : 'OFFLINE'}
                    </span>
                  </td>
                  <td>{w.currentJob ?? '—'}</td>
                  <td>{w.version ?? '—'}</td>
                  <td>{w.concurrency}</td>
                  <td>{w.ffmpegAvailable ? 'yes' : 'no'}</td>
                  <td>{new Date(w.lastSeenAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
