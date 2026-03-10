# 🔐 Dashboard Ecommerce API

Sistema de autenticación y control de acceso basado en roles (RBAC) con arquitectura multi-tenant para un dashboard de ecommerce.

---

## 📖 ¿Qué es este proyecto?

Es una **API REST** que maneja todo lo relacionado con:

- **Autenticación:** registro, login, logout, recuperación de contraseña
- **Autorización:** cada usuario tiene roles, y cada rol tiene permisos que definen qué puede hacer
- **Multi-tenancy:** varias empresas (tenants) usan la misma API pero cada una tiene sus propios usuarios, roles y permisos separados

### ¿Qué es RBAC?

RBAC significa **Role-Based Access Control** (Control de Acceso Basado en Roles). En vez de darle permisos directamente a cada usuario, los permisos se agrupan en roles y los roles se asignan a usuarios.

```
Usuario "Santiago"
   └── Rol "Administrador"
         ├── ventas.facturas.ver
         ├── ventas.facturas.crear
         ├── ventas.facturas.editar
         └── ventas.facturas.eliminar
```

### ¿Qué es Multi-Tenant?

Imagina que tienes 3 empresas usando tu dashboard: "Vestel", "TiendaX" y "ShopPlus". Cada una es un **tenant** (inquilino). Comparten el mismo código y la misma base de datos, pero sus datos están completamente separados. Un usuario de Vestel nunca ve datos de TiendaX.

---

## 🛠️ Stack Tecnológico

| Tecnología | Para qué se usa |
|-----------|----------------|
| **NestJS 11** | Framework del backend (como Express pero con estructura organizada) |
| **Prisma 6** | ORM para interactuar con la base de datos (en vez de escribir SQL a mano) |
| **PostgreSQL** | Base de datos relacional |
| **JWT** | Tokens de autenticación (para saber quién está haciendo el request) |
| **bcrypt** | Hasheo de contraseñas (nunca se guarda la contraseña en texto plano) |
| **Nodemailer** | Envío de correos electrónicos (recuperación de contraseña) |
| **pnpm** | Manejador de paquetes (como npm pero más rápido) |

---

## 🏗️ Estructura del Proyecto

```
dashboard-ecommerce-api/
│
├── prisma/
│   └── schema.prisma              # Definición de las tablas de la BD
│
├── generated/
│   └── prisma/                    # Cliente de Prisma (auto-generado, NO tocar)
│
├── src/
│   ├── main.ts                    # Punto de entrada. Arranca la app en puerto 3001
│   ├── app.module.ts              # Módulo raíz que importa todos los demás
│   │
│   ├── prisma/                    # 🗄️ Conexión a la base de datos
│   │   ├── prisma.module.ts       # Módulo global (disponible en toda la app)
│   │   └── prisma.service.ts      # Servicio que conecta/desconecta de la BD
│   │
│   ├── email/                     # 📧 Envío de correos
│   │   ├── email.module.ts        # Módulo global
│   │   └── email.service.ts       # Lógica de envío con Nodemailer
│   │
│   ├── auth/                      # 🔐 Autenticación
│   │   ├── auth.module.ts         # Configura JWT y exporta el módulo
│   │   ├── auth.controller.ts     # Define las rutas (endpoints)
│   │   ├── auth.service.ts        # Lógica: login, register, tokens, etc.
│   │   ├── guards/
│   │   │   ├── jwt.guard.ts       # Verifica que el request tenga un JWT válido
│   │   │   └── permission.guard.ts # Verifica que el usuario tenga el permiso necesario
│   │   └── decorators/
│   │       ├── current-user.decorator.ts       # @CurrentUser() → saca datos del token
│   │       └── require-permission.decorator.ts # @RequirePermission() → define qué permiso necesita
│   │
│   ├── users/                     # 👤 CRUD de usuarios
│   │   ├── users.module.ts
│   │   ├── users.controller.ts    # Rutas: listar, crear, editar, eliminar, asignar roles
│   │   └── users.service.ts       # Lógica de usuarios
│   │
│   ├── roles/                     # 🛡️ CRUD de roles
│   │   ├── roles.module.ts
│   │   ├── roles.controller.ts    # Rutas: listar, crear, editar, eliminar, asignar permisos
│   │   └── roles.service.ts       # Lógica de roles
│   │
│   └── permissions/               # 🔑 CRUD de permisos
│       ├── permissions.module.ts
│       ├── permissions.controller.ts # Rutas: listar, crear, bulk, agrupar
│       └── permissions.service.ts    # Lógica de permisos
│
├── .env                           # Variables de entorno (NO subir a Git)
├── package.json
├── tsconfig.json
└── nest-cli.json
```

