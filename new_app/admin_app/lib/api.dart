import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AdminApi {
  final Dio dio;
  final FlutterSecureStorage storage;
  AdminApi(String baseUrl)
      : dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 30),
          headers: {'Content-Type': 'application/json'},
        )),
        storage = const FlutterSecureStorage() {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (o, h) async {
        final token = await storage.read(key: 'admin_access');
        if (token != null && token.isNotEmpty) {
          o.headers['Authorization'] = 'Bearer $token';
        }
        h.next(o);
      },
    ));
  }

  Future<void> login(String username, String password, {String? otp}) async {
    try {
      final response = await dio.post(
        '/api/auth/login/',
        data: {
          'username': username,
          'password': password,
          if (otp != null && otp.isNotEmpty) 'otp_token': otp,
        },
      );
      final access = response.data is Map ? response.data['access'] : null;
      if (access == null || access.toString().isEmpty) {
        throw AuthFailed('Server did not return an access token.');
      }
      await storage.write(key: 'admin_access', value: access.toString());
    } on DioException catch (e) {
      final data = e.response?.data;
      final detail = data is Map
          ? (data['detail'] ?? data['code'] ?? data['non_field_errors'] ?? 'Authentication failed.')
          : (data?.toString() ?? 'Unable to reach the authentication server.');
      final message = detail is List ? detail.join(' ') : detail.toString();
      if (message.toUpperCase().contains('MFA') ||
          message.toUpperCase().contains('TOTP') ||
          message.toUpperCase().contains('OTP')) {
        throw MfaNeeded();
      }
      throw AuthFailed(message);
    }
  }

  Future<bool> hasSession() async => await storage.read(key: 'admin_access') != null;
  Future<void> logout() => storage.delete(key: 'admin_access');
  Future<List> users() async => (await dio.get('/api/admin/users/')).data;
  Future<List> membership() async => (await dio.get('/api/membership-requests/')).data;
  Future<void> membershipDecision(String id, String status) async {
    await dio.patch('/api/membership-requests/$id/', data: {'status': status});
  }
  Future<void> changeRole(String id, String role) async {
    await dio.patch('/api/admin/users/$id/', data: {'role': role});
  }
  Future<List> permissions() async => (await dio.get('/api/admin/permissions/')).data;
  Future<void> setPermission(String id, String node, bool value) async {
    await dio.patch('/api/admin/permissions/$id/', data: {node: value});
  }
  Future<List> hubs() async => (await dio.get('/api/subhubs/')).data;
  Future<void> createHub(String name, String description, String iconUrl) async {
    await dio.post('/api/subhubs/', data: {
      'name': name,
      'description': description,
      'icon_url': iconUrl,
    });
  }
  Future<List> audit() async => (await dio.get('/api/admin/audit-log/')).data;
  Future<String> mfaSetup() async => (await dio.post('/api/auth/mfa/setup/')).data['otpauth_url'];
  Future<void> mfaConfirm(String code) async {
    await dio.post('/api/auth/mfa/confirm/', data: {'otp_token': code});
  }
  Future<String> bootstrapMfa(String token, String username, String password) async =>
      (await dio.post('/api/auth/mfa/bootstrap/', data: {
        'bootstrap_token': token,
        'username': username,
        'password': password,
      })).data['otpauth_url'];
  Future<void> bootstrapConfirm(String token, String username, String password, String code) async {
    await dio.post('/api/auth/mfa/bootstrap/confirm/', data: {
      'bootstrap_token': token,
      'username': username,
      'password': password,
      'otp_token': code,
    });
  }
}

class MfaNeeded implements Exception {}
class AuthFailed implements Exception {
  final String message;
  AuthFailed(this.message);
}

final adminApi = AdminApi(
  const String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  ),
);
