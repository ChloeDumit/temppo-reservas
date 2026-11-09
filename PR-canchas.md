# Vertical de espacios: canchas, salones y alquiler por hora

Tercera vertical, al lado de clases y turnos: **espacios que se alquilan por hora** — canchas de pádel, fútbol 5, salones.

## Lo que entra

**El motor se reusa, no se duplica.** El `slots.ts` que se escribió para turnos nunca preguntó qué tipo de cosa estaba llenando: le das un id, una duración, horarios de apertura y los intervalos ocupados, y devuelve los horarios libres. Una cancha responde las cuatro. Así que esta vertical alimenta la misma función — un arreglo de horario de verano, o un bug en la grilla de pasos, se arregla una vez para las dos. El re-chequeo dentro de la transacción de reserva también es el que ya estaba probado.

**Lo genuinamente nuevo es el precio por franja.** Un club que no puede cobrar más el viernes a las 20 que el martes a las 10 está vendiendo sus mejores horas al precio de las peores. Las bandas van sobre el espacio, y un alquiler se cobra a la tarifa de la hora en que arranca — un club cotiza "la nocturna sale 1.200", no divide la cuenta a las 20:00.

**Un modelo, tres formas de uso.** Los espacios llevan las duraciones con las que se alquilan, así que una cancha por hora y un salón por tarde son el mismo modelo. Una duración que el espacio no ofrece se rechaza en vez de redondearse en silencio.

**El panel del club.** Agenda del día como grilla —canchas a lo ancho, horas a lo alto—, porque así lee un club su día y porque "¿hay algo libre a las ocho?" tiene que ser un vistazo y no una lista. Tocando media hora vacía se abre el formulario ya cargado con la cancha y la hora. Las reservas de mostrador pasan por el mismo `rentSpace` que la página pública, así que una tomada por teléfono y una tomada online no pueden superponerse.

**Carga de canchas desde la app**, no desde el seed: nombre, tipo, precio, duraciones, minutos entre reservas, días y horarios, y las tarifas especiales abajo. Dar de baja desactiva en vez de borrar, porque borrar se llevaría el historial.

**Panel de inicio** con lo que se pregunta en el mostrador: cuántas canchas ocupadas ahora, cuánto se reservó hoy, y qué viene en las próximas horas.

**El link público:** `/r/<slug>`. Elegís qué querés jugar, por cuánto tiempo, cualquier cancha o una puntual, y después día y horario con su precio. Sin cuenta — un club toma gente que nunca se va a registrar, así que el nombre y el teléfono se sostienen solos, y el link de gestión es la vuelta del cliente.

## Dos bugs que encontró el navegador

Los dos quedaron cubiertos por checks:

1. **"Cualquiera" cruzaba tipos.** Pedir pádel a las 22:30 podía devolver la cancha de fútbol 5 y cotizarla a su tarifa, porque el filtro por tipo vivía solo en los botones de la página. Ahora filtra el servidor.
2. **El precio mostrado y el cobrado podían diferir.** La grilla tomaba la primera cancha libre y la reserva asignaba la menos ocupada; con una techada más cara en el medio, eso es una sorpresa al confirmar. "Cualquiera" ahora significa la cancha más barata libre a esa hora, y lo significa en los dos lugares.
3. **El aviso mínimo se aplicaba también en el mostrador.** Alguien entró 17:05 pidiendo la cancha de las 18:00 y la agenda lo rechazó como "ya está tomado". Esa regla existe para que una reserva online no le caiga al club sin aviso; no tiene nada que decir sobre la persona parada en el mostrador.

## Probarlo

```bash
npm run seed:padel
```

Club del Este, cinco espacios, tres tipos (pádel, fútbol 5, salón).

- Página pública: `/es/r/club-del-este`
- Dueño: `dueno@clubdeleste.uy` / `padel1234`

Probado de punta a punta en el navegador: reserva confirmada, guardada como `CONFIRMED` / `ONLINE`, con la tarifa nocturna correcta.

**641 checks pasan** (36 nuevos), build limpio.

Probado en el navegador: panel del club, agenda con la reserva online dibujada en su hora, reserva tomada desde el mostrador, y alta de una cancha nueva desde el formulario.

## Lo que NO entra, a propósito

Esto es la rebanada que funciona de punta a punta, no la vertical terminada:

- **Sin seña ni cobro online.** El esquema ya lleva los campos (`depositCents`, `holdExpiresAt`, `Payment.rentalId`) porque en pádel la seña es clave por el no-show, pero el flujo no está conectado.
- **Un estudio sigue siendo de una sola vertical.** La fusión clases + canchas en el mismo club es un cambio aparte y más grande.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