---

## 🧩 ¿Cómo funciona NestJS? (Para Juniors)

NestJS organiza el código en 3 piezas:

### Module (el contenedor)
Agrupa todo lo relacionado a un tema. Ejemplo: el `AuthModule` contiene el controller y service de autenticación.

### Controller (las rutas)
Define los endpoints (URLs). Recibe el request, llama al service y devuelve la respuesta. Es como `router.get('/users')` en Express.

### Service (la lógica)
Donde se hace el trabajo pesado: consultas a la BD, validaciones, hasheo de contraseñas, generación de tokens.

```
Request → Controller → Service → Base de datos
                ↓
            Response
```

### Comparación con Express

```javascript
// EXPRESS
router.post('/login', async (req, res) => {
  const user = await db.query('SELECT * FROM users WHERE email = ?', [req.body.email]);
  const token = jwt.sign({ id: user.id }, secret);
  res.json({ token });
});

// NESTJS
// auth.controller.ts
@Post('login')
login(@Body() body: { email: string; password: string }) {
  return this.authService.login(body);
}

// auth.service.ts
async login(data: { email: string; password: string }) {
  const user = await this.prisma.users.findUnique({ where: { email: data.email } });
  const token = this.jwtService.sign({ sub: user.id });
  return { token };
}
```

### Decoradores que vas a ver mucho

| Decorador | Qué hace |
|-----------|----------|
| `@Module()` | Marca una clase como módulo |
| `@Controller('ruta')` | Marca una clase como controller con un prefijo de ruta |
| `@Injectable()` | Marca una clase como service inyectable |
| `@Get()`, `@Post()`, `@Patch()`, `@Delete()` | Define el método HTTP |
| `@Body()` | Extrae el body del request (como `req.body`) |
| `@Param('id')` | Extrae un parámetro de la URL (como `req.params.id`) |
| `@Query()` | Extrae query params (como `req.query`) |
| `@UseGuards()` | Aplica un guard de seguridad antes de ejecutar el endpoint |
| `@Global()` | Hace que un módulo esté disponible en toda la app sin importarlo |

---

## 🔒 ¿Cómo funciona la autenticación?

### Tokens: Access Token vs Refresh Token

Cuando un usuario hace login, recibe 2 tokens:

| Token | Duración | Para qué |
|-------|----------|----------|
| **Access Token** (JWT) | 15 minutos | Se envía en cada request para identificar al usuario |
| **Refresh Token** | 30 días | Se usa para obtener un nuevo access token cuando expira |

**¿Por qué 2 tokens?** Por seguridad. Si alguien roba el access token, solo tiene 15 minutos para usarlo. El refresh token está guardado hasheado en la base de datos y se puede invalidar.

### Flujo completo

```
1. Usuario hace login
   → Recibe access_token + refresh_token

2. Usuario navega por el dashboard (cada request lleva el access_token)
   → Header: Authorization: Bearer eyJhbGci...

3. A los 15 minutos el access_token expira
   → El frontend automáticamente llama a /auth/refresh con el refresh_token
   → Recibe tokens nuevos
   → El usuario ni se entera

4. Si pasan 30 días sin usar la app
   → El refresh_token expira
   → Ahí sí toca hacer login de nuevo
```

### Rotación de Tokens

Cada vez que usas el refresh token para pedir tokens nuevos, el viejo se invalida y se genera uno nuevo. Esto es la **rotación**, y evita que alguien reutilice un refresh token robado.

---

## 🛡️ ¿Cómo funcionan los Guards?

Los guards son como **porteros** que deciden si un request puede pasar o no.

### JwtGuard (¿Estás autenticado?)

Verifica que el request traiga un JWT válido en el header. Si no lo tiene o está expirado, devuelve 401.

