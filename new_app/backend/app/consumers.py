import json
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from .models import ChatRoom, Message
ALLOWED_KINDS={"poll","quiz","trivia","flashcard"}
class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id=self.scope["url_route"]["kwargs"]["room_name"]; self.group_name=f"chat_{self.room_id}"
        user=self.scope["user"]
        if not user.is_authenticated or not await self.user_in_room(user,self.room_id): await self.close(code=4001); return
        await self.channel_layer.group_add(self.group_name,self.channel_name); await self.accept()
    async def disconnect(self,close_code):
        if hasattr(self,"group_name"): await self.channel_layer.group_discard(self.group_name,self.channel_name)
    async def receive(self,text_data):
        try: payload=json.loads(text_data)
        except json.JSONDecodeError: return
        user=self.scope["user"]; kind=payload.get("type")
        if kind=="chat.message":
            text=str(payload.get("text","")).strip()
            if text and len(text)<=4000: await self.broadcast(await self.save_message(user,self.room_id,text=text))
        elif kind=="interactive.create":
            k=payload.get("kind")
            if k in ALLOWED_KINDS: await self.broadcast(await self.save_message(user,self.room_id,interactive_payload={"kind":k,"data":payload.get("data") or {},"responses":[]}))
        elif kind=="interactive.response":
            updated=await self.append_interactive_response(payload.get("message_id"),user,payload.get("response"))
            if updated: await self.broadcast(updated)
    async def broadcast(self,message): await self.channel_layer.group_send(self.group_name,{"type":"chat.echo","message":message})
    async def chat_echo(self,event): await self.send(text_data=json.dumps(event["message"]))
    @database_sync_to_async
    def user_in_room(self,user,room_id): return ChatRoom.objects.filter(id=room_id,members=user).exists()
    @database_sync_to_async
    def save_message(self,user,room_id,text="",interactive_payload=None):
        msg=Message.objects.create(room_id=room_id,sender=user,message_text=text,interactive_payload=interactive_payload)
        return {"type":"chat.message","id":str(msg.id),"sender":user.username,"text":msg.message_text,"interactive_payload":msg.interactive_payload,"timestamp":msg.timestamp.isoformat()}
    @database_sync_to_async
    def append_interactive_response(self,message_id,user,response):
        try: msg=Message.objects.get(id=message_id,room__members=user)
        except Message.DoesNotExist: return None
        payload=msg.interactive_payload or {"responses":[]}; responses=payload.setdefault("responses",[])
        responses[:]=[r for r in responses if r.get("user_id")!=str(user.id)]; responses.append({"user_id":str(user.id),"user":user.username,"response":response})
        msg.interactive_payload=payload; msg.save(update_fields=["interactive_payload"])
        return {"type":"interactive.update","id":str(msg.id),"interactive_payload":payload}
