import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Badge, Banner, Card, Loading, SectionTitle, useBackdrop } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Header, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useCategories, useHideCategory, useSaveCategory } from '@/api/entries';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/supabase';
import { colors, radius, shadow } from '@/theme';
import type { Category } from '@/types';

/** Icons an admin can choose from, all of them easy to recognise. */
const ICON_CHOICES: (keyof typeof Ionicons.glyphMap)[] = [
  'cube-outline',
  'car-outline',
  'speedometer-outline',
  'people-outline',
  'fast-food-outline',
  'hammer-outline',
  'home-outline',
  'water-outline',
  'flash-outline',
  'build-outline',
  'bandage-outline',
  'document-text-outline',
  'bus-outline',
  'boat-outline',
  'shirt-outline',
  'phone-portrait-outline',
  'gift-outline',
  'ellipsis-horizontal',
];

export default function CategoriesScreen() {
  const { canManage } = useAuth();
  const { data: categories = [], isLoading } = useCategories(true);
  const hideCategory = useHideCategory();

  const [editing, setEditing] = useState<Category | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) {
    return (
      <Screen>
        <Header title="Categories" back />
        <Banner tone="error" message="Only an Admin can manage categories." />
      </Screen>
    );
  }

  const visible = categories.filter((c) => !c.is_hidden);
  const hidden = categories.filter((c) => c.is_hidden);

  const toggleHidden = async (c: Category) => {
    setError(null);
    try {
      await hideCategory.mutateAsync({ id: c.id, hidden: !c.is_hidden });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Screen
      footer={
        <Button
          label="Add Category"
          icon="add-circle"
          size="lg"
          full
          onPress={() => {
            setError(null);
            setAdding(true);
          }}
        />
      }
    >
      <Header title="Categories" subtitle="What expenses can be filed under" back />

      {error ? <Banner tone="error" message={error} /> : null}

      {isLoading ? (
        <Loading />
      ) : (
        <>
          <SectionTitle title={`In use (${visible.length})`} />
          <Card padded={false}>
            {visible.map((c, i) => (
              <Row
                key={c.id}
                category={c}
                last={i === visible.length - 1}
                onEdit={() => {
                  setError(null);
                  setEditing(c);
                }}
                onToggle={() => toggleHidden(c)}
              />
            ))}
          </Card>

          {hidden.length > 0 ? (
            <>
              <SectionTitle title={`Hidden (${hidden.length})`} />
              <Card padded={false} style={styles.dim}>
                {hidden.map((c, i) => (
                  <Row
                    key={c.id}
                    category={c}
                    last={i === hidden.length - 1}
                    onEdit={() => setEditing(c)}
                    onToggle={() => toggleHidden(c)}
                  />
                ))}
              </Card>
            </>
          ) : null}

          <Txt variant="caption" color={colors.textFaint} center style={styles.note}>
            A category that has already been used is never deleted. Hiding it keeps every old
            entry and report correct, and just takes it off the Add Expense screen.
          </Txt>
        </>
      )}

      <CategoryForm
        visible={adding || !!editing}
        category={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </Screen>
  );
}

function Row({
  category,
  last,
  onEdit,
  onToggle,
}: {
  category: Category;
  last: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.rowIcon}>
        <Ionicons
          name={(category.icon as keyof typeof Ionicons.glyphMap) ?? 'pricetag-outline'}
          size={20}
          color={category.is_hidden ? colors.textFaint : colors.navy}
        />
      </View>

      <View style={styles.rowText}>
        <Txt
          variant="subtitle"
          weight="semibold"
          color={category.is_hidden ? colors.textMuted : colors.text}
        >
          {category.name}
        </Txt>
        {category.is_hidden ? <Badge label="Hidden" tone="grey" /> : null}
      </View>

      <Pressable
        onPress={onEdit}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Rename ${category.name}`}
        style={({ pressed }) => [styles.rowBtn, pressed && styles.pressed]}
      >
        <Ionicons name="create-outline" size={18} color={colors.navy} />
      </Pressable>

      <Pressable
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={category.is_hidden ? `Show ${category.name}` : `Hide ${category.name}`}
        style={({ pressed }) => [styles.rowBtn, pressed && styles.pressed]}
      >
        <Ionicons
          name={category.is_hidden ? 'eye-outline' : 'eye-off-outline'}
          size={18}
          color={category.is_hidden ? colors.green : colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

function CategoryForm({
  visible,
  category,
  onClose,
}: {
  visible: boolean;
  category: Category | null;
  onClose: () => void;
}) {
  const saveCategory = useSaveCategory();
  const backdrop = useBackdrop('center');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('pricetag-outline');
  const [error, setError] = useState<string | null>(null);

  // Start the form fresh whenever a different category is opened.
  useEffect(() => {
    if (!visible) return;
    setName(category?.name ?? '');
    setIcon(category?.icon ?? 'pricetag-outline');
    setError(null);
  }, [visible, category]);

  const save = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Give the category a name.');
    try {
      await saveCategory.mutateAsync({ id: category?.id, name, icon });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <View style={[styles.modal, shadow.raised]}>
          <View style={styles.modalHead}>
            <Txt variant="heading">{category ? 'Rename category' : 'New category'}</Txt>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <Field
            label="Name"
            value={name}
            onChangeText={(v) => {
              setName(v.slice(0, 40));
              setError(null);
            }}
            placeholder="Scaffolding"
            icon="pricetag-outline"
            autoCapitalize="words"
          />

          <Txt variant="label" color={colors.textMuted}>
            Icon
          </Txt>
          <ScrollView style={styles.iconScroll}>
            <View style={styles.iconGrid}>
              {ICON_CHOICES.map((choice) => {
                const active = choice === icon;
                return (
                  <Pressable
                    key={choice}
                    onPress={() => setIcon(choice)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={choice}
                    style={({ pressed }) => [
                      styles.iconCell,
                      active && styles.iconCellOn,
                      pressed && !active && styles.pressed,
                    ]}
                  >
                    <Ionicons name={choice} size={22} color={active ? colors.white : colors.navy} />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {error ? <Banner tone="error" message={error} /> : null}

          <Button
            label={category ? 'Save Changes' : 'Add Category'}
            icon="checkmark-circle"
            size="lg"
            full
            loading={saveCategory.isPending}
            onPress={save}
          />
          <Button label="Cancel" variant="ghost" full onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.navyTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 3, alignItems: 'flex-start' },
  rowBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { backgroundColor: colors.navyTint },
  note: { marginTop: 18, paddingHorizontal: 10 },
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
  iconScroll: { maxHeight: 160 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconCell: {
    width: 52,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCellOn: { backgroundColor: colors.navy, borderColor: colors.navy },
});
