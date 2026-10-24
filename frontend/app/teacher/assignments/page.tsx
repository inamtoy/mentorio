'use client';

import { Fragment, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { SearchInput, Input, Select } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { DetailDialog } from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/store/auth-store';
import { useMyTeacherProfileQuery } from '@/lib/queries/teachers';
import { useGroupsQuery, useGroupMembersQuery } from '@/lib/queries/groups';
import {
  useAssignmentsQuery,
  useSubmissionsQuery,
  useCreateAssignmentMutation,
  useUpdateAssignmentMutation,
  useGradeSubmissionMutation,
} from '@/lib/queries/homework';
import type { Assignment, AssignmentStatus, Attachment } from '@/lib/api/homework';
import { AttachmentList, AttachmentUploader } from '@/components/homework/attachments';
import { ApiError } from '@/lib/api/client';
import { toast } from '@/lib/store/toast-store';
import { formatLocalizedDate, INTL_DATE_LOCALES } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales';
import {
  Plus,
  Calendar,
  FileText,
  ClipboardList,
  AlertCircle,
  Clock,
  CheckCircle2,
  Edit2,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'submitted' | 'pending' | 'late';
type SubmissionStatus = 'graded' | 'late' | 'submitted';

interface GradeState {
  [submissionId: string]: { score: string; feedback: string; feedbackOpen: boolean };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, locale: Locale) {
  return formatLocalizedDate(new Date(dateStr + 'T00:00:00'), locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// A full timestamp (date + time-of-day), unlike the shared formatClockTime
// in date-locale.ts which only accepts a bare "HH:MM" time string — reuses
// its INTL_DATE_LOCALES/hour12 convention rather than re-deriving it.
function formatDateTime(dateStr: string, locale: Locale) {
  const d = new Date(dateStr);
  const datePart = formatLocalizedDate(d, locale, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(INTL_DATE_LOCALES[locale], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: locale === 'en',
  });
  return `${datePart}, ${timePart}`;
}

const GROUP_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-violet-100 text-violet-700',
  'bg-cyan-100 text-cyan-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
];

function groupColor(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = (hash + groupId.charCodeAt(i)) % GROUP_COLORS.length;
  return GROUP_COLORS[hash];
}

// ─── Create/Edit Form ──────────────────────────────────────────────────────────

interface FormValues {
  title: string;
  groupId: string;
  description: string;
  dueDate: string;
  maxScore: string;
  status: AssignmentStatus;
  attachments: Attachment[];
}

const EMPTY_FORM: FormValues = {
  title: '',
  groupId: '',
  description: '',
  dueDate: '',
  maxScore: '100',
  status: 'active',
  attachments: [],
};

// ─── Submissions Panel ─────────────────────────────────────────────────────────

interface SubmissionsPanelProps {
  assignment: Assignment;
  organizationId: string;
}

function SubmissionsPanel({ assignment, organizationId }: SubmissionsPanelProps) {
  const t = useTranslations('TeacherAssignments');
  const tc = useTranslations('Common');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const { data: submissions = [] } = useSubmissionsQuery({ organizationId, assignment: assignment.id });
  const { data: members = [] } = useGroupMembersQuery(assignment.group);
  const gradeMutation = useGradeSubmissionMutation();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [grades, setGrades] = useState<GradeState>({});

  // Local status → label map, deliberately not the shared <StatusBadge> —
  // see the same note on app/student/attendance/page.tsx.
  const STATUS_CONFIG: Record<SubmissionStatus | 'pending', { label: string; variant: 'success' | 'warning' | 'danger' }> = {
    graded: { label: t('statusGraded'), variant: 'success' },
    late: { label: t('statusLate'), variant: 'danger' },
    submitted: { label: t('statusSubmitted'), variant: 'warning' },
    pending: { label: t('statusPending'), variant: 'warning' },
  };

  function statusOf(sub: (typeof submissions)[number]): SubmissionStatus {
    if (sub.score !== null) return 'graded';
    if (sub.is_late) return 'late';
    return 'submitted';
  }

  function gradeFor(id: string) {
    return grades[id] ?? { score: '', feedback: '', feedbackOpen: false };
  }

  const submittedStudentIds = new Set(submissions.map((s) => s.student_profile));
  const pendingStudents = members.filter((m) => m.status === 'active' && !submittedStudentIds.has(m.student_profile));

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: t('tabAll'), count: submissions.length + pendingStudents.length },
    { key: 'submitted', label: t('tabSubmitted'), count: submissions.filter((s) => statusOf(s) === 'submitted').length },
    { key: 'pending', label: t('tabPending'), count: pendingStudents.length },
    { key: 'late', label: t('tabLate'), count: submissions.filter((s) => statusOf(s) === 'late').length },
  ];

  const filtered =
    activeTab === 'all' ? submissions : activeTab === 'pending' ? [] : submissions.filter((s) => statusOf(s) === activeTab);

  function handleScore(id: string, value: string) {
    setGrades((prev) => ({ ...prev, [id]: { ...gradeFor(id), score: value } }));
  }

  function handleFeedback(id: string, value: string) {
    setGrades((prev) => ({ ...prev, [id]: { ...gradeFor(id), feedback: value } }));
  }

  function toggleFeedback(id: string) {
    setGrades((prev) => ({ ...prev, [id]: { ...gradeFor(id), feedbackOpen: !gradeFor(id).feedbackOpen } }));
  }

  async function handleSave() {
    const toSave = submissions.filter((sub) => {
      const g = grades[sub.id];
      return g && g.score !== '' && !isNaN(Number(g.score));
    });
    if (toSave.length === 0) {
      toast.error(t('enterScoreFirstToast'));
      return;
    }
    try {
      await Promise.all(
        toSave.map((sub) => {
          const g = grades[sub.id];
          return gradeMutation.mutateAsync({ id: sub.id, score: Number(g.score), feedback: g.feedback || undefined });
        })
      );
      toast.success(t('gradesSavedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 pr-8">
        <h3 className="font-semibold text-slate-900">{assignment.title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{t('submissionsPanelSubtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-100 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
            }`}
          >
            {tab.label}
            <span
              className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t('colStudent')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t('colSubmitted')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t('colScore')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t('colStatus')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t('colFeedback')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (activeTab !== 'all' && activeTab !== 'pending' ? true : pendingStudents.length === 0) && submissions.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-slate-400 text-sm py-12">
                  {t('noSubmissionsYet')}
                </td>
              </tr>
            )}
            {filtered.map((sub) => (
              <Fragment key={sub.id}>
                <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={sub.student_name} size="sm" />
                      <span className="text-sm font-medium text-slate-800">{sub.student_name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-sm text-slate-500">{formatDateTime(sub.submitted_at, locale)}</td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={assignment.max_score}
                        value={gradeFor(sub.id).score || (sub.score !== null ? String(sub.score) : '')}
                        onChange={(e) => handleScore(sub.id, e.target.value)}
                        className="w-16 h-8 rounded-lg border border-slate-200 px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-slate-400">/ {assignment.max_score}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge label={STATUS_CONFIG[statusOf(sub)].label} variant={STATUS_CONFIG[statusOf(sub)].variant} dot />
                  </td>
                  <td className="py-3.5 px-4">
                    <button
                      onClick={() => toggleFeedback(sub.id)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      {gradeFor(sub.id).feedbackOpen ? t('hideFeedback') : sub.feedback ? t('editFeedback') : t('addFeedback')}
                    </button>
                  </td>
                </tr>
                {(sub.content || sub.attachments.length > 0) && (
                  <tr className="border-b border-slate-50">
                    <td colSpan={5} className="px-4 pb-3">
                      <div className="rounded-xl bg-slate-50 p-3 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('studentWorkLabel')}</p>
                        {sub.content && <p className="text-sm text-slate-700 whitespace-pre-wrap">{sub.content}</p>}
                        <AttachmentList attachments={sub.attachments} />
                      </div>
                    </td>
                  </tr>
                )}
                {gradeFor(sub.id).feedbackOpen && (
                  <tr className="border-b border-slate-50">
                    <td colSpan={5} className="px-4 pb-3">
                      <textarea
                        value={gradeFor(sub.id).feedback || sub.feedback || ''}
                        onChange={(e) => handleFeedback(sub.id, e.target.value)}
                        placeholder={t('feedbackPlaceholder')}
                        className="rounded-xl border border-slate-200 w-full p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        rows={2}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {(activeTab === 'all' || activeTab === 'pending') &&
              pendingStudents.map((member) => (
                <tr key={member.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={member.student_name} size="sm" />
                      <span className="text-sm font-medium text-slate-800">{member.student_name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-sm text-slate-400">—</td>
                  <td className="py-3.5 px-4 text-sm text-slate-400">—</td>
                  <td className="py-3.5 px-4">
                    <Badge label={STATUS_CONFIG.pending.label} variant={STATUS_CONFIG.pending.variant} dot />
                  </td>
                  <td className="py-3.5 px-4 text-sm text-slate-400">—</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-end mt-6 pt-4 border-t border-slate-100">
        <Button variant="primary" onClick={handleSave} loading={gradeMutation.isPending}>
          {t('saveGradesButton')}
        </Button>
      </div>
    </div>
  );
}

// ─── Assignment Card ───────────────────────────────────────────────────────────

interface AssignmentCardProps {
  assignment: Assignment;
  onViewSubmissions: (a: Assignment) => void;
  onEdit: (a: Assignment) => void;
}

function AssignmentCard({ assignment, onViewSubmissions, onEdit }: AssignmentCardProps) {
  const t = useTranslations('TeacherAssignments');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const total = assignment.total_students;
  const submittedPct = total > 0 ? (assignment.submitted_count / total) * 100 : 0;
  const pending = Math.max(total - assignment.submitted_count, 0);

  // Local status → label map, deliberately not the shared <StatusBadge> —
  // see the same note on app/student/attendance/page.tsx.
  const ASSIGNMENT_STATUS_CONFIG: Record<AssignmentStatus, { label: string; variant: 'success' | 'secondary' }> = {
    active: { label: t('statusActive'), variant: 'success' },
    closed: { label: t('statusClosed'), variant: 'secondary' },
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-slate-900 text-sm leading-tight flex-1">{assignment.title}</h4>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${groupColor(assignment.group)}`}>
            {assignment.group_name}
          </span>
          <Badge label={ASSIGNMENT_STATUS_CONFIG[assignment.status].label} variant={ASSIGNMENT_STATUS_CONFIG[assignment.status].variant} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Calendar className="h-3.5 w-3.5 text-slate-400" />
        <span>{t('dueLabel', { date: formatDate(assignment.due_date, locale) })}</span>
      </div>

      {assignment.description && <p className="text-xs text-slate-500 line-clamp-2">{assignment.description}</p>}

      <AttachmentList attachments={assignment.attachments} />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
          <CheckCircle2 className="h-3 w-3" />
          {t('submittedBadge', { count: assignment.submitted_count })}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full">
          <Clock className="h-3 w-3" />
          {t('pendingBadge', { count: pending })}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">
          <CheckCircle2 className="h-3 w-3" />
          {t('gradedBadge', { count: assignment.graded_count })}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
          <span>{t('submissionsLabel')}</span>
          <span>{assignment.submitted_count}/{total}</span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${submittedPct}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={() => onViewSubmissions(assignment)}>
          <FileText className="h-3.5 w-3.5" />
          {t('viewSubmissionsButton')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onEdit(assignment)}>
          <Edit2 className="h-3.5 w-3.5" />
          {t('editButton')}
        </Button>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AssignmentsPage() {
  const t = useTranslations('TeacherAssignments');
  const tc = useTranslations('Common');
  const organizationId = useAuthStore((s) => s.user?.organizationId) ?? '';
  const { data: myProfile } = useMyTeacherProfileQuery();
  const { data: groups = [] } = useGroupsQuery({ organizationId, teacher: myProfile?.id });
  const { data: assignments = [] } = useAssignmentsQuery({ organizationId });
  const createMutation = useCreateAssignmentMutation();
  const updateMutation = useUpdateAssignmentMutation();

  const [search, setSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  const [saving, setSaving] = useState(false);

  const totalAssignments = assignments.length;
  const pendingSubmissions = assignments.reduce((sum, a) => sum + Math.max(a.total_students - a.submitted_count, 0), 0);
  const gradedSubmissions = assignments.reduce((sum, a) => sum + a.graded_count, 0);

  const filtered = assignments.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.group_name.toLowerCase().includes(search.toLowerCase())
  );

  function handleFormChange<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmitForm() {
    if (!form.title || !form.groupId || !form.dueDate) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          input: {
            title: form.title,
            description: form.description,
            dueDate: form.dueDate,
            maxScore: Number(form.maxScore) || 100,
            status: form.status,
            attachmentIds: form.attachments.map((a) => a.id),
          },
        });
        toast.success(t('assignmentUpdatedToast'));
      } else {
        await createMutation.mutateAsync({
          organizationId,
          group: form.groupId,
          title: form.title,
          description: form.description,
          dueDate: form.dueDate,
          maxScore: Number(form.maxScore) || 100,
          attachmentIds: form.attachments.map((a) => a.id),
        });
        toast.success(t('assignmentCreatedToast'));
      }
      setShowCreateForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(assignment: Assignment) {
    setEditingId(assignment.id);
    setForm({
      title: assignment.title,
      groupId: assignment.group,
      description: assignment.description ?? '',
      dueDate: assignment.due_date,
      maxScore: String(assignment.max_score),
      status: assignment.status,
      attachments: assignment.attachments,
    });
    setActiveAssignment(null);
    setShowCreateForm(true);
  }

  function handleViewSubmissions(assignment: Assignment) {
    setActiveAssignment(assignment);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
        actions={
          <>
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchPlaceholder')} />
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
                setShowCreateForm((v) => !v);
                setActiveAssignment(null);
              }}
            >
              <Plus className="h-4 w-4" />
              {t('createAssignmentButton')}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t('statTotalAssignments')} value={totalAssignments} icon={<ClipboardList className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t('statPendingSubmissions')} value={pendingSubmissions} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
        <StatCard label={t('statGradedSubmissions')} value={gradedSubmissions} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
      </div>

      {showCreateForm && (
        <Card title={editingId ? t('editAssignmentTitle') : t('createNewAssignmentTitle')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldAssignmentTitle')}</label>
              <Input
                placeholder={t('titlePlaceholder')}
                value={form.title}
                onChange={(e) => handleFormChange('title', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldGroup')}</label>
              <Select
                value={form.groupId}
                onChange={(e) => handleFormChange('groupId', e.target.value)}
                placeholder={t('selectGroupPlaceholder')}
                className="w-full"
                disabled={!!editingId}
                options={groups.map((g) => ({ value: g.id, label: g.name }))}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldDeadline')}</label>
              <Input type="date" value={form.dueDate} onChange={(e) => handleFormChange('dueDate', e.target.value)} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldMaxScore')}</label>
              <Input
                type="number"
                min={1}
                placeholder="100"
                value={form.maxScore}
                onChange={(e) => handleFormChange('maxScore', e.target.value)}
              />
            </div>

            {editingId && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldStatus')}</label>
                <Select
                  value={form.status}
                  onChange={(e) => handleFormChange('status', e.target.value as AssignmentStatus)}
                  className="w-full"
                  options={[
                    { value: 'active', label: t('statusActive') },
                    { value: 'closed', label: t('statusClosed') },
                  ]}
                />
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldDescription')}</label>
              <textarea
                placeholder={t('descriptionPlaceholder')}
                value={form.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
                className="rounded-xl border border-slate-200 w-full p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={3}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldAttachments')}</label>
              <AttachmentUploader
                value={form.attachments}
                onChange={(next) => handleFormChange('attachments', next)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex items-center justify-end mt-5 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
                disabled={saving}
              >
                {tc('cancel')}
              </Button>
              <Button variant="primary" onClick={handleSubmitForm} disabled={!form.title || !form.groupId || !form.dueDate} loading={saving}>
                {editingId ? t('saveChangesButton') : t('createButton')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-slate-400 text-sm">{t('noAssignmentsFound')}</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} onViewSubmissions={handleViewSubmissions} onEdit={handleEdit} />
          ))}
        </div>
      )}

      <DetailDialog open={!!activeAssignment} onClose={() => setActiveAssignment(null)} title={activeAssignment?.title ?? ''}>
        {activeAssignment && <SubmissionsPanel assignment={activeAssignment} organizationId={organizationId} />}
      </DetailDialog>
    </div>
  );
}
