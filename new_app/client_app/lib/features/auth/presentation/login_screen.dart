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
  final username = TextEditingController();
  final password = TextEditingController();
  final otp = TextEditingController();
  bool mfa = false, busy = false;
  String? error;

  Future<void> submit() async {
    setState(() { busy = true; error = null; });
    try {
      final u = await widget.repository.login(
        username.text.trim(), password.text, otpToken: mfa ? otp.text.trim() : null,
      );
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(
        builder: (_) => HomeScreen(user: u, repository: widget.repository),
      ));
    } on MfaEnrollmentRequiredException {
      setState(() => error = L10n.t(context, 'mfaEnroll'));
    } on MfaRequiredException {
      setState(() => mfa = true);
    } catch (_) {
      setState(() => error = L10n.t(context, 'invalid'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(children: [
        Container(color: AppColors.bgPrimary),
        Positioned(
          top: 45, right: 20,
          child: TextButton(
            onPressed: LanguageScope.of(context).toggle,
            child: Text(L10n.t(context, 'language')),
          ),
        ),
        Center(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
              child: Container(
                width: 340,
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: AppColors.bgElevated.withOpacity(.55),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: AppColors.borderGlow),
                ),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.balance, size: 54, color: AppColors.accentPrimary),
                  const SizedBox(height: 12),
                  Text(L10n.t(context, 'app'), style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 24),
                  TextField(controller: username, decoration: InputDecoration(labelText: L10n.t(context, 'username'))),
                  const SizedBox(height: 12),
                  TextField(controller: password, obscureText: true, decoration: InputDecoration(labelText: L10n.t(context, 'password'))),
                  if (mfa) ...[
                    const SizedBox(height: 12),
                    TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 6,
                      decoration: InputDecoration(labelText: L10n.t(context, 'mfa'))),
                  ],
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text(error!, textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.redAccent)),
                    ),
                  const SizedBox(height: 20),
                  SizedBox(width: double.infinity,
                    child: ElevatedButton(
                      onPressed: busy ? null : submit,
                      child: Text(busy ? L10n.t(context, 'signing') : L10n.t(context, 'signIn')),
                    ),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  @override void dispose() {
    username.dispose(); password.dispose(); otp.dispose(); super.dispose();
  }
}