```
Request sin token → JwtGuard → ❌ 401 Unauthorized
Request con token → JwtGuard → ✅ Pasa al endpoint
```

### PermissionGuard (¿Tienes permiso?)

Verifica que el usuario tenga el permiso necesario para ese endpoint. Si no lo tiene, devuelve 403.

```
Usuario sin permiso → PermissionGuard → ❌ 403 Forbidden
Usuario con permiso → PermissionGuard → ✅ Ejecuta el endpoint
Super Admin         → PermissionGuard → ✅ Siempre pasa
```

### Cómo se usan en el código

```typescript
// Endpoint público (sin guards)
@Post('login')
login() { ... }

// Endpoint protegido (solo necesita estar autenticado)
@UseGuards(JwtGuard)
@Get('me')
getProfile() { ... }

// Endpoint protegido con permiso específico
@UseGuards(JwtGuard, PermissionGuard)
@RequirePermission('ventas', 'facturas', 'crear')
@Post()
crearFactura() { ... }
```

---

## 📊 Base de Datos

### Diagrama de relaciones

```
tenants (empresas)
   │
   ├──1:N──► permissions (permisos atómicos por tenant)
   │              │
   │              └──M:N──► role_permissions ──M:N──► roles (con herencia)
   │                                                    │
   ├──1:N──► users ◄──M:N── user_roles ────M:N─────────┘
   │           │
   │           ├── user_sessions (refresh tokens hasheados)
   │           ├── password_history (últimas 5 contraseñas)
   │           ├── password_reset_codes (códigos de recuperación)
   │           ├── audit_log (registro de acciones)
   │           └── login_attempts (intentos de login)
   │
   ├──1:N──► user_sessions
   ├──1:N──► audit_log
   └──1:N──► login_attempts
```

### Tablas (11 en total)

| Tabla | Descripción |
|-------|-------------|
| `tenants` | Empresas/tiendas del sistema |
| `users` | Usuarios. `tenant_id` NULL para super admins |
| `roles` | Roles por tenant. Soporta herencia via `parent_role_id` |
| `permissions` | Permisos atómicos: `modulo.submodulo.accion` |
| `role_permissions` | Qué permisos tiene cada rol (M:N) |
| `user_roles` | Qué roles tiene cada usuario (M:N). Soporta roles temporales con `expires_at` |
| `user_sessions` | Sesiones activas con refresh token hasheado (SHA-256) |
| `audit_log` | Registro de acciones con datos anteriores y nuevos (JSONB) |
| `login_attempts` | Intentos de login exitosos y fallidos |
| `password_history` | Historial de contraseñas (evita reutilizar las últimas 5) |
| `password_reset_codes` | Códigos de 6 dígitos para recuperar contraseña (expiran en 5 min) |

### Convención de permisos

Formato: `modulo.submodulo.accion`

Las 4 acciones base: `ver`, `crear`, `editar`, `eliminar`

Ejemplos:
- `ventas.facturas.ver` → puede ver facturas
- `configuracion.usuarios.crear` → puede crear usuarios
- `tesoreria.transacciones.editar` → puede editar transacciones

### Funciones de PostgreSQL

La BD tiene funciones que manejan la lógica de permisos con herencia:

| Función | Qué hace |
|---------|----------|
| `get_user_permissions(user_id)` | Retorna TODOS los permisos de un usuario, incluyendo los heredados de roles padre |
| `user_has_permission(user_id, module, submodule, action)` | Verifica si tiene un permiso específico (retorna TRUE/FALSE) |
| `get_tenant_user_permissions(user_id, tenant_id)` | Lo mismo pero filtrado por tenant |
| `tenant_user_has_permission(...)` | Verificación rápida dentro de un tenant |
| `validate_user_tenant(user_id, tenant_id)` | Valida que el usuario pertenece al tenant |

### Triggers

La BD tiene triggers automáticos que actualizan el campo `updated_at` cada vez que se modifica un registro en: `tenants`, `permissions`, `roles`, `users`.

---

## 🌐 Endpoints de la API (41 rutas)

Base URL: `http://localhost:3001/api/v1`

