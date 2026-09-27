import 'package:flutter/material.dart';
import '../data/auth_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/localization.dart';
import '../../home/home_screen.dart';

class LoginScreen extends StatefulWidget {
  final AuthRepository repository;

  const LoginScreen({super.key, required this.repository});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final username = TextEditingController();
  final password = TextEditingController();

  bool busy = false;
  String? error;

  Future<void> submit() async {
    FocusManager.instance.primaryFocus?.unfocus();

    setState(() {
      busy = true;
      error = null;
    });

    try {
      final user = await widget.repository.login(
        username.text.trim(),
        password.text,
      );

      if (!mounted) return;

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => HomeScreen(
            user: user,
            repository: widget.repository,
          ),
        ),
      );
    } on AuthFailedException catch (e) {
      if (mounted) setState(() => error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => error = L10n.t(context, 'serverError'));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final language = LanguageScope.of(context);
    final isArabic = language.isArabic;

    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                color: AppColors.bgElevated,
                elevation: 12,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              isArabic ? 'العربية' : 'English',
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          OutlinedButton.icon(
                            onPressed: busy
                                ? null
                                : () => language.setLanguage(
                                      isArabic ? 'en' : 'ar',
                                    ),
                            icon: const Icon(Icons.language),
                            label: Text(
                              isArabic ? 'English' : 'العربية',
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      const Icon(
                        Icons.balance,
                        size: 58,
                        color: AppColors.accentPrimary,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        L10n.t(context, 'app'),
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        L10n.t(context, 'subtitle'),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 26),
                      TextField(
                        controller: username,
                        textInputAction: TextInputAction.next,
                        textDirection: isArabic
                            ? TextDirection.rtl
                            : TextDirection.ltr,
                        decoration: InputDecoration(
                          labelText: L10n.t(context, 'username'),
                          prefixIcon: const Icon(Icons.person_outline),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: password,
                        obscureText: true,
                        textInputAction: TextInputAction.done,
                        onSubmitted: (_) {
                          if (!busy) submit();
                        },
                        decoration: InputDecoration(
                          labelText: L10n.t(context, 'password'),
                          prefixIcon: const Icon(Icons.lock_outline),
                        ),
                      ),
                      if (error != null) ...[
                        const SizedBox(height: 14),
                        Text(
                          error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.redAccent),
                        ),
                      ],
                      const SizedBox(height: 22),
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: busy ? null : submit,
                          child: Text(
                            busy
                                ? L10n.t(context, 'signing')
                                : L10n.t(context, 'signIn'),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    username.dispose();
    password.dispose();
    super.dispose();
  }
}
