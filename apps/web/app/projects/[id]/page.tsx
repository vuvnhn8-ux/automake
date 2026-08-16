'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// Types (mirror of the project API response)
// ---------------------------------------------------------------------------

interface ProjectAssignment {
  id: string;
  enabled: boolean;
  priority: number;
  channel: {
    id: string;
    name: string;
    platform: string;
    connectionStatus: string;
    isActive: boolean;
    project: { id: string; name: string };
  };
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  language: string;
  category: string | null;
  defaultTemplate: string;
  defaultVoice: string | null;
  defaultAIProvider: string | null;
  defaultImageProvider: string | null;
  defaultVideoProvider: string | null;
  defaultVoiceProvider: string | null;
  defaultDurationSeconds: number;
  publishingMode: string;
  status: string;
  dailyVideoTarget: number;
  timezone: string;
  config: Record<string, unknown> | null;
  facebookPage: { id: string; pageId: string; pageName: string; status: string } | null;
  channelAssignments: ProjectAssignment[];
  schedules: { nextRunAt: string | null }[];
  nextRunAt: string | null;
  _count: { topics: number; videos: number; contents: number; schedules: number; channelAssignments: number };
}

interface Topic {
  id: string;
  name: string;
  description?: string | null;
  keywords: string[];
  language: string;
  frequencyPerDay: number;
  source: string;
  usedCount: number;
  isActive: boolean;
  lastUsedAt?: string | null;
}

interface ContentItem {
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

interface GlobalChannel {
  id: string;
  name: string;
  platform: string;
  connectionStatus: string | null;
  isActive: boolean;
  project: { id: string; name: string } | null;
}

interface ProviderOption {
  id: string;
  label: string;
}

interface ProviderGroup {
  id: string;
  label: string;
  active: string;
  options: ProviderOption[];
}

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const TABS = ['general', 'content', 'video', 'topics', 'schedule', 'channels', 'ai'] as const;
type Tab = (typeof TABS)[number];

const MODES = ['MANUAL', 'SEMI_AUTOMATIC', 'FULL_AUTOMATIC'];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('general');
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    setError('');
    api<{ project: Project }>(`/api/projects/${id}`)
      .then((d) => setProject(d.project))
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  if (!project) {
    return (
      <Shell>
        <div className="muted">{t('pct.loading')}</div>
        {error && <div className="error">{error}</div>}
      </Shell>
    );
  }

