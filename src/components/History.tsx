import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/Bits';
import { Txt } from '@/components/Txt';
import { useCategories, usePeopleNames } from '@/api/entries';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { colors, radius } from '@/theme';
import {
  FIELD_LABEL,
  FLAG_LABEL,
  TYPE_SOURCE_LABEL,
  type AuditEntry,
  type TypeSource,
} from '@/types';

const ACTION_META: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; tone: string }
> = {
  insert: { label: 'Added', icon: 'add-circle', tone: colors.green },
  update: { label: 'Changed', icon: 'create', tone: colors.blue },
  delete: { label: 'Deleted', icon: 'trash', tone: colors.red },
  restore: { label: 'Put back', icon: 'arrow-undo', tone: colors.amberDark },
};

const TABLE_LABEL: Record<string, string> = {
  entries: 'Entry',
  app_users: 'Person',
  cash_checks: 'Cash Check',
  expense_categories: 'Category',
};

/** Turns one stored value into something a person can read. */
function readValue(
  field: string,
  value: unknown,
  names: Map<string, string>,
  categories: Map<string, string>,
): string {
  if (value === null || value === undefined || value === '') return 'nothing';

  if (field === 'amount' || field === 'counted' || field === 'expected') {
    return money(Number(value));
  }
  if (field === 'bill_date') return formatDate(String(value));
  if (field === 'person_id' || field === 'counterparty_id' || field === 'deleted_by') {
    return names.get(String(value)) ?? 'someone';
  }
  if (field === 'category_id') return categories.get(String(value)) ?? 'a category';
  if (field === 'head_id' || field === 'cancelled_by' || field === 'deleted_by') {
    return names.get(String(value)) ?? 'someone';
  }
  if (field === 'pay_method') {
    return { cash: 'Cash in hand', transfer: 'Bank transfer' }[String(value)] ?? String(value);
  }
  if (field === 'role') {
    return { admin: 'Admin', sub_admin: 'Sub-admin', employee: 'Employee' }[String(value)] ?? String(value);
  }
  if (field === 'expense_type') {
    return { petty: 'Petty', invoice: 'Invoice' }[String(value)] ?? String(value);
  }
  if (field === 'type_source') {
    return TYPE_SOURCE_LABEL[String(value) as TypeSource] ?? String(value);
  }
  if (field === 'bill_scan_state') {
    return (
      {
        pending: 'waiting',
        done: 'checked',
        failed: 'could not read',
        not_needed: 'not needed',
      }[String(value)] ?? String(value)
    );
  }
  if (field === 'type_flags') {
    const list = (Array.isArray(value) ? value : [value]).map(
      (f) => FLAG_LABEL[String(f)] ?? String(f),
    );
    return list.length ? list.join(', ') : 'nothing';
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';

  const text = String(value);
  // A row id means nothing to a person reading this screen.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    return names.get(text) ?? categories.get(text) ?? 'another entry';
  }
  // Neither does a raw machine time.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return formatDateTime(text);
  return text;
}

export function HistoryRow({ item, showPerson = true }: { item: AuditEntry; showPerson?: boolean }) {
  const { data: people = [] } = usePeopleNames();
  const { data: categories = [] } = useCategories(true);

  const nameMap = useMemo(
    () => new Map(people.map((p) => [p.id, p.full_name])),
    [people],
  );
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const meta = ACTION_META[item.action] ?? ACTION_META.update;
  const changes = Object.entries(item.changes ?? {}).filter(
    ([field]) => field !== 'is_deleted' && field !== 'delete_reason',
  );

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: `${meta.tone}14` }]}>
        <Ionicons name={meta.icon} size={18} color={meta.tone} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Txt variant="subtitle" weight="semibold" numberOfLines={1} style={styles.title}>
            {meta.label} {TABLE_LABEL[item.table_name] ?? item.table_name}
          </Txt>
          {showPerson && item.person_name ? (
            <Badge label={item.person_name} tone="navy" />
          ) : null}
        </View>

        {item.summary ? (
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
            {item.summary}
          </Txt>
        ) : null}

        {changes.length > 0 ? (
          <View style={styles.changes}>
            {changes.map(([field, change]) => (
              <View key={field} style={styles.change}>
                <Txt variant="caption" weight="semibold" color={colors.textMuted}>
                  {FIELD_LABEL[field] ?? field}
                </Txt>
                <Txt variant="caption" color={colors.red} style={styles.old}>
                  {readValue(field, change.old, nameMap, catMap)}
                </Txt>
                <Ionicons name="arrow-forward" size={11} color={colors.textFaint} />
                <Txt variant="caption" color={colors.green}>
                  {readValue(field, change.new, nameMap, catMap)}
                </Txt>
              </View>
            ))}
          </View>
        ) : null}

        {item.action === 'delete' && item.changes?.delete_reason?.new ? (
          <Txt variant="caption" color={colors.red}>
            Reason: {String(item.changes.delete_reason.new)}
          </Txt>
        ) : null}

        <Txt variant="caption" color={colors.textFaint}>
          {item.actor_name ?? 'System'} · {formatDateTime(item.at)}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 3, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1 },
  changes: { gap: 3, marginTop: 2 },
  change: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  old: { textDecorationLine: 'line-through' },
});
