from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import AdminPermission, SubHub, Post, Comment, ChatRoom, Message, MembershipRequest, AuditLog
User = get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]
    def create(self, validated_data):
        return User.objects.create_user(username=validated_data["username"], email=validated_data["email"], password=validated_data["password"])

class AgentAwareTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT login for every role. Agent MFA is optional and is not required for sign-in."""
    def validate(self, attrs):
        return super().validate(attrs)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id","username","email","role","bio","avatar_url","is_verified_student","created_at"]
        read_only_fields = ["role","is_verified_student","created_at"]

class UserManagementSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id","username","email","role","bio","avatar_url","is_verified_student","created_at"]
        read_only_fields = ["created_at"]

class AdminPermissionSerializer(serializers.ModelSerializer):
    admin_username = serializers.ReadOnlyField(source="admin.username")
    class Meta:
        model = AdminPermission
        fields = ["id","admin","admin_username","can_delete_posts","can_ban_members","can_host_events","can_pin_announcements","can_approve_membership","can_moderate_chat","updated_at"]
        read_only_fields = ["updated_at"]

class SubHubSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubHub
        fields = ["id","name","description","icon_url","created_by","created_at"]
        read_only_fields = ["created_by","created_at"]

class CommentSerializer(serializers.ModelSerializer):
    author_username = serializers.ReadOnlyField(source="author.username")
    class Meta:
        model = Comment
        fields = ["id","post","author","author_username","content","created_at"]
        read_only_fields = ["author","created_at"]

class PostSerializer(serializers.ModelSerializer):
    author_username = serializers.ReadOnlyField(source="author.username")
    comments = CommentSerializer(many=True, read_only=True)
    class Meta:
        model = Post
        fields = ["id","author","author_username","subhub","content","media_url","is_pinned_announcement","is_public","created_at","comments"]
        read_only_fields = ["author","created_at"]
    def validate_is_pinned_announcement(self, value):
        request = self.context.get("request")
        if value and not (request and request.user.is_admin()):
            raise serializers.ValidationError("Only Admins or the Agent may pin announcements.")
        return value

class MembershipRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MembershipRequest
        fields = ["id","applicant_name","applicant_email","credential_document_url","status","reviewed_by","submitted_at"]
        read_only_fields = ["status","reviewed_by","submitted_at"]

class ChatRoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatRoom
        fields = ["id","name","room_type","subhub","members","created_at"]
        read_only_fields = ["created_at"]

class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.ReadOnlyField(source="sender.username")
    class Meta:
        model = Message
        fields = ["id","room","sender","sender_username","message_text","interactive_payload","timestamp"]
        read_only_fields = ["sender","timestamp"]

class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.ReadOnlyField(source="actor.username")
    class Meta:
        model = AuditLog
        fields = ["id","actor","actor_username","action","target_type","target_id","timestamp"]
        read_only_fields = fields
