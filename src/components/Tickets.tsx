import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, Card, Loading } from '@/components/Bits';
import { BillImage, PhotoViewer } from '@/components/BillPhotos';
import { Txt } from '@/components/Txt';
import {
  useDecideChange,
  useOpenTickets,
  useSettleTicket,
  useWaitingChanges,
} from '@/api/tickets';
import { signedUrl } from '@/lib/photos';
import { errorMessage } from '@/lib/supabase';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';
import type { ExpenseKind, Ticket, WaitingChange } from '@/types';

/**
 * Everything recorded or changed that the office has not looked at yet.
 *
 * A ticket is raised by the database for every entry and every
 * correction, so this list cannot quietly miss one. An entry leaves the
 * list when somebody with the authority says it looks right, and the
 * ticket keeps their name against it.
 *
 * A correction says who changed it, why, and what the figure was before
 * - because "SAR 460" on its own is not the question an Admin has. The
 * question is what it used to say.
 */
export function Tickets() {
  const router = useRouter();
  const { data, isLoading, error } = useOpenTickets();
  const changes = useWaitingChanges();
  const settle = useSettleTicket();
  const [failed, setFailed] = useState<string | null>(null);
  const [clearing, setClearing] = useState<number | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const tickets = data ?? [];
  const waiting = changes.data ?? [];

  const clear = (id: number, type?: ExpenseKind) => {
    setFailed(null);
    setClearing(id);
    settle.mutate(
      { id, type },
      {
        onError: (err) => setFailed(errorMessage(err)),
        onSettled: () => setClearing(null),
      },
    );
  };

  if (isLoading) return <Loading />;
  if (error) return <Banner tone="error" message={error.message} />;

  if (tickets.length === 0 && waiting.length === 0) {
    return (
      <Card>
        <View style={styles.clear}>
          <Ionicons name="checkmark-done-circle-outline" size={20} color={colors.green} />
          <Txt variant="caption" color={colors.textMuted}>
            Nothing waiting. Everything recorded has been looked at.
          </Txt>
        </View>
      </Card>
    );
  }

  return (
    <View style={styles.list}>
      {failed ? <Banner tone="error" message={failed} /> : null}

      {/*
        Corrections first. Until one is answered the books are saying
        something somebody has already told us is wrong, which is a
        sharper thing than an entry nobody has glanced at yet.
      */}
      {waiting.map((c) => (
        <ChangeCard key={`c${c.id}`} change={c} onOpenEntry={() =>
          router.push(`/entry/${c.entry_id}`)
        } />
      ))}

      {tickets.map((t) => (
        <TicketCard
          key={t.id}
          ticket={t}
          busy={clearing === t.id}
          onOpen={() => router.push(`/entry/${t.entry_id}?person=${t.person_id}`)}
          onClear={(type) => clear(t.id, type)}
          onViewBill={async (path) => {
            const url = await signedUrl(path);
            if (url) setViewing(url);
          }}
        />
      ))}

      <PhotoViewer uri={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

function TicketCard({
  ticket,
  busy,
  onOpen,
  onClear,
  onViewBill,
}: {
  ticket: Ticket;
  busy: boolean;
  onOpen: () => void;
  onClear: (type?: ExpenseKind) => void;
  onViewBill: (path: string) => void;
}) {
  const edit = ticket.kind === 'edit';
  // The real photograph, as on every other screen. The list is long, so
  // it is fetched only when the card comes near - shrinking it instead
  // made it unreadable, which is the one thing it is there for.
  const bill = ticket.storage_path ?? ticket.thumb_path;
  const tone = edit ? colors.amberDark : colors.blue;
  const changes = Object.entries(ticket.changes ?? {});

  return (
    <View style={[styles.card, shadow.card, edit && styles.cardEdit]}>
      <Pressable onPress={onOpen} accessibilityRole="button" style={styles.top}>
        <View style={[styles.icon, { backgroundColor: `${tone}18` }]}>
          <Ionicons name={edit ? 'create-outline' : 'add-circle-outline'} size={18} color={tone} />
        </View>
        <View style={styles.head}>
          <View style={styles.headLine}>
            <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
              {money(Number(ticket.amount))}
            </Txt>
            <Badge
              label={edit ? 'Changed' : 'New'}
              tone={edit ? 'amber' : 'blue'}
              style={styles.badgeMid}
            />
          </View>
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
            {ticket.category_name ?? ticket.entry_type.replace('_', ' ')} ·{' '}
            {formatDate(ticket.bill_date)}
            {ticket.note ? ` · ${ticket.note}` : ''}
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>

      <View style={styles.who}>
        <Avatar name={ticket.person_name} size={26} />
        <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
          {ticket.person_name ?? 'Somebody'}
          {ticket.actor_name && ticket.actor_name !== ticket.person_name
            ? ` · ${edit ? 'changed' : 'entered'} by ${ticket.actor_name}`
            : ''}
          {' · '}
          {formatDateTime(ticket.at)}
        </Txt>
      </View>

      {edit ? (
        <View style={styles.why}>
          {ticket.reason ? (
            <Txt variant="caption" color={colors.text}>
              &ldquo;{ticket.reason}&rdquo;
            </Txt>
          ) : (
            <Txt variant="caption" color={colors.red}>
              Changed without a reason given.
            </Txt>
          )}
          {changes.map(([field, v]) => (
            <View key={field} style={styles.change}>
              <Txt variant="label" color={colors.textMuted}>
                {field.toUpperCase()}
              </Txt>
              <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                <Txt variant="caption" color={colors.red}>
                  {v.from ?? '—'}
                </Txt>
                {'  →  '}
                <Txt variant="caption" weight="semibold" color={colors.green}>
                  {v.to ?? '—'}
                </Txt>
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      {/*
        Where the paper's type is still an open question, it is asked
        here, over the bill itself. The office was being sent to a
        second screen to answer it about a photograph it had already
        looked at once - so the question moved to where the looking
        happens. Pressing either button says both things at once: this
        is what the paper is, and I have seen it.
      */}
      {/*
        The bill, on every ticket that has one.
        Whether the question is "is this entry right", "was this edit
        right", or "what is this paper", it is the same question
        underneath - and it cannot be answered from a figure and a note.
        The photograph is the evidence, so it is always on the card and
        never a screen away.
      */}
      {bill ? (
        <View style={styles.billBox}>
          <BillImage
            path={bill}
            thumb={ticket.thumb_path}
            style={styles.bill}
            contentFit="cover"
            lazy
            onPress={() => onViewBill(bill)}
          />
          <Txt variant="caption" color={colors.textMuted}>
            {ticket.needs_type
              ? 'What is this paper? Tap the bill to see it closely.'
              : 'Tap the bill to see it closely.'}
          </Txt>
        </View>
      ) : null}

      {/*
        Where the paper's type is still an open question, it is asked
        here, over the bill. Pressing any of the three says both things
        at once: this is what the paper is, and I have seen it.
      */}
      {ticket.needs_type ? (
        <View style={styles.typeRow}>
          <TypeChoice
            icon="receipt-outline"
            label="Petty"
            tone={colors.navy}
            busy={busy}
            onPress={() => onClear('petty')}
          />
          <TypeChoice
            icon="document-text-outline"
            label="Invoice"
            tone={colors.green}
            busy={busy}
            onPress={() => onClear('invoice')}
          />
          <TypeChoice
            icon="hammer-outline"
            label="Labour"
            tone={colors.amberDark}
            busy={busy}
            onPress={() => onClear('labour')}
          />
          <TypeChoice
            icon="swap-horizontal-outline"
            label="Transfer"
            tone={colors.blue}
            busy={busy}
            onPress={() => onClear('bank_transfer')}
          />
        </View>
      ) : (
        <Pressable
          onPress={() => onClear()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Looks right, ${money(Number(ticket.amount))}`}
          style={({ pressed }) => [styles.ok, pressed && styles.okPressed]}
        >
          {busy ? (
            <ActivityIndicator color={colors.green} size="small" />
          ) : (
            <Ionicons name="checkmark" size={17} color={colors.green} />
          )}
          <Txt variant="caption" weight="semibold" color={colors.green}>
            Looks right
          </Txt>
        </Pressable>
      )}
    </View>
  );
}

/** One of the two answers, which is also "I have looked at it". */
function TypeChoice({
  icon,
  label,
  tone,
  busy,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${label}, and it looks right`}
      style={({ pressed }) => [
        styles.choice,
        { borderColor: tone },
        pressed && { backgroundColor: `${tone}14` },
        busy && styles.choiceBusy,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tone} size="small" />
      ) : (
        <Ionicons name={icon} size={16} color={tone} />
      )}
      <Txt variant="caption" weight="semibold" color={tone}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * A correction somebody is asking for.
 *
 * Both figures, side by side, because the question an Admin has is not
 * "what does he want it to say" but "what does it say now, and should
 * it". The reason is in his own words and is the whole of the case.
 *
 * Nothing has moved yet. Approve applies it; Refuse leaves the books
 * exactly as they are.
 */
function ChangeCard({
  change,
  onOpenEntry,
}: {
  change: WaitingChange;
  onOpenEntry: () => void;
}) {
  const decide = useDecideChange();
  const [error, setError] = useState<string | null>(null);
  const [doing, setDoing] = useState<'yes' | 'no' | null>(null);

  const answer = (approve: boolean) => {
    setError(null);
    setDoing(approve ? 'yes' : 'no');
    decide.mutate(
      { id: change.id, approve },
      {
        onError: (err) => setError(errorMessage(err)),
        onSettled: () => setDoing(null),
      },
    );
  };

  const rows: { label: string; from: string; to: string }[] = [];
  if (change.new_amount !== null && Number(change.new_amount) !== Number(change.old_amount)) {
    rows.push({
      label: 'Amount',
      from: money(Number(change.old_amount)),
      to: money(Number(change.new_amount)),
    });
  }
  if (change.new_bill_date && change.new_bill_date !== change.old_bill_date) {
    rows.push({
      label: 'Bill date',
      from: formatDate(change.old_bill_date),
      to: formatDate(change.new_bill_date),
    });
  }
  if (change.new_category && change.new_category !== change.old_category) {
    rows.push({
      label: 'What for',
      from: change.old_category ?? '—',
      to: change.new_category,
    });
  }
  if (change.clear_note || (change.new_note && change.new_note !== change.old_note)) {
    rows.push({
      label: 'Note',
      from: change.old_note || '—',
      to: change.clear_note ? '—' : (change.new_note ?? '—'),
    });
  }

  return (
    <View style={[styles.card, shadow.card, styles.cardAsk]}>
      <Pressable onPress={onOpenEntry} accessibilityRole="button" style={styles.top}>
        <View style={[styles.icon, { backgroundColor: `${colors.red}18` }]}>
          <Ionicons name="help-circle-outline" size={19} color={colors.red} />
        </View>
        <View style={styles.head}>
          <View style={styles.headLine}>
            <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
              {money(Number(change.old_amount))}
            </Txt>
            <Badge label="Asking to change" tone="red" style={styles.badgeMid} />
          </View>
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
            {change.asked_by_name ?? 'Somebody'} · {formatDateTime(change.asked_at)}
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>

      <View style={styles.why}>
        <Txt variant="caption" color={colors.text}>
          &ldquo;{change.reason}&rdquo;
        </Txt>
        {rows.length === 0 ? (
          <Txt variant="caption" color={colors.textMuted}>
            Nothing is actually different. Refusing costs nothing.
          </Txt>
        ) : (
          rows.map((r) => (
            <View key={r.label} style={styles.change}>
              <Txt variant="label" color={colors.textMuted}>
                {r.label.toUpperCase()}
              </Txt>
              <Txt variant="caption" color={colors.textMuted} numberOfLines={2}>
                <Txt variant="caption" color={colors.red}>
                  {r.from}
                </Txt>
                {'  →  '}
                <Txt variant="caption" weight="semibold" color={colors.green}>
                  {r.to}
                </Txt>
              </Txt>
            </View>
          ))
        )}
      </View>

      <Txt variant="caption" color={colors.textFaint}>
        The books still say the first figure. Nothing changes until you approve it.
      </Txt>

      {error ? <Banner tone="error" message={error} /> : null}

      <View style={styles.answers}>
        <Pressable
          onPress={() => answer(false)}
          disabled={doing !== null}
          accessibilityRole="button"
          accessibilityLabel={`Refuse the change to ${money(Number(change.old_amount))}`}
          style={({ pressed }) => [styles.no, pressed && styles.noPressed]}
        >
          {doing === 'no' ? (
            <ActivityIndicator color={colors.red} size="small" />
          ) : (
            <Ionicons name="close" size={17} color={colors.red} />
          )}
          <Txt variant="caption" weight="semibold" color={colors.red}>
            Refuse
          </Txt>
        </Pressable>
        <Pressable
          onPress={() => answer(true)}
          disabled={doing !== null}
          accessibilityRole="button"
          accessibilityLabel={`Approve the change to ${money(Number(change.old_amount))}`}
          style={({ pressed }) => [styles.ok, styles.okWide, pressed && styles.okPressed]}
        >
          {doing === 'yes' ? (
            <ActivityIndicator color={colors.green} size="small" />
          ) : (
            <Ionicons name="checkmark" size={17} color={colors.green} />
          )}
          <Txt variant="caption" weight="semibold" color={colors.green}>
            Approve &amp; apply
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    gap: 9,
  },
  cardEdit: { borderColor: colors.amberSoft },
  cardAsk: { borderColor: colors.redSoft, borderWidth: 1.5 },

  top: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  head: { flex: 1, gap: 2 },
  headLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  badgeMid: { alignSelf: 'center' },

  who: { flexDirection: 'row', alignItems: 'center', gap: 7 },

  why: {
    gap: 5,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 10,
  },
  change: { gap: 1 },

  billBox: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  // Tall enough to read a figure off, not so tall the list stops being
  // a list when four of them come in at once.
  bill: { width: '100%', height: 190, borderRadius: radius.md },
  // Four of them. On a phone they fall into two rows of two rather
  // than four slivers too narrow to read or to hit.
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    flexGrow: 1,
    flexBasis: '44%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: colors.card,
  },
  choiceBusy: { opacity: 0.6 },

  ok: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.greenSoft,
    backgroundColor: colors.greenSoft,
  },
  okPressed: { backgroundColor: colors.green, borderColor: colors.green },
  okWide: { flex: 2 },
  answers: { flexDirection: 'row', gap: 8 },
  no: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.redSoft,
    backgroundColor: colors.redSoft,
  },
  noPressed: { backgroundColor: colors.red, borderColor: colors.red },
});
