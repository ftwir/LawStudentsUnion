from rest_framework import permissions


class IsAgent(permissions.BasePermission):
    """Only the single super-admin 'Agent' account may pass."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_agent())


class IsAdminOrAgent(permissions.BasePermission):
    """Union Board admins and the Agent."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin())


class HasPermissionNode(permissions.BasePermission):
    """
    Checks a specific node on the admin's AdminPermission toggle matrix,
    e.g. HasPermissionNode('can_delete_posts'). The Agent always passes.
    """

    def __init__(self, node):
        self.node = node

    def __call__(self):
        return self

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_agent():
            return True
        perms = getattr(user, "permissions", None)
        return bool(perms and getattr(perms, self.node, False))


class IsVerifiedMemberOrReadOnlyPublic(permissions.BasePermission):
    """
    Members get full read/write on non-admin content.
    Unauthenticated Visitors get read-only access to posts marked is_public=True
    (enforced in the queryset, not here) plus safe HTTP methods only.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_verified_student
        )


class IsOwnerOrAdmin(permissions.BasePermission):
    """Object-level: the author/owner, or any admin/Agent, may modify."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        user = request.user
        owner = getattr(obj, "author", None) or getattr(obj, "sender", None)
        return bool(user.is_authenticated and (owner == user or user.is_admin()))