### 🔓 Auth — Públicos (no necesitan token)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registrar un usuario nuevo |
| POST | `/auth/login` | Login → retorna access_token + refresh_token |
| POST | `/auth/refresh` | Renovar tokens (enviar refresh_token) |
| POST | `/auth/forgot-password` | Paso 1: enviar código al email |
| POST | `/auth/verify-code` | Paso 2: verificar el código |
| POST | `/auth/reset-password` | Paso 3: cambiar la contraseña |

### 🔐 Auth — Protegidos (necesitan JWT en el header)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/auth/me` | Perfil del usuario + roles + permisos |
| POST | `/auth/logout` | Cerrar sesión actual |
| POST | `/auth/logout-all` | Cerrar TODAS las sesiones |
| GET | `/auth/sessions` | Ver sesiones activas |
| PATCH | `/auth/change-password` | Cambiar contraseña (validando la actual) |

### 👤 Users — Protegidos (JWT + permiso `configuracion.usuarios.*`)

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| GET | `/api/v1/users` | ver | Listar usuarios (paginado + búsqueda) |
| GET | `/api/v1/users/:id` | ver | Ver un usuario |
| POST | `/api/v1/users` | crear | Crear usuario. Acepta `application/json` o `multipart/form-data` |
| PATCH | `/api/v1/users/:id` | editar | Actualizar usuario. Acepta `application/json` o `multipart/form-data` |
| DELETE | `/api/v1/users/:id` | eliminar | Eliminar usuario |
| GET | `/api/v1/users/:id/roles` | ver | Ver roles del usuario |
| POST | `/api/v1/users/:id/roles` | editar | Asignar roles al usuario |
| DELETE | `/api/v1/users/:id/roles/:roleId` | editar | Quitar un rol |
| GET | `/api/v1/users/:id/permissions` | ver | Ver permisos del usuario |

### 🛡️ Roles — Protegidos (JWT + permiso `configuracion.roles.*`)

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| GET | `/roles` | ver | Listar roles |
| GET | `/roles/:id` | ver | Ver un rol con sus permisos |
| POST | `/roles` | crear | Crear rol (opcionalmente con permisos) |
| PATCH | `/roles/:id` | editar | Actualizar rol |
| DELETE | `/roles/:id` | eliminar | Eliminar rol (no si es `is_system`) |
| GET | `/roles/:id/permissions` | ver | Permisos del rol |
| POST | `/roles/:id/permissions` | editar | Asignar permisos al rol |
| DELETE | `/roles/:id/permissions/:permissionId` | editar | Quitar un permiso |
| GET | `/roles/:id/users` | ver | Usuarios que tienen este rol |

### 🔑 Permissions — Protegidos (JWT + permiso `configuracion.roles.*`)

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| GET | `/permissions` | ver | Listar permisos (filtrar por módulo) |
| GET | `/permissions/grouped` | ver | Permisos agrupados por módulo → submódulo |
| GET | `/permissions/:id` | ver | Ver un permiso |
| POST | `/permissions` | crear | Crear un permiso |
| POST | `/permissions/bulk` | crear | Crear varios permisos de una vez |
| PATCH | `/permissions/:id` | editar | Actualizar descripción |
| DELETE | `/permissions/:id` | eliminar | Eliminar permiso |

---

## 🔄 Flujo de Recuperación de Contraseña

```
Paso 1: POST /auth/forgot-password { email }
   → Genera código de 6 dígitos
   → Lo guarda en BD (expira en 5 minutos)
   → Lo envía por correo

Paso 2: POST /auth/verify-code { email, code }
   → Valida que el código sea correcto
   → Máximo 5 intentos
   → Marca como verificado

Paso 3: POST /auth/reset-password { email, code, new_password }
   → Verifica que el código esté verificado
   → Cambia la contraseña
   → Guarda la anterior en historial
   → Cierra todas las sesiones
   → Elimina el código
```

---

## 📦 Módulos y Permisos del Sistema

El sistema tiene **420 permisos** en **24 módulos**:

