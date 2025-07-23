-- Hotel TV Management System Database Schema

-- System settings
CREATE TABLE system_settings (
  id SERIAL PRIMARY KEY,
  hotel_name VARCHAR(255),
  hotel_logo_url TEXT,
  admin_username VARCHAR(100),
  admin_password_hash VARCHAR(255),
  pms_base_url VARCHAR(255),
  pms_api_key VARCHAR(255),
  pms_username VARCHAR(100),
  pms_password_hash VARCHAR(255),
  pms_connection_status VARCHAR(50) DEFAULT 'disconnected',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TV devices
CREATE TABLE devices (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(100) UNIQUE NOT NULL,
  room_number VARCHAR(20),
  status VARCHAR(20) DEFAULT 'inactive', -- active, inactive
  last_sync TIMESTAMP,
  is_online BOOLEAN DEFAULT false,
  last_notification TEXT,
  assigned_bundle_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Media bundles
CREATE TABLE media_bundles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Media content
CREATE TABLE media_content (
  id SERIAL PRIMARY KEY,
  bundle_id INTEGER REFERENCES media_bundles(id) ON DELETE CASCADE,
  type VARCHAR(20), -- image, video
  content_url TEXT NOT NULL,
  title VARCHAR(255),
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Apps management
CREATE TABLE apps (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  package_name VARCHAR(255) UNIQUE NOT NULL,
  apk_url TEXT,
  app_logo_url TEXT,
  is_allowed BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Guest data (synced from PMS)
CREATE TABLE guest_data (
  id SERIAL PRIMARY KEY,
  room_number VARCHAR(20) NOT NULL,
  guest_name VARCHAR(255),
  check_in TIMESTAMP,
  check_out TIMESTAMP,
  last_pms_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bills (synced from PMS)
CREATE TABLE bills (
  id SERIAL PRIMARY KEY,
  room_number VARCHAR(20) NOT NULL,
  label VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  bill_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_pms_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(100),
  room_number VARCHAR(20),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'new', -- new, sent, viewed, dismissed
  notification_type VARCHAR(50) DEFAULT 'manual', -- manual, welcome, farewell, system
  guest_name VARCHAR(255), -- for personalized notifications
  scheduled_for TIMESTAMP,
  sent_at TIMESTAMP,
  viewed_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_devices_room_number ON devices(room_number);
CREATE INDEX idx_guest_data_room_number ON guest_data(room_number);
CREATE INDEX idx_bills_room_number ON bills(room_number);
CREATE INDEX idx_notifications_device_id ON notifications(device_id);
CREATE INDEX idx_notifications_room_number ON notifications(room_number);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_scheduled_for ON notifications(scheduled_for);

-- Create triggers for automatic updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_media_bundles_updated_at BEFORE UPDATE ON media_bundles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_apps_updated_at BEFORE UPDATE ON apps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_guest_data_updated_at BEFORE UPDATE ON guest_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default system settings
INSERT INTO system_settings (hotel_name, admin_username, admin_password_hash) 
VALUES ('Hotel TV Management', 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'); -- password: 'password'

-- Insert default media bundle
INSERT INTO media_bundles (name, is_default) VALUES ('Default Bundle', true);

-- Insert default apps
INSERT INTO apps (name, package_name, is_allowed, sort_order) VALUES 
('Netflix', 'com.netflix.mediaclient', true, 1),
('YouTube', 'com.google.android.youtube.tv', true, 2),
('Prime Video', 'com.amazon.avod.thirdpartyclient', true, 3),
('Disney+', 'com.disney.disneyplus', true, 4),
('Spotify', 'com.spotify.tv.android', true, 5);
