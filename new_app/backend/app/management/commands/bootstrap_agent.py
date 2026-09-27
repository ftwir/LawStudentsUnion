import os
from django.core.management.base import BaseCommand, CommandError
from app.models import CustomUser

class Command(BaseCommand):
    help = "Create or update the single Agent account from Render environment variables."

    def handle(self, *args, **options):
        username=os.getenv("AGENT_USERNAME","agent").strip()
        email=os.getenv("AGENT_EMAIL","agent@lawunion.local").strip()
        password=os.getenv("AGENT_PASSWORD","").strip()
        if not password:
            raise CommandError("AGENT_PASSWORD must be configured before deployment.")
        user, created=CustomUser.objects.get_or_create(username=username, defaults={"email":email})
        user.email=email
        user.role=CustomUser.Role.AGENT
        user.is_staff=True
        user.is_superuser=True
        user.is_active=True
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(("Created" if created else "Updated")+" Agent account: "+username))
