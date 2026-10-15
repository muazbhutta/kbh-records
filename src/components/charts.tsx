import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Txt } from '@/components/Txt';
import { amountOnly, money } from '@/lib/format';
import { colors, radius } from '@/theme';

/**
 * Categorical slots, in a fixed order that is never cycled. Validated for
 * colour-blind separation against a white card. Slot 1 is the KBH blue.
 * Every slice is also named in the legend, so colour is never the only
 * thing telling two categories apart.
 */
export const SERIES = [
  '#0B6493',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
] as const;

export const OTHER_COLOR = '#8A99AB';

// ====================================================== bars over time
/**
 * Expenses per month. One series, so one colour and no legend: the card
 * heading says what it is. Tap a bar to read its figure.
 */
export function MonthBars({
  data,
  height = 150,
}: {
  data: { label: string; total: number; month: string }[];
  height?: number;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => Number(d.total)));
  const shown = picked ?? data.reduce((best, d, i) => (Number(d.total) > Number(data[best].total) ? i : best), 0);

  if (data.length === 0) {
    return <EmptyChart message="No expenses yet." />;
  }

  return (
    <View style={styles.block}>
      <View style={styles.calloutRow}>
        <Txt variant="caption" color={colors.textMuted}>
          {data[shown]?.label} {data[shown]?.month?.slice(0, 4)}
        </Txt>
        <Txt variant="heading" color={colors.navy}>
          {money(Number(data[shown]?.total ?? 0))}
        </Txt>
      </View>

      <View style={[styles.barsRow, { height }]}>
        {data.map((d, i) => {
          const value = Number(d.total);
          const h = Math.max(value > 0 ? 4 : 2, (value / max) * (height - 8));
          const active = i === shown;
          return (
            <Pressable
              key={d.month}
              onPress={() => setPicked(i)}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}, ${money(value)}`}
              style={styles.barHit}
            >
              <View
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor: active ? colors.navy : colors.navyTint,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.barsRow}>
        {data.map((d, i) => (
          <View key={`l-${d.month}`} style={styles.barHit}>
            <Txt
              variant="label"
              color={i === shown ? colors.navy : colors.textFaint}
              numberOfLines={1}
              style={styles.monthLabel}
            >
              {d.label}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

// ================================================================ donut
/**
 * Expenses by category. Drawn as a ring of arcs with a 2px gap between
 * them, and every slice repeated in the legend with its own figure.
 */
export function CategoryDonut({
  data,
  size = 168,
}: {
  data: { id: string; name: string; total: number }[];
  size?: number;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const total = data.reduce((sum, d) => sum + Number(d.total), 0);
  if (data.length === 0 || total <= 0) {
    return <EmptyChart message="No expenses in this period." />;
  }

  // Past eight categories everything else folds into one "Other" slice,
  // rather than inventing a ninth colour.
  const top = data.slice(0, SERIES.length);
  const rest = data.slice(SERIES.length);
  const slices = [
    ...top.map((d, i) => ({ ...d, color: SERIES[i] as string })),
    ...(rest.length
      ? [
          {
            id: 'other',
            name: `Other (${rest.length})`,
            total: rest.reduce((s, d) => s + Number(d.total), 0),
            color: OTHER_COLOR,
          },
        ]
      : []),
  ];

  const stroke = 22;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const gap = 2;

  let offset = 0;
  const arcs = slices.map((s) => {
    const share = Number(s.total) / total;
    const length = Math.max(circumference * share - gap, 1);
    const arc = { ...s, share, length, offset };
    offset += circumference * share;
    return arc;
  });

  const focus = picked ? arcs.find((a) => a.id === picked) : null;

  return (
    <View style={styles.block}>
      <View style={styles.donutRow}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            {arcs.map((a) => (
              <Circle
                key={a.id}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={a.color}
                strokeWidth={picked && picked !== a.id ? stroke - 6 : stroke}
                strokeDasharray={`${a.length} ${circumference - a.length}`}
                strokeDashoffset={-a.offset}
                fill="none"
                opacity={picked && picked !== a.id ? 0.45 : 1}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            ))}
          </Svg>

          <View style={[styles.donutMiddle, { width: size, height: size }]}>
            <Txt variant="label" color={colors.textFaint}>
              {focus ? focus.name.toUpperCase() : 'TOTAL'}
            </Txt>
            <Txt variant="heading" color={colors.navy} numberOfLines={1}>
              {money(focus ? Number(focus.total) : total)}
            </Txt>
            {focus ? (
              <Txt variant="caption" color={colors.textMuted}>
                {Math.round(focus.share * 100)}%
              </Txt>
            ) : null}
          </View>
        </View>

        <View style={styles.legend}>
          {arcs.map((a) => {
            const active = picked === a.id;
            return (
              <Pressable
                key={`k-${a.id}`}
                onPress={() => setPicked(active ? null : a.id)}
                accessibilityRole="button"
                accessibilityLabel={`${a.name}, ${money(Number(a.total))}`}
                style={({ pressed }) => [
                  styles.legendRow,
                  (active || pressed) && styles.legendRowOn,
                ]}
              >
                <View style={[styles.swatch, { backgroundColor: a.color }]} />
                <Txt variant="caption" numberOfLines={1} style={styles.legendName}>
                  {a.name}
                </Txt>
                <Txt variant="caption" weight="semibold" color={colors.textMuted}>
                  {amountOnly(Number(a.total))}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ====================================================== horizontal bars
/** Top cash holders. One series, with the figure written on every bar. */
export function RankedBars({
  data,
  onPress,
}: {
  data: { id: string; label: string; sub?: string | null; value: number }[];
  onPress?: (id: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...data.map((d) => Number(d.value)));

  if (data.length === 0) {
    return <EmptyChart message="Nobody is holding cash." />;
  }

  return (
    <View
      style={styles.ranked}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {data.map((d) => {
        const share = Number(d.value) / max;
        return (
          <Pressable
            key={d.id}
            onPress={onPress ? () => onPress(d.id) : undefined}
            accessibilityRole={onPress ? 'button' : 'none'}
            accessibilityLabel={`${d.label}, ${money(Number(d.value))}`}
            style={({ pressed }) => [styles.rankRow, pressed && onPress && styles.rankPressed]}
          >
            <View style={styles.rankTop}>
              <Txt variant="caption" weight="semibold" numberOfLines={1} style={styles.rankName}>
                {d.label}
              </Txt>
              <Txt variant="caption" weight="bold" color={colors.navy}>
                {money(Number(d.value))}
              </Txt>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: Math.max(6, share * Math.max(width, 1)) },
                ]}
              />
            </View>
            {d.sub ? (
              <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
                {d.sub}
              </Txt>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Txt variant="caption" color={colors.textFaint} center>
        {message}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  calloutRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barHit: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, minHeight: 2 },
  monthLabel: { marginTop: 5 },

  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  donutMiddle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: 34,
  },
  legend: { flex: 1, minWidth: 150, gap: 2 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  legendRowOn: { backgroundColor: colors.navyTint },
  swatch: { width: 11, height: 11, borderRadius: 3 },
  legendName: { flex: 1 },

  ranked: { gap: 13 },
  rankRow: { gap: 5 },
  rankPressed: { opacity: 0.7 },
  rankTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rankName: { flex: 1 },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.navyTint, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.navy },

  empty: { paddingVertical: 30, alignItems: 'center' },
});
