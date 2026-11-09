# Plan: recordatorios de cobro a los negocios

## Qué queremos

- **Fin de la prueba.** 3 días antes de que termine la prueba gratis, al negocio le llega un recordatorio con lo que tiene que pagar y cómo pagarlo: transferencia o Mercado Pago.
- **Mes a mes.** Después, lo mismo cada 30 días: 3 días antes de que venza el mes pagado.
- **Atrasos.** Si no paga a tiempo, otro aviso el día que vence y uno más 3 días después. Nada se suspende solo: suspender sigue siendo una decisión tuya desde la consola.

## Lo que ya existe y se reutiliza

- **Fechas.** `Studio.trialEndsAt` es el fin de la prueba. `Subscription.currentPeriodEnd` es "pagado hasta".
- **Pago manual.** En la consola, **Cobros → registrar pago manual** (`recordManualCharge`) suma meses y corre `currentPeriodEnd`. Con eso el próximo recordatorio se recalcula solo.
- **Precios.** Los de Beauty están en `src/lib/brand/pricing.ts`: precio de lanzamiento $490 / $890 / $1.590. Los de Reservas están en la tabla `PlanPrice`.
- **Débito automático con Mercado Pago.** Ya está hecho (`startAutoDebit`, con preapproval y webhook), pero la pantalla está oculta (`BILLING_UI_ENABLED = false`). A quien lo active no le hace falta el recordatorio mensual.
- **Corrida automática.** El proceso de cada 15 minutos (`sendDueReminders`) es donde se engancha el chequeo.
- **Mails y notificaciones.** El email sale por `emailTransport`, el push por `pushToUser`, y cada envío queda en `NotificationLog`.

## Cómo funcionaría

### 1. Cuánto debe y para cuándo

Una función pura, `billingDue(studio, subscription, now)`, que devuelve:

- **monto**: el plan del negocio. Si está en prueba, el plan de la prueba (Beauty: "team", $890) o el que eligió.
- **fecha de vencimiento**: `trialEndsAt` si está en prueba, o `currentPeriodEnd` si ya pagó.
- **etapa**: `ANTES` (3 días antes), `VENCE` (el día) o `ATRASADO` (3 días después).

Quedan fuera: los negocios suspendidos, los que tienen débito automático activo y los que no tienen ninguna fecha.

### 2. No mandar dos veces el mismo aviso

Campo nuevo `Studio.billingRemindedFor` (fecha de vencimiento) más `billingReminderStage`. Si cambia la fecha porque pagó, se reinicia solo. Es el mismo patrón que los recordatorios de contenido "a mano".

### 3. Qué recibe el negocio

Va por email y por push a la dueña. Ejemplo de texto:

> Hola [Nombre], tu prueba gratis de Temppo Beauty termina el jueves 12. Para seguir usando tu agenda, el plan Equipo cuesta **$890 por mes**.
>
> **Pagá con Mercado Pago:** [botón Pagar $890]
>
> **O por transferencia:** [banco] · [tipo de cuenta] · [número] · a nombre de [titular]. Mandá el comprobante a este WhatsApp: [link wa.me].
>
> ¿Querés cambiar de plan o tenés dudas? Respondé este mail.

Opcional, en una segunda etapa: el mismo aviso por WhatsApp desde el número de Temppo Beauty. Requiere una plantilla nueva aprobada por Meta, de categoría Utility, porque es un aviso de pago y no marketing.

### 4. El link de Mercado Pago

Se genera un **link de pago único** (Checkout Pro) para cada recordatorio, con la cuenta de Mercado Pago de la plataforma y la referencia `sub:<studioId>:<plan>`.

Cuando paga, el webhook que ya existe reconoce la referencia y registra el cobro solo: suma 1 mes y avisa a las admins. No hay que cargar nada a mano.

Además, en el mismo mail, un link opcional "Activar débito automático" que usa el flujo de suscripción que ya existe.

### 5. La transferencia

Los datos de la cuenta se cargan una sola vez en la consola, en una sección nueva **Cobros → Datos para cobrar**: banco, tipo de cuenta, número, titular y el WhatsApp para comprobantes. Se guardan en una tabla de configuración de la plataforma, no en el código.

Cuando te llega el comprobante, lo registrás en **Cobros → registrar pago**, como hoy. El próximo recordatorio pasa a ser en 30 días.

### 6. Lo que ves vos en la consola

- **En Cobros, "Próximos vencimientos":** quién vence en los próximos 7 días, quién está atrasado y qué aviso se le mandó.
- **En cada negocio:** el botón "Copiar mensaje de cobro", para mandarlo también desde tu WhatsApp personal.
- **El día que alguien vence sin pagar:** un push para vos.

## Pasos

1. **Configuración de cobro.** Tabla `PlatformSetting` y formulario "Datos para cobrar" en la consola.
2. **Cálculo.** `billingDue()` con sus pruebas: prueba, mes pagado, atraso, débito automático, suspendido.
3. **Envío.** Campos de seguimiento, `sendBillingReminders(now)` dentro del proceso de cada 15 minutos, y el email con push.
4. **Pago con Mercado Pago.** Link de pago con referencia `sub:` y su manejo en el webhook (registra el cobro solo, sin duplicar).
5. **Consola.** "Próximos vencimientos" y "Copiar mensaje".
6. *(Opcional)* WhatsApp con una plantilla nueva aprobada por Meta.
7. **Pruebas** (`verify-billing-reminders.ts`) y una prueba manual en local, sin cobros reales en Mercado Pago.

## Para decidir

1. **¿Cuál es el precio después de la prueba?**
   - Que elijan plan antes de que termine.
   - O pasar todas a "Equipo" ($890), que es el plan con el que prueban.
2. **¿Mercado Pago?**
   - Link de pago cada mes (paga cuando quiere).
   - O ofrecer también débito automático (se olvida del tema).
3. **¿Atrasos?**
   - Solo avisos, y vos decidís si suspender.
   - O suspensión automática a los X días.
4. **¿Para quién?**
   - Solo Temppo Beauty.
   - O también los negocios de Temppo Reservas.
5. **¿Precio de lanzamiento?** ¿Lo respetamos durante 12 meses para los primeros 50 negocios, como dice la landing?
