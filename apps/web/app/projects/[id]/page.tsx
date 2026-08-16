'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';

interface Topic {
  id: string;
  name: string;
  description?: string | null;
  keywords: string[];
  language: string;
  frequencyPerDay: number;
  isActive: boolean;
}

interface Content {
  id: string;
  title?: string | null;
  status: string;
  createdAt: string;
  topic?: { id: string; name: string } | null;
  video?: { id: string; status: string } | null;
}

interface Schedule {
  id: string;
  name: string;
  times: string[];
  days: string[];
  timezone: string;
  status: string;
  nextRunAt?: string | null;
  topic?: { id: string; name: string } | null;
}

interface ProjectChannel {
  id: string;
  name: string;
}

interface ProjectSeries {
  id: string;
  name: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  description?: string | null;
  language: string;
  publishingMode: string;
  defaultTemplate: string;
  facebookPage?: { id: string; pageName: string; status: string } | null;
}

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [error, setError] = useState('');

  const [topicName, setTopicName] = useState('');
  const [contentTopic, setContentTopic] = useState('');
  const [contentTitle, setContentTitle] = useState('');
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [scheduleTimezone, setScheduleTimezone] = useState('Asia/Tokyo');
  const [channels, setChannels] = useState<ProjectChannel[]>([]);
  const [scheduleChannel, setScheduleChannel] = useState('');
  const [scheduleSeries, setScheduleSeries] = useState('');
  const [channelSeries, setChannelSeries] = useState<ProjectSeries[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    setError('');
    api<{ project: ProjectDetail }>(`/api/projects/${id}`).then((d) => setProject(d.project)).catch((e) => setError(e.message));
    api<{ topics: Topic[] }>(`/api/projects/${id}/topics`).then((d) => setTopics(d.topics)).catch(() => {});
    api<{ contents: Content[] }>(`/api/projects/${id}/content`).then((d) => setContents(d.contents)).catch(() => {});
    api<{ schedules: Schedule[] }>(`/api/projects/${id}/schedules`).then((d) => setSchedules(d.schedules)).catch(() => {});
    api<{ channels: ProjectChannel[] }>(`/api/projects/${id}/channels`).then((d) => setChannels(d.channels)).catch(() => {});
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const addTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    await api(`/api/projects/${id}/topics`, { method: 'POST', body: { name: topicName } });
    setTopicName('');
    load();
  };

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api(`/api/projects/${id}/content`, {
      method: 'POST',
      body: { topicId: contentTopic || undefined, title: contentTitle || undefined },
    });
    setContentTitle('');
    load();
  };

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    await api(`/api/projects/${id}/schedules`, {
      method: 'POST',
      body: {
        name: scheduleName || undefined,
        times: [scheduleTime],
        days: scheduleDays,
        timezone: scheduleTimezone,
        topicId: contentTopic || undefined,
        channelId: scheduleChannel || undefined,
        seriesId: scheduleSeries || undefined,
      },
    });
    setScheduleName('');
    load();
  };

  const pickChannel = async (channelId: string) => {
    setScheduleChannel(channelId);
    setScheduleSeries('');
    if (!channelId) {
      setChannelSeries([]);
      return;
    }
    try {
      const d = await api<{ series: ProjectSeries[] }>(`/api/channels/${channelId}/series`);
      setChannelSeries(d.series ?? []);
    } catch {
      setChannelSeries([]);
    }
  };

  const toggleDay = (d: string) =>
    setScheduleDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const action = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  if (!project) {
    return (
      <Shell>
        <div className="muted">Loading project…</div>
        {error && <div className="error">{error}</div>}
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>{project.name}</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {project.language} · {project.publishingMode} · {project.defaultTemplate}
            {project.facebookPage ? ` · Publish to: ${project.facebookPage.pageName}` : ' · No Facebook page'}
          </div>
        </div>
        <Link href={`/projects/${id}/channels`} className="btn secondary small">
          Channels
        </Link>
      </div>
      {error && <div className="error">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Topics</h3>
          <form onSubmit={(e) => void addTopic(e)} className="row" style={{ marginBottom: 12 }}>
            <input placeholder="New topic name" value={topicName} onChange={(e) => setTopicName(e.target.value)} />
            <button className="btn small" disabled={!topicName.trim()}>Add</button>
          </form>
          {topics.map((t) => (
            <div key={t.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div>{t.name}</div>
                <div className="muted mono" style={{ fontSize: 12 }}>{t.keywords.join(', ') || 'no keywords'}</div>
              </div>
              <span className={`badge ${t.isActive ? 'ok' : ''}`}>{t.isActive ? 'active' : 'paused'}</span>
            </div>
          ))}
          {topics.length === 0 && <div className="muted">No topics yet.</div>}
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Generate video</h3>
          <form onSubmit={(e) => void generate(e)}>
            <div className="field">
              <label>Topic</label>
              <select value={contentTopic} onChange={(e) => setContentTopic(e.target.value)}>
                <option value="">— Auto / free topic —</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Title (optional)</label>
              <input value={contentTitle} onChange={(e) => setContentTitle(e.target.value)} placeholder="e.g. 5 facts about space" />
            </div>
            <button className="btn" type="submit">Generate content &amp; assets</button>
          </form>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Schedule</h3>
          <form onSubmit={(e) => void addSchedule(e)}>
            <div className="field">
              <label>Name (optional)</label>
              <input value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} placeholder="e.g. Morning slot" />
            </div>
            <div className="field">
              <label>Time (24h)</label>
              <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
            </div>
            <div className="field">
              <label>Timezone (IANA)</label>
              <input value={scheduleTimezone} onChange={(e) => setScheduleTimezone(e.target.value)} placeholder="Asia/Tokyo" />
            </div>
            <div className="field">
              <label>Channel (optional)</label>
              <select value={scheduleChannel} onChange={(e) => void pickChannel(e.target.value)}>
                <option value="">— Project default —</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {scheduleChannel && (
              <div className="field">
                <label>Series (optional)</label>
                <select value={scheduleSeries} onChange={(e) => setScheduleSeries(e.target.value)}>
                  <option value="">— Auto topic —</option>
                  {channelSeries.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>Days (empty = every day)</label>
              <div className="wrap">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`btn small ${scheduleDays.includes(d) ? '' : 'secondary'}`}
                    onClick={() => toggleDay(d)}
                  >
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn" type="submit">Create schedule</button>
          </form>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16, marginTop: 16 }}>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Contents</h3>
          {contents.map((c) => (
            <div key={c.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div>{c.title ?? '(untitled)'}</div>
                <div className="muted mono" style={{ fontSize: 12 }}>
                  {c.topic?.name ?? 'free'} · {new Date(c.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="wrap">
                <span className={`badge ${c.status === 'READY' ? 'ok' : c.status === 'FAILED' ? 'danger' : 'warn'}`}>{c.status}</span>
                {c.status === 'FAILED' && (
                  <button
                    className="btn small secondary"
                    onClick={() => void action(() => api(`/api/content/${c.id}/regenerate-script`, { method: 'POST' }))}
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          ))}
          {contents.length === 0 && <div className="muted">Nothing generated yet.</div>}
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Schedules</h3>
          {schedules.map((s) => (
            <div key={s.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div>{s.name}</div>
                <div className="muted mono" style={{ fontSize: 12 }}>
                  {s.times.join(', ')} · {s.days.length ? s.days.join(', ') : 'every day'} · {s.timezone}
                  {s.nextRunAt ? ` · next ${new Date(s.nextRunAt).toLocaleString()}` : ''}
                </div>
              </div>
              {s.status === 'ACTIVE' ? (
                <button className="btn small secondary" onClick={() => void action(() => api(`/api/schedules/${s.id}/pause`, { method: 'POST' }))}>
                  Pause
                </button>
              ) : (
                <button className="btn small secondary" onClick={() => void action(() => api(`/api/schedules/${s.id}/resume`, { method: 'POST' }))}>
                  Resume
                </button>
              )}
            </div>
          ))}
          {schedules.length === 0 && <div className="muted">No schedules yet.</div>}
        </section>
      </div>
    </Shell>
  );
}
