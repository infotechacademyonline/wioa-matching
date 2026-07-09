-- Pretend offices and participants, just for testing.
-- Paste this into the Neon SQL editor AFTER you've run schema.sql.

INSERT INTO offices (name, address, city, state, zip, phone, hours) VALUES
  ('Dallas WIOA Office', '1500 Marilla St', 'Dallas', 'TX', '75201', '214-555-0100', 'Mon-Fri 9-5'),
  ('Houston WIOA Office', '611 Walker St', 'Houston', 'TX', '77002', '713-555-0100', 'Mon-Fri 9-5'),
  ('Austin WIOA Office', '301 W 2nd St', 'Austin', 'TX', '78701', '512-555-0100', 'Mon-Fri 9-5');

INSERT INTO participants (full_name, email, address, city, state, zip) VALUES
  ('Jane Test', 'jane@example.com', '400 S Zang Blvd', 'Dallas', 'TX', '75208'),
  ('John Sample', 'john@example.com', '2800 S Post Oak Rd', 'Houston', 'TX', '77056');
