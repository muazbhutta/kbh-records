import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Txt } from '@/components/Txt';
import { colors, fonts, radius } from '@/theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  prefix?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  secret?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'next' | 'go';
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  helper,
  error,
  icon,
  prefix,
  keyboardType,
  maxLength,
  autoCapitalize = 'sentences',
  secret = false,
  editable = true,
  autoFocus,
  onSubmitEditing,
  returnKeyType,
  style,
  inputStyle,
  testID,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secret);

  return (
    <View style={[styles.wrap, style]}>
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>

      <View
        style={[
          styles.box,
          focused && styles.boxFocused,
          !!error && styles.boxError,
          !editable && styles.boxDisabled,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={19}
            color={focused ? colors.navy : colors.textFaint}
            style={styles.icon}
          />
        ) : null}

        {prefix ? (
          <Txt variant="subtitle" color={colors.textMuted} style={styles.prefix}>
            {prefix}
          </Txt>
        ) : null}

        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          secureTextEntry={hidden}
          editable={editable}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, noOutline, inputStyle]}
        />

        {secret ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show' : 'Hide'}
            style={styles.eye}
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={19}
              color={colors.textFaint}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Txt variant="caption" color={colors.red}>
          {error}
        </Txt>
      ) : helper ? (
        <Txt variant="caption" color={colors.textFaint}>
          {helper}
        </Txt>
      ) : null}
    </View>
  );
}

/** A row of choices that behaves like radio buttons but looks like chips. */
export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  helper,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap; hint?: string }[];
  onChange: (v: T) => void;
  helper?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>
      <View style={styles.choices}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.choice,
                active && styles.choiceActive,
                pressed && !active && styles.choicePressed,
              ]}
            >
              {opt.icon ? (
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={active ? colors.white : colors.navy}
                />
              ) : null}
              <View style={styles.choiceText}>
                <Txt
                  variant="subtitle"
                  weight="semibold"
                  color={active ? colors.white : colors.navy}
                >
                  {opt.label}
                </Txt>
                {opt.hint ? (
                  <Txt
                    variant="caption"
                    color={active ? colors.onDarkMuted : colors.textFaint}
                  >
                    {opt.hint}
                  </Txt>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {helper ? (
        <Txt variant="caption" color={colors.textFaint}>
          {helper}
        </Txt>
      ) : null}
    </View>
  );
}

/** react-native-web draws a focus ring we replace with our own border. */
const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
  },
  boxFocused: { borderColor: colors.navy, backgroundColor: colors.white },
  boxError: { borderColor: colors.red, backgroundColor: colors.redSoft },
  boxDisabled: { backgroundColor: '#F2F5F9' },
  icon: { marginRight: 9 },
  prefix: { marginRight: 6 },
  eye: { paddingLeft: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontFamily: fonts.medium,
    color: colors.text,
    paddingVertical: 12,
  },
  choices: { gap: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  choiceActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  choicePressed: { backgroundColor: colors.navyTint },
  choiceText: { flex: 1 },
});
