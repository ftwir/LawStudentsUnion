from unittest.mock import patch
from rest_framework.test import APITestCase
from rest_framework import status
from django_otp.plugins.otp_totp.models import TOTPDevice
from .models import CustomUser, SubHub, Post, MembershipRequest, AdminPermission

class RBACTests(APITestCase):
    def setUp(self):
        self.agent=CustomUser.objects.create_user(username="agent1",password="pass12345",role=CustomUser.Role.AGENT)
        self.admin=CustomUser.objects.create_user(username="admin1",password="pass12345",role=CustomUser.Role.ADMIN)
        AdminPermission.objects.create(admin=self.admin)
        self.member=CustomUser.objects.create_user(username="member1",password="pass12345",role=CustomUser.Role.MEMBER,is_verified_student=True)
        self.hub=SubHub.objects.create(name="Moot Court",created_by=self.agent)
    def auth(self,user): self.client.force_authenticate(user=user)
    def test_visitor_only_sees_public_posts(self):
        Post.objects.create(author=self.member,subhub=self.hub,content="private",is_public=False)
        Post.objects.create(author=self.member,subhub=self.hub,content="public",is_public=True)
        r=self.client.get("/api/posts/"); self.assertEqual(r.status_code,200); self.assertEqual(len(r.data),1)
    def test_member_cannot_pin_announcement(self):
        self.auth(self.member); r=self.client.post("/api/posts/",{"subhub":str(self.hub.id),"content":"hi","is_pinned_announcement":True})
        self.assertEqual(r.status_code,status.HTTP_400_BAD_REQUEST)
    def test_admin_membership_approval_requires_permission_node(self):
        req=MembershipRequest.objects.create(applicant_name="A",applicant_email="new@x.com",credential_document_url="https://example.com/doc")
        self.auth(self.admin); r=self.client.patch(f"/api/membership-requests/{req.id}/",{"status":"APPROVED"})
        self.assertEqual(r.status_code,status.HTTP_403_FORBIDDEN)
        self.admin.permissions.can_approve_membership=True; self.admin.permissions.save()
        r=self.client.patch(f"/api/membership-requests/{req.id}/",{"status":"APPROVED"}); self.assertEqual(r.status_code,status.HTTP_200_OK)
    def test_membership_approval_verifies_existing_user(self):
        applicant=CustomUser.objects.create_user(username="applicant1",password="pass12345",email="a@x.com")
        self.admin.permissions.can_approve_membership=True; self.admin.permissions.save()
        req=MembershipRequest.objects.create(applicant_name="A",applicant_email="a@x.com",credential_document_url="https://example.com/doc")
        self.auth(self.admin); r=self.client.patch(f"/api/membership-requests/{req.id}/",{"status":"APPROVED"})
        self.assertEqual(r.status_code,200); applicant.refresh_from_db(); self.assertTrue(applicant.is_verified_student)
    def test_only_agent_can_access_permission_matrix(self):
        self.auth(self.admin); self.assertEqual(self.client.get("/api/admin/permissions/").status_code,403)
        self.auth(self.agent); self.assertEqual(self.client.get("/api/admin/permissions/").status_code,200)
    def test_only_agent_can_grant_agent_role(self):
        self.auth(self.admin); r=self.client.patch(f"/api/admin/users/{self.member.id}/",{"role":"AGENT"}); self.assertEqual(r.status_code,403)
    def test_admin_role_change_creates_permission_matrix_row(self):
        self.auth(self.agent); r=self.client.patch(f"/api/admin/users/{self.member.id}/",{"role":"ADMIN"})
        self.assertEqual(r.status_code,200); self.assertTrue(AdminPermission.objects.filter(admin=self.member).exists())
    def test_agent_login_requires_mfa(self):
        r=self.client.post("/api/auth/login/",{"username":"agent1","password":"pass12345"}); self.assertEqual(r.status_code,status.HTTP_400_BAD_REQUEST)
    @patch.object(TOTPDevice,"verify_token",return_value=False)
    def test_agent_login_rejects_invalid_mfa(self,_verify):
        TOTPDevice.objects.create(user=self.agent,name="agent-default",confirmed=True)
        r=self.client.post("/api/auth/login/",{"username":"agent1","password":"pass12345","otp_token":"000000"})
        self.assertEqual(r.status_code,status.HTTP_400_BAD_REQUEST); self.assertEqual(r.data["code"],"MFA_REQUIRED")
