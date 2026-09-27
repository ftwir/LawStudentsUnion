import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'core/theme/app_theme.dart';
import 'core/localization.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/presentation/login_screen.dart';

const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:8000');
void main() {
  final dio = Dio(BaseOptions(baseUrl: apiBaseUrl, connectTimeout: const Duration(seconds: 10), receiveTimeout: const Duration(seconds: 20), headers: {'Content-Type': 'application/json'}));
  runApp(LanguageScope(controller: LanguageController(), child: LawUnionApp(repository: AuthRepository(dio, const FlutterSecureStorage()))));
}
class LawUnionApp extends StatelessWidget {
  final AuthRepository repository;
  const LawUnionApp({super.key, required this.repository});
  @override Widget build(BuildContext context) {
    final lang = LanguageScope.of(context);
    return ValueListenableBuilder<Locale>(
      valueListenable: lang,
      builder: (context, locale, _) => MaterialApp(
        title: locale.languageCode == 'ar' ? 'اتحاد طلبة القانون' : 'Law Union',
        debugShowCheckedModeBanner: false,
        locale: locale,
        supportedLocales: const [Locale('en'), Locale('ar')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.dark,
        home: LoginScreen(repository: repository),
      ),
    );
  }
}