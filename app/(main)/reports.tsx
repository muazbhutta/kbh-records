import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Badge, Banner, Card, DetailRow, Loading, SectionTitle } from '@/components/Bits';
import { Button } from '@/components/Button';
import { buildBillsPdf } from '@/lib/billsPdf';
import {
  CategoryFilter,
  type CategoryChoice,
  type KindChoice,
} from '@/components/CategoryFilter';
import { Section, useSections } from '@/components/Collapsible';
import { DateField, PersonField } from '@/components/pickers';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import {
  fetchReportPhotos,
  fetchReportRows,
  useDownloadLog,
  useLogDownload,
  useReportTotals,
  type ReportFilter,
} from '@/api/reports';
import { useDashboardSummary } from '@/api/dashboard';
import { useCategories, usePeopleNames } from '@/api/entries';
import { useExpensesToCheck } from '@/api/expenseType';
import { useSuspectedDuplicates } from '@/api/duplicates';
import { useAuth } from '@/auth/AuthProvider';
import { periodRange, type Period } from '@/components/KhataList';
import { buildBillsZip, type ZipProgress } from '@/lib/billsZip';
import { formatDate, formatDateTime, money, todayInRiyadh } from '@/lib/format';
import {
  buildReportHtml,
  makeAndSharePdf,
  reportFileName,
  REPORT_TITLE,
  type ReportKind,
} from '@/lib/reportPdf';
import { errorMessage } from '@/lib/supabase';
import { colors, radius } from '@/theme';
import type { ExpenseKind } from '@/types';

