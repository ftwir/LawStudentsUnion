"""
Core data models for the Law Faculty Student Union app.
Implements the 4-tier role hierarchy: Agent, Administrators, Members, Visitors.
"""
import uuid
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class CustomUser(AbstractUser):
    class Role(models.TextChoices):
        AGENT = "AGENT", "The Agent (Super Admin)"
        ADMIN = "ADMIN", "Administrator (Union Board)"
        MEMBER = "MEMBER", "Member (Law Student)"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    bio = models.TextField(blank=True)
    avatar_url = models.URLField(blank=True)
    is_verified_student = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_agent(self):
        return self.role == self.Role.AGENT

    def is_admin(self):
        return self.role in (self.Role.AGENT, self.Role.ADMIN)


class AdminPermission(models.Model):
    """Dynamic per-admin permission toggle matrix, set by the Agent."""
    admin = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="permissions"
    )
    can_delete_posts = models.BooleanField(default=False)
    can_ban_members = models.BooleanField(default=False)
    can_host_events = models.BooleanField(default=False)
    can_pin_announcements = models.BooleanField(default=False)
    can_approve_membership = models.BooleanField(default=False)
    can_moderate_chat = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)


class SubHub(models.Model):
    """A Micro-Sub-Hub, e.g. Moot Court Team, Legal Defense Club."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    icon_url = models.URLField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="subhubs_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)


class Post(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="posts")
    subhub = models.ForeignKey(SubHub, on_delete=models.CASCADE, related_name="posts")
    content = models.TextField()
    media_url = models.URLField(blank=True)
    is_pinned_announcement = models.BooleanField(default=False)
    is_public = models.BooleanField(default=False)  # visible to unauthenticated Visitors
    created_at = models.DateTimeField(auto_now_add=True)


class Comment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class ChatRoom(models.Model):
    class RoomType(models.TextChoices):
        DIRECT = "DIRECT", "Direct Message"
        GROUP = "GROUP", "Group Chat"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    room_type = models.CharField(max_length=10, choices=RoomType.choices)
    subhub = models.ForeignKey(SubHub, on_delete=models.SET_NULL, null=True, blank=True, related_name="chat_rooms")
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="chat_rooms")
    created_at = models.DateTimeField(auto_now_add=True)


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    message_text = models.TextField(blank=True)
    interactive_payload = models.JSONField(blank=True, null=True)  # quiz/poll/trivia/flashcard inline blocks
    timestamp = models.DateTimeField(auto_now_add=True)


class MembershipRequest(models.Model):
    """Visitor onboarding: 'Request Membership / Submit Academic Credentials'."""
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    applicant_name = models.CharField(max_length=150)
    applicant_email = models.EmailField()
    credential_document_url = models.URLField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_requests"
    )
    submitted_at = models.DateTimeField(auto_now_add=True)


class AuditLog(models.Model):
    """Streaming feed of admin actions, surfaced in the Admin Companion App."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=255)
    target_type = models.CharField(max_length=100, blank=True)
    target_id = models.CharField(max_length=100, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)