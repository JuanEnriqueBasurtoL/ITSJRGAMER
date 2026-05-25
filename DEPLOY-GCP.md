# Despliegue en Google Cloud con Docker

Este proyecto ya no usa Flask. Tu app real funciona con:

- Angular SSR
- Express
- MySQL/MariaDB

Por eso, para Docker en la nube solo necesitas 2 contenedores:

1. `db-server`
2. `itsjrgamer-app`

La app SSR ya sirve frontend y backend desde el mismo contenedor, asi que no hace falta un tercer contenedor solo para Angular.

## Archivos listos

- `Dockerfile`
- `docker-compose.yml`
- `db/init.sql`

## Que hace cada uno

### `db/init.sql`

Carga automaticamente tu base `itsjrgamer_db` con la estructura y datos del respaldo que compartiste.

### `Dockerfile`

- instala dependencias
- compila Angular SSR
- deja lista la app para ejecutar `server.mjs`

### `docker-compose.yml`

- levanta MariaDB
- espera a que la base este sana
- levanta la app conectada al servicio `db-server`
- publica el sitio en el puerto `80`

## Importante sobre la IP publica

No fue necesario meter `136.116.132.5` dentro del codigo porque tu app Angular SSR y tu API Express viven juntas.

Cuando Docker levante todo en la VM, podras entrar directamente con:

`http://136.116.132.5`

## Comandos en la VM

```bash
sudo apt-get update
sudo apt-get install docker.io docker-compose-v2 git -y
sudo usermod -aG docker $USER
```

Despues:

```bash
git clone TU_REPO
cd ITSJRGAMER
sudo docker compose up -d --build
```

## Notas

- La base usa `rootpassword` dentro de Docker.
- La app dentro del contenedor escucha en `4000`, pero compose la publica como `80`.
- Si ya levantaste una base local en la VM usando el puerto `3306`, detenla antes de usar este compose.

## Reinicializar la base desde cero

Si quieres volver a cargar `db/init.sql` desde cero:

```bash
sudo docker compose down -v
sudo docker compose up -d --build
```
