import React from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts } from '@/theme';

type Variant =
  | 'display'   // the one huge money number
  | 'title'     // screen title
  | 'heading'   // card heading
  | 'subtitle'
  | 'body'
  | 'label'     // small caps-ish label above a value
  | 'caption';

type Props = TextProps & {
  variant?: Variant;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  color?: string;
  center?: boolean;
  children?: React.ReactNode;
};

const base: Record<Variant, TextStyle> = {
  display: { fontSize: 38, lineHeight: 46, fontFamily: fonts.bold, letterSpacing: -0.8 },
  title: { fontSize: 24, lineHeight: 31, fontFamily: fonts.bold, letterSpacing: -0.4 },
  heading: { fontSize: 17, lineHeight: 23, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  subtitle: { fontSize: 15, lineHeight: 22, fontFamily: fonts.medium },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  label: { fontSize: 12, lineHeight: 16, fontFamily: fonts.semibold, letterSpacing: 0.5 },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
};

const weights = {
  regular: fonts.regular,
  medium: fonts.medium,
  semibold: fonts.semibold,
  bold: fonts.bold,
} as const;

export function Txt({
  variant = 'body',
  weight,
  color,
  center,
  style,
  children,
  ...rest
}: Props) {
  return (
    <Text
      {...rest}
      style={[
        base[variant],
        { color: color ?? colors.text },
        weight ? { fontFamily: weights[weight] } : null,
        center ? styles.center : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
