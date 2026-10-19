import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Banner, Card, Loading, SectionTitle } from '@/components/Bits';
import { Txt } from '@/components/Txt';
import { useProjectCrew, useSetProjectMember } from '@/api/projects';
import { usePeopleNames } from '@/api/entries';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/supabase';
import { money } from '@/lib/format';
import { colors, radius } from '@/theme';

/**
 * Who works on this site.
 *
 * This is the list that decides what a person sees when he records what
 * he spent: the sites he is on, and nothing else. Putting somebody on a
 * site is the office's decision - a head can start a site and spend on
 * it, but he does not choose who else files against it.
 *
 * Taking somebody off leaves what they already spent exactly where it
 * is. They were there, and the books have to keep saying so.
 */
export function ProjectCrew({ projectId }: { projectId: string }) {
  const { canManage } = useAuth();
  const crew = useProjectCrew(projectId);
  const people = usePeopleNames();
  const set = useSetProjectMember();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const on = crew.data ?? [];
  const onIds = useMemo(() => new Set(on.map((m) => m.person_id)), [on]);
  const off = (people.data ?? []).filter((p) => !onIds.has(p.id));

  const change = (personId: string, add: boolean) => {
    setError(null);
    set.mutate(
      { projectId, personId, on: add },
      { onError: (err) => setError(errorMessage(err)) },
    );
  };

  if (crew.isLoading) {
    return (
      <>
        <SectionTitle title="Who works on this" />
        <Loading />
      </>
    );
  }

  if (crew.error) return <Banner tone="error" message={crew.error.message} />;

  return (
    <>
      <SectionTitle title="Who works on this" />

      <Card padded={false} style={styles.list}>
        {on.length === 0 ? (
          <View style={styles.empty}>
            <Txt variant="caption" color={colors.textMuted} center>
              Nobody is on this project yet. Until somebody is, they will not see it when they
              record an expense.
            </Txt>
          </View>
        ) : (
          on.map((member) => (
            <View key={member.person_id} style={styles.row}>
              <Avatar name={member.full_name} size={36} />
              <View style={styles.who}>
                <Txt variant="subtitle" weight="semibold" numberOfLines={1}>
                  {member.full_name}
                </Txt>
                <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {member.job_title ? `${member.job_title} · ` : ''}
                  {Number(member.spent) > 0 ? `${money(Number(member.spent))} on it` : 'nothing yet'}
                </Txt>
              </View>
              {canManage ? (
                <Pressable
                  onPress={() => change(member.person_id, false)}
                  accessibilityRole="button"
                  accessibilityLabel={`Take ${member.full_name} off this project`}
                  hitSlop={8}
                  style={({ pressed }) => [styles.off, pressed && styles.offPressed]}
                >
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </Card>

      {canManage ? (
        <>
          {!adding ? (
            <Pressable
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              accessibilityLabel="Put somebody on this project"
              style={({ pressed }) => [styles.addTile, pressed && styles.addPressed]}
            >
              {set.isPending ? (
                <ActivityIndicator color={colors.navy} size="small" />
              ) : (
                <Ionicons name="person-add-outline" size={17} color={colors.navy} />
              )}
              <Txt variant="caption" weight="semibold" color={colors.navy}>
                Put somebody on this project
              </Txt>
            </Pressable>
          ) : (
            <Card>
              <View style={styles.pickHead}>
                <Txt variant="label" color={colors.textMuted}>
                  WHO WORKS ON THIS SITE?
                </Txt>
                <Pressable
                  onPress={() => setAdding(false)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
              {off.length === 0 ? (
                <Txt variant="caption" color={colors.textMuted}>
                  Everybody on the books is already on this project.
                </Txt>
              ) : (
                <View style={styles.chips}>
                  {off.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => change(p.id, true)}
                      accessibilityRole="button"
                      accessibilityLabel={`Put ${p.full_name} on this project`}
                      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                    >
                      <Ionicons name="add" size={14} color={colors.navy} />
                      <Txt variant="caption" weight="semibold" color={colors.navy} numberOfLines={1}>
                        {p.full_name}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              )}
            </Card>
          )}
        </>
      ) : null}

      {error ? <Banner tone="error" message={error} /> : null}

      {on.length > 0 ? (
        <View style={styles.note}>
          <Badge label="Only these people see this project" tone="navy" icon="eye-outline" />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  list: { overflow: 'hidden' },
  empty: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  who: { flex: 1, gap: 2 },
  off: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offPressed: { backgroundColor: colors.navyTint },

  addTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.navyTint,
    backgroundColor: colors.card,
  },
  addPressed: { backgroundColor: colors.navyTint },

  pickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    maxWidth: '100%',
  },
  chipPressed: { backgroundColor: colors.navyTint },

  note: { marginTop: 10, alignItems: 'flex-start' },
});
