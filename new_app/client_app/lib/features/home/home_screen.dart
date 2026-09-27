import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../core/theme/app_theme.dart';
import '../auth/data/auth_repository.dart';
import '../auth/presentation/login_screen.dart';
import '../chat/presentation/chat_screen.dart';
import '../../main.dart';

class HomeScreen extends StatefulWidget{
  final AppUser user; final AuthRepository repository;
  const HomeScreen({super.key,required this.user,required this.repository});
  @override State<HomeScreen> createState()=>_HomeScreenState();
}
class _HomeScreenState extends State<HomeScreen>{
  List hubs=[]; List posts=[]; List rooms=[]; bool loading=true; String? error;
  final postController=TextEditingController(); final roomController=TextEditingController();
  @override void initState(){super.initState();refresh();}
  Future<void> refresh() async{
    setState(()=>loading=true);
    try{
      final h=await widget.repository.dio.get('/api/subhubs/');
      final p=await widget.repository.dio.get('/api/posts/');
      final r=await widget.repository.dio.get('/api/chat-rooms/');
      if(mounted)setState((){hubs=List.from(h.data);posts=List.from(p.data);rooms=List.from(r.data);error=null;});
    }catch(_){if(mounted)setState(()=>error='Unable to load community data.');}
    if(mounted)setState(()=>loading=false);
  }
  Future<void> createPost() async{
    final text=postController.text.trim(); if(text.isEmpty)return;
    if(hubs.isEmpty){setState(()=>error='Create or join a community hub first.');return;}
    try{await widget.repository.dio.post('/api/posts/',data:{'subhub':hubs.first['id'],'content':text,'is_public':false});postController.clear();await refresh();}
    catch(_){setState(()=>error='Post could not be published.');}
  }
  Future<void> createRoom() async{
    final name=roomController.text.trim(); if(name.isEmpty)return;
    try{await widget.repository.dio.post('/api/chat-rooms/',data:{'name':name,'room_type':'GROUP'});roomController.clear();await refresh();}
    catch(_){setState(()=>error='Room could not be created.');}
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Law Union'),actions:[IconButton(onPressed:refresh,icon:const Icon(Icons.refresh)),IconButton(onPressed:()=>widget.repository.logout().then((_)=>Navigator.pushAndRemoveUntil(context,MaterialPageRoute(builder:(_)=>LoginScreen(repository:widget.repository)),(_)=>false)),icon:const Icon(Icons.logout))]),
    body:loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:refresh,child:ListView(padding:const EdgeInsets.all(16),children:[
      Text('Communities',style:Theme.of(context).textTheme.headlineSmall),const SizedBox(height:8),
      SizedBox(height:90,child:ListView(scrollDirection:Axis.horizontal,children:hubs.map((h)=>Padding(padding:const EdgeInsets.only(right:8),child:Chip(label:Text(h['name']??'')))).toList())),
      const SizedBox(height:8),TextField(controller:postController,maxLines:3,decoration:const InputDecoration(labelText:'Share with the union')),const SizedBox(height:8),
      ElevatedButton(onPressed:createPost,child:const Text('Publish Post')),const SizedBox(height:20),
      if(error!=null)Text(error!,style:const TextStyle(color:Colors.redAccent)),
      ...posts.map((p)=>Card(child:Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(p['author_username']??'Member',style:const TextStyle(fontWeight:FontWeight.bold)),const SizedBox(height:6),Text(p['content']??''),const SizedBox(height:6),Text(p['created_at']??'',style:const TextStyle(color:AppColors.textSecondary,fontSize:11))])))),
      const SizedBox(height:20),Text('Chat Rooms',style:Theme.of(context).textTheme.headlineSmall),const SizedBox(height:8),
      TextField(controller:roomController,decoration:const InputDecoration(labelText:'New group room')),const SizedBox(height:8),OutlinedButton(onPressed:createRoom,child:const Text('Create Room')),
      ...rooms.map((r)=>ListTile(leading:const Icon(Icons.forum,color:AppColors.accentPrimary),title:Text(r['name']??''),onTap:() async{
        final token=await widget.repository.accessToken(); if(token==null)return;
        if(!mounted)return;
        Navigator.push(context,MaterialPageRoute(builder:(_)=>ChatScreen(roomId:r['id'],wsBaseUrl:apiBaseUrl.replaceFirst('http','ws'),accessToken:token)));
      }))
    ]))
  );
}
