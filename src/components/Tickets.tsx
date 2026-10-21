import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, Card, Loading } from '@/components/Bits';
import { Txt } from '@/components/Txt';
import { useMarkTicketSeen, useOpenTickets } from '@/api/tickets';
import { errorMessage } from '@/lib/supabase';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';
import type { Ticket } from '@/types';

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
  const seen = useMarkTicketSeen();
  const [failed, setFailed] = useState<string | null>(null);
  const [clearing, setClearing] = useState<number | null>(null);

  const tickets = data ?? [];

  const clear = (id: number) => {
    setFailed(null);
    setClearing(id);
    seen.mutate(id, {
      onError: (err) => setFailed(errorMessage(err)),
      onSettled: () => setClearing(null),
    });
  };

  if (isLoading) return <Loading />;
  if (error) return <Banner tone="error" message={error.message} />;

  if (tickets.length === 0) {
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
      {tickets.map((t) => (
        <TicketCard
          key={t.id}
          ticket={t}
          busy={clearing === t.id}
          onOpen={() => router.push(`/entry/${t.entry_id}?person=${t.person_id}`)}
          onClear={() => clear(t.id)}
        />
      ))}
    </View>
  );
}

function TicketCard({
  ticket,
  busy,
  onOpen,
  onClear,
}: {
  ticket: Ticket;
  busy: boolean;
  onOpen: () => void;
  onClear: () => void;
}) {
  const edit = ticket.kind === 'edit';
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

      <Pressable
        onPress={onClear}
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
});
