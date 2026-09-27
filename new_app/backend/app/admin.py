from django.contrib import admin
from .models import (
    CustomUser, AdminPermission, SubHub, Post, Comment,
    ChatRoom, Message, MembershipRequest, AuditLog,
)

admin.site.register(CustomUser)
admin.site.register(AdminPermission)
admin.site.register(SubHub)
admin.site.register(Post)
admin.site.register(Comment)
admin.site.register(ChatRoom)
admin.site.register(Message)
admin.site.register(MembershipRequest)
admin.site.register(AuditLog)