'use client';

import { useState } from 'react';
import {
  Upload,
  FileText,
  Video,
  Image,
  Link2,
  Download,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, SearchInput, Select } from '@/components/ui/input';
import { useAuthStore } from '@/lib/store/auth-store';
import { useMyTeacherProfileQuery } from '@/lib/queries/teachers';
import { useGroupsQuery } from '@/lib/queries/groups';
import { useTeacherResourcesStore, type TeacherResource } from '@/lib/store/teacher-resources-store';
import { toast } from '@/lib/store/toast-store';
import { cn } from '@/lib/utils';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/locales';

type ResourceType = 'pdf' | 'video' | 'document' | 'image' | 'link';
type Resource = TeacherResource;

const TYPE_CONFIG: Record<
  ResourceType,
  { bg: string; iconColor: string; Icon: React.ElementType }
> = {
  pdf: { bg: 'bg-red-50', iconColor: 'text-red-500', Icon: FileText },
  video: { bg: 'bg-blue-50', iconColor: 'text-blue-500', Icon: Video },
  document: { bg: 'bg-indigo-50', iconColor: 'text-indigo-500', Icon: FileText },
  image: { bg: 'bg-emerald-50', iconColor: 'text-emerald-500', Icon: Image },
  link: { bg: 'bg-amber-50', iconColor: 'text-amber-500', Icon: Link2 },
};

