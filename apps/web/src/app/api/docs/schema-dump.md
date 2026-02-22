# Wifey PostgreSQL Schema Reference

> The full CREATE TABLE schema is available in the system configuration. This document provides a quick-reference summary organized by domain.

## Core Tables (50+)

### Authentication & Users
| Table | Purpose | Key Columns |
|---|---|---|
| `users` | Main user accounts (phone-based) | id, email (phone E.164), password_hash, status, screening_phase, cooldown_until, delete_requested_at |
| `auth_users` | NextAuth user records (web auth) | id, name, email, emailVerified, image |
| `auth_accounts` | NextAuth OAuth accounts | userId, type, provider, providerAccountId, access_token |
| `auth_sessions` | NextAuth sessions | userId, expires, sessionToken |
| `auth_verification_token` | NextAuth email verification | identifier, expires, token |

### User Profiles
| Table | Purpose | Key Columns |
|---|---|---|
| `user_profiles` | Dating profile data | user_id, display_name, age, birthdate, gender, bio, photos (jsonb), location, lat, lng, preferences (jsonb), is_verified, verification_status |
| `user_location_latest` | Last known GPS | user_id, lat, lng, accuracy_m, captured_at |
| `user_presence_latest` | Online status | user_id, last_seen_at, platform |
| `user_notification_preferences` | Push prefs | user_id, enable_all, mute_all, new_likes, new_matches, new_messages |
| `user_push_tokens` | Expo push tokens | user_id, expo_push_token, platform |

### Matching & Likes
| Table | Purpose | Key Columns |
|---|---|---|
| `profile_likes` | Inbound likes with hidden-like throttle | from_user_id, to_user_id, section_type, comment_text, status (pending_hidden/surfaced/matched/expired) |
| `profile_passes` | Passed profiles | from_user_id, to_user_id |
| `matches` | Mutual matches | id, user1_id (lower), user2_id (higher), user1_seen_at, user2_seen_at |
| `match_conversation_states` | Pre-chat → active chat state machine | match_id, user1/2_consented_at, active_at, decision_expires_at, terminal_state |
| `user_active_conversations` | Tracks which match is "active" per user | user_id, active_match_id |
| `user_match_archives` | Per-user hidden/archived matches | match_id, user_id, archived_at, reason |
| `match_unmatch_events` | Unmatch audit trail | match_id, actor_user_id, reason_code, reason_text |
| `user_blocks` | Block list | blocker_user_id, blocked_user_id |
| `feed_impressions` | Profile view tracking | viewer_id, viewed_user_id, seen_at |
| `feed_waitlist` | Empty-feed notification queue | user_id, lat, lng, radius_miles, notified_at |
| `like_throttle_settings` | Hidden-like surfacing config (singleton) | id, config_json |

### Chat
| Table | Purpose | Key Columns |
|---|---|---|
| `chat_messages` | All messages | match_id, sender_id, message_text, message_type (TEXT/AUDIO/SYSTEM_HINT/...), audio_url, replied_to_message_id |
| `chat_message_reactions` | Message likes | message_id, user_id, reaction_type (LIKE) |

### Date Planning
| Table | Purpose | Key Columns |
|---|---|---|
| `match_date_plans` | Date proposals | match_id, date_status, proposed_by_user_id, date_start/end, place_label, place_id, activity_label, credit_status |
| `match_date_events` | Date lifecycle audit | match_id, actor_user_id, event_type (DATE_PROPOSED/ACCEPTED/DECLINED/CANCELED/EXPIRED/COMPLETED) |
| `match_availability` | User scheduling prefs per match | match_id, user_id, days (jsonb), times (jsonb) |

### Date Credits (Payments)
| Table | Purpose | Key Columns |
|---|---|---|
| `date_credit_wallets` | Balance per user | user_id, balance_cents |
| `date_credit_ledger` | All credit transactions | user_id, match_id, action (PURCHASE/SPEND/REFUND/ADJUST), amount_cents, meta (jsonb) |
| `match_chat_escrows` | Legacy deposit tracking (being phased out) | match_id, user1/2_deposit_cents |

### Drink Perk
| Table | Purpose | Key Columns |
|---|---|---|
| `match_drink_perks` | Perk state machine | match_id, state (LOCKED/ARMED/READY/REDEEMED) |
| `drink_credits` | Issued drink tokens | match_id, token, unlocked_at, expires_at, redeemed_at |
| `drink_handshake_sessions` | In-person verification | match_id, code, initiator_user_id, responder_user_id, completed_at |