| Módulo | Submódulos |
|--------|-----------|
| dashboard | principal |
| ventas | apertura, facturas, cierre, electronicas, notas, historial |
| reciclaje | tablero, facturas |
| redes | equipos, bodega, conexiones, transferencias |
| inventarios | materiales, categorias, almacenes, traspasos, actas, historial |
| ordenes | compra, servicio, historial |
| devoluciones | principal |
| usuarios | administrar, grupos |
| soporte | tickets |
| moviles | principal |
| proveedores | productos, servicios |
| encuestas | principal, llamadas, acuerdos, lista, ats |
| proyectos | principal |
| cuentas | administrar, balance, declaraciones |
| tesoreria | anulaciones, transacciones, transferencias, ingresos, gastos, importar |
| datos | estadisticas, estadisticas_servicios, estadisticas_tickets, reportes, metas, declaraciones, declaraciones_cliente, declaraciones_proveedor, declaraciones_impuesto, transacciones_clientes, calcular_ingresos, calcular_gastos, historial |
| diverso | notas, calendario, documentos |
| configuracion | empresa, facturacion, moneda, asignaciones, promociones, formato, categorias, metas, api, correo, mensajes, terminos, seguridad, tema, boletos, mikrotiks, ips, acerca, update, roles, usuarios |
| empleados | principal |
| pagos | configuracion, vias, monedas, cambio_divisas, cuentas |
| complementos | recaptcha, url, twilio, currency |
| plantillas | email, sms, tema, localizaciones |
| exportacion | personas, transacciones, productos, declaraciones, impuestos, backup |
| importacion | usuarios, productos, equipos, facturas |

Cada submódulo tiene las 4 acciones: `ver`, `crear`, `editar`, `eliminar`.

---

## 🚀 Cómo ejecutar el proyecto

### 1. Clonar e instalar

```bash
git clone <url-del-repo>
cd dashboard-ecommerce-api
pnpm install
```

### 2. Configurar variables de entorno

Crear archivo `.env` en la raíz:

```env
DATABASE_URL="postgresql://db_owner:TU_PASSWORD@190.14.233.186:5433/dashboard_ecommerce"
JWT_SECRET="un_string_random_de_al_menos_64_caracteres"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASS=tu_contraseña_de_aplicacion
SMTP_FROM_NAME=Dashboard Ecommerce
```

### 3. Generar el cliente de Prisma

```bash
npx prisma generate
```

### 4. Ejecutar en desarrollo

```bash
pnpm start:dev
```

La API arranca en `http://localhost:3001`.

### 5. Probar en Postman

- Importar la colección de Postman (`Dashboard_Ecommerce_RBAC_API.postman_collection.json`)
- Hacer login para obtener el token
- Copiar el `access_token` en el header `Authorization: Bearer <token>`

---

## 📋 Scripts SQL disponibles

| Archivo | Descripción |
|---------|-------------|
| `rbac_multitenant_v2.sql` | Crea toda la BD desde cero (tablas, índices, triggers, funciones) |
| `seed_permissions.sql` | Inserta los 420 permisos para un tenant |

---

## 🔐 Seguridad — Lo que debes saber

1. **Las contraseñas NUNCA se guardan en texto plano.** Se hashean con bcrypt (12 rondas). Ni siquiera nosotros podemos ver la contraseña original.

2. **El refresh token se guarda hasheado** con SHA-256 en la BD. Si alguien accede a la BD, no puede usar los tokens.

3. **Rotación de tokens:** cada vez que se renueva un token, el anterior se invalida.

4. **Cambio de contraseña** valida que no se repitan las últimas 5 contraseñas.

5. **Recuperación de contraseña** usa códigos de 6 dígitos que expiran en 5 minutos y tienen máximo 5 intentos.

6. **Super Admin** tiene acceso total a todo. Solo asignar a personas de absoluta confianza.

7. **Intentos de login** se registran para poder detectar ataques de fuerza bruta.

8. **El JWT_SECRET** debe ser un string largo y aleatorio. Si alguien lo conoce, puede crear tokens falsos.

---

## 📝 Conexión a la Base de Datos

| Parámetro | Valor |
|-----------|-------|
| Host | 190.14.233.186 |
| Puerto | 5433 |
| Base de datos | dashboard_ecommerce |
| Usuario | db_owner |
| Timezone | America/Bogota |

Para conectarte desde DBeaver o cualquier cliente SQL usa:

```
postgresql://db_owner:TU_PASSWORD@190.14.233.186:5433/dashboard_ecommerce
```