const PERIODS: { key: Period | 'custom'; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

/** What is shown after a report or a ZIP has actually been made. */
type Ready = { title: string; lines: string[]; hint: string | null };

/** How a line in the download history reads. */
const DOWNLOAD_LABEL: Record<string, string> = {
  pdf_petty: 'Petty Expenses report (PDF)',
  pdf_invoice: 'Invoice Expenses report (PDF)',
  pdf_all: 'All Expenses report (PDF)',
  zip_bills: 'Bill photos (ZIP)',
};

/** "01 Oct 2026 to 31 Oct 2026", or just "Every expense, from the start". */
function rangeText(from?: string, to?: string): string {
  if (!from && !to) return 'Every expense, from the start';
  if (from && to) return `${formatDate(from)} to ${formatDate(to)}`;
  if (from) return `From ${formatDate(from)}`;
  return `Up to ${formatDate(to)}`;
}

/**
 * Where an auditor or the owner comes at the end of the month: pick the
 * period and the person once, then take the three PDFs and the photo ZIP
 * from the same filter.
 */
export default function ReportsScreen() {
  const { person: me, canManage } = useAuth();
  const router = useRouter();
  const sections = useSections('kbh-report-sections', { log: false });

  const [period, setPeriod] = useState<Period | 'custom'>('this_month');
  const [customFrom, setCustomFrom] = useState(todayInRiyadh());
  const [customTo, setCustomTo] = useState(todayInRiyadh());
  const [personId, setPersonId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<CategoryChoice>(null);
  const [kind, setKind] = useState<KindChoice>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<ZipProgress | null>(null);
  const [notice, setNotice] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filter: ReportFilter = useMemo(() => {
    const range =
      period === 'custom'
        ? customFrom <= customTo
          ? { from: customFrom, to: customTo }
          : { from: customTo, to: customFrom }
        : periodRange(period);
    return { ...range, personId, categoryId };
  }, [period, customFrom, customTo, personId, categoryId]);

  const { data: people = [] } = usePeopleNames();
  const { data: categories = [] } = useCategories(true);
  const totals = useReportTotals(filter, canManage);
  const dashboard = useDashboardSummary({ from: filter.from, to: filter.to }, canManage);
  const toCheck = useExpensesToCheck(canManage);
  const duplicates = useSuspectedDuplicates(canManage);
  const log = useDownloadLog(canManage);
  const logDownload = useLogDownload();

  if (!canManage) {
    return (
      <Screen>
        <Header title="Reports" />
        <Banner tone="error" message="Only an Admin can take reports out of the app." />
      </Screen>
    );
  }

  const t = totals.data;
  const personName = personId ? (people.find((p) => p.id === personId)?.full_name ?? null) : null;
  const categoryName = categoryId
    ? (categories.find((c) => c.id === categoryId)?.name ?? null)
    : null;

  // The sums the report would print, against the app's own figure for
  // the same filter. They must agree before anything is made.
  const addsUp =
    !t || !dashboard.data
      ? null
      : Math.abs(Number(t.petty_total) + Number(t.invoice_total) - Number(t.all_total)) < 0.005;
  // The dashboard figure is the whole company's spending for the period.
  // It can only be compared against a report of the whole company, so one
  // person or one category means there is nothing to compare it with.
  const matchesApp =
    !t || !dashboard.data || personId || categoryId
      ? null
      : Math.abs(Number(t.all_total) - Number(dashboard.data.expenses)) < 0.005;

  const makePdf = async (kind: ReportKind) => {
    setError(null);
    setNotice(null);

    if (addsUp === false || matchesApp === false) {
      setError('The totals do not agree. The report was not made.');
      return;
    }

    setBusy(kind);
    try {
      const expenseKind: ExpenseKind | undefined = kind === 'all' ? undefined : kind;
      const rows = await fetchReportRows(filter, expenseKind);

      const printed = rows.reduce((sum, r) => sum + Number(r.amount), 0);
      const expected =
        kind === 'petty'
          ? Number(t?.petty_total ?? 0)
          : kind === 'invoice'
            ? Number(t?.invoice_total ?? 0)
            : Number(t?.all_total ?? 0);

      if (Math.abs(printed - expected) >= 0.005) {
        setError(
          `The report adds up to ${money(printed)} but the app says ${money(
            expected,
          )}. The report was not made.`,
        );
        return;
      }

      const html = buildReportHtml(rows, {
        kind,
        from: filter.from,
        to: filter.to,
        personName,
        categoryName,
        generatedBy: me?.full_name ?? 'Admin',
      });

      await makeAndSharePdf(
        html,
        reportFileName(kind, filter.from, filter.to, categoryName),
      );
      await logDownload.mutateAsync({
        kind: `pdf_${kind}`,
        filter,
        rows: rows.length,
        total: printed,
      });
      setNotice({
        title: `${REPORT_TITLE[kind]} is ready`,
        lines: [
          `${rows.length} ${rows.length === 1 ? 'expense' : 'expenses'} · ${money(printed)}`,
          `${rangeText(filter.from, filter.to)} · ${personName ?? 'All people'}${
            categoryName ? ` · ${categoryName}` : ''
          }`,
        ],
        hint:
          Platform.OS === 'web'
            ? 'Choose "Save as PDF" in the window that just opened.'
            : 'Saved to this phone - pick where to send it.',
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const makeBillsPdf = async () => {
    setError(null);
    setNotice(null);
    setBusy('billspdf');
    setProgress(null);
    try {
      const photos = await fetchReportPhotos(filter, kind ?? undefined);
      if (photos.length === 0) {
        setNotice({ title: 'No bill photos in this period', lines: [], hint: null });
        return;
      }

      const names = await buildBillsPdf(
        photos,
        {
          from: filter.from,
          to: filter.to,
          heading: `${rangeText(filter.from, filter.to)}`,
          lines: [
            personName ?? 'All people',
            categoryName ?? 'All categories',
            kind === 'petty' ? 'Petty only' : kind === 'invoice' ? 'Invoices only' : 'Petty and invoices',
          ],
          total: Number(t?.all_total ?? 0),
        },
        { label: categoryName, onProgress: setProgress },
      );

      await logDownload.mutateAsync({
        kind: 'pdf_bills',
        filter,
        rows: photos.length,
        total: Number(t?.all_total ?? 0),
        note: names.join(', '),
      });

      setNotice({
        title:
          names.length === 1
            ? 'The bill photos PDF is ready'
            : `The bill photos are ready in ${names.length} files`,
        lines: [
          `${photos.length} ${photos.length === 1 ? 'bill' : 'bills'} · ${rangeText(filter.from, filter.to)}`,
          ...names,
        ],
        hint:
          Platform.OS === 'web'
            ? 'Choose "Save as PDF" in the window that just opened.'
            : 'Saved to this phone - pick where to send it.',
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const makeZip = async () => {
    setError(null);
    setNotice(null);
    setBusy('zip');
    setProgress(null);
    try {
      const photos = await fetchReportPhotos(filter, kind ?? undefined);
      if (photos.length === 0) {
        setNotice({ title: 'No bill photos in this period', lines: [], hint: null });
        return;
      }

      const results = await buildBillsZip(photos, {
        from: filter.from,
        to: filter.to,
        label: categoryName,
        onProgress: setProgress,
      });

      await logDownload.mutateAsync({
        kind: 'zip_bills',
        filter,
        rows: photos.length,
        total: Number(t?.all_total ?? 0),
        note: results.map((r) => r.fileName).join(', '),
      });

      setNotice({
        title: results.length === 1 ? 'Bill photos are ready' : `Bill photos are ready in ${results.length} parts`,
        lines: [
          `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} · ${rangeText(filter.from, filter.to)}`,
          ...results.map((r) => r.fileName),
        ],
        hint:
          Platform.OS === 'web'
            ? 'Look in your Downloads folder.'
            : 'Saved to this phone - pick where to send it.',
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const working = busy !== null;

  // The line at the top of the summary must answer the filter that is
  // actually set, not the category as a whole.
  const shownTotal = !t
    ? 0
    : kind === 'petty'
      ? Number(t.petty_total)
      : kind === 'invoice'
        ? Number(t.invoice_total)
        : Number(t.all_total);
  const shownCount = !t
    ? 0
    : kind === 'petty'
      ? Number(t.petty_count)
      : kind === 'invoice'
        ? Number(t.invoice_count)
        : Number(t.entry_count);

  /** "Petty Report (PDF)", or "Fuel - Petty Report (PDF)" when narrowed. */
  const pdfLabel = (k: ReportKind) => {
    const name = { petty: 'Petty Report', invoice: 'Invoice Report', all: 'All Expenses Report' }[k];
    return categoryName ? `${categoryName} - ${name} (PDF)` : `${name} (PDF)`;
  };

  return (
    <Screen>
      <Header title="Reports" subtitle="Expenses, bills and who took them" />

      {/* ------------------------------------------------- the filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setPeriod(p.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: period === p.key }}
            style={({ pressed }) => [
              styles.chip,
              period === p.key && styles.chipOn,
              pressed && period !== p.key && styles.chipPressed,
            ]}
          >
            <Txt
              variant="caption"
              weight="semibold"
              color={period === p.key ? colors.white : colors.textMuted}
            >
              {p.label}
            </Txt>
          </Pressable>
        ))}
      </ScrollView>

      {period === 'custom' ? (
        <Card style={styles.customCard}>
          <DateField label="From" value={customFrom} onChange={setCustomFrom} />
          <DateField label="To" value={customTo} onChange={setCustomTo} />
        </Card>
      ) : null}

      <Card style={styles.personCard}>
        <PersonField
          label="Person"
          value={personId}
          people={[
            { id: '', full_name: 'All people', is_active: true, is_owner: false, is_head: false, head_id: null },
            ...people,
          ]}
          onChange={(id) => setPersonId(id || null)}
          placeholder="All people"
          helper={rangeText(filter.from, filter.to)}
        />
      </Card>

      <View style={styles.catFilter}>
        <CategoryFilter
          categoryId={categoryId}
          onCategory={setCategoryId}
          kind={kind}
          onKind={setKind}
        />
      </View>

      {notice ? <ReadyCard ready={notice} onClose={() => setNotice(null)} /> : null}
      {error ? <Banner tone="error" message={error} /> : null}

      {/* ------------------------------------------------- what is in it */}
      <Section
        title="What is in this period"
        open={sections.isOpen('summary')}
        onToggle={() => sections.toggle('summary')}
        hint={t ? `${shownCount} ${shownCount === 1 ? 'expense' : 'expenses'} · ${money(shownTotal)}` : undefined}
      >
        {totals.isLoading || !t ? (
          <Loading />
        ) : (
          <>
            <Card padded={false} style={styles.sumCard}>
              <DetailRow label="Petty" value={money(Number(t.petty_total))} />
              <DetailRow label="Invoice" value={money(Number(t.invoice_total))} />
              <DetailRow
                label="All expenses"
                value={money(Number(t.all_total))}
                valueColor={colors.navy}
              />
              <DetailRow label="Expenses" value={String(t.entry_count)} />
              <DetailRow label="Bill photos" value={String(t.photo_count)} last />
            </Card>

            {addsUp === false || matchesApp === false ? (
              <Banner
                tone="error"
                title="The totals do not agree"
                message="Petty and Invoice do not add up to the total the app shows. No report will be made until this is sorted out."
              />
            ) : (
              <View style={styles.checkRow}>
                <Ionicons name="checkmark-circle" size={15} color={colors.green} />
                <Txt variant="caption" color={colors.green}>
                  Petty {money(Number(t.petty_total))} + Invoice {money(Number(t.invoice_total))} ={' '}
                  {money(Number(t.all_total))}
                  {matchesApp ? ', and it matches the app' : ''}
                </Txt>
              </View>
            )}
          </>
        )}
      </Section>

      {/* ------------------------------------------------- the downloads */}
      <View style={styles.downloadHead}>
        <SectionTitle title="Download" />
      </View>
      <View style={styles.downloads}>
        {/*
          The chips above already say which bills are wanted. Offering an
          "Invoice report" button under a Petty chip would be two answers
          to one question, so only the matching button is shown.
        */}
        {kind === null || kind === 'petty' ? (
          <Button
            label={pdfLabel('petty')}
            icon="document-text-outline"
            size="lg"
            full
            loading={busy === 'petty'}
            disabled={working && busy !== 'petty'}
            onPress={() => makePdf('petty')}
          />
        ) : null}
        {kind === null || kind === 'invoice' ? (
          <Button
            label={pdfLabel('invoice')}
            icon="document-text-outline"
            variant="navy"
            size="lg"
            full
            loading={busy === 'invoice'}
            disabled={working && busy !== 'invoice'}
            onPress={() => makePdf('invoice')}
          />
        ) : null}
        {kind === null ? (
          <Button
            label={pdfLabel('all')}
            icon="documents-outline"
            variant="outline"
            size="lg"
            full
            loading={busy === 'all'}
            disabled={working && busy !== 'all'}
            onPress={() => makePdf('all')}
          />
        ) : null}
        <Button
          label={
            categoryName ? `${categoryName} - Bill Photos (PDF)` : 'Bill Photos (PDF)'
          }
          icon="document-attach-outline"
          size="lg"
          full
          loading={busy === 'billspdf'}
          disabled={working && busy !== 'billspdf'}
          onPress={makeBillsPdf}
        />
        <Button
          label={
            categoryName ? `${categoryName} - Bill Photos (ZIP)` : 'Download Bill Photos (ZIP)'
          }
          icon="images-outline"
          variant="success"
          size="lg"
          full
          loading={busy === 'zip'}
          disabled={working && busy !== 'zip'}
          onPress={makeZip}
        />
      </View>

      {progress ? (
        <View style={styles.progress}>
          <Txt variant="caption" color={colors.textMuted}>
            Preparing... {progress.done} of {progress.total} photos
            {progress.parts > 1 ? ` · part ${progress.part} of ${progress.parts}` : ''}
          </Txt>
          <View style={styles.bar}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` },
              ]}
            />
          </View>
        </View>
      ) : null}

      <Txt variant="caption" color={colors.textFaint} style={styles.note}>
        The expense reports are figures only, so they stay small enough to send. The bill photos
        come either as one PDF, a bill to a page with its date, person and amount underneath, or as
        a ZIP filed by month and day. All of them answer the filter set above. Cancelled expenses
        are in none of them.
      </Txt>

      {/* ------------------------------------------------- before you file */}
      <Section
        title="Before you file"
        open={sections.isOpen('checks')}
        onToggle={() => sections.toggle('checks')}
        hint={`${toCheck.data?.length ?? 0} to check · ${duplicates.data?.length ?? 0} duplicates`}
      >
        <Card padded={false}>
          <CheckLink
            icon="pricetag-outline"
            label="Bill types to check"
            count={toCheck.data?.length ?? 0}
            onPress={() => router.push('/check-type')}
          />
          <CheckLink
            icon="copy-outline"
            label="Suspected duplicates"
            count={duplicates.data?.length ?? 0}
            onPress={() => router.push('/duplicates')}
            last
          />
        </Card>
      </Section>

      {/* ------------------------------------------------- who took what */}
      <Section
        title="Download history"
        open={sections.isOpen('log')}
        onToggle={() => sections.toggle('log')}
        hint={`${log.data?.length ?? 0} downloads`}
      >
        {log.isLoading ? (
          <Loading />
        ) : (log.data ?? []).length === 0 ? (
          <Card>
            <Txt variant="caption" color={colors.textMuted} center>
              Nothing has been downloaded yet.
            </Txt>
          </Card>
        ) : (
          <Card padded={false}>
            {(log.data ?? []).map((row, i) => (
              <View
                key={row.id}
                style={[styles.logRow, i < (log.data?.length ?? 0) - 1 && styles.logBorder]}
              >
                <View style={styles.logMain}>
                  <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
                    {DOWNLOAD_LABEL[row.kind] ?? row.kind}
                  </Txt>
                  <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                    {row.from_date ? formatDate(row.from_date) : 'start'} to{' '}
                    {row.to_date ? formatDate(row.to_date) : 'today'}
                    {row.person_name ? ` · ${row.person_name}` : ' · all people'}
                  </Txt>
                  <Txt variant="caption" color={colors.textFaint}>
                    {row.actor_name ?? 'Someone'} · {formatDateTime(row.at)}
                  </Txt>
                </View>
                <Badge label={`${row.row_count ?? 0}`} tone="grey" style={styles.midBadge} />
              </View>
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

/**
 * The moment a report lands. Plain and green, so there is no doubt that
 * the work was done and no doubt about what to do next.
 */
function ReadyCard({ ready, onClose }: { ready: Ready; onClose: () => void }) {
  return (
    <View style={styles.ready}>
      <View style={styles.readyTick}>
        <Ionicons name="checkmark" size={17} color={colors.white} />
      </View>
      <View style={styles.readyMain}>
        <Txt variant="subtitle" weight="bold" color={colors.green}>
          {ready.title}
        </Txt>
        {ready.lines.map((line) => (
          <Txt key={line} variant="caption" color={colors.textMuted}>
            {line}
          </Txt>
        ))}
        {ready.hint ? (
          <Txt variant="caption" color={colors.textFaint} style={styles.readyHint}>
            {ready.hint}
          </Txt>
        ) : null}
      </View>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={10}
      >
        <Ionicons name="close" size={18} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

function CheckLink({
  icon,
  label,
  count,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.check, !last && styles.logBorder, pressed && styles.chipPressed]}
    >
      <View style={styles.checkIcon}>
        <Ionicons name={icon} size={18} color={count > 0 ? colors.amberDark : colors.textFaint} />
      </View>
      <Txt variant="subtitle" weight="semibold" style={styles.checkLabel}>
        {label}
      </Txt>
      <Badge
        label={count === 0 ? 'None' : String(count)}
        tone={count === 0 ? 'green' : 'amber'}
        style={styles.midBadge}
      />
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingBottom: 12, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipPressed: { backgroundColor: colors.navyTint },
  customCard: { gap: 14, marginBottom: 10 },
  personCard: { marginBottom: 4 },
  sumCard: { paddingHorizontal: 16 },
  checkRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 10 },
  ready: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 13,
    marginBottom: 4,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
  },
  readyTick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyMain: { flex: 1, gap: 1, minWidth: 0 },
  readyHint: { marginTop: 4 },
  // These rows line up through the middle, so their badge does too.
  midBadge: { alignSelf: 'center' },
  catFilter: { marginTop: 8, marginBottom: 6 },
  downloadHead: { marginTop: 10 },
  downloads: { gap: 10 },
  progress: { gap: 6, marginTop: 14 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.navyTint, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.navy },
  note: { marginTop: 14, marginBottom: 4 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 },
  logBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  logMain: { flex: 1, gap: 1, minWidth: 0 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  checkIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.navyTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: { flex: 1 },
});
