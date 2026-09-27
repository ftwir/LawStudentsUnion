import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AppUser {
  final String id;
  final String username;
  final String role;

  AppUser(this.id, this.username, this.role);
}

class AuthFailedException implements Exception {
  final String message;
  AuthFailedException(this.message);
}

class AuthRepository {
  final Dio dio;
  final FlutterSecureStorage storage;

  AuthRepository(this.dio, this.storage) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final path = options.path;
          final publicAuthEndpoint =
              path == '/api/auth/login/' ||
              path == '/api/auth/register/' ||
              path == '/api/auth/refresh/' ||
              path.startsWith('/api/auth/mfa/');

          if (!publicAuthEndpoint) {
            final token = await storage.read(key: 'access_token');
            if (token != null && token.isNotEmpty) {
              options.headers['Authorization'] = 'Bearer $token';
            }
          }

          handler.next(options);
        },
      ),
    );
  }

  Future<AppUser> login(String username, String password) async {
    try {
      final response = await dio.post(
        '/api/auth/login/',
        data: {'username': username, 'password': password},
      );

      final data = response.data;
      final access = data is Map ? data['access'] : null;
      final refresh = data is Map ? data['refresh'] : null;

      if (access == null || refresh == null) {
        throw AuthFailedException(
          'The server did not return a valid session.',
        );
      }

      await storage.write(key: 'access_token', value: access.toString());
      await storage.write(key: 'refresh_token', value: refresh.toString());

      return await _me(access.toString());
    } on AuthFailedException {
      rethrow;
    } on DioException catch (e) {
      throw AuthFailedException(_message(e.response?.data));
    }
  }

  String _message(dynamic data) {
    if (data is Map) {
      if (data['detail'] != null) return _flatten(data['detail']);
      if (data['non_field_errors'] != null) {
        return _flatten(data['non_field_errors']);
      }
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
    final token = await accessToken();
    if (token == null || token.isEmpty) return null;

    try {
      return await _me(token);
    } catch (_) {
      return null;
    }
  }

  Future<AppUser> _me(String token) async {
    final response = await dio.get(
      '/api/users/me/',
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );

    final data = response.data as Map;
    return AppUser(
      data['id'].toString(),
      data['username'].toString(),
      data['role'].toString(),
    );
  }
}
