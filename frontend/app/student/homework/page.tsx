'use client';

import { useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  ClipboardList,
  AlertCircle,
  GraduationCap,
  Upload,
  MessageSquare,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AttachmentList, AttachmentUploader } from '@/components/homework/attachments';
import { useAuthStore } from '@/lib/store/auth-store';
import { useStudentsQuery } from '@/lib/queries/students';
import { useStudentGroupMembershipsQuery } from '@/lib/queries/groups';
import { useAssignmentsQuery, useSubmissionsQuery, useCreateSubmissionMutation } from '@/lib/queries/homework';
import type { Assignment, Attachment, Submission } from '@/lib/api/homework';
import { ApiError } from '@/lib/api/client';
import { toast } from '@/lib/store/toast-store';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales';

// ─── Types ────────────────────────────────────────────────────────────────────

type HomeworkStatus = 'pending' | 'submitted' | 'graded' | 'late';
type FilterTab = 'all' | HomeworkStatus;

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_COLORS = ['#6366f1', '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899'];

function cardColor(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = (hash + groupId.charCodeAt(i)) % CARD_COLORS.length;
  return CARD_COLORS[hash];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, locale: Locale) {
  return formatLocalizedDate(new Date(dateStr + 'T00:00:00'), locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusOf(assignment: Assignment, submission: Submission | undefined, todayIso: string): HomeworkStatus {
  if (submission) return submission.score !== null ? 'graded' : 'submitted';
  return assignment.due_date < todayIso ? 'late' : 'pending';
}

// ─── Homework Card ─────────────────────────────────────────────────────────────

function HomeworkCard({
  assignment,
  submission,
  status,
  onSubmit,
}: {
  assignment: Assignment;
  submission: Submission | undefined;
  status: HomeworkStatus;
  onSubmit: (assignment: Assignment) => void;
}) {
  const t = useTranslations('StudentHomework');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_CONFIG: Record<HomeworkStatus, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' }> = {
    pending: { label: t('statusPending'), variant: 'warning' },
    submitted: { label: t('statusSubmitted'), variant: 'info' },
    graded: { label: t('statusGraded'), variant: 'success' },
    late: { label: t('statusLate'), variant: 'danger' },
  };

  const config = STATUS_CONFIG[status];
  const color = cardColor(assignment.group);

  return (
    <div
      className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-3"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-slate-900 text-sm leading-tight flex-1">{assignment.title}</h4>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-xs font-medium px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}18`, color }}
          >
            {assignment.group_name}
          </span>
          <Badge label={config.label} variant={config.variant} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Calendar className="h-3.5 w-3.5 text-slate-400" />
        <span>{t('dueLabel', { date: formatDate(assignment.due_date, locale) })}</span>
        <span className="text-slate-300 mx-1">·</span>
        <span>{t('maxPtsLabel', { points: assignment.max_score })}</span>
      </div>

      {assignment.description && <p className="text-xs text-slate-500 whitespace-pre-wrap">{assignment.description}</p>}

      <AttachmentList attachments={assignment.attachments} />

      {submission && (submission.content || submission.attachments.length > 0) && (
        <div className="rounded-xl border border-slate-100 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('yourWorkLabel')}</p>
          {submission.content && <p className="text-xs text-slate-600 whitespace-pre-wrap">{submission.content}</p>}
          <AttachmentList attachments={submission.attachments} />
        </div>
      )}

      {status === 'graded' && submission && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-emerald-700">{submission.score}</span>
            <span className="text-xs text-emerald-600">/ {assignment.max_score}</span>
          </div>
          {submission.feedback && (
            <div className="flex items-start gap-1.5 border-l border-emerald-200 pl-3 flex-1 min-w-0">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 leading-snug">{submission.feedback}</p>
            </div>
          )}
        </div>
      )}

      {status === 'submitted' && (
        <p className="text-xs text-blue-600 bg-blue-50 rounded-xl p-3">
          {t('submittedAwaitingGrading')}
        </p>
      )}

      {(status === 'pending' || status === 'late') && (
        <div className="pt-1">
          <Button
            variant={status === 'late' ? 'outline' : 'primary'}
            size="sm"
            onClick={() => onSubmit(assignment)}
          >
            <Upload className="h-3.5 w-3.5" />
            {status === 'late' ? t('submitLate') : t('submitHomework')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentHomeworkPage() {
  const t = useTranslations('StudentHomework');
  const tc = useTranslations('Common');

  const FILTER_TABS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: t('tabAll') },
    { id: 'pending', label: t('tabPending') },
    { id: 'submitted', label: t('tabSubmitted') },
    { id: 'graded', label: t('tabGraded') },
    { id: 'late', label: t('tabLate') },
  ];

  const organizationId = useAuthStore((s) => s.user?.organizationId) ?? '';
  const authUserId = useAuthStore((s) => s.user?.id);
  const { data: students = [] } = useStudentsQuery({ organizationId });
  const myProfile = students.find((s) => s.user === authUserId);

  const { data: memberships = [] } = useStudentGroupMembershipsQuery(myProfile?.id ?? null);
  const myGroupIds = new Set(memberships.filter((m) => m.status === 'active').map((m) => m.group));

  const { data: assignments = [] } = useAssignmentsQuery({ organizationId });
  const myAssignments = useMemo(() => assignments.filter((a) => myGroupIds.has(a.group)), [assignments, myGroupIds]);

  const { data: submissions = [] } = useSubmissionsQuery({ organizationId, studentProfile: myProfile?.id });
  const submissionByAssignment = new Map(submissions.map((s) => [s.assignment, s]));

  const createMutation = useCreateSubmissionMutation();
  // The assignment whose submit dialog is open, and that dialog's draft.
  const [submitFor, setSubmitFor] = useState<Assignment | null>(null);
  const [answer, setAnswer] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const todayIso = new Date().toISOString().slice(0, 10);

  const rows = useMemo(
    () =>
      myAssignments.map((assignment) => ({
        assignment,
        submission: submissionByAssignment.get(assignment.id),
        status: statusOf(assignment, submissionByAssignment.get(assignment.id), todayIso),
      })),
    [myAssignments, submissionByAssignment, todayIso]
  );

  const filtered = activeTab === 'all' ? rows : rows.filter((r) => r.status === activeTab);

  const pendingCount = rows.filter((r) => r.status === 'pending' || r.status === 'late').length;
  const submittedCount = rows.filter((r) => r.status === 'submitted').length;
  const gradedRows = rows.filter((r) => r.status === 'graded' && r.submission?.score !== null && r.submission?.score !== undefined);
  const avgScore =
    gradedRows.length > 0
      ? Math.round(
          gradedRows.reduce((sum, r) => sum + ((r.submission!.score! / r.assignment.max_score) * 100), 0) / gradedRows.length
        )
      : 0;

  function openSubmit(assignment: Assignment) {
    setSubmitFor(assignment);
    setAnswer('');
    setFiles([]);
  }

  async function handleSubmit() {
    if (!myProfile || !submitFor) return;
    if (!answer.trim() && files.length === 0) {
      toast.error(t('submitEmptyError'));
      return;
    }
    try {
      await createMutation.mutateAsync({
        organizationId,
        assignment: submitFor.id,
        content: answer.trim(),
        attachmentIds: files.map((f) => f.id),
      });
      toast.success(t('submitSuccessToast'));
      setSubmitFor(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t('statPending')}
          value={pendingCount}
          icon={<ClipboardList className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-50"
        />
        <StatCard
          label={t('statAwaitingGrading')}
          value={submittedCount}
          icon={<Clock className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
        />
        <StatCard
          label={t('statAverageScore')}
          value={avgScore > 0 ? `${avgScore}%` : '—'}
          icon={<GraduationCap className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-100 overflow-x-auto pb-px">
        {FILTER_TABS.map((tab) => {
          const count = tab.id === 'all' ? rows.length : rows.filter((r) => r.status === tab.id).length;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-semibold ${
                  activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Homework Grid */}
      {filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <AlertCircle className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">{t('noHomeworkCategory')}</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((r) => (
            <HomeworkCard
              key={r.assignment.id}
              assignment={r.assignment}
              submission={r.submission}
              status={r.status}
              onSubmit={openSubmit}
            />
          ))}
        </div>
      )}

      <Dialog open={!!submitFor} onOpenChange={(open) => !open && !createMutation.isPending && setSubmitFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{submitFor?.title ?? ''}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('answerLabel')}</label>
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={t('answerPlaceholder')}
                rows={4}
                disabled={createMutation.isPending}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('filesLabel')}</label>
              <AttachmentUploader value={files} onChange={setFiles} disabled={createMutation.isPending} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSubmitFor(null)} disabled={createMutation.isPending}>
              {tc('cancel')}
            </Button>
            <Button variant="primary" onClick={handleSubmit} loading={createMutation.isPending}>
              <Upload className="h-3.5 w-3.5" />
              {t('submitHomework')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
