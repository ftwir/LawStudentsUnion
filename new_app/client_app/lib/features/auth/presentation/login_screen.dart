import 'dart:ui';
import 'package:flutter/material.dart';
import '../data/auth_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/localization.dart';
import '../../home/home_screen.dart';

class LoginScreen extends StatefulWidget {
  final AuthRepository repository;
  const LoginScreen({super.key, required this.repository});
  @override State<LoginScreen> createState() => _LoginScreenState();
}
class _LoginScreenState extends State<LoginScreen> {
  final username = TextEditingController(), password = TextEditingController(), otp = TextEditingController();
  bool mfa = false, busy = false;
  String? error;

  String tr(String en, String ar) => LanguageScope.of(context).isArabic ? ar : en;

  Future<void> submit() async {
    setState(() { busy = true; error = null; });
    try {
      final u = await widget.repository.login(username.text.trim(), password.text, otpToken: mfa ? otp.text.trim() : null);
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => HomeScreen(user: u, repository: widget.repository)));
    } on MfaEnrollmentRequiredException {
      setState(() => error = tr('Agent MFA is not enrolled yet. Open the Admin App and complete first-time enrollment.', 'لم يتم إعداد MFA للوكيل بعد. افتح تطبيق الإدارة وأكمل الإعداد الأولي.'));
    } on MfaRequiredException {
      setState(() { mfa = true; error = tr('Enter the 6-digit code from your authenticator app.', 'أدخل رمز التحقق المكوّن من 6 أرقام من تطبيق المصادقة.'); });
    } on AuthFailedException catch (e) {
      setState(() => error = e.message);
    } catch (_) {
      setState(() => error = tr('Unable to contact the server. Check your connection and try again.', 'تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override Widget build(BuildContext context) {
    final isAr = LanguageScope.of(context).isArabic;
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        body: Stack(children: [
          Container(color: AppColors.bgPrimary),
          Positioned(
            top: 45, left: isAr ? 20 : null, right: isAr ? null : 20,
            child: TextButton.icon(
              onPressed: LanguageScope.of(context).toggle,
              icon: const Icon(Icons.language),
              label: Text(L10n.t(context, 'language')),
            ),
          ),
          Center(child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
              child: Container(
                width: 340, padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(color: AppColors.bgElevated.withOpacity(.55), borderRadius: BorderRadius.circular(24), border: Border.all(color: AppColors.borderGlow)),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.balance, size: 54, color: AppColors.accentPrimary),
                  const SizedBox(height: 12),
                  Text(L10n.t(context, 'app'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 24),
                  TextField(controller: username, textDirection: isAr ? TextDirection.rtl : TextDirection.ltr, decoration: InputDecoration(labelText: L10n.t(context, 'username'), prefixIcon: const Icon(Icons.person_outline))),
                  const SizedBox(height: 12),
                  TextField(controller: password, obscureText: true, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: L10n.t(context, 'password'), prefixIcon: const Icon(Icons.lock_outline))),
                  if (mfa) ...[
                    const SizedBox(height: 12),
                    TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 6, textAlign: TextAlign.center, decoration: InputDecoration(labelText: L10n.t(context, 'mfa'))),
                  ],
                  if (error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.redAccent))),
                  const SizedBox(height: 20),
                  SizedBox(width: double.infinity, child: ElevatedButton(onPressed: busy ? null : submit, child: Text(busy ? L10n.t(context, 'signing') : L10n.t(context, 'signIn')))),
                ]),
              ),
            ),
          )),
        ]),
      ),
    );
  }
  @override void dispose() { username.dispose(); password.dispose(); otp.dispose(); super.dispose(); }
}