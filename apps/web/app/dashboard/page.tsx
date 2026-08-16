'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import PublishingJobsMonitor from '@/components/PublishingJobsMonitor';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface DashboardData {
  stats: {
    totalVideos: number;
    publishedVideos: number;
    scheduledVideos: number;
    failedVideos: number;
    projects: number;
    topics: number;
    facebookPages: number;
    activeSchedules: number;
  };
  engagement: Record<string, number>;
}

export default function DashboardPage() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<DashboardData>('/api/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <Shell>
        <div className="error">{error}</div>
      </Shell>
    );
  }

  const s = data?.stats;

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>{t('dash.title')}</h2>
        <Link href="/projects" className="btn small">
          {t('dash.newProject')}
        </Link>
      </div>

      {s && (
        <div className="stat" style={{ marginBottom: 24 }}>
          <div className="stat-item">
            <div className="value">{s.projects}</div>
            <div className="label">{t('dash.projects')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{s.totalVideos}</div>
            <div className="label">{t('dash.totalVideos')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{s.publishedVideos}</div>
            <div className="label">{t('dash.readyToPublish')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{s.scheduledVideos}</div>
            <div className="label">{t('dash.scheduledPosts')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{s.activeSchedules}</div>
            <div className="label">{t('dash.activeSchedules')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{s.topics}</div>
            <div className="label">{t('dash.activeTopics')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{s.facebookPages}</div>
            <div className="label">{t('dash.connectedPages')}</div>
          </div>
          <div className="stat-item">
            <div className="value">{s.failedVideos}</div>
            <div className="label">{t('dash.failedVideos')}</div>
          </div>
        </div>
      )}

      {data?.engagement && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('dash.engagement')}</h3>
          <table>
            <thead>
              <tr>
                {Object.keys(data.engagement).map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {Object.values(data.engagement).map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <PublishingJobsMonitor />
    </Shell>
  );
}
