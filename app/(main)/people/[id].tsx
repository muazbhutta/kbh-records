import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import {
  Avatar,
  Badge,
  Banner,
  Card,
  DetailRow,
  Loading,
  SectionTitle,
  useBackdrop,
} from '@/components/Bits';
import { Button } from '@/components/Button';
import { ChoiceField, Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { usePerson, useResetPin, useSetActive, useUpdatePerson } from '@/api/people';
import { useTotals, usePeopleNames } from '@/api/entries';
import { TeamFields } from '@/components/TeamFields';
import { useCashChecks, useCheckSummary, useDeleteCashCheck } from '@/api/control';
import {
  CashCheckModal,
  CashCheckRow,
  CheckResultBadge,
  CheckSummaryLine,
} from '@/components/CashCheckCard';
import { KhataList } from '@/components/KhataList';
import { CashCard, Money } from '@/components/Money';
import { useAuth } from '@/auth/AuthProvider';
import {
  firstName,
  formatDateTime,
  money,
  formatMobileInput,
  normalizeMobile,
  prettyMobile,
  ROLE_LABEL,
} from '@/lib/format';
import { errorMessage } from '@/lib/supabase';
import { colors, radius, shadow } from '@/theme';
import type { Role } from '@/types';

export default function PersonScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const router = useRouter();
  const { person: me, canManage, refreshPerson } = useAuth();

  const { data: person, isLoading, error } = usePerson(id);
  const updatePerson = useUpdatePerson();
  const setActive = useSetActive();

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [mobileText, setMobileText] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [isHead, setIsHead] = useState(false);
  const [headId, setHeadId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(created ? 'Person added.' : null);
  const [pinOpen, setPinOpen] = useState(false);
  const [tab, setTab] = useState<'khata' | 'details' | 'checks'>('khata');
  const [checkOpen, setCheckOpen] = useState(false);
  const { data: totals } = useTotals(id);
  const { data: checks = [] } = useCashChecks(id);
  const { data: checkSummary } = useCheckSummary(id);
  const { data: allPeople = [] } = usePeopleNames();
  const deleteCheck = useDeleteCashCheck();

  useEffect(() => {
    if (!person) return;
    setFullName(person.full_name);
    setMobileText(formatMobileInput(person.mobile));
    setJobTitle(person.job_title ?? '');
    setRole(person.role);
    setIsHead(!!person.is_head);
    setHeadId(person.head_id ?? null);
  }, [person]);

  if (!canManage) {
    return (
      <Screen>
        <Header title="Person" back />
        <Banner tone="error" message="Only an Admin can open other people." />
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen>
        <Header title="Person" back />
        <Loading />
      </Screen>
    );
  }

  if (error || !person) {
    return (
      <Screen>
        <Header title="Person" back />
        <Banner tone="error" message={error ? (error as Error).message : 'That person was not found.'} />
      </Screen>
    );
  }

  const isMe = person.id === me?.id;
  // Nobody but the Owner may touch the Owner's own card - changing the
  // mobile number there would lock him out of the company's books.
  const ownerIsSomeoneElse = person.is_owner && !isMe;

  const save = async () => {
    setFormError(null);
    const normalized = normalizeMobile(mobileText);
    if (fullName.trim().length < 2) return setFormError('Please enter the full name.');
    if (!normalized) return setFormError('Enter a Saudi mobile number like 050 123 4567.');

    try {
      await updatePerson.mutateAsync({
        userId: person.id,
        fullName: fullName.trim(),
        mobile: normalized,
        jobTitle: jobTitle.trim() || null,
        role,
        isHead,
        headId,
      });
      setEditing(false);
      setNotice('Changes saved.');
      if (isMe) await refreshPerson();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const toggleActive = async () => {
    setFormError(null);
    try {
      await setActive.mutateAsync({ userId: person.id, isActive: !person.is_active });
      setNotice(person.is_active ? 'Account turned off.' : 'Account turned back on.');
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  return (
    <Screen>
      <Header
        title={person.full_name}
        subtitle={prettyMobile(person.mobile)}
        back
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/people'))}
      />

      {notice ? <Banner tone="success" message={notice} /> : null}
      {formError ? <Banner tone="error" message={formError} /> : null}

      <Card style={styles.hero}>
        <Avatar
          name={person.full_name}
          size={64}
          tone={person.is_owner ? colors.amberDark : colors.navy}
        />
        <View style={styles.heroText}>
          <Txt variant="title" numberOfLines={2}>
            {person.full_name}
          </Txt>
          {person.job_title ? (
            <Txt variant="caption" color={colors.textMuted}>
              {person.job_title}
            </Txt>
          ) : null}
          <View style={styles.badgeRow}>
            {person.is_owner ? <Badge label="Owner" tone="amber" icon="shield-checkmark" /> : null}
            <Badge
              label={ROLE_LABEL[person.role]}
              tone={person.role === 'employee' ? 'grey' : 'navy'}
            />
            <Badge
              label={person.is_active ? 'Active' : 'Turned off'}
              tone={person.is_active ? 'green' : 'red'}
            />
            {person.is_head ? (
              <Badge
                label={`Head · ${person.team_count} ${Number(person.team_count) === 1 ? 'person' : 'people'}`}
                tone="blue"
                icon="people-outline"
              />
            ) : null}
            {person.head_name ? (
              <Badge label={`Under ${person.head_name}`} tone="grey" />
            ) : null}
            {isMe ? <Badge label="This is you" tone="blue" /> : null}
          </View>
        </View>
      </Card>

      {!editing ? (
        <View style={styles.tabs}>
          {(['khata', 'checks', 'details'] as const).map((key) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.tab,
                  active && styles.tabOn,
                  pressed && !active && styles.tabPressed,
                ]}
              >
                <Txt
                  variant="subtitle"
                  weight="semibold"
                  color={active ? colors.white : colors.navy}
                >
                  {key === 'khata' ? 'Khata' : key === 'checks' ? 'Cash Check' : 'Details'}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!editing && tab === 'khata' ? (
        <View style={styles.khata}>
          <CashCard
            title="Should be holding"
            spentLabel="Paid out"
            subtitle={person.full_name}
            balance={Number(totals?.balance ?? person.balance ?? 0)}
            given={Number(totals?.money_given ?? 0) + Number(totals?.transfers_in ?? 0)}
            spent={Number(totals?.expenses ?? 0) + Number(totals?.transfers_out ?? 0)}
            returned={Number(totals?.returned ?? 0)}
          />

          <View style={styles.howRow}>
            <HowTile
              icon="cash-outline"
              label="Cash in hand"
              amount={Number(totals?.in_cash ?? person.in_cash ?? 0)}
              tint={colors.green}
            />
            <HowTile
              icon="card-outline"
              label="Bank transfer"
              amount={Number(totals?.in_transfer ?? person.in_transfer ?? 0)}
              tint={colors.blue}
            />
            <HowTile
              icon="receipt-outline"
              label="Spent"
              amount={Number(totals?.expenses ?? person.expenses ?? 0)}
              tint={colors.red}
            />
          </View>

          <View style={styles.checkStrip}>
            <View style={styles.checkStripText}>
              <Txt variant="caption" weight="semibold" color={colors.navy}>
                Count the real cash
              </Txt>
              <CheckSummaryLine summary={checkSummary} />
            </View>
            {person.last_check_result ? (
              <CheckResultBadge
                result={person.last_check_result as 'short' | 'extra' | 'matched'}
                difference={Number(person.last_check_difference ?? 0)}
              />
            ) : null}
            <Button
              label="Cash Check"
              icon="checkmark-done"
              size="sm"
              onPress={() => setCheckOpen(true)}
            />
          </View>

          <SectionTitle title={`Record cash for ${firstName(person.full_name)}`} />
          <View style={styles.addGrid}>
            <Button
              label="Money Given"
              icon="cash"
              variant="success"
              onPress={() => router.push(`/entry/new?type=money_given&person=${person.id}`)}
              style={styles.addBtn}
            />
            <Button
              label="Expense"
              icon="receipt"
              variant="danger"
              onPress={() => router.push(`/entry/new?type=expense&person=${person.id}`)}
              style={styles.addBtn}
            />
          </View>
          <View style={[styles.addGrid, styles.addGridGap]}>
            <Button
              label="Transfer"
              icon="swap-horizontal"
              variant="navy"
              onPress={() => router.push(`/entry/new?type=transfer&person=${person.id}`)}
              style={styles.addBtn}
            />
            <Button
              label="Returned"
              icon="arrow-undo"
              variant="outline"
              onPress={() => router.push(`/entry/new?type=returned&person=${person.id}`)}
              style={styles.addBtn}
            />
          </View>

          <View style={styles.khataList}>
            <KhataList
              personId={person.id}
              emptyTitle="Nothing recorded yet"
              emptyMessage={`No entries for ${firstName(person.full_name)} in this period.`}
            />
          </View>
        </View>
      ) : null}

      {editing ? (
        <>
          <SectionTitle title="Edit details" />
          <Card>
            <View style={styles.group}>
              <Field
                label="Full name"
                value={fullName}
                onChangeText={setFullName}
                icon="person-outline"
                autoCapitalize="words"
              />
              <Field
                label="Mobile number"
                value={mobileText}
                onChangeText={(v) => setMobileText(formatMobileInput(v))}
                keyboardType="number-pad"
                icon="call-outline"
                prefix="+966"
                autoCapitalize="none"
                helper="Changing this changes how they log in."
              />
              <Field
                label="Job title (optional)"
                value={jobTitle}
                onChangeText={setJobTitle}
                icon="briefcase-outline"
                autoCapitalize="words"
              />
            </View>
          </Card>

          <View style={styles.spacer} />
          <Card>
            {person.is_owner ? (
              <Banner
                tone="info"
                message="The Owner always stays an Admin. This cannot be changed."
              />
            ) : isMe ? (
              <Banner
                tone="info"
                message="You cannot change your own role. Ask another Admin to do it."
              />
            ) : (
              <ChoiceField<Role>
                label="What can this person do?"
                value={role}
                onChange={setRole}
                options={[
                  { value: 'employee', label: 'Employee', icon: 'person-outline' },
                  { value: 'sub_admin', label: 'Sub-admin', icon: 'shield-half-outline' },
                  { value: 'admin', label: 'Admin', icon: 'shield-checkmark-outline' },
                ]}
              />
            )}
          </Card>

          <View style={styles.spacer} />
          <Card>
            <TeamFields
              people={allPeople}
              isHead={isHead}
              onIsHead={setIsHead}
              headId={headId}
              onHeadId={setHeadId}
              selfId={person.id}
              teamCount={Number(person.team_count ?? 0)}
            />
          </Card>

          <View style={styles.actions}>
            <Button
              label="Save Changes"
              icon="checkmark-circle"
              size="lg"
              full
              loading={updatePerson.isPending}
              onPress={save}
            />
            <Button
              label="Cancel"
              variant="ghost"
              full
              onPress={() => {
                setEditing(false);
                setFormError(null);
                setFullName(person.full_name);
                setMobileText(formatMobileInput(person.mobile));
                setJobTitle(person.job_title ?? '');
                setRole(person.role);
                setIsHead(!!person.is_head);
                setHeadId(person.head_id ?? null);
              }}
            />
          </View>
        </>
      ) : !editing && tab === 'checks' ? (
        <>
          <Card style={styles.checkHead}>
            <Txt variant="heading">Cash Checks</Txt>
            <Txt variant="caption" color={colors.textMuted}>
              A Cash Check records what {firstName(person.full_name)} really had in hand. It never
              changes the balance. To settle a difference, add a normal entry with a note.
            </Txt>
            <View style={styles.checkStats}>
              <CheckStat label="Checks" value={String(checkSummary?.check_count ?? 0)} />
              <CheckStat
                label="Short"
                value={String(checkSummary?.short_count ?? 0)}
                tone={Number(checkSummary?.short_count ?? 0) > 0 ? colors.red : undefined}
              />
              <CheckStat
                label="Total short"
                value={money(Number(checkSummary?.total_short ?? 0))}
                tone={Number(checkSummary?.total_short ?? 0) > 0 ? colors.red : undefined}
              />
            </View>
            <Button
              label="Run a Cash Check"
              icon="checkmark-done"
              size="lg"
              full
              onPress={() => setCheckOpen(true)}
            />
          </Card>

          <SectionTitle title="Every count" />
          {checks.length === 0 ? (
            <Card>
              <Txt variant="caption" color={colors.textMuted} center>
                {firstName(person.full_name)} has never been counted.
              </Txt>
            </Card>
          ) : (
            <Card padded={false} style={styles.checkList}>
              {checks.map((c, i) => (
                <CashCheckRow
                  key={c.id}
                  check={c}
                  last={i === checks.length - 1}
                  canDelete
                  onDelete={async () => {
                    setFormError(null);
                    try {
                      await deleteCheck.mutateAsync(c.id);
                      setNotice('Cash Check removed.');
                    } catch (err) {
                      setFormError(errorMessage(err));
                    }
                  }}
                />
              ))}
            </Card>
          )}

          <Txt variant="caption" color={colors.textFaint} center style={styles.note}>
            A Cash Check can never be edited. Removing one is written to the change history.
          </Txt>
        </>
      ) : tab === 'details' ? (
        <>
          <SectionTitle title="Details" />
          <Card padded={false} style={styles.detailCard}>
            <DetailRow label="Mobile number" value={prettyMobile(person.mobile)} />
            <DetailRow label="Role" value={ROLE_LABEL[person.role]} />
            <DetailRow label="Job title" value={person.job_title || '-'} />
            <DetailRow
              label="Works under"
              value={person.head_name || 'Nobody'}
            />
            <DetailRow
              label="Is a head"
              value={
                person.is_head
                  ? `Yes · ${person.team_count} ${Number(person.team_count) === 1 ? 'person' : 'people'} under them`
                  : 'No'
              }
            />
            <DetailRow
              label="Status"
              value={person.is_active ? 'Active' : 'Turned off'}
              valueColor={person.is_active ? colors.green : colors.red}
            />
            <DetailRow label="Added on" value={formatDateTime(person.created_at)} />
            <DetailRow label="Added by" value={person.created_by_name || 'First setup'} last />
          </Card>

          <SectionTitle title="Manage" />
          <View style={styles.actions}>
            {ownerIsSomeoneElse ? null : (
              <>
                <Button
                  label="Edit Details"
                  icon="create-outline"
                  variant="navy"
                  size="lg"
                  full
                  onPress={() => {
                    setEditing(true);
                    setNotice(null);
                  }}
                />
                <Button
                  label="Reset PIN"
                  icon="keypad-outline"
                  variant="outline"
                  size="lg"
                  full
                  onPress={() => {
                    setNotice(null);
                    setPinOpen(true);
                  }}
                />
              </>
            )}
            {person.is_owner ? (
              <Banner
                tone="info"
                message={
                  ownerIsSomeoneElse
                    ? 'The Owner account can only be changed by the Owner, and can never be turned off or deleted.'
                    : 'The Owner account can never be turned off or deleted.'
                }
              />
            ) : isMe ? (
              <Banner tone="info" message="You cannot turn off your own account." />
            ) : (
              <Button
                label={person.is_active ? 'Turn Off Account' : 'Turn Account Back On'}
                icon={person.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
                variant={person.is_active ? 'danger' : 'success'}
                size="lg"
                full
                loading={setActive.isPending}
                onPress={toggleActive}
              />
            )}
            <Txt variant="caption" color={colors.textFaint} center style={styles.note}>
              People are never deleted. Turning an account off stops the login but keeps every
              record and report.
            </Txt>
          </View>
        </>
      ) : null}

      <CashCheckModal
        visible={checkOpen}
        personId={person.id}
        personName={person.full_name}
        expected={Number(totals?.balance ?? person.balance ?? 0)}
        onClose={(saved) => {
          setCheckOpen(false);
          if (saved) {
            setNotice('Cash Check saved.');
            setTab('checks');
          }
        }}
      />

      <ResetPinModal
        visible={pinOpen}
        personName={person.full_name}
        userId={person.id}
        onClose={() => setPinOpen(false)}
        onDone={() => {
          setPinOpen(false);
          setNotice('New PIN saved. Tell them the new number.');
        }}
      />
    </Screen>
  );
}

function CheckStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.checkStat}>
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt variant="heading" color={tone ?? colors.text} numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}

// ----------------------------------------------------------- reset PIN
function ResetPinModal({
  visible,
  personName,
  userId,
  onClose,
  onDone,
}: {
  visible: boolean;
  personName: string;
  userId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const resetPin = useResetPin();
  const backdrop = useBackdrop('center');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPin('');
      setConfirm('');
      setError(null);
    }
  }, [visible]);

  const save = async () => {
    setError(null);
    if (!/^\d{4}$/.test(pin)) return setError('The PIN must be exactly 4 digits.');
    if (pin !== confirm) return setError('The two PINs are not the same.');
    try {
      await resetPin.mutateAsync({ userId, pin });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <View style={[styles.modal, shadow.raised]}>
          <View style={styles.modalHead}>
            <Txt variant="heading">New PIN for {personName}</Txt>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <Txt variant="caption" color={colors.textMuted}>
            Tell them the new number. They will need it the next time they log in.
          </Txt>

          <Field
            label="New 4-digit PIN"
            value={pin}
            onChangeText={(v) => {
              setPin(v.replace(/\D/g, '').slice(0, 4));
              setError(null);
            }}
            keyboardType="number-pad"
            maxLength={4}
            icon="lock-closed-outline"
            secret
            autoCapitalize="none"
          />
          <Field
            label="Type it again"
            value={confirm}
            onChangeText={(v) => {
              setConfirm(v.replace(/\D/g, '').slice(0, 4));
              setError(null);
            }}
            keyboardType="number-pad"
            maxLength={4}
            icon="lock-closed-outline"
            secret
            autoCapitalize="none"
          />

          {error ? <Banner tone="error" message={error} /> : null}

          <Button
            label="Save New PIN"
            icon="checkmark-circle"
            size="lg"
            full
            loading={resetPin.isPending}
            onPress={save}
          />
          <Button label="Cancel" variant="ghost" full onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/** How one person's money reached them, and what they did with it. */
function HowTile({
  icon,
  label,
  amount,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  amount: number;
  tint: string;
}) {
  return (
    <View style={styles.howTile}>
      <View style={[styles.howIcon, { backgroundColor: `${tint}14` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
        {label}
      </Txt>
      <Money amount={amount} size="sm" tone="plain" />
    </View>
  );
}

const styles = StyleSheet.create({
  howRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  howTile: {
    flex: 1,
    gap: 3,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    minWidth: 0,
  },
  howIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 6 },
  heroText: { flex: 1, gap: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  detailCard: { paddingHorizontal: 16 },
  group: { gap: 14 },
  actions: { gap: 10, marginTop: 4 },
  spacer: { height: 12 },
  note: { marginTop: 6, paddingHorizontal: 8 },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.navyTint,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: colors.navy },
  tabPressed: { backgroundColor: colors.white },
  khata: { gap: 4 },
  addGrid: { flexDirection: 'row', gap: 10 },
  addGridGap: { marginTop: 10 },
  addBtn: { flex: 1 },
  khataList: { marginTop: 20 },
  checkStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    backgroundColor: colors.navyTint,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 14,
  },
  checkStripText: { flex: 1, minWidth: 140, gap: 2 },
  checkHead: { gap: 10 },
  checkStats: { flexDirection: 'row', gap: 10, marginTop: 2 },
  checkStat: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: 10,
    gap: 2,
  },
  checkList: { overflow: 'hidden' },
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
    gap: 14,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