function ResourceCard({
  resource,
  onShare,
  onDelete,
}: {
  resource: Resource;
  onShare: (id: string, shared: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations('TeacherResources');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const config = TYPE_CONFIG[resource.type];
  const Icon = config.Icon;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
      {/* Icon area */}
      <div className="p-5 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className={cn('h-14 w-14 rounded-xl flex items-center justify-center flex-shrink-0', config.bg)}>
            <Icon className={cn('h-7 w-7', config.iconColor)} />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {resource.shared && (
              <Badge label={t('sharedBadge')} variant="success" />
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex-1 space-y-2.5">
        <p className="font-medium text-slate-900 leading-snug line-clamp-2">{resource.title}</p>

        <div className="flex flex-wrap gap-1.5">
          <Badge label={resource.subject} variant="info" />
          {resource.groupName && (
            <Badge label={resource.groupName} variant="purple" />
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>{resource.size}</span>
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <span>{formatLocalizedDate(new Date(resource.uploadedAt + 'T00:00:00'), locale, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>

        <div className="text-xs text-slate-500">
          <span className="font-medium text-slate-700">{resource.downloads}</span> {t('downloadsLabel')}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-50 flex items-center gap-1">
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          {t('downloadButton')}
        </a>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-center"
          onClick={() => onShare(resource.id, !resource.shared)}
        >
          <Share2 className="h-3.5 w-3.5" />
          {resource.shared ? t('unshareButton') : t('shareButton')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-center text-red-500 hover:bg-red-50 hover:text-red-600"
          onClick={() => onDelete(resource.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('deleteButton')}
        </Button>
      </div>
    </div>
  );
}

export default function ResourcesPage() {
  const t = useTranslations('TeacherResources');
  const tc = useTranslations('Common');

  const SUBJECT_OPTIONS = [
    { value: '', label: t('allSubjectsOption') },
    { value: 'Algebra', label: t('subjectAlgebra') },
    { value: 'Calculus', label: t('subjectCalculus') },
    { value: 'Mathematics', label: t('subjectMathematics') },
  ];

  const FILE_TYPE_OPTIONS = [
    { value: 'pdf', label: t('fileTypePdf') },
    { value: 'video', label: t('fileTypeVideo') },
    { value: 'document', label: t('fileTypeDocument') },
    { value: 'image', label: t('fileTypeImage') },
    { value: 'link', label: t('fileTypeLink') },
  ];

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: myProfile } = useMyTeacherProfileQuery();
  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? '', teacher: myProfile?.id });

  const GROUP_OPTIONS = [
    { value: '', label: t('allGroupsOption') },
    ...(groups ?? []).map((g) => ({ value: g.id, label: g.name })),
  ];

  const resourceItems = useTeacherResourcesStore((s) => s.items);
  const resources = resourceItems.filter((r) => !r.deletedAt);
  const addResource = useTeacherResourcesStore((s) => s.add);
  const updateResource = useTeacherResourcesStore((s) => s.update);
  const removeResource = useTeacherResourcesStore((s) => s.softDelete);

  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);

  // Upload form state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadSubject, setUploadSubject] = useState('');
  const [uploadGroup, setUploadGroup] = useState('');
  const [uploadType, setUploadType] = useState<ResourceType>('pdf');
  const [uploadShared, setUploadShared] = useState(false);

  const filtered = resources.filter((r) => {
    const matchesSearch =
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.subject.toLowerCase().includes(search.toLowerCase());
    const matchesSubject = !subjectFilter || r.subject === subjectFilter;
    return matchesSearch && matchesSubject;
  });

  function handleUpload() {
    if (!uploadTitle.trim() || !uploadSubject.trim()) return;
    const group = (groups ?? []).find((g) => g.id === uploadGroup);
    addResource({
      title: uploadTitle,
      subject: uploadSubject,
      type: uploadType,
      size: '—',
      uploadedAt: new Date().toISOString().split('T')[0],
      groupId: group?.id,
      groupName: group?.name,
      downloads: 0,
      shared: uploadShared,
    });
    toast.success(t('resourceUploadedToast'));
    setUploadTitle('');
    setUploadSubject('');
    setUploadGroup('');
    setUploadType('pdf');
    setUploadShared(false);
    setShowUploadForm(false);
  }

  function handleShare(id: string, shared: boolean) {
    updateResource(id, { shared });
    toast.success(shared ? t('resourceSharedToast') : t('resourceUnsharedToast'));
  }

  function handleDelete(id: string) {
    removeResource(id);
    toast.success(t('resourceDeletedToast'));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
        actions={
          <>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
            />
            <Select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              options={SUBJECT_OPTIONS}
            />
            <Button onClick={() => setShowUploadForm(!showUploadForm)}>
              <Upload className="h-4 w-4" />
              {t('uploadFileButton')}
            </Button>
          </>
        }
      />

      {/* Upload Form */}
      {showUploadForm && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">{t('uploadNewResourceTitle')}</h3>
              <button
                onClick={() => setShowUploadForm(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('fieldTitle')}</label>
                <Input
                  placeholder={t('titlePlaceholder')}
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('fieldSubject')}</label>
                <Input
                  placeholder={t('subjectPlaceholder')}
                  value={uploadSubject}
                  onChange={(e) => setUploadSubject(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('fieldGroupOptional')}</label>
                <Select
                  value={uploadGroup}
                  onChange={(e) => setUploadGroup(e.target.value)}
                  options={GROUP_OPTIONS}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('fieldFileType')}</label>
                <Select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value as ResourceType)}
                  options={FILE_TYPE_OPTIONS}
                  className="w-full"
                />
              </div>
            </div>

            {/* Share toggle */}
            <div className="flex items-center gap-3">
              <button
                role="switch"
                aria-checked={uploadShared}
                onClick={() => setUploadShared(!uploadShared)}
                className={cn(
                  'relative inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                  uploadShared ? 'bg-indigo-600' : 'bg-slate-200'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    uploadShared ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
              <span className="text-sm text-slate-700">{t('shareWithStudentsLabel')}</span>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowUploadForm(false)}>
                {tc('cancel')}
              </Button>
              <Button onClick={handleUpload} disabled={!uploadTitle.trim() || !uploadSubject.trim()}>
                <Upload className="h-4 w-4" />
                {t('uploadButton')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Resources Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} onShare={handleShare} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <FileText className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">{t('noResourcesFound')}</p>
          <p className="text-xs mt-1">{t('tryAdjustingFilters')}</p>
        </div>
      )}
    </div>
  );
}
