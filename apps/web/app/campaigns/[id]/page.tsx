'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { api } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface Channel {
  id: string;
  name: string;
  platform: string;
  isActive: boolean;
}

interface Assignment {
  id: string;
  enabled: boolean;
  priority: number;
  languageOverride: string | null;
  captionInstructions: string | null;
  channel: Channel;
}

interface Series {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  priority: number;
  _count: { topics: number; contents: number };
}

interface Knowledge {
  id: string;
  title: string;
  type: string;
  url: string | null;
  isActive: boolean;
}

interface Topic {
  id: string;
  name: string;
  isActive: boolean;
  usedCount: number;
}

interface CampaignDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dailyVideoTarget: number;
  timezone: string;
  aiInstructions: string | null;
  contentProfile: Record<string, unknown> | null;
  providerOverrides: Record<string, unknown> | null;
  automation: Record<string, unknown> | null;
  assignments: Assignment[];
  series: Series[];
  knowledge: Knowledge[];
}

const defaultProfile = {
  description: '',
  audience: '',
  language: 'vi-VN',
  tone: '',
  contentStyle: '',
  keywords: '',
  excludedTopics: '',
  cta: '',
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { t } = useI18n();

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  // Profile form state
  const [profile, setProfile] = useState({ ...defaultProfile });
  const [aiInstructions, setAiInstructions] = useState('');
  const [dailyVideoTarget, setDailyVideoTarget] = useState(1);
  const [autoPublish, setAutoPublish] = useState(false);
  const [providerAI, setProviderAI] = useState('');

  // Assignment editor state
  const [selectedChannel, setSelectedChannel] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Series / topic state
  const [seriesName, setSeriesName] = useState('');
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [topicsBySeries, setTopicsBySeries] = useState<Record<string, Topic[]>>({});

  // Knowledge state
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [kTitle, setKTitle] = useState('');
  const [kContent, setKContent] = useState('');

  const load = useCallback(() => {
    api<{ campaign: CampaignDetail }>(`/api/campaigns/${id}`)
      .then((d) => {
        setCampaign(d.campaign);
        setProjectId((d.campaign as unknown as { projectId?: string }).projectId ?? '');
        setAssignments(d.campaign.assignments);
        setSeriesList(d.campaign.series);
        setKnowledge(d.campaign.knowledge);
        const p = (d.campaign.contentProfile ?? {}) as Record<string, unknown>;
        setProfile({
          description: (p.description as string) ?? '',
          audience: (p.audience as string) ?? '',
          language: (p.language as string) ?? 'vi-VN',
          tone: (p.tone as string) ?? '',
          contentStyle: (p.contentStyle as string) ?? '',
          keywords: ((p.keywords as string[]) ?? []).join(', '),
          excludedTopics: ((p.excludedTopics as string[]) ?? []).join(', '),
          cta: (p.cta as string) ?? '',
        });
        setAiInstructions(d.campaign.aiInstructions ?? '');
        setDailyVideoTarget(d.campaign.dailyVideoTarget);
        setAutoPublish(Boolean((d.campaign.automation as Record<string, unknown> | null)?.autoPublish));
        setProviderAI(((d.campaign.providerOverrides as Record<string, unknown> | null)?.ai as string) ?? '');
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    api<{ channels: Channel[] }>('/api/channels')
      .then((d) => setChannels(d.channels))
      .catch(() => undefined);
  }, [load]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/api/campaigns/${id}`, {
        method: 'PATCH',
        body: {
          contentProfile: {
            description: profile.description || undefined,
            audience: profile.audience || undefined,
            language: profile.language || undefined,
            tone: profile.tone || undefined,
            contentStyle: profile.contentStyle || undefined,
            keywords: profile.keywords ? profile.keywords.split(',').map((k) => k.trim()).filter(Boolean) : [],
            excludedTopics: profile.excludedTopics ? profile.excludedTopics.split(',').map((k) => k.trim()).filter(Boolean) : [],
            cta: profile.cta || undefined,
          },
          aiInstructions: aiInstructions || undefined,
          dailyVideoTarget,
          automation: { autoPublish },
          providerOverrides: providerAI ? { ai: providerAI } : undefined,
        },
      });
      setNotice(t('cdetail.profileSaved'));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cdetail.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: string) => {
    setError('');
    setNotice('');
    try {
      await api(`/api/campaigns/${id}/${status.toLowerCase()}`, { method: 'POST' });
      setNotice(
        status === 'activate' ? t('cdetail.activated') : status === 'pause' ? t('cdetail.pausedMsg') : t('cdetail.archivedMsg'),
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cdetail.failed'));
    }
  };

  const addAssignment = async () => {
    if (!selectedChannel) return;
    setError('');
    setNotice('');
    try {
      const next = [...assignments.map((a) => ({ publishingChannelId: a.channel.id, enabled: a.enabled, priority: a.priority, languageOverride: a.languageOverride ?? undefined, captionInstructions: a.captionInstructions ?? undefined }))];
      if (!next.some((a) => a.publishingChannelId === selectedChannel)) {
        next.push({ publishingChannelId: selectedChannel, enabled: true, priority: next.length + 1, languageOverride: undefined, captionInstructions: undefined });
      }
      await api(`/api/campaigns/${id}/assignments`, {
        method: 'PUT',
        body: { assignments: next },
      });
      setSelectedChannel('');
      setNotice(t('cdetail.assignmentsUpdated'));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cdetail.assignUpdateFailed'));
    }
  };

  const toggleAssignment = async (a: Assignment) => {
    try {
      const next = assignments.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x));
      await api(`/api/campaigns/${id}/assignments`, {
        method: 'PUT',
        body: {
          assignments: next.map((x) => ({
            publishingChannelId: x.channel.id,
            enabled: x.enabled,
            priority: x.priority,
            languageOverride: x.languageOverride ?? undefined,
            captionInstructions: x.captionInstructions ?? undefined,
          })),
        },
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cdetail.failed'));
    }
  };

  const addSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seriesName.trim()) return;
    try {
      await api(`/api/campaigns/${id}/series`, {
        method: 'POST',
        body: { name: seriesName },
      });
      setSeriesName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cdetail.seriesCreateFailed'));
    }
  };

  const loadTopics = async (seriesId: string) => {
    const d = await api<{ topics: Topic[] }>(`/api/campaigns/${id}/series/${seriesId}/topics`);
    setTopicsBySeries((prev) => ({ ...prev, [seriesId]: d.topics }));
  };

  const addTopic = async (seriesId: string) => {
    const name = window.prompt(t('cdetail.topicPrompt'));
    if (!name) return;
    try {
      await api(`/api/campaigns/${id}/series/${seriesId}/topics`, {
        method: 'POST',
        body: { name },
      });
      loadTopics(seriesId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cdetail.topicAddFailed'));
    }
  };

  const generateTopics = async (seriesId: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const d = await api<{ created: string[] }>(`/api/campaigns/${id}/generate-topic`, {
        method: 'POST',
        body: { seriesId, count: 10 },
      });
      setNotice(t('cdetail.generatedTopics', { n: d.created.length }));
      loadTopics(seriesId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cdetail.genTopicsFailed'));
    } finally {
      setBusy(false);
    }
  };

  const addKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kTitle.trim()) return;
    try {
      await api(`/api/campaigns/${id}/knowledge`, {
        method: 'POST',
        body: { title: kTitle, content: kContent || undefined },
      });
      setKTitle('');
      setKContent('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cdetail.knowledgeAddFailed'));
    }
  };

  const deleteKnowledge = async (kid: string) => {
    try {
      await api(`/api/campaign-knowledge/${kid}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cdetail.deleteFailed'));
    }
  };

  const generate = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const d = await api<{ concepts: string[]; variants: Record<string, string[]> }>(
        `/api/campaigns/${id}/generate`,
        { method: 'POST', body: { count: 1 } },
      );
      const total = d.concepts.length + Object.values(d.variants).reduce((n, v) => n + v.length, 0);
      setNotice(t('cdetail.enqueued', { total, concepts: d.concepts.length }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cdetail.generateFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!campaign) {
    return (
      <Shell>
        <div className="hero">{t('cdetail.loading')}</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="spread" style={{ marginBottom: 20 }}>
        <div>
          <button className="btn secondary small" onClick={() => router.push('/campaigns')}>
            {t('cdetail.back')}
          </button>
          <h2 style={{ margin: '10px 0 0' }}>{campaign.name}</h2>
          <div className="wrap" style={{ marginTop: 8 }}>
            <span className={`badge ${campaign.status === 'ACTIVE' ? 'ok' : ''}`}>{campaign.status}</span>
            {campaign.status === 'DRAFT' && (
              <button className="btn small" onClick={() => void changeStatus('activate')}>
                {t('cdetail.activate')}
              </button>
            )}
            {campaign.status === 'ACTIVE' && (
              <button className="btn secondary small" onClick={() => void changeStatus('pause')}>
                {t('cdetail.pause')}
              </button>
            )}
            {campaign.status !== 'ARCHIVED' && (
              <button className="btn secondary small" onClick={() => void changeStatus('archive')}>
                {t('cdetail.archive')}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="muted" style={{ marginBottom: 12, color: 'var(--ok)' }}>{notice}</div>}

      <form onSubmit={(e) => void saveProfile(e)} className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>{t('cdetail.contentProfile')}</h3>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t('cdetail.audience')}</label>
            <input value={profile.audience} onChange={(e) => setProfile({ ...profile, audience: e.target.value })} placeholder="e.g. Tech enthusiasts in Japan" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t('cdetail.language')}</label>
            <input value={profile.language} onChange={(e) => setProfile({ ...profile, language: e.target.value })} placeholder="ja-JP" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t('cdetail.tone')}</label>
            <input value={profile.tone} onChange={(e) => setProfile({ ...profile, tone: e.target.value })} placeholder="professional" />
          </div>
        </div>
        <div className="field">
          <label>{t('cdetail.description')}</label>
          <textarea rows={2} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t('cdetail.keywords')}</label>
            <input value={profile.keywords} onChange={(e) => setProfile({ ...profile, keywords: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t('cdetail.excludedTopics')}</label>
            <input value={profile.excludedTopics} onChange={(e) => setProfile({ ...profile, excludedTopics: e.target.value })} />
          </div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t('cdetail.cta')}</label>
            <input value={profile.cta} onChange={(e) => setProfile({ ...profile, cta: e.target.value })} placeholder="Follow for daily updates" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t('cdetail.dailyTarget')}</label>
            <input type="number" min={0} value={dailyVideoTarget} onChange={(e) => setDailyVideoTarget(Number(e.target.value))} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t('cdetail.aiProvider')}</label>
            <input value={providerAI} onChange={(e) => setProviderAI(e.target.value)} placeholder="GEMINI / OPENAI / CLAUDE" />
          </div>
        </div>
        <div className="field">
          <label>{t('cdetail.aiInstructions')}</label>
          <textarea rows={3} value={aiInstructions} onChange={(e) => setAiInstructions(e.target.value)} placeholder="Brand safety, sourcing rules, formats to avoid…" />
        </div>
        <div className="row">
          <label style={{ margin: 0 }}>
            <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} style={{ width: 'auto', marginRight: 8 }} />
            {t('cdetail.autoPublish')}
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {t('cdetail.saveProfile')}
          </button>
          <button className="btn secondary" type="button" onClick={() => void generate()} disabled={busy}>
            {t('cdetail.generateNow')}
          </button>
        </div>
      </form>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="spread">
          <h3 style={{ margin: 0 }}>{t('cdetail.assignments')}</h3>
          <div className="row">
            <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)} style={{ width: 280 }}>
              <option value="">{t('cdetail.selectChannel')}</option>
              {channels
                .filter((c) => !assignments.some((a) => a.channel.id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.platform})
                  </option>
                ))}
            </select>
            <button className="btn small" onClick={() => void addAssignment()} disabled={!selectedChannel}>
              {t('cdetail.add')}
            </button>
          </div>
        </div>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>{t('cdetail.channel')}</th>
              <th>{t('cdetail.platform')}</th>
              <th>{t('cdetail.priority')}</th>
              <th>{t('cdetail.langOverride')}</th>
              <th>{t('cdetail.captionInstructions')}</th>
              <th>{t('cdetail.enabled')}</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id}>
                <td>{a.channel.name}</td>
                <td>{a.channel.platform}</td>
                <td>{a.priority}</td>
                <td className="muted">{a.languageOverride ?? '—'}</td>
                <td className="muted" style={{ maxWidth: 260 }}>
                  <span style={{ display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                    {a.captionInstructions ?? '—'}
                  </span>
                </td>
                <td>
                  <button className={`btn small ${a.enabled ? 'secondary' : ''}`} onClick={() => void toggleAssignment(a)}>
                    {a.enabled ? t('cdetail.on') : t('cdetail.off')}
                  </button>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {t('cdetail.noAssignments')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>{t('cdetail.series')}</h3>
        <form className="row" onSubmit={(e) => void addSeries(e)} style={{ marginBottom: 12 }}>
          <input placeholder={t('cdetail.seriesName')} value={seriesName} onChange={(e) => setSeriesName(e.target.value)} style={{ flex: 1 }} />
          <button className="btn small" type="submit" disabled={!seriesName.trim()}>
            {t('cdetail.addSeries')}
          </button>
        </form>
        {seriesList.map((s) => (
          <div key={s.id} className="card" style={{ marginBottom: 10 }}>
            <div className="spread">
              <div>
                <strong>{s.name}</strong>
                <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>
                  {t('cdetail.seriesCount', { topics: s._count.topics, contents: s._count.contents })}
                </span>
              </div>
              <div className="row">
                <button className="btn secondary small" onClick={() => void generateTopics(s.id)} disabled={busy}>
                  {t('cdetail.generateTopics')}
                </button>
                <button className="btn secondary small" onClick={() => void addTopic(s.id)}>
                  {t('cdetail.addTopic')}
                </button>
              </div>
            </div>
            <button className="btn secondary small" style={{ marginTop: 10 }} onClick={() => void loadTopics(s.id)}>
              {t('cdetail.toggleTopics')}
            </button>
            <div style={{ marginTop: 8 }}>
              {(topicsBySeries[s.id] ?? []).map((topic) => (
                <span key={topic.id} className="badge" style={{ marginRight: 6, marginBottom: 6 }}>
                  {topic.name} ({topic.usedCount})
                </span>
              ))}
              {topicsBySeries[s.id] && topicsBySeries[s.id].length === 0 && (
                <span className="muted">{t('cdetail.noTopics')}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>{t('cdetail.knowledgeBase')}</h3>
        <form className="row" onSubmit={(e) => void addKnowledge(e)} style={{ marginBottom: 12 }}>
          <input placeholder={t('cdetail.title')} value={kTitle} onChange={(e) => setKTitle(e.target.value)} style={{ flex: 1 }} />
          <input placeholder={t('cdetail.contentOptional')} value={kContent} onChange={(e) => setKContent(e.target.value)} style={{ flex: 2 }} />
          <button className="btn small" type="submit" disabled={!kTitle.trim()}>
            {t('cdetail.add')}
          </button>
        </form>
        <table>
          <tbody>
            {knowledge.map((k) => (
              <tr key={k.id}>
                <td>{k.title}</td>
                <td className="muted">{k.type}</td>
                <td>
                  <button className="btn danger small" onClick={() => void deleteKnowledge(k.id)}>
                    {t('cdetail.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {knowledge.length === 0 && <div className="muted">{t('cdetail.noKnowledge')}</div>}
      </div>
    </Shell>
  );
}
