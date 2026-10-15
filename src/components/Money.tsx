import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from '@/components/Txt';
import { amountOnly, money } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';

/** Green for money coming in, red for money going out, navy for a balance. */
export function Money({
  amount,
  tone = 'auto',
  size = 'md',
  showSign = false,
}: {
  amount: number;
  tone?: 'auto' | 'in' | 'out' | 'plain';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSign?: boolean;
}) {
  const color =
    tone === 'in'
      ? colors.green
      : tone === 'out'
        ? colors.red
        : tone === 'plain'
          ? colors.text
          : amount < 0
            ? colors.red
            : colors.text;

  const sizes = { sm: 14, md: 17, lg: 22, xl: 38 } as const;
  const fontSize = sizes[size];
  const letterSpacing = size === 'xl' ? -1 : -0.3;

  // Every size here is bigger than the body text this component inherits
  // from, so the line box has to grow with it. Without this the tall
  // bold digits are sliced off at the top and bottom.
  const lineHeight = Math.round(fontSize * 1.3);

  if (!showSign) {
    return (
      <Txt
        weight="bold"
        color={color}
        style={{ fontSize, lineHeight, letterSpacing }}
        numberOfLines={1}
      >
        {money(amount)}
      </Txt>
    );
  }

  // The plus or minus is drawn as its own mark, smaller and sitting on the
  // same baseline, rather than glued into the text. At 38px a full-size
  // sign next to "SAR" reads as part of the currency instead of a
  // direction, which is what made the big figure look wrong.
  const out = tone === 'out' || amount < 0;
  const signSize = Math.round(fontSize * 0.68);

  return (
    <View style={[styles.signRow, { gap: Math.max(3, Math.round(fontSize * 0.13)) }]}>
      <Txt
        weight="bold"
        color={color}
        style={{ fontSize: signSize, lineHeight: Math.round(signSize * 1.3), letterSpacing: 0 }}
      >
        {out ? '−' : '+'}
      </Txt>
      <Txt
        weight="bold"
        color={color}
        style={{ fontSize, lineHeight, letterSpacing }}
        numberOfLines={1}
      >
        {`SAR ${amountOnly(Math.abs(amount))}`}
      </Txt>
    </View>
  );
}

/**
 * The one number that matters on the employee home screen: the cash this
 * person should be holding right now.
 */
export function CashCard({
  balance,
  given,
  spent,
  returned,
  title = 'Cash in hand',
  /**
   * On a person's own card this figure covers money spent on bills AND
   * money passed on to somebody else, so calling it "Spent" would argue
   * with the plain spending shown elsewhere on the same screen.
   */
  spentLabel = 'Spent',
  owedTitle = 'Company owes',
  owedNote = 'More was spent than was handed over',
  subtitle,
  style,
}: {
  balance: number;
  given: number;
  spent: number;
  returned: number;
  title?: string;
  spentLabel?: string;
  /** What to call the figure when it has gone the other way. */
  owedTitle?: string;
  owedNote?: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const owed = balance < 0;
  // "Should be holding SAR 1,560" over a minus figure sends a person off to
  // count money that is not there. When it has gone the other way the card
  // has to say so in the heading, not in the small print.
  const heading = owed ? owedTitle : title;

  return (
    <View style={[styles.cash, shadow.raised, style]}>
      <View style={styles.cashTop}>
        <Txt variant="label" color={owed ? colors.red : colors.onDarkMuted} style={styles.upper}>
          {heading}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" color={colors.onDarkMuted}>
            {subtitle}
          </Txt>
        ) : null}
      </View>

      <Txt
        weight="bold"
        color={owed ? colors.red : colors.white}
        style={styles.cashAmount}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {money(Math.abs(balance))}
      </Txt>

      {owed ? (
        <View style={styles.owes}>
          <Ionicons name="alert-circle" size={14} color={colors.red} />
          <Txt variant="caption" weight="semibold" color={colors.red}>
            {owedNote}
          </Txt>
        </View>
      ) : null}

      <View style={styles.cashRow}>
        <CashBit label="Given" value={given} tone={colors.green} />
        <CashBit label={spentLabel} value={spent} tone={colors.amber} />
        <CashBit label="Returned" value={returned} tone={colors.onDarkMuted} />
      </View>
    </View>
  );
}

function CashBit({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.cashBit}>
      <Txt variant="caption" color={colors.onDarkMuted}>
        {label}
      </Txt>
      <Txt weight="semibold" color={tone} style={styles.cashBitValue} numberOfLines={1}>
        {amountOnly(value)}
      </Txt>
    </View>
  );
}

/** A small labelled figure, used in rows of four on summary cards. */
export function Figure({
  label,
  value,
  tone = colors.text,
  icon,
}: {
  label: string;
  value: number;
  tone?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[styles.figure, shadow.card]}>
      {icon ? (
        <View style={[styles.figureIcon, { backgroundColor: `${tone}14` }]}>
          <Ionicons name={icon} size={16} color={tone} />
        </View>
      ) : null}
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt weight="bold" color={tone} style={styles.figureValue} numberOfLines={1}>
        {money(value)}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  upper: { textTransform: 'uppercase' },
  signRow: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 1 },
  cash: {
    backgroundColor: colors.navy,
    borderRadius: radius.xl,
    padding: 20,
    gap: 2,
  },
  cashTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cashAmount: { fontSize: 38, lineHeight: 48, letterSpacing: -1.2 },
  owes: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -2, marginBottom: 2 },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  cashBit: { flex: 1, gap: 2 },
  cashBitValue: { fontSize: 16, lineHeight: 22 },
  figure: {
    flexGrow: 1,
    flexBasis: 150,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 2,
  },
  figureIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  figureValue: { fontSize: 18, lineHeight: 24 },
});
