import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AppUser {
  final String id, username, role;
  AppUser(this.id, this.username, this.role);
}
class MfaRequiredException implements Exception {}
class MfaEnrollmentRequiredException implements Exception {}
class AuthFailedException implements Exception {
  final String message;
  AuthFailedException(this.message);
}

class AuthRepository {
  final Dio dio;
  final FlutterSecureStorage storage;
  AuthRepository(this.dio, this.storage);

  Future<AppUser> login(String username, String password, {String? otpToken}) async {
    try {
      final r = await dio.post('/api/auth/login/', data: {
        'username': username,
        'password': password,
        if (otpToken != null && otpToken.isNotEmpty) 'otp_token': otpToken,
      });
      final access = r.data is Map ? r.data['access'] : null;
      final refresh = r.data is Map ? r.data['refresh'] : null;
      if (access == null || refresh == null) {
        throw AuthFailedException('The server did not return a valid session.');
      }
      await storage.write(key: 'access_token', value: access.toString());
      await storage.write(key: 'refresh_token', value: refresh.toString());
      return _me(access.toString());
    } on DioException catch (e) {
      final d = e.response?.data;
      final message = _message(d);
      final upper = message.toUpperCase();
      if (upper.contains('MFA') || upper.contains('TOTP') || upper.contains('OTP')) {
        if (upper.contains('NOT CONFIGURED') || upper.contains('NOT ENROLLED')) {
          throw MfaEnrollmentRequiredException();
        }
        throw MfaRequiredException();
      }
      throw AuthFailedException(message);
    }
  }

  String _message(dynamic data) {
    if (data is Map) {
      final code = data['code']?.toString();
      if (code == 'MFA_ENROLLMENT_REQUIRED') return 'MFA enrollment is required for this Agent account.';
      if (code == 'MFA_REQUIRED') return 'A valid MFA code is required.';
      final detail = data['detail'];
      if (detail != null) return _flatten(detail);
      final errors = data['non_field_errors'];
      if (errors != null) return _flatten(errors);
      return data.entries.map((entry) => entry.key.toString() + ': ' + _flatten(entry.value)).join('\\n');
    }
    final text = data?.toString() ?? '';
    return text.trim().isNotEmpty ? text : 'Authentication failed.';
  }

  String _flatten(dynamic value) {
    if (value is List) return value.map(_flatten).join(' ');
    if (value is Map) return value.entries.map((entry) => entry.key.toString() + ': ' + _flatten(entry.value)).join(' ');
    return value?.toString() ?? '';
  }

  Future<String?> accessToken() => storage.read(key: 'access_token');
  Future<void> logout() => storage.deleteAll();
  Future<AppUser?> currentUser() async {
    final t = await accessToken();
    if (t == null) return null;
    try { return _me(t); } catch (_) { return null; }
  }
  Future<AppUser> _me(String token) async {
    final r = await dio.get('/api/users/me/', options: Options(headers: {'Authorization': 'Bearer $token'}));
    return AppUser(r.data['id'].toString(), r.data['username'].toString(), r.data['role'].toString());
  }
}