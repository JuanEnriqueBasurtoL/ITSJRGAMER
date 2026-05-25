USE itsjrgamer_db;

INSERT INTO roles (role_name, role_description)
SELECT 'admin', 'Administrador del sistema ITSJR Gamer'
WHERE NOT EXISTS (
  SELECT 1
  FROM roles
  WHERE role_name = 'admin'
);

INSERT INTO users (
  role_id,
  career_id,
  first_name,
  last_name,
  username,
  email,
  password_hash,
  phone,
  bio,
  profile_image_name,
  profile_image_mime,
  profile_image_data,
  terms_accepted,
  email_verified,
  account_status,
  last_login_at
)
SELECT
  r.role_id,
  NULL,
  'Admin',
  'ITSJR Gamer',
  'AdminITSJR',
  'admin@itsjrgamer.local',
  'scrypt:d219190ebb13f275823dafa920b4279d:0f031cdbf023c6f9b41d4982eba14107ece8f455886f7438ded385dd3cfe18ba02fecab9e33548435c69d2a94d9c8a8b19f47bfa1cf614a35c513b2e5ca8ae9b',
  NULL,
  'Cuenta administradora principal',
  NULL,
  NULL,
  NULL,
  1,
  1,
  'active',
  NULL
FROM roles r
WHERE r.role_name = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM users
    WHERE email = 'admin@itsjrgamer.local'
       OR username = 'AdminITSJR'
  );

-- Credenciales iniciales:
-- Correo: admin@itsjrgamer.local
-- Contrasena: Admin123!
