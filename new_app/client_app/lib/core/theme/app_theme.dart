import 'package:flutter/material.dart';

class AppColors {
  static const bgPrimary = Color(0xFF000000);
  static const bgElevated = Color(0xFF0D0B14);
  static const accentPrimary = Color(0xFF8B5CF6);
  static const accentGlow = Color(0xFFA78BFA);
  static const textPrimary = Color(0xFFFFFFFF);
  static const textSecondary = Color(0xFFB4AFC7);
  static const borderGlow = Color(0x338B5CF6);
}

class AppTheme {
  static ThemeData get dark => ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.bgPrimary,
    primaryColor: AppColors.accentPrimary,
    colorScheme: const ColorScheme.dark(
      primary: AppColors.accentPrimary,
      secondary: AppColors.accentGlow,
      surface: AppColors.bgElevated,
    ),
    fontFamily: 'Sora',
    textTheme: const TextTheme(
      headlineMedium: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700, letterSpacing: 0.5),
      bodyMedium: TextStyle(color: AppColors.textSecondary),
    ),
    cardTheme: CardThemeData(
      color: AppColors.bgElevated,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
        side: BorderSide(color: AppColors.borderGlow, width: 1),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ButtonStyle(
        backgroundColor: WidgetStatePropertyAll(AppColors.accentPrimary),
        foregroundColor: WidgetStatePropertyAll(Colors.white),
        shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(12)))),
        padding: WidgetStatePropertyAll(EdgeInsets.symmetric(vertical: 14, horizontal: 24)),
      ),
    ),
  );
}
