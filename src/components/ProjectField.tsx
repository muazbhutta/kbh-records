import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { useCreateProject, useProjects } from '@/api/projects';
import type { Project } from '@/types';
import { fonts, colors, radius } from '@/theme';

/**
 * Which site was this spent on.
 *
 * Only an Admin, a Sub-admin or a head ever sees this: an employee
 * records what he spent, and somebody who knows the sites files it
 * afterwards. So it is never a required field, and "No project" is a
 * real answer, not a gap - office tea and petrol belong to nobody's
 * site.
 *
 * A site gets its name on the day work starts on it, not on the day the
 * office gets round to adding it, so the name can be written here and
 * then used, without leaving the expense half-finished.
 */
export function ProjectField({
  value,
  onChange,
  label = 'WHICH PROJECT?',
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
}) {
  const { data, isLoading } = useProjects();
  const [adding, setAdding] = useState(false);

  const projects = data ?? [];

  return (
    <View style={styles.group}>
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>

      {isLoading ? (
        <ActivityIndicator color={colors.navy} />
      ) : (
        <View style={styles.row}>
          <Chip label="No project" active={value === null} onPress={() => onChange(null)} />
          {projects.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              active={p.id === value}
              onPress={() => onChange(p.id)}
            />
          ))}
          {!adding ? (
            <Pressable
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              accessibilityLabel="Start a new project"
              style={({ pressed }) => [styles.chip, styles.add, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={16} color={colors.navy} />
              <Txt variant="caption" weight="semibold" color={colors.navy}>
                New project
              </Txt>
            </Pressable>
          ) : null}
        </View>
      )}

      {adding ? (
        <NewProjectBox
          onDone={(project) => {
            onChange(project.id);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

    </View>
  );
}

/**
 * Write down a project by name. Used both while recording an expense and
 * on the Projects screen, where a site can be set up before anybody has
 * spent a riyal on it.
 */
export function NewProjectBox({
  onDone,
  onCancel,
  placeholder = 'Name of the site or job',
}: {
  onDone: (project: Project) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const create = useCreateProject();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Give the project a name of at least 2 letters.');
      return;
    }
    setError(null);
    try {
      const project = await create.mutateAsync(trimmed);
      setName('');
      onDone(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.');
    }
  };

  return (
    <View style={styles.group}>
      <View style={styles.newBox}>
        <TextInput
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoFocus
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="Name of the new project"
        />
        <Pressable
          onPress={save}
          disabled={create.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [styles.save, pressed && styles.savePressed]}
        >
          {create.isPending ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Txt variant="caption" weight="semibold" color={colors.white}>
              Add
            </Txt>
          )}
        </Pressable>
        <Pressable
          onPress={() => {
            setName('');
            setError(null);
            onCancel();
          }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          hitSlop={8}
          style={styles.cancel}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      {error ? (
        <Txt variant="caption" color={colors.red}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipOn,
        pressed && !active && styles.pressed,
      ]}
    >
      <Txt
        variant="caption"
        weight="semibold"
        color={active ? colors.white : colors.navy}
        numberOfLines={1}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    maxWidth: '100%',
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  pressed: { backgroundColor: colors.navyTint },
  add: { borderStyle: 'dashed' },

  newBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.navy,
    backgroundColor: colors.card,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  save: {
    paddingHorizontal: 18,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 68,
  },
  savePressed: { backgroundColor: colors.navyDeep },
  cancel: { padding: 4 },
});