  const statusClass = project.status === 'ACTIVE' ? 'badge ok' : 'badge warn';

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Link href="/projects" className="muted" style={{ fontSize: 13 }}>
            ← {t('pct.backProjects')}
          </Link>
          <h2 style={{ margin: 0, marginTop: 4 }}>{project.name}</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {t('pct.meta', {
              language: project.language,
              target: project.dailyVideoTarget,
            })}
            {project.nextRunAt
              ? ` · ${t('pct.nextRun', { date: new Date(project.nextRunAt).toLocaleString() })}`
              : ''}
          </div>
        </div>
        <div className="wrap" style={{ gap: 8 }}>
          <span className={statusClass}>{project.status}</span>
          {project.status === 'ACTIVE' ? (
            <button className="btn small secondary" onClick={() => void post(`/api/projects/${id}/pause`, load)}>
              {t('pct.pause')}
            </button>
          ) : (
            <button className="btn small secondary" onClick={() => void post(`/api/projects/${id}/activate`, load)}>
              {t('pct.activate')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      {saved && <div className="muted" style={{ color: 'var(--ok)', marginBottom: 12 }}>{saved}</div>}

      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map((key) => (
          <button
            key={key}
            className={`btn small ${tab === key ? '' : 'secondary'}`}
            onClick={() => setTab(key)}
          >
            {t(`pct.tab.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab project={project} onSaved={reload} onNotice={notice} onError={err} />}      {tab === 'content' && <ContentTab project={project} onSaved={reload} onNotice={notice} onError={err} />}
      {tab === 'video' && <VideoTab project={project} onSaved={reload} onNotice={notice} onError={err} />}
      {tab === 'topics' && <TopicsTab projectId={id} onSaved={reload} onNotice={notice} onError={err} />}
      {tab === 'schedule' && <ScheduleTab projectId={id} onSaved={reload} onNotice={notice} onError={err} />}
      {tab === 'channels' && <ChannelsTab project={project} onSaved={reload} onNotice={notice} onError={err} />}
      {tab === 'ai' && <AiTab project={project} onSaved={reload} onNotice={notice} onError={err} />}
    </Shell>
  );

  function reload() {
    load();
  }
  function notice(msg: string) {
    setSaved(msg);
  }
  function err(msg: string) {
    setError(msg);
  }
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function post(url: string, then: () => void) {
  return api(url, { method: 'POST' }).then(then);
}

function stringConfig(config: Record<string, unknown> | null, key: string): string {
  const v = config?.[key];
  return typeof v === 'string' ? v : '';
}

function arrayConfig(config: Record<string, unknown> | null, key: string): string[] {
  const v = config?.[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// General tab
// ---------------------------------------------------------------------------

function GeneralTab({ project, onSaved, onNotice, onError }: { project: Project; onSaved: () => void; onNotice: (m: string) => void; onError: (m: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [language, setLanguage] = useState(project.language);
  const [timezone, setTimezone] = useState(project.timezone);
  const [publishingMode, setPublishingMode] = useState(project.publishingMode);
  const [dailyVideoTarget, setDailyVideoTarget] = useState(project.dailyVideoTarget);
  const [duration, setDuration] = useState(project.defaultDurationSeconds);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: {
          name,
          description: description || undefined,
          language,
          timezone,
          publishingMode,
          dailyVideoTarget,
          defaultDurationSeconds: duration,
        },
      });
      onNotice(t('pct.saved'));
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', alignItems: 'start' }}>
      <form onSubmit={(e) => void save(e)} className="card">
        <h3 style={{ marginTop: 0 }}>{t('pct.general')}</h3>
        <Field label={t('pct.name')}>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label={t('pct.description')}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
        <Field label={t('pct.language')}>
          <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="vi-VN" />
        </Field>
        <Field label={t('pct.timezone')}>
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Tokyo" />
        </Field>
        <Field label={t('pct.publishingMode')}>
          <select value={publishingMode} onChange={(e) => setPublishingMode(e.target.value)}>
            {MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </Field>
        <div className="row" style={{ gap: 12 }}>
          <Field label={t('pct.videosPerDay')}>
            <input type="number" min={1} max={100} value={dailyVideoTarget} onChange={(e) => setDailyVideoTarget(Number(e.target.value))} />
          </Field>
          <Field label={t('pct.duration')}>
            <input type="number" min={10} max={600} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </Field>
        </div>
        <button className="btn" type="submit" disabled={saving || !name.trim()}>
          {saving ? '…' : t('pct.saveGeneral')}
        </button>
      </form>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('pct.latestContents')}</h3>
        <RecentContents projectId={project.id} onError={onError} />
      </div>
    </div>
  );
}

function RecentContents({ projectId, onError }: { projectId: string; onError: (m: string) => void }) {
  const { t } = useI18n();
  const [contents, setContents] = useState<ContentItem[]>([]);

  useEffect(() => {
    api<{ contents: ContentItem[] }>(`/api/projects/${projectId}/content`)
      .then((d) => setContents(d.contents))
      .catch((e) => onError(e.message));
  }, [projectId, onError]);

  const retry = async (contentId: string) => {
    try {
      await api(`/api/content/${contentId}/regenerate-script`, { method: 'POST' });
    } catch (e) {
      onError(e instanceof Error ? e.message : t('pct.requestFailed'));
    }
  };

  return (
    <div>
      {contents.slice(0, 10).map((c) => (
        <div key={c.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div>{c.title ?? t('pct.untitled')}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {c.topic?.name ?? t('pct.free')} · {new Date(c.createdAt).toLocaleString()}
            </div>
          </div>
          <div className="wrap" style={{ gap: 8 }}>
            <span className={`badge ${c.status === 'READY' ? 'ok' : c.status === 'FAILED' ? 'danger' : 'warn'}`}>{c.status}</span>
            {c.status === 'FAILED' && (
              <button className="btn small secondary" onClick={() => void retry(c.id)}>{t('pct.retry')}</button>
            )}
          </div>
        </div>
      ))}
      {contents.length === 0 && <div className="muted">{t('pct.nothingGenerated')}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content tab (strategy)
// ---------------------------------------------------------------------------

function ContentTab({ project, onSaved, onNotice, onError }: { project: Project; onSaved: () => void; onNotice: (m: string) => void; onError: (m: string) => void }) {
  const { t } = useI18n();
  const [theme, setTheme] = useState(stringConfig(project.config, 'contentTheme'));
  const [keywords, setKeywords] = useState(arrayConfig(project.config, 'keywords').join(', '));
  const [instructions, setInstructions] = useState(stringConfig(project.config, 'contentInstructions'));
  const [avoid, setAvoid] = useState(stringConfig(project.config, 'avoid'));
  const [audience, setAudience] = useState(stringConfig(project.config, 'targetAudience'));
  const [contentLanguage, setContentLanguage] = useState(stringConfig(project.config, 'contentLanguage') || project.language);
  const [voiceLanguage, setVoiceLanguage] = useState(stringConfig(project.config, 'voiceLanguage') || project.language);
  const [voiceTone, setVoiceTone] = useState(stringConfig(project.config, 'voiceTone'));
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/projects/${project.id}/config`, {
        method: 'PUT',
        body: {
          contentTheme: theme || undefined,
          keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
          contentInstructions: instructions || undefined,
          avoid: avoid || undefined,
          targetAudience: audience || undefined,
          contentLanguage: contentLanguage || undefined,
          voiceLanguage: voiceLanguage || undefined,
          voiceTone: voiceTone || undefined,
        },
      });
      onNotice(t('pct.saved'));
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="card" style={{ maxWidth: 720 }}>
      <h3 style={{ marginTop: 0 }}>{t('pct.content')}</h3>
      <div className="muted" style={{ marginBottom: 16 }}>{t('pct.contentIntro')}</div>
      <Field label={t('pct.theme')}>
        <textarea value={theme} onChange={(e) => setTheme(e.target.value)} rows={2} placeholder={t('pct.themePlaceholder')} />
      </Field>
      <Field label={t('pct.keywords')}>
        <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={t('pct.keywordsPlaceholder')} />
      </Field>
      <Field label={t('pct.audience')}>
        <textarea value={audience} onChange={(e) => setAudience(e.target.value)} rows={2} />
      </Field>
      <Field label={t('pct.instructions')}>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} />
      </Field>
      <Field label={t('pct.avoid')}>
        <textarea value={avoid} onChange={(e) => setAvoid(e.target.value)} rows={2} />
      </Field>
      <div className="row" style={{ gap: 12 }}>
        <Field label={t('pct.contentLanguage')}>
          <input value={contentLanguage} onChange={(e) => setContentLanguage(e.target.value)} placeholder="vi-VN" />
        </Field>
        <Field label={t('pct.voiceLanguage')}>
          <input value={voiceLanguage} onChange={(e) => setVoiceLanguage(e.target.value)} placeholder="vi-VN" />
        </Field>
        <Field label={t('pct.voiceTone')}>
          <input value={voiceTone} onChange={(e) => setVoiceTone(e.target.value)} placeholder="PROFESSIONAL" />
        </Field>
      </div>
      <button className="btn" type="submit" disabled={saving}>
        {saving ? '…' : t('pct.saveContent')}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Video tab (production defaults)
// ---------------------------------------------------------------------------

function VideoTab({ project, onSaved, onNotice, onError }: { project: Project; onSaved: () => void; onNotice: (m: string) => void; onError: (m: string) => void }) {
  const { t } = useI18n();
  const [aspectRatio, setAspectRatio] = useState(stringConfig(project.config, 'aspectRatio') || '9:16');
  const [resolution, setResolution] = useState(stringConfig(project.config, 'resolution'));
  const [durationTarget, setDurationTarget] = useState(Number(stringConfig(project.config, 'durationTarget')) || project.defaultDurationSeconds);
  const [visualStyle, setVisualStyle] = useState(stringConfig(project.config, 'visualStyle'));
  const [imageStyle, setImageStyle] = useState(stringConfig(project.config, 'imageStyle'));
  const [videoStyle, setVideoStyle] = useState(stringConfig(project.config, 'videoStyle'));
  const [subtitleStyle, setSubtitleStyle] = useState(stringConfig(project.config, 'subtitleStyle'));
  const [voice, setVoice] = useState(project.defaultVoice ?? '');
  const [template, setTemplate] = useState(project.defaultTemplate);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/projects/${project.id}/config`, {
        method: 'PUT',
        body: {
          aspectRatio,
          resolution: resolution || undefined,
          durationTarget,
          visualStyle: visualStyle || undefined,
          imageStyle: imageStyle || undefined,
          videoStyle: videoStyle || undefined,
          subtitleStyle: subtitleStyle || undefined,
        },
      });
      await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: { defaultVoice: voice || undefined, defaultTemplate: template },
      });
      onNotice(t('pct.saved'));
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="card" style={{ maxWidth: 720 }}>
      <h3 style={{ marginTop: 0 }}>{t('pct.video')}</h3>
      <div className="muted" style={{ marginBottom: 16 }}>{t('pct.videoIntro')}</div>
      <div className="row" style={{ gap: 12 }}>
        <Field label={t('pct.aspectRatio')}>
          <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
            {['9:16', '16:9', '1:1'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label={t('pct.resolution')}>
          <input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="1080x1920" />
        </Field>
        <Field label={t('pct.durationTarget')}>
          <input type="number" min={10} max={600} value={durationTarget} onChange={(e) => setDurationTarget(Number(e.target.value))} />
        </Field>
      </div>
      <Field label={t('pct.visualStyle')}>
        <input value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} placeholder={t('pct.visualStylePlaceholder')} />
      </Field>
      <div className="row" style={{ gap: 12 }}>
        <Field label={t('pct.imageStyle')}>
          <input value={imageStyle} onChange={(e) => setImageStyle(e.target.value)} />
        </Field>
        <Field label={t('pct.videoStyle')}>
          <input value={videoStyle} onChange={(e) => setVideoStyle(e.target.value)} />
        </Field>
      </div>
      <Field label={t('pct.subtitleStyle')}>
        <input value={subtitleStyle} onChange={(e) => setSubtitleStyle(e.target.value)} />
      </Field>
      <div className="row" style={{ gap: 12 }}>
        <Field label={t('pct.voice')}>
          <input value={voice} onChange={(e) => setVoice(e.target.value)} placeholder={t('pct.voicePlaceholder')} />
        </Field>
        <Field label={t('pct.template')}>
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>
            {['DEFAULT_REELS', 'NEWS', 'FACTS', 'TOP5', 'STORY', 'EDUCATIONAL'].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>
      <button className="btn" type="submit" disabled={saving}>
        {saving ? '…' : t('pct.saveVideo')}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Topics tab
// ---------------------------------------------------------------------------

function TopicsTab({ projectId, onSaved, onNotice, onError }: { projectId: string; onSaved: () => void; onNotice: (m: string) => void; onError: (m: string) => void }) {
  const { t } = useI18n();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [newName, setNewName] = useState('');
  const [genCount, setGenCount] = useState(10);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ topics: Topic[] }>(`/api/projects/${projectId}/topics`)
      .then((d) => setTopics(d.topics))
      .catch((e) => onError(e.message));
  }, [projectId, onError]);

  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/topics`, { method: 'POST', body: { name: newName.trim() } });
      setNewName('');
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.topicAddFailed'));
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const d = await api<{ count: number; skippedDuplicates: string[] }>(`/api/projects/${projectId}/topics/generate`, {
        method: 'POST',
        body: { count: genCount },
      });
      onNotice(t('pct.generatedN', { n: d.count }));
      if (d.skippedDuplicates.length > 0) {
        onError(t('pct.skippedN', { n: d.skippedDuplicates.length }));
      }
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.genFailed'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (topic: Topic) => {
    try {
      await api(`/api/topics/${topic.id}`, { method: 'PATCH', body: { isActive: !topic.isActive } });
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.requestFailed'));
    }
  };

  const markUsed = async (topic: Topic) => {
    try {
      await api(`/api/topics/${topic.id}/use`, { method: 'POST' });
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.requestFailed'));
    }
  };

  const remove = async (topic: Topic) => {
    try {
      await api(`/api/topics/${topic.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.requestFailed'));
    }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder={t('pct.newTopic')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button className="btn" onClick={(e) => void add(e)} disabled={busy || !newName.trim()}>
            {t('pct.add')}
          </button>
          <span className="row" style={{ gap: 8 }}>
            <input
              type="number"
              min={1}
              max={20}
              value={genCount}
              onChange={(e) => setGenCount(Number(e.target.value))}
              style={{ width: 70 }}
              title={t('pct.genCount')}
            />
            <button className="btn secondary" onClick={() => void generate()} disabled={busy}>
              {busy ? '…' : t('pct.generateTopics')}
            </button>
          </span>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t('pct.topic')}</th>
              <th>{t('pct.source')}</th>
              <th>{t('pct.used')}</th>
              <th>{t('pct.status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <tr key={topic.id}>
                <td>
                  <strong>{topic.name}</strong>
                  {topic.keywords.length > 0 && (
                    <div className="muted" style={{ fontSize: 12 }}>{topic.keywords.join(', ')}</div>
                  )}
                </td>
                <td className="muted">{topic.source}</td>
                <td className="muted">
                  {topic.usedCount}
                  {topic.lastUsedAt && (
                    <div style={{ fontSize: 12 }}>{new Date(topic.lastUsedAt).toLocaleDateString()}</div>
                  )}
                </td>
                <td>
                  <span className={`badge ${topic.isActive ? 'ok' : 'warn'}`}>
                    {topic.isActive ? t('pct.active') : t('pct.inactive')}
                  </span>
                </td>
                <td>
                  <div className="wrap" style={{ gap: 6 }}>
                    <button className="btn small secondary" onClick={() => void markUsed(topic)}>{t('pct.markUsed')}</button>
                    <button className="btn small secondary" onClick={() => void toggle(topic)}>
                      {topic.isActive ? t('pct.deactivate') : t('pct.activate')}
                    </button>
                    <button className="btn small secondary" onClick={() => void remove(topic)}>{t('pct.delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
            {topics.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">{t('pct.noTopics')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule / Automation tab
// ---------------------------------------------------------------------------

function ScheduleTab({ projectId, onSaved, onNotice, onError }: { projectId: string; onSaved: () => void; onNotice: (m: string) => void; onError: (m: string) => void }) {
  const { t } = useI18n();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [days, setDays] = useState<string[]>([]);
  const [timezone, setTimezone] = useState('Asia/Tokyo');
  const [topicId, setTopicId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ schedules: Schedule[] }>(`/api/projects/${projectId}/schedules`)
      .then((d) => setSchedules(d.schedules))
      .catch((e) => onError(e.message));
    api<{ topics: Topic[] }>(`/api/projects/${projectId}/topics`)
      .then((d) => setTopics(d.topics))
      .catch(() => undefined);
  }, [projectId, onError]);

  useEffect(load, [load]);

  const addTime = () => setTimes((prev) => [...prev, '08:00']);
  const updateTime = (i: number, v: string) => setTimes((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  const removeTime = (i: number) => setTimes((prev) => prev.filter((_, idx) => idx !== i));

  const toggleDay = (d: string) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/schedules`, {
        method: 'POST',
        body: {
          name: name || undefined,
          times,
          days,
          timezone,
          topicId: topicId || undefined,
        },
      });
      setName('');
      setTimes(['08:00']);
      setDays([]);
      onNotice(t('pct.scheduleCreated'));
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.scheduleFailed'));
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (s: Schedule) => {
    try {
      await api(`/api/schedules/${s.id}/${s.status === 'ACTIVE' ? 'pause' : 'resume'}`, { method: 'POST' });
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.requestFailed'));
    }
  };

  const remove = async (s: Schedule) => {
    try {
      await api(`/api/schedules/${s.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.requestFailed'));
    }
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', alignItems: 'start' }}>
      <form onSubmit={(e) => void create(e)} className="card">
        <h3 style={{ marginTop: 0 }}>{t('pct.newSchedule')}</h3>
        <div className="muted" style={{ marginBottom: 16 }}>{t('pct.scheduleIntro')}</div>
        <Field label={t('pct.name')}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('pct.scheduleNamePlaceholder')} />
        </Field>
        <Field label={t('pct.times')}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {times.map((tm, i) => (
              <span key={i} className="row" style={{ gap: 6 }}>
                <input type="time" value={tm} onChange={(e) => updateTime(i, e.target.value)} />
                {times.length > 1 && (
                  <button type="button" className="btn small secondary" onClick={() => removeTime(i)}>×</button>
                )}
              </span>
            ))}
            <button type="button" className="btn small secondary" onClick={addTime}>+ {t('pct.addTime')}</button>
          </div>
        </Field>
        <Field label={t('pct.timezone')}>
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Tokyo" />
        </Field>
        <Field label={t('pct.topic')}>
          <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">{t('pct.autoTopic')}</option>
            {topics.map((tp) => (
              <option key={tp.id} value={tp.id}>{tp.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t('pct.days')}>
          <div className="wrap">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                className={`btn small ${days.includes(d) ? '' : 'secondary'}`}
                onClick={() => toggleDay(d)}
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{t('pct.daysHint')}</div>
        </Field>
        <button className="btn" type="submit" disabled={busy || times.length === 0}>
          {busy ? '…' : t('pct.createSchedule')}
        </button>
      </form>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('pct.schedules')}</h3>
        {schedules.map((s) => (
          <div key={s.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div>{s.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {s.times.join(', ')} · {s.days.length ? s.days.join(', ') : t('pct.everyDay')} · {s.timezone}
                {s.topic && ` · ${s.topic.name}`}
                {s.nextRunAt ? ` · ${t('pct.next', { date: new Date(s.nextRunAt).toLocaleString() })}` : ''}
              </div>
            </div>
            <div className="wrap" style={{ gap: 6 }}>
              <button className="btn small secondary" onClick={() => void toggleStatus(s)}>
                {s.status === 'ACTIVE' ? t('pct.pause') : t('pct.resume')}
              </button>
              <button className="btn small secondary" onClick={() => void remove(s)}>{t('pct.delete')}</button>
            </div>
          </div>
        ))}
        {schedules.length === 0 && <div className="muted">{t('pct.noSchedules')}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Publishing Channels tab (project <-> channel assignments)
// ---------------------------------------------------------------------------

function ChannelsTab({ project, onSaved, onNotice, onError }: { project: Project; onSaved: () => void; onNotice: (m: string) => void; onError: (m: string) => void }) {
  const { t } = useI18n();
  const [channels, setChannels] = useState<GlobalChannel[]>([]);
  const [selected, setSelected] = useState<Record<string, { enabled: boolean; priority: number }>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ channels: GlobalChannel[] }>('/api/channels')
      .then((d) => setChannels(d.channels))
      .catch((e) => onError(e.message));
  }, [onError]);

  useEffect(() => {
    if (project.channelAssignments.length > 0) {
      setSelected((prev) => {
        const next = { ...prev };
        for (const a of project.channelAssignments) {
          next[a.channel.id] = { enabled: a.enabled, priority: a.priority };
        }
        return next;
      });
    }
  }, [project.channelAssignments]);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}/channel-assignments`, {
        method: 'PUT',
        body: {
          assignments: Object.entries(selected)
            .filter(([, v]) => v.enabled)
            .map(([publishingChannelId, v]) => ({ publishingChannelId, enabled: true, priority: v.priority })),
        },
      });
      onNotice(t('pct.assignSaved'));
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.assignFailed'));
    } finally {
      setBusy(false);
    }
  };

  const setFlag = (id: string, flag: boolean) =>
    setSelected((prev) => ({ ...prev, [id]: { enabled: flag, priority: prev[id]?.priority ?? 1 } }));
  const setPriority = (id: string, priority: number) =>
    setSelected((prev) => ({ ...prev, [id]: { enabled: prev[id]?.enabled ?? true, priority } }));

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('pct.assignChannels')}</h3>
        <div className="muted" style={{ marginBottom: 16 }}>{t('pct.assignIntro')}</div>
        <table>
          <thead>
            <tr>
              <th>{t('pct.channel')}</th>
              <th>{t('pct.platform')}</th>
              <th>{t('pct.connection')}</th>
              <th>{t('pct.enabled')}</th>
              <th>{t('pct.priority')}</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => {
              const entry = selected[c.id] ?? { enabled: false, priority: 1 };
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    {!c.isActive && <span className="badge warn" style={{ marginLeft: 8 }}>{t('pct.disabled')}</span>}
                  </td>
                  <td className="muted">{c.platform}</td>
                  <td>
                    <span className={`badge ${c.connectionStatus === 'CONNECTED' ? 'ok' : 'warn'}`}>
                      {c.connectionStatus ?? t('pct.neverTested')}
                    </span>
                  </td>
                  <td>
                    <input type="checkbox" checked={entry.enabled} onChange={(e) => setFlag(c.id, e.target.checked)} />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={entry.priority}
                      onChange={(e) => setPriority(c.id, Number(e.target.value))}
                      style={{ width: 70 }}
                    />
                  </td>
                </tr>
              );
            })}
            {channels.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">{t('pct.noGlobalChannels')}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 16, gap: 8 }}>
          <button className="btn" onClick={() => void save()} disabled={busy}>
            {busy ? '…' : t('pct.saveAssignments')}
          </button>
          <Link href="/channels" className="btn secondary">{t('pct.manageChannels')}</Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI providers tab (project defaults per capability)
// ---------------------------------------------------------------------------

function AiTab({ project, onSaved, onNotice, onError }: { project: Project; onSaved: () => void; onNotice: (m: string) => void; onError: (m: string) => void }) {
  const { t } = useI18n();
  const [groups, setGroups] = useState<ProviderGroup[]>([]);
  const [ai, setAi] = useState(project.defaultAIProvider ?? '');
  const [image, setImage] = useState(project.defaultImageProvider ?? '');
  const [video, setVideo] = useState(project.defaultVideoProvider ?? '');
  const [voice, setVoice] = useState(project.defaultVoiceProvider ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ groups: ProviderGroup[] }>('/api/providers')
      .then((d) => setGroups(d.groups))
      .catch((e) => onError(e.message));
  }, [onError]);

  const fieldFor = (group: string): { value: string; set: (v: string) => void } | null => {
    switch (group) {
      case 'AI_TEXT':
        return { value: ai, set: setAi };
      case 'IMAGE':
        return { value: image, set: setImage };
      case 'VIDEO':
        return { value: video, set: setVideo };
      case 'VOICE':
        return { value: voice, set: setVoice };
      default:
        return null;
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: {
          defaultAIProvider: ai || undefined,
          defaultImageProvider: image || undefined,
          defaultVideoProvider: video || undefined,
          defaultVoiceProvider: voice || undefined,
        },
      });
      onNotice(t('pct.saved'));
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('pct.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="card" style={{ maxWidth: 720 }}>
      <h3 style={{ marginTop: 0 }}>{t('pct.ai')}</h3>
      <div className="muted" style={{ marginBottom: 16 }}>{t('pct.aiIntro')}</div>
      {groups.map((g) => {
        const f = fieldFor(g.id);
        if (!f) return null;
        return (
          <Field key={g.id} label={g.label}>
            <select value={f.value} onChange={(e) => f.set(e.target.value)}>
              <option value="">{t('pct.inheritDefault')}</option>
              {g.options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>
        );
      })}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? '…' : t('pct.saveAi')}
      </button>
    </form>
  );
}
