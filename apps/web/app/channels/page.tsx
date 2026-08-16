'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';

interface Channel {
  id: string;
  name: string;
  platform: string;
  description: string | null;
  isActive: boolean;
  dailyVideoTarget: number;
  project: { id: string; name: string };
  publishingAccount: { id: string; accountName: string; platform: string; status: string } | null;
  _count: { series: number; knowledge: number; contents: number };
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ channels: Channel[] }>('/api/channels')
      .then((d) => setChannels(d.channels))
      .catch((e) => setError(e.message));
  }, []);

  const platforms = Array.from(new Set(channels.map((c) => c.platform))).sort();
  const byPlatform = (platform: string) => channels.filter((c) => c.platform === platform);

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Publishing Channels</h2>
        <span className="muted">Destinations for campaign + channel content, grouped by platform</span>
      </div>
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {platforms.map((platform) => (
        <div key={platform} className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{platform}</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Project</th>
                <th>Account</th>
                <th>Daily target</th>
                <th>Series</th>
                <th>Contents</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {byPlatform(platform).map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    {c.description && (
                      <div className="muted" style={{ fontSize: 12 }}>{c.description}</div>
                    )}
                  </td>
                  <td className="muted">{c.project.name}</td>
                  <td className="muted">{c.publishingAccount ? c.publishingAccount.accountName : '—'}</td>
                  <td>{c.dailyVideoTarget}</td>
                  <td>{c._count.series}</td>
                  <td>{c._count.contents}</td>
                  <td>
                    <span className={`badge ${c.isActive ? 'ok' : 'warn'}`}>
                      {c.isActive ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </td>
                </tr>
              ))}
              {byPlatform(platform).length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">No channels.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {channels.length === 0 && (
        <div className="card muted">
          No channels yet. Create one from a project page or the API, then assign it to a campaign.
        </div>
      )}
    </Shell>
  );
}
