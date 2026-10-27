import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getBrand } from "@/lib/brand/server";
import { ProductBrand } from "@/components/brand-footer";

/*
  The privacy policy for both products, in the brand the request is served
  as. Written for Uruguay's Ley 18.331; Meta asks for its URL before a
  WhatsApp app can go live. Kept as plain text in code rather than in the
  message files: it is read as a whole, changed rarely, and the date at the
  top has to move with it.
*/

const UPDATED = { es: "27 de octubre de 2026", en: "October 27, 2026" };
const CONTACT = "hola@temppo.uy";

type Section = { id?: string; title: string; body: (string | string[])[] };

function sections(lang: "es" | "en", product: string): Section[] {
  if (lang === "en") {
    return [
      {
        title: "Who we are",
        body: [
          `${product} is a service of TEMPPO SAS, a company registered in Uruguay ("Temppo", "we"). TEMPPO SAS also runs TEMPPO Reservas and Temppo Beauty, and this policy covers both.`,
          `For any question about your data, write to ${CONTACT}.`,
        ],
      },
      {
        title: "Two kinds of data, two roles",
        body: [
          "Businesses (studios, salons and professionals) use Temppo to take bookings. Their account data — the owner's and their team's — is ours to look after: for it, TEMPPO SAS is the data controller.",
          "The data of each business's clients (the people who book) belongs to that business. The business decides what to record and why, and is the controller; Temppo stores and processes it on the business's behalf, only to provide the service. If you are a client, the business you booked with is your first point of contact; we will help it answer you.",
        ],
      },
      {
        title: "What we collect",
        body: [
          [
            "Business accounts: name, email, phone, password (stored only as a secure hash), the business's name, address, settings, services, prices and schedules.",
            "Clients: name, phone, email if given, ID number if the business asks for it, bookings and their history, payments and deposits, and the notes the business keeps (for example allergies or preferences relevant to the service).",
            "Payments: the amount, status and reference of each payment. Card details are entered at Mercado Pago and never reach us.",
            "Technical data: session cookies, the browser's language, and, if you allow it, a push-notification subscription for your device.",
          ],
          "Notes about health, such as allergies, are sensitive data. The business records them only to provide its service safely and is responsible for having its client's consent to do so.",
        ],
      },
      {
        title: "What we use it for",
        body: [
          [
            "To take, confirm, move and cancel bookings and classes.",
            "To send the messages that go with a booking — confirmation, reminder, changes and deposit receipts — by email, push notification and WhatsApp.",
            "To process deposits and payments, and to keep the business's records.",
            "To bill businesses for the service, to keep accounts secure and to give support.",
          ],
          "We do not sell personal data, show advertising, or use it to build marketing profiles. We do not use advertising or tracking cookies.",
        ],
      },
      {
        title: "WhatsApp messages",
        body: [
          "When a business has automatic WhatsApp turned on, booking messages are sent from Temppo's number through Meta's WhatsApp Business Platform, with the business's name in each one. To send them, Meta processes the phone number and the content of the message.",
          "Reply STOP (or BAJA) at any time and no more automatic messages will be sent to that number; reply START (or ALTA) to receive them again. Email and the booking link keep working.",
        ],
      },
      {
        title: "Who we share it with",
        body: [
          "Only with the providers that make the service work, each for that purpose alone:",
          [
            "Hosting and database: Netlify and our cloud database provider.",
            "Email: Resend.",
            "WhatsApp: Meta Platforms (WhatsApp Business Platform).",
            "Payments: Mercado Pago, which handles card payments and deposits.",
            "Push notifications: the browser's or phone's own service (Apple, Google, Mozilla).",
          ],
          "Some of these providers keep data on servers outside Uruguay, mainly in the United States and the European Union. We only use providers that commit to protect it with safeguards adequate under Uruguayan law. We will also disclose data when a court or competent authority requires it.",
        ],
      },
      {
        title: "How long we keep it",
        body: [
          "Business data is kept while the account is active. Client data is kept while the business keeps it in its account, or until it is deleted at the client's or the business's request. After an account is closed we delete or anonymise its data, except what we must keep by law (for example billing records), and backups roll over in regular cycles.",
        ],
      },
      {
        id: "delete",
        title: "Your rights, and how to delete your data",
        body: [
          "Under Law 18,331 you can ask to access, correct, update, add to or delete your personal data, and object to its use. To do so:",
          [
            "Clients: ask the business you booked with, or write to us and we will pass it on and follow it up.",
            `Businesses: write to ${CONTACT} from the account's email. Closing the account deletes it and its clients' data as described above.`,
            "Automatic WhatsApp: reply STOP to stop the messages at once.",
          ],
          "We answer within the time the law sets (5 business days for access, 5 for correction or deletion). If you are not satisfied, you can turn to Uruguay's data protection authority, the Unidad Reguladora y de Control de Datos Personales (URCDP).",
        ],
      },
      {
        title: "Security",
        body: [
          "Connections are encrypted, passwords are stored only as secure hashes, each business sees only its own data, and access to the platform's systems is limited to the people who need it. No system is perfect: if a breach ever affected your data, we would tell you and the authority as the law requires.",
        ],
      },
      {
        title: "Children",
        body: [
          "Business accounts are for adults. A minor's booking is the responsibility of the business and of the adult who makes it.",
        ],
      },
      {
        title: "Changes",
        body: [
          "If we change this policy we will update the date at the top and, when the change matters, let businesses know by email before it applies.",
        ],
      },
    ];
  }

  return [
    {
      title: "Quiénes somos",
      body: [
        `${product} es un servicio de TEMPPO SAS, una empresa registrada en Uruguay ("Temppo", "nosotros"). TEMPPO SAS también opera TEMPPO Reservas y Temppo Beauty, y esta política cubre a los dos.`,
        `Para cualquier consulta sobre tus datos, escribinos a ${CONTACT}.`,
      ],
    },
    {
      title: "Dos tipos de datos, dos roles",
      body: [
        "Los negocios (estudios, salones y profesionales) usan Temppo para recibir reservas. Los datos de su cuenta — los de la dueña o el dueño y los de su equipo — los cuidamos nosotros: para esos datos, TEMPPO SAS es el responsable de la base de datos.",
        "Los datos de las clientas y clientes de cada negocio (las personas que reservan) son de ese negocio. El negocio decide qué registra y para qué, y es el responsable; Temppo los guarda y los trata por cuenta del negocio, solo para prestar el servicio. Si sos clienta, tu primer contacto es el negocio donde reservaste; nosotros lo ayudamos a responderte.",
      ],
    },
    {
      title: "Qué datos recolectamos",
      body: [
        [
          "Cuentas de negocios: nombre, email, teléfono, contraseña (guardada solo como un hash seguro), y el nombre, la dirección, la configuración, los servicios, los precios y los horarios del negocio.",
          "Clientas y clientes: nombre, teléfono, email si lo dejan, cédula si el negocio la pide, las reservas y su historial, pagos y señas, y las notas que guarda el negocio (por ejemplo alergias o preferencias relevantes para el servicio).",
          "Pagos: el monto, el estado y la referencia de cada pago. Los datos de tarjeta se ingresan en Mercado Pago y nunca llegan a nosotros.",
          "Datos técnicos: cookies de sesión, el idioma del navegador y, si lo permitís, una suscripción a notificaciones para tu dispositivo.",
        ],
        "Las notas sobre salud, como las alergias, son datos sensibles. El negocio las registra solo para prestar su servicio de forma segura y es responsable de contar con el consentimiento de su clienta para hacerlo.",
      ],
    },
    {
      title: "Para qué los usamos",
      body: [
        [
          "Para tomar, confirmar, cambiar y cancelar reservas y clases.",
          "Para mandar los mensajes de cada reserva — confirmación, recordatorio, cambios y comprobantes de seña — por email, notificación y WhatsApp.",
          "Para procesar señas y pagos, y llevar los registros del negocio.",
          "Para cobrarle el servicio a los negocios, mantener las cuentas seguras y dar soporte.",
        ],
        "No vendemos datos personales, no mostramos publicidad ni los usamos para armar perfiles de marketing. No usamos cookies de publicidad ni de seguimiento.",
      ],
    },
    {
      title: "Mensajes de WhatsApp",
      body: [
        "Cuando un negocio tiene activado el WhatsApp automático, los mensajes de las reservas salen desde el número de Temppo a través de la plataforma WhatsApp Business de Meta, con el nombre del negocio en cada uno. Para enviarlos, Meta procesa el número de teléfono y el contenido del mensaje.",
        "Respondé BAJA en cualquier momento y no se mandan más mensajes automáticos a ese número; respondé ALTA para volver a recibirlos. El email y el link de tu reserva siguen funcionando.",
      ],
    },
    {
      title: "Con quién los compartimos",
      body: [
        "Solo con los proveedores que hacen funcionar el servicio, y cada uno solo para eso:",
        [
          "Alojamiento y base de datos: Netlify y nuestro proveedor de base de datos en la nube.",
          "Email: Resend.",
          "WhatsApp: Meta Platforms (plataforma WhatsApp Business).",
          "Pagos: Mercado Pago, que procesa los pagos con tarjeta y las señas.",
          "Notificaciones: el servicio propio del navegador o del celular (Apple, Google, Mozilla).",
        ],
        "Algunos de estos proveedores guardan datos en servidores fuera de Uruguay, principalmente en Estados Unidos y la Unión Europea. Solo trabajamos con proveedores que se comprometen a protegerlos con garantías adecuadas según la ley uruguaya. También comunicaremos datos cuando lo exija un juez o una autoridad competente.",
      ],
    },
    {
      title: "Cuánto tiempo los guardamos",
      body: [
        "Los datos de un negocio se guardan mientras su cuenta esté activa. Los de sus clientas, mientras el negocio los mantenga en su cuenta o hasta que se borren a pedido de la clienta o del negocio. Al cerrar una cuenta, borramos o anonimizamos sus datos, salvo lo que la ley nos obliga a conservar (por ejemplo registros de facturación), y las copias de seguridad se renuevan en ciclos regulares.",
      ],
    },
    {
      id: "eliminar",
      title: "Tus derechos y cómo borrar tus datos",
      body: [
        "Según la Ley 18.331 podés pedir acceder a tus datos personales, rectificarlos, actualizarlos, incluirlos o suprimirlos, y oponerte a su uso. Para hacerlo:",
        [
          "Clientas y clientes: pedíselo al negocio donde reservaste, o escribinos y lo derivamos y le hacemos seguimiento.",
          `Negocios: escribí a ${CONTACT} desde el email de la cuenta. Al cerrar la cuenta se borran sus datos y los de sus clientas como se explica arriba.`,
          "WhatsApp automático: respondé BAJA y los mensajes se cortan en el momento.",
        ],
        "Respondemos en los plazos que fija la ley (5 días hábiles para el acceso y 5 para la rectificación o supresión). Si no quedás conforme, podés recurrir a la Unidad Reguladora y de Control de Datos Personales (URCDP).",
      ],
    },
    {
      title: "Seguridad",
      body: [
        "Las conexiones van cifradas, las contraseñas se guardan solo como hashes seguros, cada negocio ve únicamente sus propios datos y el acceso a los sistemas de la plataforma está limitado a quienes lo necesitan. Ningún sistema es perfecto: si alguna vez una filtración afectara tus datos, te avisaríamos a vos y a la autoridad como indica la ley.",
      ],
    },
    {
      title: "Menores de edad",
      body: [
        "Las cuentas de negocios son para personas mayores de edad. La reserva de una persona menor es responsabilidad del negocio y del adulto que la hace.",
      ],
    },
    {
      title: "Cambios",
      body: [
        "Si cambiamos esta política, actualizamos la fecha de arriba y, cuando el cambio importa, se lo avisamos a los negocios por email antes de que se aplique.",
      ],
    },
  ];
}

