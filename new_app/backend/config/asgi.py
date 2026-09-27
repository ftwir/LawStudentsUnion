import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.asgi import get_asgi_application

django_asgi_app = get_asgi_application()

# Render's direct service configuration does not have a release-command hook.
# Bootstrap the isolated Agent account during startup when credentials are present.
# The command is idempotent and also seeds the default community/room.
if os.getenv("AGENT_PASSWORD", "").strip():
    from django.core.management import call_command
    call_command("bootstrap_agent", verbosity=0)

from channels.routing import ProtocolTypeRouter, URLRouter
from app.routing import websocket_urlpatterns
from app.channels_middleware import JWTAuthMiddlewareStack

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
})
