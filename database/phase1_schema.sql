-- Phase 1 relational schema for PopNic POS
-- Target: MySQL 8.0+ on Aiven for MySQL
-- Tool:   MySQL Workbench (run via File > Run SQL Script, or paste into a query tab)
-- Requires: InnoDB engine, utf8mb4 charset
--
-- Aiven connection setup (MySQL Workbench):
--   1. In Workbench, create a new connection using the host, port, and user from Aiven console.
--   2. Under SSL tab, set "Use SSL" = "Require" and point to the CA cert downloaded from Aiven.
--   3. Set "Default Schema" to your Aiven database name (usually `defaultdb`).

SET NAMES utf8mb4;

-- ========== Users / Auth Profile ==========
-- auth_uid should map to your auth provider UID
CREATE TABLE IF NOT EXISTS app_user (
  id              BIGINT          NOT NULL AUTO_INCREMENT,
  auth_uid        VARCHAR(255)    NOT NULL,
  user_type       ENUM('customer','employee') NOT NULL,
  email           VARCHAR(255)    DEFAULT NULL,
  phone           VARCHAR(50)     DEFAULT NULL,
  display_name    VARCHAR(255)    DEFAULT NULL,
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_user_auth_uid (auth_uid),
  INDEX idx_app_user_phone (phone),
  INDEX idx_app_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_profile (
  user_id         BIGINT          NOT NULL,
  role            ENUM('cashier','kitchen','manager','admin') NOT NULL,
  location_code   VARCHAR(50)     DEFAULT NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_employee_user
    FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_profile (
  user_id         BIGINT          NOT NULL,
  loyalty_points  INT             NOT NULL DEFAULT 0,
  loyalty_tier    ENUM('bronze','silver','gold','platinum') NOT NULL DEFAULT 'bronze',
  total_spent     DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  orders_count    INT             NOT NULL DEFAULT 0,
  joined_date     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_visit      TIMESTAMP       NULL DEFAULT NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_customer_user
    FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
  CONSTRAINT chk_customer_loyalty_points CHECK (loyalty_points >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== Menu / Inventory ==========
CREATE TABLE IF NOT EXISTS menu_item (
  id              BIGINT          NOT NULL AUTO_INCREMENT,
  name            VARCHAR(255)    NOT NULL,
  category        VARCHAR(100)    NOT NULL,
  price           DECIMAL(10,2)   NOT NULL,
  cost            DECIMAL(10,2)   NOT NULL,
  available       BOOLEAN         NOT NULL DEFAULT TRUE,
  is_combo        BOOLEAN         NOT NULL DEFAULT FALSE,
  points_value    INT             NOT NULL DEFAULT 0,
  metadata        JSON            NOT NULL DEFAULT (JSON_OBJECT()),
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_menu_item_category (category),
  INDEX idx_menu_item_available (available),
  CONSTRAINT chk_menu_item_price       CHECK (price >= 0),
  CONSTRAINT chk_menu_item_cost        CHECK (cost >= 0),
  CONSTRAINT chk_menu_item_points      CHECK (points_value >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_item (
  id              BIGINT          NOT NULL AUTO_INCREMENT,
  name            VARCHAR(255)    NOT NULL,
  quantity        DECIMAL(12,3)   NOT NULL DEFAULT 0.000,
  unit            VARCHAR(50)     NOT NULL,
  reorder_level   DECIMAL(12,3)   NOT NULL DEFAULT 0.000,
  cost_per_unit   DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  last_updated    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inventory_item_name (name),
  CONSTRAINT chk_inventory_quantity    CHECK (quantity >= 0),
  CONSTRAINT chk_inventory_reorder     CHECK (reorder_level >= 0),
  CONSTRAINT chk_inventory_cost        CHECK (cost_per_unit >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_item_inventory (
  menu_item_id      BIGINT        NOT NULL,
  inventory_item_id BIGINT        NOT NULL,
  quantity_used     DECIMAL(12,3) NOT NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (menu_item_id, inventory_item_id),
  INDEX idx_mii_inventory_item_id (inventory_item_id),
  CONSTRAINT fk_mii_menu_item
    FOREIGN KEY (menu_item_id) REFERENCES menu_item(id) ON DELETE CASCADE,
  CONSTRAINT fk_mii_inventory_item
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_item(id) ON DELETE RESTRICT,
  CONSTRAINT chk_mii_quantity_used CHECK (quantity_used > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== Orders ==========
CREATE TABLE IF NOT EXISTS customer_order (
  id                BIGINT        NOT NULL AUTO_INCREMENT,
  order_number      INT           NOT NULL,
  order_type        ENUM('dine_in','pickup','delivery') NOT NULL DEFAULT 'dine_in',
  status            ENUM('pending','preparing','ready','completed','cancelled') NOT NULL DEFAULT 'pending',
  total             DECIMAL(10,2) NOT NULL,

  customer_user_id  BIGINT        DEFAULT NULL,
  customer_name     VARCHAR(255)  DEFAULT NULL,
  customer_phone    VARCHAR(50)   DEFAULT NULL,

  table_number      INT           DEFAULT NULL,
  delivery_address  TEXT          DEFAULT NULL,
  notes             TEXT          DEFAULT NULL,

  payment_method    ENUM('cash','card','digital') DEFAULT NULL,
  points_earned     INT           NOT NULL DEFAULT 0,
  points_redeemed   INT           NOT NULL DEFAULT 0,

  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at      TIMESTAMP     NULL DEFAULT NULL,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_order_number (order_number),
  INDEX idx_customer_order_status (status),
  INDEX idx_customer_order_created_at (created_at DESC),
  INDEX idx_customer_order_customer_phone (customer_phone),
  INDEX idx_customer_order_customer_user_id (customer_user_id),
  CONSTRAINT fk_order_customer
    FOREIGN KEY (customer_user_id) REFERENCES app_user(id) ON DELETE SET NULL,
  CONSTRAINT chk_order_total           CHECK (total >= 0),
  CONSTRAINT chk_order_points_earned   CHECK (points_earned >= 0),
  CONSTRAINT chk_order_points_redeemed CHECK (points_redeemed >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_item (
  id                BIGINT        NOT NULL AUTO_INCREMENT,
  order_id          BIGINT        NOT NULL,
  menu_item_id      BIGINT        DEFAULT NULL,
  line_name         VARCHAR(255)  NOT NULL,
  quantity          INT           NOT NULL,
  unit_price        DECIMAL(10,2) NOT NULL,
  paid_with_points  BOOLEAN       NOT NULL DEFAULT FALSE,
  notes             TEXT          DEFAULT NULL,
  customizations    JSON          NOT NULL DEFAULT (JSON_OBJECT()),
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_order_item_order_id (order_id),
  INDEX idx_order_item_menu_item_id (menu_item_id),
  CONSTRAINT fk_oi_order
    FOREIGN KEY (order_id) REFERENCES customer_order(id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_menu_item
    FOREIGN KEY (menu_item_id) REFERENCES menu_item(id) ON DELETE SET NULL,
  CONSTRAINT chk_oi_quantity   CHECK (quantity > 0),
  CONSTRAINT chk_oi_unit_price CHECK (unit_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== Audit (optional but useful for employee actions) ==========
CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGINT        NOT NULL AUTO_INCREMENT,
  actor_user_id   BIGINT        DEFAULT NULL,
  action_type     VARCHAR(100)  NOT NULL,
  entity_type     VARCHAR(100)  NOT NULL,
  entity_id       VARCHAR(255)  NOT NULL,
  payload         JSON          NOT NULL DEFAULT (JSON_OBJECT()),
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_audit_log_actor_user_id (actor_user_id),
  INDEX idx_audit_log_created_at (created_at DESC),
  CONSTRAINT fk_audit_actor
    FOREIGN KEY (actor_user_id) REFERENCES app_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== Notes ==========
-- 1) Inventory deduction should be handled in a transaction when inserting orders.
-- 2) Keep historical order_item.unit_price and line_name immutable for reporting.
-- 3) Use app_user/auth_uid + role checks to enforce employee/customer access rules.
-- 4) Aiven for MySQL: SSL is required by default — configure in Workbench SSL tab.
-- 5) JSON columns use expression defaults (MySQL 8.0.13+): DEFAULT (JSON_OBJECT()).
-- 6) All tables use IF NOT EXISTS so this script is safe to re-run from Workbench.
