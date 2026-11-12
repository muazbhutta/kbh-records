import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from '@/components/Txt';
import { amountOnly, money } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';

/** Green for money coming in, red for money going out, navy for a balance. */
export function Money({
  amount,
  tone = 'auto',
  size = 'md',
  showSign = false,
  currency = true,
}: {
  amount: number;
  tone?: 'auto' | 'in' | 'out' | 'plain';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSign?: boolean;
  /**
   * Whether to print "SAR" in front of the figure.
   *
   * Off where a row of tiles is plainly all in one currency and saying
   * it three times costs four characters each - enough, in a tile a
   * third of a phone wide, to make the figures shrink or be cut.
   */
  currency?: boolean;
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
  // A long figure in a narrow box used to be cut: "SAR 78,531.50" came
  // out "SAR 78,53...", which on a money screen is not a smaller figure
  // but a wrong one. The same rule the cash card uses - shrink the
  // digits until they fit - rather than hide the end of them.
  const text = currency
    ? showSign
      ? `SAR ${amountOnly(Math.abs(amount))}`
      : money(amount)
    : amountOnly(showSign ? Math.abs(amount) : amount);
  const fontSize = fitFigure(text, sizes[size]);
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
        {text}
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
        {text}
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
  onPress,
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
  /**
   * Given one, the card opens up into whose hands the money is in. The
   * card on a person's own khata has no such question to answer, so it
   * passes nothing and stays a plain card.
   */
  onPress?: () => void;
}) {
  const owed = balance < 0;
  /*
   * Amber, not red.
   *
   * A man being owed ninety riyals is the ordinary end of a month, not
   * a fault - he paid for something out of his own pocket and will be
   * paid back. In red, under an alarm bell, it read as an accusation,
   * and the man it reads that way to is the one who did nothing wrong.
   * Amber says "this needs settling" without saying "this is broken".
   */
  const owedTone = colors.amber;
  // "Should be holding SAR 1,560" over a minus figure sends a person off to
  // count money that is not there. When it has gone the other way the card
  // has to say so in the heading, not in the small print.
  const heading = owed ? owedTitle : title;

  const body = (
    <>
      <View style={styles.cashTop}>
        <Txt variant="label" color={owed ? owedTone : colors.onDarkMuted} style={styles.upper}>
          {heading}
        </Txt>
        <View style={styles.cashTopRight}>
          {subtitle ? (
            <Txt variant="caption" color={colors.onDarkMuted}>
              {subtitle}
            </Txt>
          ) : null}
          {onPress ? (
            <Ionicons name="chevron-forward" size={16} color={colors.onDarkMuted} />
          ) : null}
        </View>
      </View>

      {/*
        adjustsFontSizeToFit is an iOS and Android prop; on the web, which
        is what the installed app actually runs, it does nothing. So the
        big figure is sized by the same rule as the small ones - a long
        balance steps down rather than losing its last digits.
      */}
      <Txt
        weight="bold"
        color={owed ? owedTone : colors.white}
        style={[styles.cashAmount, cashAmountSize(money(Math.abs(balance)))]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {money(Math.abs(balance))}
      </Txt>

      {owed ? (
        <View style={styles.owes}>
          <Ionicons name="arrow-undo" size={13} color={owedTone} />
          <Txt variant="caption" weight="semibold" color={owedTone}>
            {owedNote}
          </Txt>
        </View>
      ) : null}

      <View style={styles.cashRow}>
        <CashBit label="Given" value={given} tone={colors.green} />
        <CashBit label={spentLabel} value={spent} tone={colors.amber} />
        <CashBit label="Returned" value={returned} tone={colors.onDarkMuted} />
      </View>
    </>
  );

  if (!onPress) return <View style={[styles.cash, shadow.raised, style]}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${heading}, ${money(Math.abs(balance))}. Open to see whose hands it is in.`}
      style={({ pressed }) => [styles.cash, shadow.raised, style, pressed && styles.cashPressed]}
    >
      {body}
    </Pressable>
  );
}

/** The big balance, stepped down far enough that it cannot be cut. */
function cashAmountSize(text: string) {
  const fontSize = fitFigure(text, 38);
  return { fontSize, lineHeight: Math.round(fontSize * 1.26) };
}

/**
 * A figure must never be cut.
 *
 * "SAR 267,660.00" wanted 143 points in the 138 a half-width tile
 * gives it, so it came out as "SAR 267,660...." - a number with its
 * end missing, which is worse than a small number. Long figures step
 * down a size or two instead; short ones are left bold and big.
 */
export function fitFigure(text: string, big: number): number {
  if (text.length <= 12) return big;
  if (text.length <= 14) return Math.round(big * 0.88);
  if (text.length <= 16) return Math.round(big * 0.78);
  return Math.round(big * 0.68);
}

function CashBit({ label, value, tone }: { label: string; value: number; tone: string }) {
  const shown = amountOnly(value);
  return (
    <View style={styles.cashBit}>
      <Txt variant="caption" color={colors.onDarkMuted}>
        {label}
      </Txt>
      <Txt
        weight="semibold"
        color={tone}
        style={[styles.cashBitValue, { fontSize: fitFigure(shown, 17) }]}
        numberOfLines={1}
      >
        {shown}
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
  onPress,
}: {
  label: string;
  value: number;
  tone?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Given one, the figure opens up into who it belongs to. */
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={styles.figureTop}>
        {icon ? (
          <View style={[styles.figureIcon, { backgroundColor: `${tone}14` }]}>
            <Ionicons name={icon} size={16} color={tone} />
          </View>
        ) : null}
        {onPress ? (
          <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
        ) : null}
      </View>
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt
        weight="bold"
        color={tone}
        style={[styles.figureValue, { fontSize: fitFigure(money(value), 18) }]}
        numberOfLines={1}
      >
        {money(value)}
      </Txt>
    </>
  );

  if (!onPress) return <View style={[styles.figure, shadow.card]}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${money(value)}. Open to see whose it is.`}
      style={({ pressed }) => [styles.figure, shadow.card, pressed && styles.figurePressed]}
    >
      {body}
    </Pressable>
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
  cashTopRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cashPressed: { backgroundColor: colors.navyDeep },
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
  figurePressed: { backgroundColor: colors.navyTint, borderColor: colors.navyTint },
  figureTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
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
