import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AdminApi {
  final Dio dio;
  final FlutterSecureStorage storage;
  AdminApi(String baseUrl) : dio = Dio(BaseOptions(baseUrl: baseUrl, connectTimeout: const Duration(seconds: 15), receiveTimeout: const Duration(seconds: 30), headers: {'Content-Type': 'application/json'})), storage = const FlutterSecureStorage() {
    dio.interceptors.add(InterceptorsWrapper(onRequest: (o,h) async {
      final token = await storage.read(key: 'admin_access');
      if (token != null && token.isNotEmpty) o.headers['Authorization'] = 'Bearer $token';
      h.next(o);
    }));
  }
  Future<void> login(String username, String password) async {
    try {
      final r = await dio.post('/api/auth/login/', data: {'username': username, 'password': password});
      final access = r.data is Map ? r.data['access'] : null;
      if (access == null || access.toString().isEmpty) throw AuthFailed('Server did not return an access token.');
      await storage.write(key: 'admin_access', value: access.toString());
    } on DioException catch (e) {
      final d = e.response?.data;
      final detail = d is Map ? (d['detail'] ?? d['non_field_errors'] ?? 'Authentication failed.') : (d?.toString() ?? 'Unable to reach the authentication server.');
      throw AuthFailed(detail is List ? detail.join(' ') : detail.toString());
    }
  }
  Future<bool> hasSession() async => await storage.read(key: 'admin_access') != null;
  Future<void> logout() => storage.delete(key: 'admin_access');
  Future<List> users() async => (await dio.get('/api/admin/users/')).data;
  Future<List> membership() async => (await dio.get('/api/membership-requests/')).data;
  Future<void> membershipDecision(String id, String status) async => await dio.patch('/api/membership-requests/$id/', data: {'status': status});
  Future<void> changeRole(String id, String role) async => await dio.patch('/api/admin/users/$id/', data: {'role': role});
  Future<List> permissions() async => (await dio.get('/api/admin/permissions/')).data;
  Future<void> setPermission(String id, String node, bool value) async => await dio.patch('/api/admin/permissions/$id/', data: {node: value});
  Future<List> hubs() async => (await dio.get('/api/subhubs/')).data;
  Future<void> createHub(String name, String description, String iconUrl) async => await dio.post('/api/subhubs/', data: {'name': name, 'description': description, 'icon_url': iconUrl});
  Future<List> audit() async => (await dio.get('/api/admin/audit-log/')).data;
  Future<String> mfaSetup() async => (await dio.post('/api/auth/mfa/setup/')).data['otpauth_url'];
  Future<void> mfaConfirm(String code) async => await dio.post('/api/auth/mfa/confirm/', data: {'otp_token': code});
}
class AuthFailed implements Exception { final String message; AuthFailed(this.message); }
final adminApi = AdminApi(const String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:8000'));
