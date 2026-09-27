import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AdminApi{
 final Dio dio; final FlutterSecureStorage storage;
 AdminApi(String baseUrl):dio=Dio(BaseOptions(baseUrl:baseUrl,connectTimeout:const Duration(seconds:10),receiveTimeout:const Duration(seconds:20))),storage=const FlutterSecureStorage(){
  dio.interceptors.add(InterceptorsWrapper(onRequest:(o,h)async{final t=await storage.read(key:'admin_access');if(t!=null)o.headers['Authorization']='Bearer '+t;h.next(o);}));
 }
 Future<bool> login(String username,String password,{String? otp})async{
  try{final r=await dio.post('/api/auth/login/',data:{'username':username,'password':password,if(otp!=null)'otp_token':otp});await storage.write(key:'admin_access',value:r.data['access']);return true;}
  on DioException catch(e){final d=e.response?.data;final text=d is Map?((d['code']??'').toString()+' '+(d['detail']??'').toString()):d?.toString()??'';if(text.contains('MFA')||text.contains('TOTP')||text.contains('otp'))throw MfaNeeded();return false;}
 }
 Future<bool> hasSession()async=>await storage.read(key:'admin_access')!=null;
 Future<void> logout()=>storage.delete(key:'admin_access');
 Future<List> users()async=>(await dio.get('/api/admin/users/')).data;
 Future<List> membership()async=>(await dio.get('/api/membership-requests/')).data;
 Future<void> membershipDecision(String id,String status)async{await dio.patch('/api/membership-requests/'+id+'/',data:{'status':status});}
 Future<void> changeRole(String id,String role)async{await dio.patch('/api/admin/users/'+id+'/',data:{'role':role});}
 Future<List> permissions()async=>(await dio.get('/api/admin/permissions/')).data;
 Future<void> setPermission(String id,String node,bool value)async{await dio.patch('/api/admin/permissions/'+id+'/',data:{node:value});}
 Future<List> hubs()async=>(await dio.get('/api/subhubs/')).data;
 Future<void> createHub(String name,String description,String iconUrl)async{await dio.post('/api/subhubs/',data:{'name':name,'description':description,'icon_url':iconUrl});}
 Future<List> audit()async=>(await dio.get('/api/admin/audit-log/')).data;
 Future<String> mfaSetup()async=>(await dio.post('/api/auth/mfa/setup/')).data['otpauth_url'];
 Future<void> mfaConfirm(String code)async{await dio.post('/api/auth/mfa/confirm/',data:{'otp_token':code});}
 Future<String> bootstrapMfa(String token,String username,String password)async=>(await dio.post('/api/auth/mfa/bootstrap/',data:{'bootstrap_token':token,'username':username,'password':password})).data['otpauth_url'];
 Future<void> bootstrapConfirm(String token,String username,String password,String code)async{await dio.post('/api/auth/mfa/bootstrap/confirm/',data:{'bootstrap_token':token,'username':username,'password':password,'otp_token':code});}
}
class MfaNeeded implements Exception{}
