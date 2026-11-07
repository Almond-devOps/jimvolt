CREATE DATABASE IF NOT EXISTS jimvolt_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE jimvolt_db;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(32) NULL,
  password VARCHAR(255) NOT NULL,
  token_version INT UNSIGNED NOT NULL DEFAULT 0,
  role ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user',
  profile_image VARCHAR(2048) NULL,
  account_status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  password_reset_token VARCHAR(255) NULL,
  password_reset_expires_at TIMESTAMP NULL,
  pending_email VARCHAR(254) NULL,
  email_verification_token VARCHAR(255) NULL,
  email_verification_expires_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_status (account_status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL,
  description TEXT NULL,
  image VARCHAR(2048) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name),
  UNIQUE KEY uq_categories_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS advertisements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  brand VARCHAR(120) NULL,
  specifications TEXT NULL,
  slug VARCHAR(220) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(13, 2) NOT NULL,
  condition_type ENUM('new', 'used') NOT NULL,
  state VARCHAR(100) NOT NULL,
  city VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  whatsapp VARCHAR(32) NULL,
  status ENUM('pending', 'approved', 'rejected', 'paused', 'suspended', 'changes_requested', 'sold', 'expired') NOT NULL DEFAULT 'pending',
  moderation_note VARCHAR(1000) NULL,
  approved_at TIMESTAMP NULL,
  views BIGINT UNSIGNED NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_advertisements_slug (slug),
  KEY idx_ads_public_newest (status, created_at),
  KEY idx_ads_category (category_id, status),
  KEY idx_ads_location (state, city, status),
  KEY idx_ads_price (price, status),
  KEY idx_ads_featured (is_featured, status),
  KEY idx_ads_condition_status (condition_type, status),
  KEY idx_ads_city_status (city, status),
  FULLTEXT KEY ft_ads_search (title, description, brand, specifications),
  CONSTRAINT fk_ads_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_ads_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT,
  CONSTRAINT chk_ads_price CHECK (price >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  advertisement_id BIGINT UNSIGNED NOT NULL,
  image_url VARCHAR(2048) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_product_images_ad (advertisement_id),
  CONSTRAINT fk_product_images_ad FOREIGN KEY (advertisement_id) REFERENCES advertisements (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS favourites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  advertisement_id BIGINT UNSIGNED NULL,
  saved_title VARCHAR(180) NULL,
  saved_price DECIMAL(13, 2) NULL,
  saved_condition_type ENUM('new', 'used') NULL,
  saved_state VARCHAR(100) NULL,
  saved_city VARCHAR(120) NULL,
  saved_image VARCHAR(2048) NULL,
  saved_seller_name VARCHAR(120) NULL,
  saved_category_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_favourites_user_ad (user_id, advertisement_id),
  KEY idx_favourites_ad (advertisement_id, user_id),
  CONSTRAINT fk_favourites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_favourites_ad FOREIGN KEY (advertisement_id) REFERENCES advertisements (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recently_viewed (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  advertisement_id BIGINT UNSIGNED NOT NULL,
  viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recently_viewed_user_ad (user_id, advertisement_id),
  KEY idx_recently_viewed_user_date (user_id, viewed_at),
  CONSTRAINT fk_recently_viewed_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_recently_viewed_ad FOREIGN KEY (advertisement_id) REFERENCES advertisements (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS price_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  advertisement_id BIGINT UNSIGNED NOT NULL,
  old_price DECIMAL(13, 2) NOT NULL,
  new_price DECIMAL(13, 2) NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_price_history_ad_date (advertisement_id, changed_at),
  CONSTRAINT fk_price_history_ad FOREIGN KEY (advertisement_id) REFERENCES advertisements (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wishlist_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  notify_price_drops BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_wishlist_preferences_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  buyer_id BIGINT UNSIGNED NOT NULL,
  seller_id BIGINT UNSIGNED NOT NULL,
  advertisement_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversation_buyer_seller_ad (buyer_id, seller_id, advertisement_id),
  KEY idx_conversation_seller_updated (seller_id, updated_at),
  KEY idx_conversation_buyer_updated (buyer_id, updated_at),
  CONSTRAINT fk_conversation_buyer FOREIGN KEY (buyer_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_seller FOREIGN KEY (seller_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_ad FOREIGN KEY (advertisement_id) REFERENCES advertisements (id) ON DELETE SET NULL,
  CONSTRAINT chk_conversation_different_users CHECK (buyer_id != seller_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  last_read_at TIMESTAMP NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id),
  KEY idx_conversation_participant_inbox (user_id, is_archived, updated_at),
  CONSTRAINT fk_conversation_participant_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_participant_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  receiver_id BIGINT UNSIGNED NOT NULL,
  advertisement_id BIGINT UNSIGNED NULL,
  message TEXT NOT NULL,
  message_type ENUM('text', 'image') NOT NULL DEFAULT 'text',
  message_content TEXT NULL,
  attachment_url VARCHAR(2048) NULL,
  attachment_public_id VARCHAR(255) NULL,
  delivered_at TIMESTAMP NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_messages_conversation_time (conversation_id, created_at, id),
  KEY idx_messages_inbox (receiver_id, is_read, created_at),
  KEY idx_messages_sender (sender_id, created_at),
  KEY idx_messages_ad (advertisement_id),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_ad FOREIGN KEY (advertisement_id) REFERENCES advertisements (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS seller_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  business_name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  logo_url VARCHAR(2048) NULL,
  description TEXT NULL,
  email VARCHAR(254) NULL,
  phone VARCHAR(32) NULL,
  whatsapp VARCHAR(32) NULL,
  website_url VARCHAR(2048) NULL,
  address VARCHAR(255) NULL,
  state VARCHAR(100) NULL,
  city VARCHAR(120) NULL,
  years_in_business SMALLINT UNSIGNED NULL,
  operating_hours VARCHAR(500) NULL,
  category_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seller_profiles_user (user_id),
  UNIQUE KEY uq_seller_profiles_slug (slug),
  KEY idx_seller_profiles_category (category_id),
  CONSTRAINT fk_seller_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_seller_profiles_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS seller_verifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  verification_type ENUM('individual', 'registered_business', 'renewable_energy_company') NOT NULL,
  business_name VARCHAR(160) NULL,
  registration_number VARCHAR(100) NULL,
  business_address VARCHAR(255) NOT NULL,
  business_phone VARCHAR(32) NOT NULL,
  business_owner VARCHAR(120) NULL,
  business_email VARCHAR(254) NULL,
  whatsapp VARCHAR(32) NULL,
  state VARCHAR(100) NULL,
  city VARCHAR(120) NULL,
  business_description TEXT NULL,
  website VARCHAR(2048) NULL,
  business_category_id BIGINT UNSIGNED NULL,
  cac_document_path VARCHAR(255) NULL,
  identity_document_path VARCHAR(255) NULL,
  additional_document_path VARCHAR(255) NULL,
  document_path VARCHAR(255) NOT NULL,
  status ENUM('pending', 'verified', 'rejected', 'information_requested', 'revoked') NOT NULL DEFAULT 'pending',
  admin_notes VARCHAR(1000) NULL,
  rejection_reason VARCHAR(1000) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_seller_verifications_user (user_id, submitted_at),
  KEY idx_seller_verifications_status (status, submitted_at),
  KEY idx_seller_verifications_category (business_category_id),
  CONSTRAINT fk_seller_verifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_seller_verifications_category FOREIGN KEY (business_category_id) REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_seller_verifications_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS advertisement_analytics (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  advertisement_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('view') NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ad_analytics_ad_time (advertisement_id, occurred_at),
  KEY idx_ad_analytics_time (occurred_at),
  CONSTRAINT fk_ad_analytics_ad FOREIGN KEY (advertisement_id) REFERENCES advertisements (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500) NOT NULL,
  related_advertisement_id BIGINT UNSIGNED NULL,
  dedupe_key VARCHAR(191) NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, is_read, created_at),
  UNIQUE KEY uq_notifications_user_dedupe (user_id, dedupe_key),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_ad FOREIGN KEY (related_advertisement_id) REFERENCES advertisements (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  administrator_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  previous_value JSON NULL,
  new_value JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_audit_created (created_at),
  KEY idx_admin_audit_actor (administrator_id, created_at),
  KEY idx_admin_audit_entity (entity_type, entity_id, created_at),
  CONSTRAINT fk_admin_audit_actor FOREIGN KEY (administrator_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_id BIGINT UNSIGNED NOT NULL,
  advertisement_id BIGINT UNSIGNED NULL,
  seller_id BIGINT UNSIGNED NULL,
  conversation_id BIGINT UNSIGNED NULL,
  message_id BIGINT UNSIGNED NULL,
  category ENUM('fraud', 'fake_seller', 'misleading_description', 'incorrect_price', 'duplicate', 'suspicious_activity', 'inappropriate_content', 'message_abuse', 'other') NOT NULL,
  description VARCHAR(2000) NOT NULL,
  status ENUM('open', 'investigating', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  admin_notes VARCHAR(2000) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reports_status_date (status, created_at),
  KEY idx_reports_reporter_date (reporter_id, created_at),
  KEY idx_reports_ad (advertisement_id),
  KEY idx_reports_conversation (conversation_id),
  KEY idx_reports_message (message_id),
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_ad FOREIGN KEY (advertisement_id) REFERENCES advertisements (id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_seller FOREIGN KEY (seller_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_message FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  advertisement_id BIGINT UNSIGNED NULL,
  payment_type ENUM('featured_ad', 'promotion', 'other') NOT NULL,
  amount DECIMAL(13, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  status ENUM('pending', 'succeeded', 'failed') NOT NULL DEFAULT 'pending',
  provider VARCHAR(80) NOT NULL,
  provider_reference VARCHAR(191) NOT NULL,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_provider_reference (provider, provider_reference),
  KEY idx_payment_status_date (status, created_at),
  KEY idx_payment_user_date (user_id, created_at),
  CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_ad FOREIGN KEY (advertisement_id) REFERENCES advertisements (id) ON DELETE SET NULL,
  CONSTRAINT chk_payment_amount CHECK (amount >= 0),
  CONSTRAINT chk_verified_payment CHECK (status != 'succeeded' OR verified_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS category_subcategories (
  category_id BIGINT UNSIGNED NOT NULL,
  subcategory_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (category_id, subcategory_id),
  UNIQUE KEY uq_category_subcategory (subcategory_id),
  CONSTRAINT fk_category_subcategories_parent FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE,
  CONSTRAINT fk_category_subcategories_child FOREIGN KEY (subcategory_id) REFERENCES categories (id) ON DELETE CASCADE,
  CONSTRAINT chk_category_not_own_parent CHECK (category_id != subcategory_id)
) ENGINE=InnoDB;
