# Alcance de las pruebas de interfaz

`tests/frontend.test.tsx` ejecuta React con Testing Library y JSDOM contra un servidor HTTP real creado con `createApp` y SQLite en memoria. No sustituye una prueba de navegador, Android, TalkBack, contraste visual o rendimiento de un teléfono.

```bash
node --import tsx --test tests/frontend.test.tsx
```

Las pruebas cubren carga de unidades desde la API, transparencia de simulación y accesibilidad desconocida, planear y guardar un viaje, persistencia tras remontar React, validación de origen igual a destino, búsqueda por alias, ajustes de lectura/contraste, cambio de escenario, envío y persistencia de reportes, conservación del texto ante fallo, modo parada y simulación sin servidor.

También retienen solicitudes HTTP para comprobar que una respuesta antigua no borre un borrador nuevo ni atribuya unidades a otra estación. Verifican que abrir la estación actual restablezca filtros incompatibles, que el kiosco bloqueado no lea preferencias personales ni exponga salida/guardados, y que volver a una pestaña visible actualice información inmediatamente. Los nombres accesibles de unidades incluyen afluencia y aire acondicionado simulados.

Solo se sustituyen APIs de plataforma ausentes en JSDOM: apertura/cierre nativo de `dialog`, desplazamiento, `matchMedia` y síntesis de voz. Los tests de diálogo verifican su estado abierto y contenido, sin afirmar comportamiento de la capa modal, foco nativo o lectura real de pantalla. La síntesis de voz verifica el mensaje solicitado, no el audio del dispositivo.

La función global `fetch` conserva el cliente HTTP real y convierte las URLs relativas `/api/...` al puerto temporal del servidor. Dos casos fuerzan fallos de transporte para comprobar recuperación y conservación de texto. No se sustituyen el planificador, predicciones, datos regionales, validación de reportes ni consultas SQLite. Cada prueba desmonta React para cancelar los temporizadores; al terminar se cierran conexiones, base de datos y JSDOM.
