'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface Channel {
  id: string;
  name: string;
  platform: string;
  description?: string | null;
  dailyVideoTarget: number;
  autoGenerationEnabled: boolean;
  isActive: boolean;
  contentProfile?: Profile | null;
  series: Series[];
  knowledge: Knowledge[];
  _count: { contents: number; schedules: number };
}

interface Profile {
  id: string;
  description?: string | null;
  audience?: string | null;
  language: string;
  tone: string;
  contentStyle?: string | null;
  videoStyle?: string | null;
  defaultDurationSeconds?: number | null;
  defaultTemplate?: string | null;
  aiInstructions?: string | null;
  keywords: string[];
  excludedTopics: string[];
  hashtags: string[];
  cta?: string | null;
}

interface Series {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  frequencyPerDay: number;
  priority: number;
  isActive: boolean;
  _count: { topics: number; contents: number; schedules: number };
  topics?: Topic[];
}

interface Topic {
  id: string;
  name: string;
  description?: string | null;
  keywords: string[];
  source: string;
  usedCount: number;
  isActive: boolean;
  _count: { contents: number };
}

interface Knowledge {
  id: string;
  title: string;
  type: string;
  isActive: boolean;
}

export default function ChannelDetailPage() {
  const { id, channelId } = useParams<{ id: string; channelId: string }>();
  const { t } = useI18n();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // profile form
  const [profile, setProfile] = useState<Profile>({
    id: '',
    language: 'vi-VN',
    tone: 'PROFESSIONAL',
    description: '',
    audience: '',
    contentStyle: '',
    videoStyle: '',
    defaultDurationSeconds: 60,
    defaultTemplate: 'DEFAULT_REELS',
    aiInstructions: '',
    keywords: [],
    excludedTopics: [],
    hashtags: [],
    cta: '',
  });

  // series / topics
  const [seriesName, setSeriesName] = useState('');
  const [selectedSeries, setSelectedSeries] = useState('');
  const [topicName, setTopicName] = useState('');
  const [genCount, setGenCount] = useState(1);
  const [aiTopicCount, setAiTopicCount] = useState(10);

  // knowledge
  const [kbTitle, setKbTitle] = useState('');
  const [kbContent, setKbContent] = useState('');
  const [kbType, setKbType] = useState('TEXT');

  // calendar
  const [calendar, setCalendar] = useState<{ contents: any[]; publishingJobs: any[] }>({ contents: [], publishingJobs: [] });

  const load = useCallback(() => {
    if (!channelId) return;
    setError('');
    api<{ channel: Channel }>(`/api/channels/${channelId}`)
      .then((d) => {
        setChannel(d.channel);
        if (d.channel.contentProfile) setProfile(d.channel.contentProfile);
        if (d.channel.series.length > 0 && !selectedSeries) setSelectedSeries(d.channel.series[0].id);
        if (d.channel.series.length > 0) {
          setSeriesIdForTopics(d.channel.series[0].id);
        }
      })
      .catch((e) => setError(e.message));
    api<{ contents: any[]; publishingJobs: any[] }>(`/api/channels/${channelId}/calendar`)
      .then((d) => setCalendar(d))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const setSeriesIdForTopics = (seriesId: string) => {
    api<{ topics: Topic[] }>(`/api/series/${seriesId}/topics`)
      .then((d) => {
        setChannel((prev) => (prev ? { ...prev, series: prev.series.map((s) => (s.id === seriesId ? { ...s, topics: d.topics } : s)) } : prev));
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chdet.requestFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!channel) {
    return (
      <Shell>
        <div className="muted">{t('chdet.loading')}</div>
        {error && <div className="error">{error}</div>}
      </Shell>
    );
  }

  const saveProfile = () =>
    action(() =>
      api(`/api/channels/${channelId}/content-profile`, {
        method: 'PUT',
        body: {
          description: profile.description || undefined,
          audience: profile.audience || undefined,
          language: profile.language,
          tone: profile.tone,
          contentStyle: profile.contentStyle || undefined,
          videoStyle: profile.videoStyle || undefined,
          defaultDurationSeconds: profile.defaultDurationSeconds ?? undefined,
          defaultTemplate: profile.defaultTemplate || undefined,
          aiInstructions: profile.aiInstructions || undefined,
          keywords: profile.keywords,
          excludedTopics: profile.excludedTopics,
          hashtags: profile.hashtags,
          cta: profile.cta || undefined,
        },
      }),
    );

  const addSeries = (e: React.FormEvent) =>
    action(async () => {
      e.preventDefault();
      await api(`/api/channels/${channelId}/series`, { method: 'POST', body: { name: seriesName } });
      setSeriesName('');
    });

  const addTopic = (e: React.FormEvent) =>
    action(async () => {
      e.preventDefault();
      if (!selectedSeries) return;
      await api(`/api/series/${selectedSeries}/topics`, { method: 'POST', body: { name: topicName } });
      setTopicName('');
      setSeriesIdForTopics(selectedSeries);
    });

  const generate = () =>
    action(() =>
      api(`/api/channels/${channelId}/generate`, {
        method: 'POST',
        body: { seriesId: selectedSeries || undefined, count: genCount },
      }),
    );

  const generateTopics = () =>
    action(() =>
      api(`/api/channels/${channelId}/generate-topic`, {
        method: 'POST',
        body: { seriesId: selectedSeries || undefined, count: aiTopicCount },
      }),
    );

  const addKnowledge = (e: React.FormEvent) =>
    action(async () => {
      e.preventDefault();
      await api(`/api/channels/${channelId}/knowledge`, {
        method: 'POST',
        body: { type: kbType, title: kbTitle, content: kbContent || undefined },
      });
      setKbTitle('');
      setKbContent('');
    });

  const deleteSeries = (seriesId: string) => {
    if (!window.confirm(t('chdet.deleteSeriesConfirm'))) return;
    void action(() => api(`/api/series/${seriesId}`, { method: 'DELETE' }));
  };

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 16 }}>
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            <Link href={`/projects/${id}/channels`}>{t('chdet.backChannels')}</Link>
          </div>
          <h2 style={{ margin: 0 }}>{channel.name}</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {channel.platform} · {t('chdet.meta', { target: channel.dailyVideoTarget, contents: channel._count.contents, schedules: channel._count.schedules })}
          </div>
        </div>
        <div className="wrap">
          <button
            className="btn secondary small"
            disabled={busy}
            onClick={() => void action(() => api(`/api/channels/${channelId}`, { method: 'PATCH', body: { isActive: !channel.isActive } }))}
          >
            {channel.isActive ? t('chdet.deactivate') : t('chdet.activate')}
          </button>
          <button
            className="btn small"
            disabled={busy || !selectedSeries}
            onClick={() => void generate()}
          >
            {genCount > 1 ? t('chdet.generateNs', { n: genCount }) : t('chdet.generateN', { n: genCount })}
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
        {/* Content profile */}
        <section className="card">
          <h3 style={{ marginTop: 0 }}>{t('chdet.contentProfile')}</h3>
          <div className="field">
            <label>{t('chdet.description')}</label>
            <textarea rows={2} value={profile.description ?? ''} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
          </div>
          <div className="field">
            <label>{t('chdet.audience')}</label>
            <input value={profile.audience ?? ''} onChange={(e) => setProfile({ ...profile, audience: e.target.value })} placeholder="e.g. Gen Z, tech enthusiasts" />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>{t('chdet.language')}</label>
              <input value={profile.language} onChange={(e) => setProfile({ ...profile, language: e.target.value })} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t('chdet.tone')}</label>
              <input value={profile.tone} onChange={(e) => setProfile({ ...profile, tone: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>{t('chdet.contentStyle')}</label>
            <input value={profile.contentStyle ?? ''} onChange={(e) => setProfile({ ...profile, contentStyle: e.target.value })} placeholder="e.g. storytelling, listicle, tutorial" />
          </div>
          <div className="field">
            <label>{t('chdet.videoStyle')}</label>
            <input value={profile.videoStyle ?? ''} onChange={(e) => setProfile({ ...profile, videoStyle: e.target.value })} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>{t('chdet.defaultDuration')}</label>
              <input type="number" min={5} max={600} value={profile.defaultDurationSeconds ?? 60} onChange={(e) => setProfile({ ...profile, defaultDurationSeconds: Number(e.target.value) })} />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>{t('chdet.defaultTemplate')}</label>
              <input value={profile.defaultTemplate ?? ''} onChange={(e) => setProfile({ ...profile, defaultTemplate: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>{t('chdet.keywords')}</label>
            <input value={profile.keywords.join(', ')} onChange={(e) => setProfile({ ...profile, keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </div>
          <div className="field">
            <label>{t('chdet.excludedTopics')}</label>
            <input value={profile.excludedTopics.join(', ')} onChange={(e) => setProfile({ ...profile, excludedTopics: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </div>
          <div className="field">
            <label>{t('chdet.hashtags')}</label>
            <input value={profile.hashtags.join(', ')} onChange={(e) => setProfile({ ...profile, hashtags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </div>
          <div className="field">
            <label>{t('chdet.cta')}</label>
            <input value={profile.cta ?? ''} onChange={(e) => setProfile({ ...profile, cta: e.target.value })} placeholder="e.g. Follow for more tips" />
          </div>
          <div className="field">
            <label>{t('chdet.aiInstructions')}</label>
            <textarea rows={3} value={profile.aiInstructions ?? ''} onChange={(e) => setProfile({ ...profile, aiInstructions: e.target.value })} />
          </div>
          <button className="btn" disabled={busy} onClick={() => void saveProfile()}>{t('chdet.saveProfile')}</button>
        </section>

        {/* Series + topics */}
        <section className="card">
          <h3 style={{ marginTop: 0 }}>{t('chdet.series')}</h3>
          <form onSubmit={(e) => void addSeries(e)} className="row" style={{ marginBottom: 12 }}>
            <input placeholder={t('chdet.newSeriesName')} value={seriesName} onChange={(e) => setSeriesName(e.target.value)} />
            <button className="btn small" disabled={!seriesName.trim() || busy}>{t('chdet.add')}</button>
          </form>
          {channel.series.length > 0 && (
            <div className="field">
              <label>{t('chdet.activeSeries')}</label>
              <select
                value={selectedSeries}
                onChange={(e) => {
                  setSelectedSeries(e.target.value);
                  setSeriesIdForTopics(e.target.value);
                }}
              >
                {channel.series.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {channel.series.map((s) => (
            <SeriesCard key={s.id} series={s} busy={busy} onAction={action} onDelete={deleteSeries} />
          ))}
          {channel.series.length === 0 && <div className="muted">{t('chdet.noSeries')}</div>}

          <h4 style={{ marginBottom: 8 }}>{t('chdet.addTopicToSeries')}</h4>
          <form onSubmit={(e) => void addTopic(e)} className="row" style={{ marginBottom: 12 }}>
            <input placeholder={t('chdet.newTopic')} value={topicName} onChange={(e) => setTopicName(e.target.value)} disabled={!selectedSeries} />
            <button className="btn small" disabled={!topicName.trim() || !selectedSeries || busy}>{t('chdet.add')}</button>
          </form>
          <div className="row" style={{ gap: 8 }}>
            <input type="number" min={1} max={20} value={aiTopicCount} onChange={(e) => setAiTopicCount(Number(e.target.value))} title="AI topic count" style={{ width: 70 }} />
            <button className="btn small secondary" disabled={!selectedSeries || busy} onClick={() => void generateTopics()}>
              {t('chdet.genTopicsAI')}
            </button>
          </div>
        </section>

        {/* Knowledge base */}
        <section className="card">
          <h3 style={{ marginTop: 0 }}>{t('chdet.knowledgeBase')}</h3>
          <form onSubmit={(e) => void addKnowledge(e)}>
            <div className="field">
              <label>{t('chdet.type')}</label>
              <select value={kbType} onChange={(e) => setKbType(e.target.value)}>
                {['TEXT', 'TXT', 'MARKDOWN', 'PDF', 'URL'].map((kt) => (
                  <option key={kt} value={kt}>{kt}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('chdet.title')}</label>
              <input value={kbTitle} onChange={(e) => setKbTitle(e.target.value)} placeholder="e.g. Brand guidelines" />
            </div>
            <div className="field">
              <label>{t('chdet.content')}</label>
              <textarea rows={3} value={kbContent} onChange={(e) => setKbContent(e.target.value)} placeholder="Paste reference content the AI must follow" />
            </div>
            <button className="btn small" disabled={!kbTitle.trim() || busy}>{t('chdet.addEntry')}</button>
          </form>
          <div style={{ marginTop: 12 }}>
            {channel.knowledge.map((k) => (
              <div key={k.id} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 14 }}>{k.title}</div>
                  <div className="muted mono" style={{ fontSize: 12 }}>{k.type}</div>
                </div>
                <button
                  className="btn small secondary"
                  onClick={() => void action(() => api(`/api/knowledge/${k.id}`, { method: 'DELETE' }))}
                >
                  {t('chdet.delete')}
                </button>
              </div>
            ))}
            {channel.knowledge.length === 0 && <div className="muted">{t('chdet.noKnowledge')}</div>}
          </div>
        </section>
      </div>

      {/* Generate + calendar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16, marginTop: 16 }}>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>{t('chdet.generateNow')}</h3>
          <div className="row" style={{ gap: 8 }}>
            <input type="number" min={1} max={20} value={genCount} onChange={(e) => setGenCount(Number(e.target.value))} title="Number of videos" style={{ width: 80 }} />
            <span className="muted" style={{ fontSize: 13 }}>{t('chdet.videosFromSeries')}</span>
          </div>
          <button className="btn" style={{ marginTop: 8 }} disabled={busy || !selectedSeries} onClick={() => void generate()}>
            {t('chdet.generateContent')}
          </button>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>{t('chdet.calendar')}</h3>
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            {t('chdet.calendarCount', { n: calendar.contents.length, jobs: calendar.publishingJobs.length })}
          </div>
          {calendar.contents.slice(0, 10).map((c: any) => (
            <div key={c.id} className="spread" style={{ padding: '4px 0' }}>
              <div style={{ fontSize: 13 }}>
                {c.title ?? t('chdet.untitled')} <span className="muted">· {c.topic?.name ?? t('chdet.free')}</span>
              </div>
              <span className="badge warn">{c.status}</span>
            </div>
          ))}
          {calendar.publishingJobs.slice(0, 10).map((p: any) => (
            <div key={p.id} className="spread" style={{ padding: '4px 0' }}>
              <div style={{ fontSize: 13 }}>
                {t('chdet.publish', { title: p.video?.content?.title ?? '(video)' })} <span className="muted">· {new Date(p.scheduledAt).toLocaleString()}</span>
              </div>
              <span className="badge">{p.status}</span>
            </div>
          ))}
          {calendar.contents.length === 0 && calendar.publishingJobs.length === 0 && (
            <div className="muted">{t('chdet.nothingScheduled')}</div>
          )}
        </section>
      </div>
    </Shell>
  );
}

function SeriesCard({
  series,
  busy,
  onAction,
  onDelete,
}: {
  series: Series;
  busy: boolean;
  onAction: (fn: () => Promise<unknown>) => Promise<void>;
  onDelete: (seriesId: string) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(series.name);
  const [description, setDescription] = useState(series.description ?? '');
  const [instructions, setInstructions] = useState(series.instructions ?? '');
  const [frequencyPerDay, setFrequencyPerDay] = useState(series.frequencyPerDay);
  const [priority, setPriority] = useState(series.priority);

  const save = () =>
    onAction(async () => {
      await api(`/api/series/${series.id}`, {
        method: 'PATCH',
        body: {
          name: name.trim() || undefined,
          description: description || undefined,
          instructions: instructions || undefined,
          frequencyPerDay,
          priority,
        },
      });
      setEditing(false);
    });

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="spread">
        <div>
          <strong>{series.name}</strong>
          <div className="muted" style={{ fontSize: 12 }}>
            {t('chdet.seriesMeta', { freq: series.frequencyPerDay, priority: series.priority, topics: series._count.topics })}
          </div>
        </div>
        <div className="wrap">
          <button
            className="btn small secondary"
            onClick={() => void onAction(() => api(`/api/series/${series.id}`, { method: 'PATCH', body: { isActive: !series.isActive } }))}
          >
            {series.isActive ? t('chdet.pause') : t('chdet.resume')}
          </button>
          <button className="btn small secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? t('chdet.cancel') : t('chdet.edit')}
          </button>
          <button className="btn small secondary" disabled={busy} onClick={() => onDelete(series.id)}>
            {t('chdet.delete')}
          </button>
        </div>
      </div>

      {editing && (
        <div className="card" style={{ marginTop: 8, padding: 12 }}>
          <div className="field">
            <label>{t('chdet.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('chdet.description')}</label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('chdet.instructions')}</label>
            <textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>{t('chdet.videosPerDay')}</label>
              <input type="number" min={0} max={100} value={frequencyPerDay} onChange={(e) => setFrequencyPerDay(Number(e.target.value))} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t('chdet.priority')}</label>
              <input type="number" min={0} max={100} value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
          </div>
          <button className="btn small" disabled={busy || !name.trim()} onClick={() => void save()}>
            {t('chdet.saveSeries')}
          </button>
        </div>
      )}

      <div style={{ paddingLeft: 12 }}>
        {series.topics?.map((tp) => (
          <div key={tp.id} className="spread" style={{ padding: '4px 0' }}>
            <div style={{ fontSize: 13 }}>
              {tp.name}
              <span className="muted"> · {t('chdet.usedN', { n: tp.usedCount })}</span>
            </div>
            <div className="wrap">
              <span className="badge">{tp.source}</span>
              <button
                className="btn small secondary"
                onClick={() => void onAction(() => api(`/api/series/${series.id}/topics/${tp.id}/use`, { method: 'POST' }))}
              >
                {t('chdet.markUsed')}
              </button>
            </div>
          </div>
        ))}
        {series.topics && series.topics.length === 0 && <div className="muted" style={{ fontSize: 13 }}>{t('chdet.noTopics')}</div>}
      </div>
    </div>
  );
}
