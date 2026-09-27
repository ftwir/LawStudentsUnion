import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AppUser {
  final String id, username, role;
  AppUser(this.id, this.username, this.role);
}
class AuthFailedException implements Exception {
  final String message;
  AuthFailedException(this.message);
}
class AuthRepository {
  final Dio dio;
  final FlutterSecureStorage storage;
  AuthRepository(this.dio, this.storage);

  Future<AppUser> login(String username, String password) async {
    try {
      final r = await dio.post('/api/auth/login/', data: {'username': username, 'password': password});
      final access = r.data is Map ? r.data['access'] : null;
      final refresh = r.data is Map ? r.data['refresh'] : null;
      if (access == null || refresh == null) throw AuthFailedException('The server did not return a valid session.');
      await storage.write(key: 'access_token', value: access.toString());
      await storage.write(key: 'refresh_token', value: refresh.toString());
      return _me(access.toString());
    } on DioException catch (e) {
      throw AuthFailedException(_message(e.response?.data));
    }
  }
  String _message(dynamic data) {
    if (data is Map) {
      if (data['detail'] != null) return _flatten(data['detail']);
      if (data['non_field_errors'] != null) return _flatten(data['non_field_errors']);
      return 'Authentication failed.';
    }
    final text = data?.toString() ?? '';
    return text.trim().isNotEmpty ? text : 'Authentication failed.';
  }
  String _flatten(dynamic value) {
    if (value is List) return value.map(_flatten).join(' ');
    if (value is Map) return value.values.map(_flatten).join(' ');
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
