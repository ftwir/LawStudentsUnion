import os
from pathlib import Path
import dj_database_url
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = config("SECRET_KEY")
DEBUG = config("DEBUG_MODE", default=False, cast=bool)
ALLOWED_HOSTS = [h.strip() for h in config("ALLOWED_HOSTS", default="*").split(",") if h.strip()]
INSTALLED_APPS = ["daphne","django.contrib.admin","django.contrib.auth","django.contrib.contenttypes","django.contrib.sessions","django.contrib.messages","django.contrib.staticfiles","rest_framework","rest_framework_simplejwt","corsheaders","channels","django_otp","django_otp.plugins.otp_totp","app"]
MIDDLEWARE = ["corsheaders.middleware.CorsMiddleware","django.middleware.security.SecurityMiddleware","django.contrib.sessions.middleware.SessionMiddleware","django.middleware.common.CommonMiddleware","django.middleware.csrf.CsrfViewMiddleware","django.contrib.auth.middleware.AuthenticationMiddleware","django_otp.middleware.OTPMiddleware","django.contrib.messages.middleware.MessageMiddleware","django.middleware.clickjacking.XFrameOptionsMiddleware"]
ROOT_URLCONF="config.urls"; ASGI_APPLICATION="config.asgi.application"; AUTH_USER_MODEL="app.CustomUser"
TEMPLATES=[{"BACKEND":"django.template.backends.django.DjangoTemplates","DIRS":[],"APP_DIRS":True,"OPTIONS":{"context_processors":["django.template.context_processors.debug","django.template.context_processors.request","django.contrib.auth.context_processors.auth","django.contrib.messages.context_processors.messages"]}}]
DATABASES={'default':dj_database_url.config(default=f'sqlite:///{BASE_DIR / "local.sqlite3"}',conn_max_age=600)}
if os.getenv('DATABASE_URL') and DATABASES['default']['ENGINE']=='django.db.backends.postgresql':
    DATABASES['default'].setdefault('OPTIONS',{})['options']='-c search_path=law_union_v2,public'
CHANNEL_LAYERS={"default":{"BACKEND":"channels_redis.core.RedisChannelLayer","CONFIG":{"hosts":[config("REDIS_URL",default="redis://localhost:6379")]}}}
REST_FRAMEWORK={"DEFAULT_AUTHENTICATION_CLASSES":["rest_framework_simplejwt.authentication.JWTAuthentication"],"DEFAULT_PERMISSION_CLASSES":["rest_framework.permissions.IsAuthenticated"]}
from datetime import timedelta
SIMPLE_JWT={"ACCESS_TOKEN_LIFETIME":timedelta(minutes=30),"REFRESH_TOKEN_LIFETIME":timedelta(days=7),"SIGNING_KEY":SECRET_KEY,"AUTH_HEADER_TYPES":("Bearer",)}
cors=[x.strip() for x in config("CORS_ALLOWED_ORIGINS",default="").split(",") if x.strip()]
CORS_ALLOWED_ORIGINS=cors; CSRF_TRUSTED_ORIGINS=cors
LANGUAGE_CODE="en-us"; TIME_ZONE="UTC"; USE_I18N=True; USE_TZ=True
STATIC_URL="/static/"; STATIC_ROOT=BASE_DIR/"staticfiles"; DEFAULT_AUTO_FIELD="django.db.models.BigAutoField"
SECURE_SSL_REDIRECT=not DEBUG; SESSION_COOKIE_SECURE=not DEBUG; CSRF_COOKIE_SECURE=not DEBUG
SECURE_HSTS_SECONDS=0 if DEBUG else 31536000; SECURE_HSTS_INCLUDE_SUBDOMAINS=not DEBUG; SECURE_HSTS_PRELOAD=not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF=True; X_FRAME_OPTIONS="DENY"; SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO","https")
SECURE_REFERRER_POLICY="strict-origin-when-cross-origin"