### Screening (Quiz)
| Table | Purpose | Key Columns |
|---|---|---|
| `quiz_versions` | Quiz version management | version_number, status (draft/active/archived), audience_gender |
| `quiz_configs` | Legacy quiz config | version, is_active, config_json |
| `question_bank` | All screening questions | question_text, is_active, allow_multiple, audience_gender |
| `question_answers` | Answer choices with weights | question_id, answer_text, weight |
| `version_phase_configs` | Phase pass/fail thresholds | version_id, phase_name, fail_if_sum_gte, approve_if_sum_lte |
| `version_phase_questions` | Questions assigned to phases | version_id, phase_name, question_id |
| `version_lifetime_rules` | Lifetime ineligibility rules | version_id, rule_json |
| `screening_attempts` | User quiz attempts | user_id, quiz_config_version, outcome, phase_scores_json, answers_json |
| `screening_bans` | Quiz-based bans | user_id, reason, expires_at, is_permanent |

### Discovery
| Table | Purpose | Key Columns |
|---|---|---|
| `profile_categories` | Browse categories | name, emoji, is_active, sort_order |
| `discover_standout_sets` | Cached standout profiles | viewer_user_id, gender, tier, user_ids (int[]) |

### RevenueCat Integration
| Table | Purpose | Key Columns |
|---|---|---|
| `revenuecat_app_user_links` | Maps RC anonymous IDs to user IDs | app_user_id, user_id |
| `revenuecat_pending_date_credit_events` | Unprocessed webhook events | app_user_id, event_id, transaction_id, product_id, raw_event, processed_at |

### OTP
| Table | Purpose | Key Columns |
|---|---|---|
| `otp_send_events` | Rate limit tracking | phone_e164, ip, created_at |
| `otp_verification_sessions` | Short-lived registration tokens | phone_e164, token, expires_at (15min) |

### Subscriptions
| Table | Purpose | Key Columns |
|---|---|---|
| `user_subscription_overrides` | Admin-granted tier overrides | user_id, tier (serious/committed), expires_at |

### Moderation & Reports
| Table | Purpose | Key Columns |
|---|---|---|
| `user_reports` | User-submitted reports | reporter_user_id, reported_user_id, report_type, status |
| `behavior_bans` | Behavior-based bans | user_id, reason, violation_type, is_permanent |
| `photo_moderation_events` | Google Vision results | user_id, image_url, decision, safe_search (jsonb) |

### Admin
| Table | Purpose | Key Columns |
|---|---|---|
| `admin_users` | Admin accounts | email, password_hash, role (OWNER/ADMIN/MODERATOR/SUPPORT) |
| `admin_sessions` | Admin auth sessions | session_token, admin_id, expires_at |
| `admin_password_reset_tokens` | Password reset | admin_id, token_hash, expires_at |
| `audit_logs` | Admin action audit | admin_id, action, entity_type, entity_id, details (jsonb) |

### Support
| Table | Purpose | Key Columns |
|---|---|---|
| `support_tickets` | User support tickets | user_id, subject, description, status, priority, assigned_to_admin_id |
| `support_ticket_messages` | Ticket thread messages | ticket_id, sender_type (USER/ADMIN), message |

## Key Relationships

```
users.id ──→ user_profiles.user_id (1:1)
users.id ──→ matches.user1_id / user2_id (many)
matches.id ──→ chat_messages.match_id (many)
matches.id ──→ match_conversation_states.match_id (1:1)
matches.id ──→ match_date_plans.match_id (1:1)
matches.id ──→ match_drink_perks.match_id (1:1)
users.id ──→ profile_likes.from_user_id / to_user_id (many)
users.id ──→ date_credit_wallets.user_id (1:1)
users.id ──→ date_credit_ledger.user_id (many)
users.id ──→ screening_attempts.user_id (many)
```

## Conventions
- `user1_id` is always `LEAST(a, b)`, `user2_id` is always `GREATEST(a, b)`
- Phone numbers stored as E.164 in `users.email` column (legacy naming)
- All timestamps are `timestamp without time zone` (UTC assumed)
- JSONB used for: photos, preferences, quiz answers, phase scores, planner prefs, audit details
- Soft deletes via `delete_requested_at` + `delete_scheduled_for` + `deleted_at` (30-day grace)
