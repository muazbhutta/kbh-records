import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { PersonField } from '@/components/pickers';
import { colors, radius } from '@/theme';
import type { PersonName } from '@/types';

/**
 * Who this person works under, and whether they are a head themselves.
 * A head is simply somebody other people can be put under.
 */
export function TeamFields({
  people,
  isHead,
  onIsHead,
  headId,
  onHeadId,
  selfId,
  teamCount = 0,
  note,
}: {
  people: PersonName[];
  isHead: boolean;
  onIsHead: (v: boolean) => void;
  headId: string | null;
  onHeadId: (id: string | null) => void;
  selfId?: string | null;
  teamCount?: number;
  note?: string | null;
}) {
  const heads = people.filter((p) => p.is_head && p.id !== selfId);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onIsHead(!isHead)}
        accessibilityRole="switch"
        accessibilityState={{ checked: isHead }}
        accessibilityLabel="This person is a head"
        style={({ pressed }) => [styles.toggle, isHead && styles.toggleOn, pressed && styles.pressed]}
      >
        <View style={[styles.box, isHead && styles.boxOn]}>
          {isHead ? <Ionicons name="checkmark" size={15} color={colors.white} /> : null}
        </View>
        <View style={styles.toggleText}>
          <Txt variant="subtitle" weight="semibold">
            This person is a head
          </Txt>
          <Txt variant="caption" color={colors.textMuted}>
            {teamCount > 0
              ? `${teamCount} ${teamCount === 1 ? 'person works' : 'people work'} under them`
              : 'Other people can then be put under them'}
          </Txt>
        </View>
      </Pressable>

      {heads.length > 0 ? (
        <PersonField
          label="Works under"
          value={headId}
          people={[
            { id: '', full_name: 'Nobody', is_active: true, is_owner: false, is_head: false, head_id: null },
            ...heads,
          ]}
          onChange={(id) => onHeadId(id || null)}
          placeholder="Nobody"
          helper={note ?? 'Only people marked as a head can be chosen.'}
        />
      ) : (
        <Txt variant="caption" color={colors.textFaint}>
          Nobody is marked as a head yet. Mark someone first, then you can put people under them.
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  toggleOn: { borderColor: colors.navy, backgroundColor: colors.navyTint },
  pressed: { backgroundColor: colors.navyTint },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  boxOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  toggleText: { flex: 1, gap: 1 },
});
