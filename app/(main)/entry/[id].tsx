import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Banner, Card, DetailRow, Loading, SectionTitle, useBackdrop } from '@/components/Bits';
import { ProjectField } from '@/components/ProjectField';
import { BillImage, PhotoViewer } from '@/components/BillPhotos';
import { Button } from '@/components/Button';
import { lineIcon, lineTitle } from '@/components/EntryRow';
import { Field } from '@/components/Field';
import { HistoryRow } from '@/components/History';
import { TypeFlags, TypeTag } from '@/components/ExpenseType';
import { PayMethodTag } from '@/components/PayMethodRow';
import { ExpenseTypeAdmin } from '@/components/ExpenseTypeAdmin';
import { Money } from '@/components/Money';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useDeleteEntry, useRowHistory } from '@/api/control';
import { useEntry, useEntryPhotos } from '@/api/entries';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { signedUrl } from '@/lib/photos';
import { errorMessage } from '@/lib/supabase';
import { useSetEntryProject } from '@/api/projects';
import { colors, radius, shadow } from '@/theme';
import { EXPENSE_KIND_LABEL, LINE_META, PAY_METHOD_LABEL } from '@/types';

export default function EntryScreen() {
  const { id, person, saved, edited } = useLocalSearchParams<{
    id: string;
    person?: string;
    saved?: string;
    edited?: string;
  }>();
  const router = useRouter();
  const { person: me, canManage } = useAuth();
  // Who may say which site an expense was for. The database keeps the
  // same rule; this only decides whether the question is asked.
  const canFileProjects = canManage || !!me?.is_head;

  const { data: entry, isLoading, error } = useEntry(id, person);
  const { data: photos = [] } = useEntryPhotos(id, (entry?.photo_count ?? 0) > 0);
  const { data: history = [] } = useRowHistory(id, canManage);

  const [viewing, setViewing] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const setProject = useSetEntryProject();
  const [showHistory, setShowHistory] = useState(false);

  if (isLoading) {
    return (
      <Screen>
        <Header title="Entry" back />
        <Loading />
      </Screen>
    );
  }

  if (error || !entry) {
    return (
      <Screen>
        <Header title="Entry" back />
        <Banner
          tone="error"
          message={error ? (error as Error).message : 'This entry was not found.'}
        />
      </Screen>
    );
  }

  const meta = LINE_META[entry.line_type];
  const tone = meta.positive ? colors.green : colors.red;

  return (
    <Screen>
      <Header title="Entry" subtitle={formatDate(entry.bill_date)} back />

      {saved ? (
        <Banner
          tone="success"
          message={[
            'Saved',
            entry.system_id,
            entry.expense_type ? EXPENSE_KIND_LABEL[entry.expense_type] : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      ) : null}
      {edited ? <Banner tone="success" message="Changes saved." /> : null}

      {entry.duplicate_photo && canManage ? (
        <Banner
          tone="warn"
          title="Duplicate photo"
          message="A bill photo on this entry is already used on another entry. Worth a second look."
        />
      ) : null}

      <View style={[styles.hero, shadow.card, { borderColor: `${tone}33` }]}>
        <View style={[styles.heroIcon, { backgroundColor: `${tone}14` }]}>
          <Ionicons name={lineIcon(entry)} size={26} color={tone} />
        </View>
        <Txt variant="caption" color={colors.textMuted}>
          {lineTitle(entry)}
        </Txt>
        <Money amount={entry.amount} tone={meta.positive ? 'in' : 'out'} size="xl" showSign />

        <Txt variant="caption" color={colors.textFaint}>
          {meta.positive ? 'Money in' : 'Money out'} · {formatDate(entry.bill_date)}
        </Txt>

        {entry.note ? (
          <View style={styles.noteBox}>
            <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.textFaint} />
            <Txt variant="caption" color={colors.textMuted} style={styles.noteText}>
              {entry.note}
            </Txt>
          </View>
        ) : null}
        {entry.type === 'expense' ? (
          <View style={styles.heroBadges}>
            <TypeTag
              type={entry.expense_type}
              source={entry.type_source}
              scanState={entry.bill_scan_state}
              enteredAt={entry.entered_at}
            />
            {entry.system_id ? <Badge label={entry.system_id} tone="grey" icon="pricetag-outline" /> : null}
          </View>
        ) : entry.pay_method ? (
          <View style={styles.heroBadges}>
            <PayMethodTag method={entry.pay_method} />
          </View>
        ) : null}

        <View style={styles.heroBadges}>
          {entry.entered_for_someone_else ? (
            <Badge
              label={`Entered by ${entry.entered_by_name ?? 'someone else'}`}
              tone="blue"
              icon="person-outline"
            />
          ) : null}
          {entry.duplicate_photo && canManage ? (
            <Badge label="Duplicate photo" tone="amber" icon="copy-outline" />
          ) : null}
        </View>
      </View>

      {entry.type === 'expense' && canManage ? (
        <>
          <TypeFlags flags={entry.type_flags} />
          <ExpenseTypeAdmin entry={entry} />
        </>
      ) : null}

      <SectionTitle title="Details" />
      <Card padded={false} style={styles.detailCard}>
        {entry.system_id ? <DetailRow label="Expense ID" value={entry.system_id} /> : null}
        <DetailRow label="Bill date" value={formatDate(entry.bill_date)} />
        {entry.pay_method ? (
          <DetailRow label="How it was given" value={PAY_METHOD_LABEL[entry.pay_method]} />
        ) : null}
        {entry.type === 'expense' ? (
          <DetailRow label="Category" value={entry.category_name ?? '-'} />
        ) : null}
        {entry.type === 'expense' && !canFileProjects ? (
          <DetailRow label="Project" value={entry.project_name ?? 'Not filed'} />
        ) : null}
        <DetailRow
          label={entry.type === 'transfer' ? 'Sent by' : 'Whose khata'}
          value={entry.owner_name ?? '-'}
        />
        {entry.counterparty_name ? (
          <DetailRow label="Received by" value={entry.counterparty_name} />
        ) : null}
        <DetailRow label="Entered by" value={entry.entered_by_name ?? '-'} />
        <DetailRow label="Saved at" value={formatDateTime(entry.entered_at)} last />
      </Card>

      {entry.type === 'expense' && canFileProjects ? (
        <>
          <SectionTitle title="Project" />
          <Card>
            <ProjectField
              value={entry.project_id}
              onChange={(id) => {
                setFileError(null);
                setProject.mutate(
                  { entryId: entry.id, projectId: id },
                  { onError: (err) => setFileError(errorMessage(err)) },
                );
              }}
              label="WHAT WAS THIS SPENT ON?"
            />
            {setProject.isPending ? (
              <Txt variant="caption" color={colors.textMuted}>
                Saving...
              </Txt>
            ) : null}
            {fileError ? <Banner tone="error" message={fileError} /> : null}
          </Card>
        </>
      ) : null}

      {entry.photo_count > 0 ? (
        <>
          <SectionTitle
            title={entry.photo_count === 1 ? 'Bill photo' : `${entry.photo_count} bill photos`}
          />
          <View style={styles.photoGrid}>
            {photos.map((p) => (
              <View key={p.id} style={styles.photoCell}>
                <BillImage
                  path={p.thumb_path ?? p.storage_path}
                  style={styles.photo}
                  onPress={async () => {
                    const url = await signedUrl(p.storage_path);
                    if (url) setViewing(url);
                  }}
                />
              </View>
            ))}
          </View>
          <Txt variant="caption" color={colors.textFaint} center style={styles.photoHint}>
            Tap a bill to see it full screen.
          </Txt>
        </>
      ) : entry.type === 'expense' ? (
        <Banner tone="warn" message="This expense has no bill photo." />
      ) : null}

      {/*
        A man who typed the wrong figure can put it right himself, which
        beats ringing the office. He says why, and the office is told -
        so this is a correction in the open, not a quiet change.
      */}
      {!canManage && entry.person_id === me?.id ? (
        <>
          <SectionTitle title="Made a mistake?" />
          <Button
            label="Correct This Entry"
            icon="create-outline"
            variant="navy"
            size="lg"
            full
            onPress={() => router.push(`/entry/edit?id=${entry.id}&person=${entry.person_id}`)}
          />
          <Txt variant="caption" color={colors.textFaint} center style={styles.note}>
            You will be asked why. The office is told about every correction.
          </Txt>
        </>
      ) : null}

      {canManage ? (
        <>
          <SectionTitle title="Admin" />
          <View style={styles.actions}>
            <Button
              label="Edit Entry"
              icon="create-outline"
              variant="navy"
              size="lg"
              full
              onPress={() => router.push(`/entry/edit?id=${entry.id}&person=${entry.person_id}`)}
            />
            <Button
              label="Delete Entry"
              icon="trash-outline"
              variant="danger"
              size="lg"
              full
              onPress={() => setDeleteOpen(true)}
            />
            <Txt variant="caption" color={colors.textFaint} center style={styles.note}>
              A delete only hides the entry. It is kept, and shows up under Deleted entries.
            </Txt>
          </View>

          <SectionTitle
            title="History"
            action={
              <Pressable
                onPress={() => setShowHistory((v) => !v)}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Txt variant="caption" weight="semibold" color={colors.blue}>
                  {showHistory ? 'Hide' : `Show (${history.length})`}
                </Txt>
              </Pressable>
            }
          />
          {showHistory ? (
            history.length === 0 ? (
              <Card>
                <Txt variant="caption" color={colors.textMuted} center>
                  Nothing recorded yet.
                </Txt>
              </Card>
            ) : (
              <Card padded={false} style={styles.historyCard}>
                {history.map((item) => (
                  <HistoryRow key={item.id} item={item} showPerson={false} />
                ))}
              </Card>
            )
          ) : null}
        </>
      ) : null}

      <Txt variant="caption" color={colors.textFaint} center style={styles.foot}>
        {money(entry.amount)} · saved {formatDateTime(entry.entered_at)}
      </Txt>

      <PhotoViewer
        uri={viewing}
        onClose={() => setViewing(null)}
        caption={`${lineTitle(entry)} · ${money(entry.amount)} · ${formatDate(entry.bill_date)}`}
      />

      <DeleteModal
        visible={deleteOpen}
        entryId={entry.id}
        label={`${lineTitle(entry)} · ${money(entry.amount)}`}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          router.replace(`/people/${entry.person_id}`);
        }}
      />
    </Screen>
  );
}

