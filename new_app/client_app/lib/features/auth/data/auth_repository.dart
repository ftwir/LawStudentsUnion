import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
class AppUser{final String id,username,role;AppUser(this.id,this.username,this.role);}
class MfaRequiredException implements Exception{}
class AuthRepository{
 final Dio dio; final FlutterSecureStorage storage;
 AuthRepository(this.dio,this.storage);
 Future<AppUser> login(String username,String password,{String? otpToken}) async{
  try{
   final r=await dio.post('/api/auth/login/',data:{'username':username,'password':password,if(otpToken!=null)'otp_token':otpToken});
   await storage.write(key:'access_token',value:r.data['access']); await storage.write(key:'refresh_token',value:r.data['refresh']);
   return _me(r.data['access']);
  }on DioException catch(e){
   final d=e.response?.data;
   final text=d is Map ? ((d['code']??'').toString()+' '+(d['detail']??'').toString()) : (d?.toString()??'');
   if(text.contains('MFA')||text.contains('otp')||text.contains('TOTP'))throw MfaRequiredException();
   rethrow;
  }
 }
 Future<String?> accessToken()=>storage.read(key:'access_token');
 Future<void> logout()=>storage.deleteAll();
 Future<AppUser?> currentUser()async{final t=await accessToken();if(t==null)return null;try{return _me(t);}catch(_){return null;}}
 Future<AppUser> _me(String token)async{final r=await dio.get('/api/users/me/',options:Options(headers:{'Authorization':'Bearer $token'}));return AppUser(r.data['id'].toString(),r.data['username'].toString(),r.data['role'].toString());}
}
