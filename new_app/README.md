# Law Faculty Student Union v2

A new two-app ecosystem built from the supplied build package:

- `new_app/client_app`: Flutter student/community client.
- `new_app/admin_app`: standalone Flutter Agent/Admin command center.
- `new_app/backend`: Django + DRF + Channels/Daphne API.
- PostgreSQL on Render, with this app isolated in the `law_union_v2` schema.
- Render Key Value for WebSocket channel coordination.

## Security model

Agent authentication is TOTP-gated with no JWT/session bypass. Initial enrollment uses the one-time `AGENT_BOOTSTRAP_TOKEN` plus the Agent's normal credentials and never returns a session. After enrollment, every Agent login requires a valid six-digit TOTP code.

Roles are Agent -> Administrator -> verified Member -> Visitor. Only the Agent can grant Agent-level access or change the Administrator permission matrix.

## Render

The root `render.yaml` references the existing Render Postgres resource `lawstudentsunion-db` and the new `law-union-v2-cache` Key Value resource. The backend creates/uses the isolated `law_union_v2` PostgreSQL schema before migrations.

Required secret on the Render service:
- `AGENT_PASSWORD`

Render generates:
- `SECRET_KEY`
- `AGENT_BOOTSTRAP_TOKEN`

The bootstrap token is only for initial MFA enrollment. It is never accepted by the normal login endpoint.

## Local backend

```bash
cd new_app/backend
python -m venv .venv
# activate the environment
pip install -r requirements.txt
export SECRET_KEY=dev-secret
export DEBUG_MODE=True
export DATABASE_URL=sqlite:///local.sqlite3
export REDIS_URL=redis://localhost:6379
export AGENT_PASSWORD=dev-agent-password
python manage.py makemigrations app
python manage.py migrate
python manage.py bootstrap_agent
python manage.py runserver
```

## Flutter

Client:
```bash
cd new_app/client_app
flutter pub get
flutter run --dart-define=API_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com
```

Admin:
```bash
cd new_app/admin_app
flutter pub get
flutter run --dart-define=API_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com
```

For the first Agent enrollment, use the Render-generated `AGENT_BOOTSTRAP_TOKEN` in the Admin Companion's **First-time Agent MFA enrollment** screen. Scan the returned QR with an authenticator, confirm the six-digit code, then use the normal Agent login.
