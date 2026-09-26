CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    student_id VARCHAR(50) UNIQUE,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(40),
    academic_year VARCHAR(50),
    bio TEXT,
    avatar_url TEXT,
    profile_background_url TEXT,
    profile_slug VARCHAR(100),
    privacy_settings JSONB NOT NULL DEFAULT '{"show_email":false,"show_phone":false,"show_online":true}'::jsonb,
    notification_settings JSONB NOT NULL DEFAULT '{"push":true,"announcements":true,"messages":true}'::jsonb,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS academic_year VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_background_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_slug VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_settings JSONB NOT NULL DEFAULT '{"show_email":false,"show_phone":false,"show_online":true}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_settings JSONB NOT NULL DEFAULT '{"push":true,"announcements":true,"messages":true}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_page VARCHAR(80);

UPDATE users SET privacy_settings = '{"show_email":false,"show_phone":false,"show_online":true}'::jsonb WHERE privacy_settings IS NULL;
UPDATE users SET notification_settings = '{"push":true,"announcements":true,"messages":true}'::jsonb WHERE notification_settings IS NULL;
UPDATE users SET profile_slug = 'u-' || id WHERE profile_slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_profile_slug ON users(profile_slug) WHERE profile_slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_owner_only ON users(role) WHERE role = 'owner';

CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    tag VARCHAR(50),
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS activities (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    tag VARCHAR(50),
    event_date TIMESTAMPTZ,
    is_published BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS schedules (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    day_name VARCHAR(30),
    start_time TIME,
    end_time TIME,
    room VARCHAR(100),
    is_published BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS registrations (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    year VARCHAR(50),
    academic_year VARCHAR(50),
    email VARCHAR(255),
    phone VARCHAR(40),
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ,
    archived_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS academic_year VARCHAR(50);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS phone VARCHAR(40);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS archived_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_archived ON registrations(archived_at DESC);

CREATE TABLE IF NOT EXISTS posts (
    id BIGSERIAL PRIMARY KEY,
    author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section VARCHAR(40) NOT NULL DEFAULT 'community',
    title VARCHAR(255),
    body TEXT NOT NULL,
    body_html TEXT,
    content_type VARCHAR(20) NOT NULL DEFAULT 'post',
    hashtags TEXT[] NOT NULL DEFAULT '{}',
    image_url TEXT,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS body_html TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) NOT NULL DEFAULT 'post';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hashtags TEXT[] NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS post_likes (
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS post_comments (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_posts_section_date ON posts(section, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_pinned ON posts(is_pinned, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_hashtags ON posts USING GIN(hashtags);

CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150),
    description TEXT,
    cover_image_url TEXT,
    hashtags TEXT[] NOT NULL DEFAULT '{}',
    type VARCHAR(30) NOT NULL DEFAULT 'direct',
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    host_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    messaging_paused BOOLEAN NOT NULL DEFAULT FALSE,
    voice_room_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS name VARCHAR(150);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS hashtags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'direct';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS host_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS messaging_paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS voice_room_active BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_muted BOOLEAN NOT NULL DEFAULT FALSE,
    inbox_position_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member';
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS inbox_position_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE conversation_members cm
SET inbox_position_at = COALESCE(
  (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = cm.conversation_id),
  cm.joined_at,
  NOW()
)
WHERE cm.inbox_position_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_role ON conversation_members(conversation_id, role);
UPDATE conversations
SET host_user_id = created_by
WHERE host_user_id IS NULL
  AND type <> 'direct'
  AND created_by IS NOT NULL;

UPDATE conversation_members cm
SET role='host'
FROM conversations c
WHERE cm.conversation_id=c.id
  AND c.host_user_id=cm.user_id
  AND c.type <> 'direct'
  AND cm.role='member';

CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL DEFAULT '',
    image_url TEXT,
    audio_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_read BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_url TEXT;

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id BIGINT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_notifications_date ON notifications(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_date ON announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (key VARCHAR(120) PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}'::jsonb, updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS user_notifications (id BIGSERIAL PRIMARY KEY, recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL, kind VARCHAR(40) NOT NULL, title VARCHAR(255) NOT NULL, body TEXT, source VARCHAR(30) NOT NULL DEFAULT 'member', reference_type VARCHAR(40), reference_id BIGINT, is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient ON user_notifications(recipient_id, created_at DESC);
CREATE TABLE IF NOT EXISTS friendships (user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, friend_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, status VARCHAR(20) NOT NULL DEFAULT 'accepted', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, friend_id), CHECK (user_id <> friend_id));
CREATE TABLE IF NOT EXISTS membership_activation_tokens (
    id BIGSERIAL PRIMARY KEY,
    registration_id BIGINT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_membership_activation_registration ON membership_activation_tokens(registration_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_status ON friendships(friend_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_date ON messages(conversation_id, created_at DESC);
CREATE TABLE IF NOT EXISTS polls (
 id BIGSERIAL PRIMARY KEY,
 author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 question TEXT NOT NULL,
 options JSONB NOT NULL DEFAULT '[]'::jsonb,
 hashtags TEXT[] NOT NULL DEFAULT '{}',
 duration_minutes INTEGER NOT NULL DEFAULT 1440,
 closes_at TIMESTAMPTZ,
 allow_vote_change BOOLEAN NOT NULL DEFAULT TRUE,
 anonymous BOOLEAN NOT NULL DEFAULT FALSE,
 results_visibility VARCHAR(20) NOT NULL DEFAULT 'after_vote',
 expiration_notified_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE polls ADD COLUMN IF NOT EXISTS hashtags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE polls ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 1440;
ALTER TABLE polls ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;
ALTER TABLE polls ADD COLUMN IF NOT EXISTS allow_vote_change BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE polls ADD COLUMN IF NOT EXISTS anonymous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE polls ADD COLUMN IF NOT EXISTS results_visibility VARCHAR(20) NOT NULL DEFAULT 'after_vote';
ALTER TABLE polls ADD COLUMN IF NOT EXISTS expiration_notified_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_polls_closes_at ON polls(closes_at) WHERE closes_at IS NOT NULL;
UPDATE polls SET closes_at = created_at + (duration_minutes * INTERVAL '1 minute') WHERE closes_at IS NULL;
CREATE TABLE IF NOT EXISTS poll_votes (
 poll_id BIGINT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 option_index INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (poll_id,user_id)
);