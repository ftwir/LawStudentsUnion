from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    RegisterView, CustomTokenObtainPairView, MFABootstrapView, MFABootstrapConfirmView, MFASetupView, MFAConfirmView, MeView,
    UserManagementViewSet, SubHubViewSet, PostViewSet, CommentViewSet,
    ChatRoomViewSet, MessageViewSet,
    MembershipRequestViewSet, AdminPermissionViewSet, AuditLogListView,
)

router = DefaultRouter()
router.register(r"admin/users", UserManagementViewSet, basename="usermanagement")
router.register(r"subhubs", SubHubViewSet, basename="subhub")
router.register(r"posts", PostViewSet, basename="post")
router.register(r"comments", CommentViewSet, basename="comment")
router.register(r"chat-rooms", ChatRoomViewSet, basename="chatroom")
router.register(r"messages", MessageViewSet, basename="message")
router.register(r"membership-requests", MembershipRequestViewSet, basename="membershiprequest")
router.register(r"admin/permissions", AdminPermissionViewSet, basename="adminpermission")

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/mfa/bootstrap/", MFABootstrapView.as_view(), name="mfa-bootstrap"),
    path("auth/mfa/bootstrap/confirm/", MFABootstrapConfirmView.as_view(), name="mfa-bootstrap-confirm"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/mfa/setup/", MFASetupView.as_view(), name="mfa-setup"),
    path("auth/mfa/confirm/", MFAConfirmView.as_view(), name="mfa-confirm"),
    path("users/me/", MeView.as_view(), name="me"),
    path("admin/audit-log/", AuditLogListView.as_view(), name="audit-log"),
    path("", include(router.urls)),
]