function DeleteModal({
  visible,
  entryId,
  label,
  onClose,
  onDeleted,
}: {
  visible: boolean;
  entryId: string;
  label: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const deleteEntry = useDeleteEntry();
  const backdrop = useBackdrop('center');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    try {
      await deleteEntry.mutateAsync({ id: entryId, reason: reason.trim() || undefined });
      setReason('');
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <View style={[styles.modal, shadow.raised]}>
          <View style={styles.modalHead}>
            <Txt variant="heading">Delete this entry?</Txt>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <Txt variant="subtitle" weight="semibold">
            {label}
          </Txt>
          <Txt variant="caption" color={colors.textMuted}>
            It will stop counting in the balances straight away. The record is kept, and an Admin
            can put it back.
          </Txt>

          <Field
            label="Why? (optional)"
            value={reason}
            onChangeText={(v) => setReason(v.slice(0, 200))}
            placeholder="Recorded twice by mistake"
            icon="chatbox-ellipses-outline"
          />

          {error ? <Banner tone="error" message={error} /> : null}

          <Button
            label="Yes, Delete It"
            icon="trash"
            variant="danger"
            size="lg"
            full
            loading={deleteEntry.isPending}
            onPress={confirm}
          />
          <Button label="Keep It" variant="ghost" full onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  note: { marginTop: 2 },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 8,
    maxWidth: '100%',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  noteText: { flexShrink: 1 },
  detailCard: { paddingHorizontal: 16 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoCell: { flexGrow: 1, flexBasis: 150 },
  photo: { width: '100%', height: 150, borderRadius: radius.md },
  photoHint: { marginTop: 10 },
  actions: { gap: 10 },
  historyCard: { overflow: 'hidden' },
  foot: { marginTop: 18 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 22, 40, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 20,
    gap: 12,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
