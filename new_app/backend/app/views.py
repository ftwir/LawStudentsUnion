from django.http import JsonResponse
from django.contrib.auth import get_user_model, authenticate
import os
from rest_framework import generics, viewsets, permissions as drf_permissions
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from django_otp.plugins.otp_totp.models import TOTPDevice

from .models import SubHub, Post, Comment, ChatRoom, Message, MembershipRequest, AdminPermission, AuditLog
from .serializers import (
    RegisterSerializer, AgentAwareTokenObtainPairSerializer, UserSerializer,
    UserManagementSerializer, SubHubSerializer, PostSerializer,
    CommentSerializer, ChatRoomSerializer, MessageSerializer,
    MembershipRequestSerializer, AdminPermissionSerializer, AuditLogSerializer,
)
from .permissions import IsAgent, IsAdminOrAgent, IsOwnerOrAdmin, IsVerifiedMemberOrReadOnlyPublic

User = get_user_model()


def log_action(actor, action, target_type="", target_id=""):
    AuditLog.objects.create(actor=actor, action=action, target_type=target_type, target_id=str(target_id))


# ---- Auth ----

class RegisterView(generics.CreateAPIView):
    """Public sign-up; account starts unverified until credentials are approved."""
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [drf_permissions.AllowAny]


class CustomTokenObtainPairView(TokenObtainPairView):
    """JWT login for every role. The Agent additionally requires a TOTP code — no bypass path."""
    serializer_class = AgentAwareTokenObtainPairSerializer
    permission_classes = [drf_permissions.AllowAny]


class MFABootstrapView(APIView):
    """One-time enrollment gate. It never returns a JWT/session."""
    permission_classes = [drf_permissions.AllowAny]

    def post(self, request):
        if not os.getenv("AGENT_BOOTSTRAP_TOKEN") or request.data.get("bootstrap_token") != os.getenv("AGENT_BOOTSTRAP_TOKEN"):
            return Response({"detail": "Invalid bootstrap token."}, status=403)
        user = authenticate(username=request.data.get("username", ""), password=request.data.get("password", ""))
        if not user or not user.is_agent():
            return Response({"detail": "Invalid Agent credentials."}, status=401)
        if TOTPDevice.objects.filter(user=user, confirmed=True).exists():
            return Response({"detail": "Agent MFA is already enabled."}, status=409)
        TOTPDevice.objects.filter(user=user, confirmed=False).delete()
        device = TOTPDevice.objects.create(user=user, name="agent-default", confirmed=False)
        return Response({"otpauth_url": device.config_url})

class MFABootstrapConfirmView(APIView):
    permission_classes = [drf_permissions.AllowAny]

    def post(self, request):
        if not os.getenv("AGENT_BOOTSTRAP_TOKEN") or request.data.get("bootstrap_token") != os.getenv("AGENT_BOOTSTRAP_TOKEN"):
            return Response({"detail": "Invalid bootstrap token."}, status=403)
        user = authenticate(username=request.data.get("username", ""), password=request.data.get("password", ""))
        if not user or not user.is_agent():
            return Response({"detail": "Invalid Agent credentials."}, status=401)
        device = TOTPDevice.objects.filter(user=user, confirmed=False).first()
        if not device or not device.verify_token(str(request.data.get("otp_token", ""))):
            return Response({"detail": "Invalid TOTP code."}, status=400)
        device.confirmed = True
        device.save(update_fields=["confirmed"])
        log_action(user, "completed initial Agent MFA enrollment")
        return Response({"detail": "MFA enabled. Future Agent logins require the TOTP code."})

class MFASetupView(APIView):
    """Agent-only: (re)provision their TOTP device. Returns an otpauth:// URI to render as a QR code."""
    permission_classes = [IsAgent]

    def post(self, request):
        TOTPDevice.objects.filter(user=request.user, confirmed=False).delete()
        device = TOTPDevice.objects.create(user=request.user, name="agent-default", confirmed=False)
        return Response({"otpauth_url": device.config_url})