// The layout's title template adds the brand.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "en" ? "Privacy policy" : "Política de privacidad" };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = locale === "en" ? "en" : "es";
  const brand = await getBrand();

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-8 sm:px-5">
        <header className="mb-8">
          <Link href="/" aria-label={brand.name}>
            <ProductBrand />
          </Link>
          <h1 className="mt-6 text-[32px] leading-tight">{lang === "en" ? "Privacy policy" : "Política de privacidad"}</h1>
          <p className="mt-1 text-sm text-muted">
            {lang === "en" ? "Last updated" : "Última actualización"}: {UPDATED[lang]}
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-relaxed text-ink-soft">
          {sections(lang, brand.name).map((section) => (
            <section key={section.title} id={section.id} className="scroll-mt-6">
              <h2 className="mb-2 text-xl text-ink">{section.title}</h2>
              <div className="space-y-3">
                {section.body.map((block, i) =>
                  Array.isArray(block) ? (
                    <ul key={i} className="list-disc space-y-1.5 pl-5">
                      {block.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={i}>{block}</p>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-line pt-6 text-sm text-muted">
          TEMPPO SAS · Uruguay ·{" "}
          <a href={`mailto:${CONTACT}`} className="text-accent underline-offset-4 hover:underline">
            {CONTACT}
          </a>
        </p>
      </main>
    </div>
  );
}
