import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Banner, useBackdrop } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { DateField } from '@/components/pickers';
import { Txt } from '@/components/Txt';
import {
  useCloseProject,
  useDeleteProject,
  useRenameProject,
  useReopenProject,
} from '@/api/projects';
import { errorMessage } from '@/lib/supabase';
import { formatDate, money } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';
import type { ProjectTotal } from '@/types';

type Which = 'none' | 'rename' | 'finish' | 'remove';

/**
 * The three things an Admin can do to a project: change its name or the
 * day work started, mark it finished, and - only when nothing has ever
 * been put on it - remove it.
 *
 * Removing is deliberately the narrow one. A project with money on it is
 * renamed, because the money went somewhere and the books have to keep
 * saying where. The button is not even shown when it would be refused.
 */
export function ProjectSheets({
  which,
  project,
  onClose,
}: {
  which: Which;
  project: ProjectTotal;
  onClose: () => void;
}) {
  if (which === 'none') return null;
  if (which === 'rename') return <RenameSheet project={project} onClose={onClose} />;
  if (which === 'finish') return <FinishSheet project={project} onClose={onClose} />;
  return <RemoveSheet project={project} onClose={onClose} />;
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const backdrop = useBackdrop('center');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <View style={[styles.sheet, shadow.raised]}>
          <View style={styles.head}>
            <Txt variant="heading">{title}</Txt>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function RenameSheet({ project, onClose }: { project: ProjectTotal; onClose: () => void }) {
  const rename = useRenameProject();
  const [name, setName] = useState(project.name);
  const [started, setStarted] = useState(project.started_on);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(project.name);
    setStarted(project.started_on);
  }, [project.name, project.started_on]);

  const save = async () => {
    setError(null);
    try {
      await rename.mutateAsync({ id: project.project_id, name: name.trim(), startedOn: started });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Sheet title="Change this project" onClose={onClose}>
      <Txt variant="caption" color={colors.textMuted}>
        The expenses already on it stay on it. Only the name and the start date change.
      </Txt>

      <Field
        label="Project name"
        value={name}
        onChangeText={(v) => setName(v.slice(0, 80))}
        placeholder="Name of the site or job"
        icon="business-outline"
      />

      <DateField label="Work started on" value={started} onChange={setStarted} />

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label="Save"
        icon="checkmark"
        size="lg"
        full
        loading={rename.isPending}
        onPress={save}
      />
      <Button label="Cancel" variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

function FinishSheet({ project, onClose }: { project: ProjectTotal; onClose: () => void }) {
  const close = useCloseProject();
  const reopen = useReopenProject();
  const [error, setError] = useState<string | null>(null);
  const finishing = project.is_active;

  const go = async () => {
    setError(null);
    try {
      if (finishing) await close.mutateAsync(project.project_id);
      else await reopen.mutateAsync(project.project_id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Sheet title={finishing ? 'Mark this project complete?' : 'Open this project again?'} onClose={onClose}>
      <Txt variant="subtitle" weight="semibold">
        {project.name}
      </Txt>

      {finishing ? (
        <>
          <Txt variant="caption" color={colors.textMuted}>
            {money(Number(project.spent))} has been spent on it. Today is written down as the day
            it finished.
          </Txt>
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={15} color={colors.blue} />
            <Txt variant="caption" color={colors.blue}>
              Nothing new can be put on a finished project. Everything already on it stays, and you
              can open it again later.
            </Txt>
          </View>
        </>
      ) : (
        <Txt variant="caption" color={colors.textMuted}>
          It was finished on {formatDate(project.closed_at)}. Opening it again lets expenses be
          filed against it once more.
        </Txt>
      )}

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label={finishing ? 'Yes, Mark It Complete' : 'Yes, Open It Again'}
        icon={finishing ? 'checkmark-done' : 'refresh-outline'}
        size="lg"
        full
        loading={close.isPending || reopen.isPending}
        onPress={go}
      />
      <Button label="Not Now" variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

function RemoveSheet({ project, onClose }: { project: ProjectTotal; onClose: () => void }) {
  const router = useRouter();
  const remove = useDeleteProject();
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setError(null);
    try {
      await remove.mutateAsync(project.project_id);
      onClose();
      router.replace('/projects');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Sheet title="Remove this project?" onClose={onClose}>
      <Txt variant="subtitle" weight="semibold">
        {project.name}
      </Txt>
      <Txt variant="caption" color={colors.textMuted}>
        Nothing has ever been spent on it, so nothing is lost. This is for a name typed by mistake.
      </Txt>
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={15} color={colors.blue} />
        <Txt variant="caption" color={colors.blue}>
          The moment one expense sits on a project it can no longer be removed, only renamed.
        </Txt>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      <Button
        label="Yes, Remove It"
        icon="trash"
        variant="danger"
        size="lg"
        full
        loading={remove.isPending}
        onPress={go}
      />
      <Button label="Keep It" variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 20,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  note: {
    flexDirection: 'row',
    gap: 7,
    backgroundColor: colors.blueSoft,
    borderRadius: radius.md,
    padding: 11,
  },
});