class MFAConfirmView(APIView):
    """Agent-only: confirm the device with one valid code so future logins require it."""
    permission_classes = [IsAgent]

    def post(self, request):
        token = request.data.get("otp_token", "")
        device = TOTPDevice.objects.filter(user=request.user, confirmed=False).first()
        if not device or not device.verify_token(token):
            return Response({"detail": "Invalid code."}, status=400)
        device.confirmed = True
        device.save()
        log_action(request.user, "enabled Agent MFA")
        return Response({"detail": "MFA enabled."})


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [drf_permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


# ---- User Management Matrix (Admin Companion App) ----

class UserManagementViewSet(viewsets.ModelViewSet):
    """List every user and edit role / verification status. Admins may only
    grant MEMBER/ADMIN; only the Agent may grant AGENT."""
    queryset = User.objects.all().order_by("username")
    serializer_class = UserManagementSerializer
    permission_classes = [IsAdminOrAgent]
    http_method_names = ["get", "patch", "head", "options"]

    def perform_update(self, serializer):
        new_role = serializer.validated_data.get("role")
        if new_role == User.Role.AGENT and not self.request.user.is_agent():
            raise PermissionDenied("Only the Agent may grant Agent-level access.")
        instance = serializer.save()
        if instance.role == User.Role.ADMIN:
            AdminPermission.objects.get_or_create(admin=instance)
        else:
            AdminPermission.objects.filter(admin=instance).delete()
        log_action(self.request.user, f"updated user {instance.username}", "CustomUser", instance.id)


# ---- Sub-Hubs (Community Hub Configurator backs onto this) ----

class SubHubViewSet(viewsets.ModelViewSet):
    queryset = SubHub.objects.all().order_by("name")
    serializer_class = SubHubSerializer
    permission_classes = [IsVerifiedMemberOrReadOnlyPublic]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAdminOrAgent()]
        return super().get_permissions()

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        log_action(self.request.user, "created SubHub", "SubHub", instance.id)


# ---- Posts & Comments ----

class PostViewSet(viewsets.ModelViewSet):
    serializer_class = PostSerializer
    permission_classes = [IsVerifiedMemberOrReadOnlyPublic, IsOwnerOrAdmin]

    def get_queryset(self):
        user = self.request.user
        qs = Post.objects.all().order_by("-created_at")
        if not (user.is_authenticated and user.is_verified_student):
            qs = qs.filter(is_public=True)  # Visitors only see public posts
        return qs

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def perform_destroy(self, instance):
        log_action(self.request.user, "deleted Post", "Post", instance.id)
        instance.delete()


class CommentViewSet(viewsets.ModelViewSet):
    serializer_class = CommentSerializer
    permission_classes = [drf_permissions.IsAuthenticated, IsOwnerOrAdmin]
    queryset = Comment.objects.all().order_by("created_at")

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


# ---- Chat ----

class ChatRoomViewSet(viewsets.ModelViewSet):
    serializer_class = ChatRoomSerializer
    permission_classes = [drf_permissions.IsAuthenticated]

    def get_queryset(self):
        return ChatRoom.objects.filter(members=self.request.user).order_by("-created_at")

    def perform_create(self, serializer):
        room = serializer.save()
        room.members.add(self.request.user)


class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [drf_permissions.IsAuthenticated]

    def get_queryset(self):
        return Message.objects.filter(room__members=self.request.user).order_by("timestamp")

    def perform_create(self, serializer):
        serializer.save(sender=self.request.user)


# ---- Membership (Visitor onboarding) ----

class MembershipRequestViewSet(viewsets.ModelViewSet):
    serializer_class = MembershipRequestSerializer
    queryset = MembershipRequest.objects.all().order_by("-submitted_at")

    def get_permissions(self):
        if self.action == "create":
            return [drf_permissions.AllowAny()]
        return [IsAdminOrAgent()]

    def perform_update(self, serializer):
        if not self.request.user.is_agent() and not getattr(getattr(self.request.user, 'permissions', None), 'can_approve_membership', False):
            raise PermissionDenied('Membership approval permission is disabled for this Administrator.')
        instance = serializer.save(reviewed_by=self.request.user)
        if instance.status == MembershipRequest.Status.APPROVED:
            User.objects.filter(email=instance.applicant_email).update(is_verified_student=True)
        log_action(self.request.user, f"set MembershipRequest to {instance.status}", "MembershipRequest", instance.id)


# ---- Admin Companion App: permission matrix & audit log ----

class AdminPermissionViewSet(viewsets.ModelViewSet):
    """Only the Agent may view/edit the dynamic permission toggle matrix for Admins."""
    queryset = AdminPermission.objects.select_related("admin").all()
    serializer_class = AdminPermissionSerializer
    permission_classes = [IsAgent]

    def perform_update(self, serializer):
        instance = serializer.save()
        log_action(self.request.user, "updated permission matrix", "AdminPermission", instance.id)


class AuditLogListView(generics.ListAPIView):
    """Read-only streaming feed for the Admin Companion App dashboard."""
    queryset = AuditLog.objects.select_related("actor").order_by("-timestamp")[:500]
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminOrAgent]

def health_view(request):
    from django.db import connection
    try:
        with connection.cursor() as c: c.execute('SELECT 1')
        return JsonResponse({'ok':True,'database':'connected','service':'law-union-v2'})
    except Exception:
        return JsonResponse({'ok':False,'database':'disconnected'},status=503)
